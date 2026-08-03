#!/usr/bin/env node
import type { SponsorkitConfig } from './types.ts'
import cac from 'cac'
import pkg from '../package.json' with { type: 'json' }
import { loadConfig } from './configs/index.ts'
import { DEFAULT_KOFI_DATA_FILE, startKofiWebhookServer } from './providers/kofi.ts'
import { run } from './run.ts'

const RE_FILTER = /([<>=]+)(\d+)/
const cli = cac('sponsors-svg')
  .version(pkg.version)
  .help()

cli
  .command('kofi-webhook', 'Receive and store Ko-fi payment webhooks')
  .option('--host <host>', 'Host to listen on', { default: '127.0.0.1' })
  .option('--port <port>', 'Port to listen on', { default: 3456 })
  .option('--path <path>', 'Webhook path', { default: '/kofi' })
  .option('--data-file <file>', 'Ko-fi event store')
  .action(async (options) => {
    const config = await loadConfig()
    const verificationToken = config.kofi?.verificationToken
    if (!verificationToken) {
      throw new Error('Ko-fi verification token is required')
    }
    const dataFile = options.dataFile || config.kofi?.dataFile || DEFAULT_KOFI_DATA_FILE
    const port = Number.parseInt(options.port)
    await startKofiWebhookServer({
      verificationToken,
      dataFile,
      host: options.host,
      port,
      path: options.path,
    })
    console.log(`[sponsorkit] Ko-fi webhook listening on http://${options.host}:${port}${options.path}`)
    console.log(`[sponsorkit] Storing sanitized events in ${resolveDisplayPath(dataFile)}`)
  })

cli
  .command('[outputDir]', 'Generate sponsors SVG')
  .option('--width, -w <width>', 'SVG width', { default: 800 })
  .option('--fallback-avatar, --fallback <url>', 'Fallback avatar URL')
  .option('--force, -f', 'Force regeneration', { default: false })
  .option('--name <name>', 'Name')
  .option('--filter <filter>', 'Filter sponsors')
  .option('--output-dir, -o, --dir <dir>', 'Output directory')
  .action(async (outputDir: string, options) => {
    const config = options as SponsorkitConfig

    if (outputDir)
      config.outputDir = outputDir

    if (options.filter)
      config.filter = createFilterFromString(options.filter)

    await run(config)
  })

cli.parse()

/**
 * Create filter function from templates like
 * - `<10`
 * - `>=10`
 * @param template
 */
function createFilterFromString(template: string): SponsorkitConfig['filter'] {
  const [_, op, value] = template.split(RE_FILTER)
  const num = Number.parseInt(value)
  if (op === '<')
    return s => s.monthlyDollars < num
  if (op === '<=')
    return s => s.monthlyDollars <= num
  if (op === '>')
    return s => s.monthlyDollars > num
  if (op === '>=')
    return s => s.monthlyDollars >= num
  throw new Error(`Unable to parse filter template ${template}`)
}

function resolveDisplayPath(path: string) {
  return path.replaceAll('\\', '/')
}
