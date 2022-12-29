import type { Provider, ProviderName, SponsorkitConfig } from '../types'
import { GitHubProvider } from './github'
import { PatreonProvider } from './patreon'
import { OpenCollectiveProvider } from './opencollective'
import { AfdianProvider } from './afdian'

export * from './github'

export const ProvidersMap = {
  github: GitHubProvider,
  patreon: PatreonProvider,
  opencollective: OpenCollectiveProvider,
  afdian: AfdianProvider,
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

  // fallback
  if (!items.length)
    items.push('github')

  return items
}

export function resolveProviders(names: (ProviderName | Provider)[]) {
  return Array.from(new Set(names)).map((i) => {
    if (typeof i === 'string') {
      const provider = ProvidersMap[i]
      if (!provider)
        throw new Error(`Unknown provider: ${i}`)
      return provider
    }
    return i
  })
}
