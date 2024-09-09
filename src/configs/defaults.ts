import { tierPresets } from './tier-presets'
import type { SponsorkitConfig, Tier } from '../types'

export const defaultTiers: Tier[] = [
  {
    title: 'Past Sponsors',
    monthlyDollars: -1,
    preset: tierPresets.xs,
  },
  {
    title: 'Backers',
    preset: tierPresets.base,
  },
  {
    title: 'Sponsors',
    monthlyDollars: 10,
    preset: tierPresets.medium,
  },
  {
    title: 'Silver Sponsors',
    monthlyDollars: 50,
    preset: tierPresets.large,
  },
  {
    title: 'Gold Sponsors',
    monthlyDollars: 100,
    preset: tierPresets.xl,
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
