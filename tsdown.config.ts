import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index',
    'src/cli',
  ],
  deps: {
    onlyBundle: [
      '@antfu/utils',
      '@fast-csv/parse',
    ],
  },
  exports: true,
})
