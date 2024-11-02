import { Buffer } from 'node:buffer'
import { consola } from 'consola'
import webp from 'imagemin-webp'
import { $fetch } from 'ofetch'
import { version } from '../../package.json'
import type { SponsorkitConfig, Sponsorship } from '../types'

export const dataWebpBase64 = 'data:image/webp;base64,'

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

  const fallbackDataUri = fallbackAvatar && ((await convertToWebp(fallbackAvatar, 100)).toString('base64'))

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
      const [
        highRes,
        mediumRes,
        lowRes,
      ] = await Promise.all([
        convertToWebp(pngBuffer, 120),
        convertToWebp(pngBuffer, 80),
        convertToWebp(pngBuffer, 50),
      ])

      const hiresBase64 = highRes.toString('base64')
      ship.sponsor.avatarBuffer = hiresBase64
      ship.sponsor.avatarUrlHighRes = hiresBase64
      ship.sponsor.avatarUrlMediumRes = mediumRes.toString('base64')
      ship.sponsor.avatarUrlLowRes = lowRes.toString('base64')
    }
  })))
}

export async function convertToWebp(
  image: Buffer,
  size: number,
) {
  const buffer = await webp({
    quality: 80,
    resize: {
      height: size,
      width: size,
    },
  })(image as Uint8Array) // types are incorrect here—should be Buffer
  return buffer as Buffer
}
