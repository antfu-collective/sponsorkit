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
import { builtinRenderers } from './renders'

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

  const linksReplacements = normalizeReplacements(config.replaceLinks)
  const avatarsReplacements = normalizeReplacements(config.replaceAvatars)

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

    allSponsors = await config.onSponsorsAllFetched?.(allSponsors) || allSponsors

    // Links and avatars replacements
    allSponsors.forEach((ship) => {
      for (const r of linksReplacements) {
        if (typeof r === 'function') {
          const result = r(ship)
          if (result) {
            ship.sponsor.linkUrl = result
            break
          }
        }
        else if (r[0] === ship.sponsor.linkUrl) {
          ship.sponsor.linkUrl = r[1]
          break
        }
      }
      for (const r of avatarsReplacements) {
        if (typeof r === 'function') {
          const result = r(ship)
          if (result) {
            ship.sponsor.avatarUrl = result
            break
          }
        }
        else if (r[0] === ship.sponsor.avatarUrl) {
          ship.sponsor.avatarUrl = r[1]
          break
        }
      }
    })

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

  allSponsors = await config.onSponsorsReady?.(allSponsors) || allSponsors

  if (config.renders?.length) {
    t.info(`Generating with ${config.renders.length} renders...`)
    await Promise.all(config.renders.map(async (renderOptions) => {
      const mergedOptions = {
        ...fullConfig,
        ...renderOptions,
      }
      const renderer = builtinRenderers[mergedOptions.renderer || 'tiers']
      await applyRenderer(
        renderer,
        config,
        mergedOptions,
        allSponsors,
        t,
      )
    }))
  }
  else {
    const renderer = builtinRenderers[fullConfig.renderer || 'tiers']
    await applyRenderer(
      renderer,
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
  sponsors = [...sponsors]
  sponsors = await renderOptions.onBeforeRenderer?.(sponsors) || sponsors

  const logPrefix = c.dim(`[${renderOptions.name}]`)
  const dir = resolve(process.cwd(), config.outputDir)
  await fsp.mkdir(dir, { recursive: true })
  if (renderOptions.formats?.includes('json')) {
    const path = join(dir, `${renderOptions.name}.json`)
    await fsp.writeFile(path, JSON.stringify(sponsors, null, 2))
    t.success(`${logPrefix} Wrote to ${r(path)}`)
  }

  if (renderOptions.filter)
    sponsors = sponsors.filter(s => renderOptions.filter(s, sponsors) !== false)
  if (!renderOptions.includePrivate)
    sponsors = sponsors.filter(s => s.privacyLevel !== 'PRIVATE')

  t.info(`${logPrefix} Composing SVG...`)
  let svg = await renderer.renderSVG(renderOptions, sponsors)
  svg = await renderOptions.onSvgGenerated?.(svg) || svg

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

function normalizeReplacements(replaces: SponsorkitMainConfig['replaceLinks']) {
  const array = (Array.isArray(replaces) ? replaces : [replaces]).filter(Boolean)
  const entries = array.map((i) => {
    if (!i)
      return []
    if (typeof i === 'function')
      return [i]
    return Object.entries(i) as [string, string][]
  }).flat()
  return entries
}
