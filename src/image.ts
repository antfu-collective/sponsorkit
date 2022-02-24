import { $fetch } from 'ohmyfetch'
// @ts-expect-error missing types
import imageDataURI from 'image-data-uri'
import sharp from 'sharp'
import type { Sponsorship } from './types'

export async function resolveAvatars(ships: Sponsorship[]) {
  return Promise.all(ships.map(async(ship) => {
    const data = await $fetch(ship.sponsor.avatarUrl, { responseType: 'arrayBuffer' })
    const rounded = await round(data, ship.sponsor.type === 'User' ? 0.5 : 0.15)
    ship.sponsor.avatarUrl = await imageDataURI.encode(rounded, 'PNG')
  }))
}

function toBuffer(ab: ArrayBuffer) {
  const buf = Buffer.alloc(ab.byteLength)
  const view = new Uint8Array(ab)
  for (let i = 0; i < buf.length; ++i)
    buf[i] = view[i]

  return buf
}

export async function round(image: string | ArrayBuffer, radius = 0.5, size = 100) {
  const rect = Buffer.from(
    `<svg><rect x="0" y="0" width="${size}" height="${size}" rx="${size * radius}" ry="${size * radius}"/></svg>`,
  )

  return await sharp(typeof image === 'string' ? image : toBuffer(image))
    .resize(size, size, { fit: sharp.fit.cover })
    .composite([{
      blend: 'dest-in',
      input: rect,
      density: 72,
    }])
    .png({ quality: 90 })
    .toBuffer()
}

export function svgToPng(svg: string) {
  return sharp(Buffer.from(svg), { density: 150 })
    .png({ quality: 90 })
    .toBuffer()
}
