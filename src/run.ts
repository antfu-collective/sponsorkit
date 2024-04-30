import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { consola } from 'consola'
import c from 'picocolors'
import { version } from '../package.json'
import { loadConfig } from './configs'
import { resolveAvatars, svgToPng } from './processing/image'
import type { SponsorkitConfig, SponsorkitMainConfig, SponsorkitRenderOptions, SponsorkitRenderer, Sponsorship } from './types'
import { guessProviders, resolveProviders } from './providers'
import { tiersRenderer } from './renders/tiers'

export {
  // default
  tiersRenderer as defaultRenderer,
  tiersComposer as defaultComposer,

  tiersRenderer,
  tiersComposer,
} from './renders/tiers'

function r(path: string) {
  return `./${relative(process.cwd(), path)}`
}

export async function run(inlineConfig?: SponsorkitConfig, t = consola) {
  t.log(`\n${c.magenta(c.bold('SponsorKit'))} ${c.dim(`v${version}`)}\n`)

  const fullConfig = await loadConfig(inlineConfig)
  const config = fullConfig as Required<SponsorkitMainConfig>
  const dir = resolve(process.cwd(), config.outputDir)
  const cacheFile = resolve(dir, config.cacheFile)

  const providers = resolveProviders(config.providers || guessProviders(config))

  if (config.renders?.length) {
    const names = new Set<string>()
    config.renders.forEach((renderOptions, idx) => {
      const name = renderOptions.name || 'sponsors'
      if (names.has(name))
        throw new Error(`Duplicate render name: ${name} at index ${idx}`)
      names.add(name)
    })
  }

  let allSponsors: Sponsorship[] = []
  if (!fs.existsSync(cacheFile) || config.force) {
    for (const i of providers) {
      t.info(`Fetching sponsorships from ${i.name}...`)
      let sponsors = await i.fetchSponsors(config)
      sponsors.forEach(s => s.provider = i.name)
      sponsors = await config.onSponsorsFetched?.(sponsors, i.name) || sponsors
      t.success(`${sponsors.length} sponsorships fetched from ${i.name}`)
      allSponsors.push(...sponsors)
    }

    t.info('Resolving avatars...')
    await resolveAvatars(allSponsors, config.fallbackAvatar, t)
    t.success('Avatars resolved')

    await fsp.mkdir(dirname(cacheFile), { recursive: true })
    await fsp.writeFile(cacheFile, JSON.stringify(allSponsors, null, 2))
  }
  else {
    allSponsors = JSON.parse(await fsp.readFile(cacheFile, 'utf-8'))
    t.success(`Loaded from cache ${r(cacheFile)}`)
  }

  // Sort
  allSponsors.sort((a, b) =>
    b.monthlyDollars - a.monthlyDollars // DESC amount
    || Date.parse(b.createdAt!) - Date.parse(a.createdAt!) // DESC date
    || (b.sponsor.login || b.sponsor.name).localeCompare(a.sponsor.login || a.sponsor.name), // ASC name
  )

  if (config.renders?.length) {
    t.info(`Generating with ${config.renders.length} renders...`)
    await Promise.all(config.renders.map(renderOptions =>
      applyRenderer(
        tiersRenderer,
        config,
        {
          ...fullConfig,
          ...renderOptions,
        },
        allSponsors,
        t,
      ),
    ))
  }
  else {
    await applyRenderer(
      tiersRenderer,
      config,
      fullConfig,
      allSponsors,
      t,
    )
  }
}

export async function applyRenderer(
  renderer: SponsorkitRenderer,
  config: Required<SponsorkitMainConfig>,
  renderOptions: Required<SponsorkitRenderOptions>,
  sponsors: Sponsorship[],
  t = consola,
) {
  const logPrefix = c.dim(`[${renderOptions.name}]`)
  const dir = resolve(process.cwd(), config.outputDir)
  await fsp.mkdir(dir, { recursive: true })
  if (renderOptions.formats?.includes('json')) {
    const path = join(dir, `${renderOptions.name}.json`)
    await fsp.writeFile(path, JSON.stringify(sponsors, null, 2))
    t.success(`${logPrefix} Wrote to ${r(path)}`)
  }

  sponsors = await config.onSponsorsReady?.(sponsors) || sponsors
  if (renderOptions.filter)
    sponsors = sponsors.filter(s => renderOptions.filter(s, sponsors) !== false)
  if (!renderOptions.includePrivate)
    sponsors = sponsors.filter(s => s.privacyLevel !== 'PRIVATE')

  t.info(`${logPrefix} Composing SVG...`)
  const svg = await renderer.renderSVG(renderOptions, sponsors)

  if (renderOptions.formats?.includes('svg')) {
    const path = join(dir, `${renderOptions.name}.svg`)
    await fsp.writeFile(path, svg, 'utf-8')
    t.success(`${logPrefix} Wrote to ${r(path)}`)
  }

  if (renderOptions.formats?.includes('png')) {
    const path = join(dir, `${renderOptions.name}.png`)
    await fsp.writeFile(path, await svgToPng(svg))
    t.success(`${logPrefix} Wrote to ${r(path)}`)
  }
}
