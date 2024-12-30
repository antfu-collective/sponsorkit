import type { Sponsorship } from './types'
import { Buffer } from 'node:buffer'

export function stringifyCache(cache: Sponsorship[]): string {
  return JSON.stringify(
    cache,
    (_key, value) => {
      if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
        return Buffer.from(value.data).toString('base64')
      }
      return value
    },
    2,
  )
}

export function parseCache(cache: string): Sponsorship[] {
  return JSON.parse(cache, (key, value) => {
    if (key === 'avatarBuffer') {
      return Buffer.from(value, 'base64')
    }
    return value
  })
}
