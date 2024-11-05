import { Buffer } from 'node:buffer'
import { consola } from 'consola'
import { $fetch } from 'ofetch'
import sharp from 'sharp'
import { version } from '../../package.json'
import type { SponsorkitConfig, Sponsorship } from '../types'

export async function resolveAvatars(
  ships: Sponsorship[],
  getFallbackAvatar: SponsorkitConfig['fallbackAvatar'],
  t = consola,
) {
  const fallbackAvatar = await (async () => {
    if (typeof getFallbackAvatar === 'string') {
      const data = await $fetch(getFallbackAvatar, { responseType: 'arrayBuffer' })
      return Buffer.from(data)
    }
    if (getFallbackAvatar)
      return getFallbackAvatar
    return undefined
  })()

  const fallbackDataUri = fallbackAvatar && (await round(fallbackAvatar, 0.5, 100)).toString('base64')

  const pLimit = await import('p-limit').then(r => r.default)
  const limit = pLimit(15)

  return Promise.all(ships.map(ship => limit(async () => {
    const pngArrayBuffer = (ship.privacyLevel === 'PRIVATE' || !ship.sponsor.avatarUrl)
      ? fallbackAvatar
      : await $fetch(ship.sponsor.avatarUrl, {
        responseType: 'arrayBuffer',
        headers: {
          'User-Agent': `Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36 Sponsorkit/${version}`,
        },
      })
        .catch((e) => {
          t.error(`Failed to fetch avatar for ${ship.sponsor.login || ship.sponsor.name} [${ship.sponsor.avatarUrl}]`)
          t.error(e)
          if (fallbackAvatar)
            return fallbackAvatar
          throw e
        })

    if (ship.privacyLevel === 'PRIVATE' && fallbackDataUri)
      ship.sponsor.avatarUrl = fallbackDataUri

    if (pngArrayBuffer) {
      const pngBuffer = Buffer.from(pngArrayBuffer)
      const radius = ship.sponsor.type === 'Organization' ? 0.1 : 0.5
      const [
        highRes,
        mediumRes,
        lowRes,
      ] = await Promise.all([
        round(pngBuffer, radius, 120),
        round(pngBuffer, radius, 80),
        round(pngBuffer, radius, 50),
      ])

      const highResBase64 = highRes.toString('base64')

      ship.sponsor.avatarBuffer = highResBase64
      ship.sponsor.avatarUrlHighRes = highResBase64
      ship.sponsor.avatarUrlMediumRes = mediumRes.toString('base64')
      ship.sponsor.avatarUrlLowRes = lowRes.toString('base64')
    }
  })))
}

export async function round(image: Buffer, radius = 0.5, size = 100) {
  const rect = Buffer.from(
    `<svg><rect x="0" y="0" width="${size}" height="${size}" rx="${size * radius}" ry="${size * radius}"/></svg>`,
  )

  return await sharp(image)
    .resize(size, size, { fit: sharp.fit.cover })
    .composite([{
      blend: 'dest-in',
      input: rect,
      density: 72,
    }])
    .png({ quality: 80, compressionLevel: 8 })
    .toBuffer()
}

export function svgToPng(svg: string) {
  return sharp(Buffer.from(svg), { density: 150 })
    .png({ quality: 90 })
    .toBuffer()
}
