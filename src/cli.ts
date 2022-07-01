import yargs from 'yargs'
import { version } from '../package.json'
import { run } from './run'
import type { SponsorkitConfig } from './types'

const cli = yargs
  .scriptName('sponsors-svg')
  .usage('$0 [args]')
  .version(version)
  .strict()
  .showHelpOnFail(false)
  .alias('h', 'help')
  .alias('v', 'version')

cli.command(
  '*',
  'Generate',
  args => args
    .option('width', {
      alias: 'w',
      type: 'number',
      default: 800,
    })
    .option('force', {
      alias: 'f',
      default: false,
      type: 'boolean',
    })
    .option('name', {
      type: 'string',
    })
    .option('outputDir', {
      type: 'string',
      alias: ['o', 'dir'],
    })
    .strict()
    .help(),
  async (options) => {
    const config = options as SponsorkitConfig

    if (options._[0])
      config.outputDir = options._[0] as string

    await run(options)
  })

cli
  .help()
  .parse()
