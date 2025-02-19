import type { Provider, ProviderName, SponsorkitConfig } from '../types'
import { AfdianProvider } from './afdian'
import { GitHubProvider } from './github'
import { LiberapayProvider } from './liberapay'
import { OpenCollectiveProvider } from './opencollective'
import { PatreonProvider } from './patreon'
import { PolarProvider } from './polar'
import { YoutubeProvider } from './youtube'

export * from './github'

export const ProvidersMap = {
  github: GitHubProvider,
  patreon: PatreonProvider,
  opencollective: OpenCollectiveProvider,
  afdian: AfdianProvider,
  polar: PolarProvider,
  liberapay: LiberapayProvider,
  youtube: YoutubeProvider,
}

export function guessProviders(config: SponsorkitConfig) {
  const items: ProviderName[] = []
  if (config.github && config.github.login)
    items.push('github')

  if (config.patreon && config.patreon.token)
    items.push('patreon')

  if (config.opencollective && (config.opencollective.id || config.opencollective.slug || config.opencollective.githubHandle))
    items.push('opencollective')

  if (config.afdian && config.afdian.userId && config.afdian.token)
    items.push('afdian')

  if (config.polar && config.polar.token)
    items.push('polar')

  if (config.liberapay && config.liberapay.login)
    items.push('liberapay')
  if (config.youtube && config.youtube.clientId)
    items.push('youtube')

  // fallback
  if (!items.length)
    items.push('github')

  return items
}

export function resolveProviders(names: (ProviderName | Provider)[]) {
  return Array.from(new Set(names))
    .map((i) => {
      if (typeof i === 'string') {
        const provider = ProvidersMap[i]
        if (!provider)
          throw new Error(`Unknown provider: ${i}`)
        return provider
      }
      return i
    })
}

export async function fetchSponsors(config: SponsorkitConfig) {
  const providers = resolveProviders(guessProviders(config))
  const sponsorships = await Promise.all(
    providers.map(provider => provider.fetchSponsors(config)),
  )

  return sponsorships.flat(1)
}
