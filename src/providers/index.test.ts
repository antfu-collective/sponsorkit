import type { Provider } from '../types.ts'
import { describe, expect, it } from 'vitest'
import { GitHubProvider } from './github.ts'
import { guessProviders, ProvidersMap, resolveProviders } from './index.ts'

describe('guessProviders', () => {
  it('falls back to github when nothing is configured', () => {
    expect(guessProviders({})).toEqual(['github'])
  })

  it('detects each provider from its required config', () => {
    expect(guessProviders({ github: { login: 'antfu' } })).toEqual(['github'])
    expect(guessProviders({ patreon: { token: 't' } })).toEqual(['patreon'])
    expect(guessProviders({ opencollective: { slug: 'antfu' } })).toEqual(['opencollective'])
    expect(guessProviders({ afdian: { userId: 'u', token: 't' } })).toEqual(['afdian'])
    expect(guessProviders({ polar: { token: 't' } })).toEqual(['polar'])
    expect(guessProviders({ liberapay: { login: 'antfu' } })).toEqual(['liberapay'])
    expect(guessProviders({ kofi: { verificationToken: 't' } })).toEqual(['kofi'])
    expect(guessProviders({ kofi: { dataFile: './events.json' } })).toEqual(['kofi'])
  })

  it('ignores providers with incomplete config', () => {
    // afdian needs both userId and token
    expect(guessProviders({ afdian: { userId: 'u' } })).toEqual(['github'])
    // github needs a login
    expect(guessProviders({ github: {} })).toEqual(['github'])
  })

  it('collects multiple providers in declaration order', () => {
    expect(guessProviders({
      github: { login: 'antfu' },
      polar: { token: 't' },
      kofi: { dataFile: './events.json' },
    })).toEqual(['github', 'polar', 'kofi'])
  })
})

describe('resolveProviders', () => {
  it('maps provider names to their implementations', () => {
    expect(resolveProviders(['github'])).toEqual([GitHubProvider])
  })

  it('deduplicates repeated names', () => {
    expect(resolveProviders(['github', 'github'])).toEqual([GitHubProvider])
  })

  it('passes custom provider objects through untouched', () => {
    const custom: Provider = { name: 'custom', fetchSponsors: async () => [] }
    expect(resolveProviders([custom])).toEqual([custom])
  })

  it('throws on an unknown provider name', () => {
    // @ts-expect-error deliberately invalid provider name
    expect(() => resolveProviders(['nope'])).toThrow('Unknown provider: nope')
  })

  it('exposes every known provider in ProvidersMap', () => {
    expect(Object.keys(ProvidersMap)).toEqual([
      'github',
      'patreon',
      'opencollective',
      'afdian',
      'polar',
      'liberapay',
      'kofi',
    ])
  })
})
