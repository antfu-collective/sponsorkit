import { describe, expect, it } from 'vitest'
import { normalizeUrl } from './utils.ts'

describe('normalizeUrl', () => {
  it('returns undefined for empty input', () => {
    expect(normalizeUrl(undefined)).toBeUndefined()
    expect(normalizeUrl('')).toBeUndefined()
  })

  it('adds the default https protocol when missing', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com')
  })

  it('preserves an explicit protocol', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com')
  })

  it('normalizes the url (strips trailing slash)', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com')
  })
})
