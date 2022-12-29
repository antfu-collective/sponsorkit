import { loadConfig as _loadConfig } from 'unconfig'
import { loadEnv } from './env'
import { FALLBACK_AVATAR } from './fallback'
import { presets } from './presets'
import type { SponsorkitConfig, Tier } from './types'

export const defaultTiers: Tier[] = [
  {
    title: 'Past Sponsors',
    monthlyDollars: -1,
    preset: presets.xs,
  },
  {
    title: 'Backers',
    preset: presets.base,
  },
  {
    title: 'Sponsors',
    monthlyDollars: 10,
    preset: presets.medium,
  },
  {
    title: 'Silver Sponsors',
    monthlyDollars: 50,
    preset: presets.large,
  },
  {
    title: 'Gold Sponsors',
    monthlyDollars: 100,
    preset: presets.xl,
  },
]

export const defaultInlineCSS = `
text {
  font-weight: 300;
  font-size: 14px;
  fill: #777777;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}
.sponsorkit-link {
  cursor: pointer;
}
.sponsorkit-tier-title {
  font-weight: 500;
  font-size: 20px;
}
`

export const defaultConfig: SponsorkitConfig = {
  width: 800,
  outputDir: './sponsorkit',
  cacheFile: '.cache.json',
  formats: ['json', 'svg', 'png'],
  tiers: defaultTiers,
  name: 'sponsors',
  includePrivate: false,
  svgInlineCSS: defaultInlineCSS,
}

export function defineConfig(config: SponsorkitConfig) {
  return config
}

export async function loadConfig(inlineConfig: SponsorkitConfig = {}) {
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
