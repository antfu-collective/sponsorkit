import type { ImageFormat, SponsorkitConfig, Sponsorship } from '../types'
import { Buffer } from 'node:buffer'
import { consola } from 'consola'
import { $fetch } from 'ofetch'
import sharp from 'sharp'
import { version } from '../../package.json'

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
      // Store the highest resolution version we use of the original image
      // Stored in webp to save space
      ship.sponsor.avatarBuffer = await resizeImage(pngBuffer, 120, 'webp')
    }
  })))
}

const cache = new Map<Buffer, Map<string, Buffer>>()
export async function resizeImage(
  image: Buffer,
  size = 100,
  format: ImageFormat,
) {
  const cacheKey = `${size}:${format}`
  if (cache.has(image)) {
    const cacheHit = cache.get(image)!.get(cacheKey)
    if (cacheHit) {
      return cacheHit
    }
  }

  let processing = sharp(image)
    .resize(size, size, { fit: sharp.fit.cover })

  processing = (format === 'webp')
    ? processing.webp()
    : processing.png({ quality: 80, compressionLevel: 8 })

  const result = await processing.toBuffer()

  if (!cache.has(image)) {
    cache.set(image, new Map())
  }
  cache.get(image)!.set(cacheKey, result)

  return result
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
