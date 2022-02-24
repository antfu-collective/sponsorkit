/* eslint-disable @typescript-eslint/no-unused-vars */
import { defineConfig, presets } from 'sponsorkit'

export default defineConfig({
  login: 'antfu',
  tiers: [
    {
      title: 'Backers',
      monthlyDollars: 10,
      // to replace the entire tier rendering
      // compose: (composer, tierSponsors, config) => {
      //   composer.addRaw(
      //     '<-- custom svg -->',
      //   )
      // },
    },
    {
      title: 'Sponsors',
      monthlyDollars: 50,
      preset: presets.medium,
      // to insert custom elements after the tier block
      composeAfter: (composer, tierSponsors, config) => {
        composer.addSpan(10)
      },
    },
    {
      title: 'Silver Sponsors',
      monthlyDollars: 100,
      preset: presets.large,
    },
    {
      title: 'Gold Sponsors',
      preset: presets.xl,
    },
  ],
})
