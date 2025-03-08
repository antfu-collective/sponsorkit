import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
    'src/cli',
  ],
  declaration: 'node16',
  clean: true,
  rollup: {
    inlineDependencies: [
      '@fast-csv/parse',
      'd3-hierarchy',
      '@antfu/utils',
      'normalize-url',
      'p-limit',
      'yocto-queue',
      'lodash.escaperegexp',
      'lodash.isnil',
      'lodash.isfunction',
      'lodash.isundefined',
      'lodash.uniq',
      'lodash.groupby',
    ],
  },
})
