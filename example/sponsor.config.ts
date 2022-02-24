import { defineConfig, presets } from 'sponsorkit'

export default defineConfig({
  login: 'antfu',
  tiers: [
    {
      title: 'Backers',
      monthlyDollars: 10,
      compose: (composer, sponsors, config) => {
        composer.addRaw(
          '<-- custom svg -->',
        )
      },
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
