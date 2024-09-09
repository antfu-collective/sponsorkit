/* eslint-disable unicorn/consistent-function-scoping */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { notNullish } from '@antfu/utils'
import { consola } from 'consola'
import c from 'picocolors'
import { version } from '../package.json'
import { loadConfig } from './configs'
import { resolveAvatars, svgToPng } from './processing/image'
import { guessProviders, resolveProviders } from './providers'
import { builtinRenderers } from './renders'
import type { SponsorkitConfig, SponsorkitMainConfig, SponsorkitRenderer, SponsorkitRenderOptions, SponsorMatcher, Sponsorship } from './types'

export {
  tiersComposer as defaultComposer,
  tiersComposer,

  // default
  tiersRenderer as defaultRenderer,
  tiersRenderer,
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
    // Fetch sponsors
    for (const i of providers) {
      t.info(`Fetching sponsorships from ${i.name}...`)
      let sponsors = await i.fetchSponsors(config)
      sponsors.forEach(s => s.provider = i.name)
      sponsors = await config.onSponsorsFetched?.(sponsors, i.name) || sponsors
      t.success(`${sponsors.length} sponsorships fetched from ${i.name}`)
      allSponsors.push(...sponsors)
    }

    // Custom hook
    allSponsors = await config.onSponsorsAllFetched?.(allSponsors) || allSponsors

    // Merge sponsors
    {
      const sponsorsMergeMap = new Map<Sponsorship, Set<Sponsorship>>()

      function pushGroup(group: Sponsorship[]) {
        const existingSets = new Set(group.map(s => sponsorsMergeMap.get(s)).filter(notNullish))
        let set: Set<Sponsorship>
        if (existingSets.size === 1) {
          set = [...existingSets.values()][0]
        }
        else if (existingSets.size === 0) {
          set = new Set(group)
        }
        // Multiple sets, merge them into one
        else {
          set = new Set()
          for (const s of existingSets) {
            for (const i of s)
              set.add(i)
          }
        }

        for (const s of group) {
          set.add(s)
          sponsorsMergeMap.set(s, set)
        }
      }

      function matchSponsor(sponsor: Sponsorship, matcher: SponsorMatcher) {
        if (matcher.provider && sponsor.provider !== matcher.provider)
          return false
        if (matcher.login && sponsor.sponsor.login !== matcher.login)
          return false
        if (matcher.name && sponsor.sponsor.name !== matcher.name)
          return false
        if (matcher.type && sponsor.sponsor.type !== matcher.type)
          return false
        return true
      }

      for (const rule of config.mergeSponsors || []) {
        if (typeof rule === 'function') {
          for (const ship of allSponsors) {
            const result = rule(ship, allSponsors)
            if (result)
              pushGroup(result)
          }
        }
        else {
          const group = rule.flatMap((matcher) => {
            const matched = allSponsors.filter(s => matchSponsor(s, matcher))
            if (!matched.length)
              t.warn(`No sponsor matched for ${JSON.stringify(matcher)}`)
            return matched
          })
          pushGroup(group)
        }
      }

      if (config.sponsorsAutoMerge) {
        for (const ship of allSponsors) {
          if (!ship.sponsor.socialLogins)
            continue
          for (const [provider, login] of Object.entries(ship.sponsor.socialLogins)) {
            const matched = allSponsors.filter(s => s.sponsor.login === login && s.provider === provider)
            if (matched)
              pushGroup([ship, ...matched])
          }
        }
      }

      function mergeSponsors(main: Sponsorship, sponsors: Sponsorship[]) {
        const all = [main, ...sponsors]
        main.isOneTime = all.every(s => s.isOneTime)
        main.expireAt = all.map(s => s.expireAt).filter(notNullish).sort((a, b) => b.localeCompare(a))[0]
        main.createdAt = all.map(s => s.createdAt).filter(notNullish).sort((a, b) => a.localeCompare(b))[0]
        main.monthlyDollars = all.every(s => s.monthlyDollars === -1)
          ? -1
          : all.filter(s => s.monthlyDollars > 0).reduce((a, b) => a + b.monthlyDollars, 0)
        main.provider = [...new Set(all.map(s => s.provider))].join('+')
        return main
      }

      const removeSponsors = new Set<Sponsorship>()
      const groups = new Set(sponsorsMergeMap.values())
      for (const group of groups) {
        if (group.size === 1)
          continue
        const sorted = [...group]
          .sort((a, b) => allSponsors.indexOf(a) - allSponsors.indexOf(b))

        t.info(`Merging ${sorted.map(i => c.cyan(`@${i.sponsor.login}(${i.provider})`)).join(' + ')}`)

        for (const s of sorted.slice(1))
          removeSponsors.add(s)
        mergeSponsors(sorted[0], sorted.slice(1))
      }

      allSponsors = allSponsors.filter(s => !removeSponsors.has(s))
    }

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
  const array = (Array.isArray(replaces) ? replaces : [replaces]).filter(notNullish)
  const entries = array.map((i) => {
    if (!i)
      return []
    if (typeof i === 'function')
      return [i]
    return Object.entries(i) as [string, string][]
  }).flat()
  return entries
}
