import { defineConfig, presets } from 'sponsorkit'

export default defineConfig({
  login: 'antfu',
  tiers: [
    {
      title: 'Backers',
      monthlyDollars: 10,
      preset: presets.base,
    },
    {
      title: 'Sponsors',
      monthlyDollars: 50,
      preset: presets.medium,
    },
    {
      title: 'Sliver Sponsors',
      monthlyDollars: 100,
      preset: presets.large,
    },
    {
      title: 'Gold Sponsors',
      preset: presets.xl,
    },
  ],
})
