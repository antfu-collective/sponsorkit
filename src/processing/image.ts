import { Buffer } from 'node:buffer'
import { consola } from 'consola'
import { $fetch } from 'ofetch'
import sharp from 'sharp'
import { version } from '../../package.json'
import type { SponsorkitConfig, Sponsorship } from '../types'

async function fetchImage(url: string) {
  const arrayBuffer = await $fetch(url, {
    responseType: 'arrayBuffer',
    headers: {
      'User-Agent': `Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36 Sponsorkit/${version}`,
    },
  })
  return Buffer.from(arrayBuffer)
}

export async function resolveAvatars(
  ships: Sponsorship[],
  getFallbackAvatar: SponsorkitConfig['fallbackAvatar'],
  t = consola,
) {
  const fallbackAvatar = await (() => {
    if (typeof getFallbackAvatar === 'string') {
      return fetchImage(getFallbackAvatar)
    }
    if (getFallbackAvatar)
      return getFallbackAvatar
  })()

  const pLimit = await import('p-limit').then(r => r.default)
  const limit = pLimit(15)

  return Promise.all(ships.map(ship => limit(async () => {
    if (ship.privacyLevel === 'PRIVATE' || !ship.sponsor.avatarUrl) {
      ship.sponsor.avatarBuffer = fallbackAvatar
      return
    }

    const pngBuffer = await fetchImage(ship.sponsor.avatarUrl).catch((e) => {
      t.error(`Failed to fetch avatar for ${ship.sponsor.login || ship.sponsor.name} [${ship.sponsor.avatarUrl}]`)
      t.error(e)
      if (fallbackAvatar)
        return fallbackAvatar
      throw e
    })

    if (pngBuffer) {
      const radius = ship.sponsor.type === 'Organization' ? 0.1 : 0.5

      // Store the highest resolution version we use of the original image
      ship.sponsor.avatarBuffer = await round(pngBuffer, radius, 120)
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

export function svgToWebp(svg: string) {
  return sharp(Buffer.from(svg), { density: 150 })
    .webp()
    .toBuffer()
}
