import { loadConfig as _loadConfig } from 'unconfig'
import { defaultConfig } from './defaults'
import { loadEnv } from './env'
import { FALLBACK_AVATAR } from './fallback'
import type { SponsorkitConfig, Sponsorship, Tier, TierPartition } from '../types'

export * from './defaults'
export * from './fallback'
export * from './tier-presets'

export function defineConfig(config: SponsorkitConfig): SponsorkitConfig {
  return config
}

export async function loadConfig(inlineConfig: SponsorkitConfig = {}): Promise<Required<SponsorkitConfig>> {
  const env = loadEnv()

  const { config = {} } = await _loadConfig<SponsorkitConfig>({
    sources: [
      {
        files: 'sponsor.config',
      },
      {
        files: 'sponsorkit.config',
      },
    ],
    merge: true,
  })

  const hasNegativeTier = !!config.tiers?.find(tier => tier && tier.monthlyDollars! <= 0)

  const resolved = {
    fallbackAvatar: FALLBACK_AVATAR,
    includePastSponsors: hasNegativeTier,
    ...defaultConfig,
    ...env,
    ...config,
    ...inlineConfig,
    github: {
      ...env.github,
      ...config.github,
      ...inlineConfig.github,
    },
    patreon: {
      ...env.patreon,
      ...config.patreon,
      ...inlineConfig.patreon,
    },
    opencollective: {
      ...env.opencollective,
      ...config.opencollective,
      ...inlineConfig.opencollective,
    },
    afdian: {
      ...env.afdian,
      ...config.afdian,
      ...inlineConfig.afdian,
    },
  } as Required<SponsorkitConfig>

  return resolved
}

export function partitionTiers(sponsors: Sponsorship[], tiers: Tier[], includePastSponsors?: boolean): TierPartition[] {
  const tierMappings = tiers!.map<TierPartition>(tier => ({
    monthlyDollars: tier.monthlyDollars ?? 0,
    tier,
    sponsors: [],
  }))

  tierMappings.sort((a, b) => b.monthlyDollars - a.monthlyDollars)

  const finalSponsors = tierMappings.filter(i => i.monthlyDollars === 0)

  if (finalSponsors.length !== 1)
    throw new Error(`There should be exactly one tier with no \`monthlyDollars\`, but got ${finalSponsors.length}`)

  sponsors
    .sort((a, b) => Date.parse(a.createdAt!) - Date.parse(b.createdAt!))
    .filter(s => s.monthlyDollars > 0 || includePastSponsors) // Past sponsors monthlyDollars is -1
    .forEach((sponsor) => {
      const tier = tierMappings.find(t => sponsor.monthlyDollars >= t.monthlyDollars) ?? tierMappings[0]
      tier.sponsors.push(sponsor)
    })

  return tierMappings
}
