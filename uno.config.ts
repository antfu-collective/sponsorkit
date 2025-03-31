import { defineConfig, presetAttributify, presetIcons, presetWebFonts, presetWind3 } from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
    presetIcons(),
    presetAttributify(),
    presetWebFonts({
      fonts: {
        type1: 'Yuji Boku',
        type2: 'Potta One',
        type3: 'Kosugi Maru',
        type4: 'Noto Serif Japanese',
      },
    }),
  ],
})
