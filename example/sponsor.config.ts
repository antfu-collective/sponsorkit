/* eslint-disable @typescript-eslint/no-unused-vars */
import { defineConfig, presets } from 'sponsorkit'

export default defineConfig({
  tiers: [
    {
      title: 'Backers',
      // to replace the entire tier rendering
      // compose: (composer, tierSponsors, config) => {
      //   composer.addRaw(
      //     '<-- custom svg -->',
      //   )
      // },
    },
    {
      title: 'Sponsors',
      monthlyDollars: 100,
      preset: presets.base,
      // to insert custom elements after the tier block
      composeAfter: (composer, tierSponsors, config) => {
        composer.addSpan(10)
      },
    },
    {
      title: 'Silver Sponsors',
      monthlyDollars: 500,
      preset: presets.medium,
    },
    {
      title: 'Gold Sponsors',
      monthlyDollars: 1000,
      preset: presets.large,
    },
    {
      title: 'Platinum Sponsors',
      monthlyDollars: 5000,
      preset: presets.xl,
    },
  ],
})
