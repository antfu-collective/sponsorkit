import { dirname, join, relative, resolve } from 'path'
import fs from 'fs-extra'
import consola from 'consola'
import c from 'picocolors'
import { version } from '../package.json'
import { loadConfig } from './config'
import { resolveAvatars, svgToPng } from './image'
import { SvgComposer } from './svg'
import { presets } from './presets'
import type { SponsorkitConfig, Sponsorship } from './types'
import { guessProviders, resolveProviders } from './providers'

function r(path: string) {
  return `./${relative(process.cwd(), path)}`
}

export async function run(inlineConfig?: SponsorkitConfig, t = consola) {
  t.log(`\n${c.magenta(c.bold('SponsorKit'))} ${c.dim(`v${version}`)}\n`)

  const config = await loadConfig(inlineConfig)
  const dir = resolve(process.cwd(), config.outputDir)
  const cacheFile = resolve(dir, config.cacheFile)

  const providers = resolveProviders(config.providers || guessProviders(config))

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
    await resolveAvatars(allSponsors, config.fallbackAvatar)
    t.success('Avatars resolved')

    await fs.ensureDir(dirname(cacheFile))
    await fs.writeJSON(cacheFile, allSponsors, { spaces: 2 })
  }
  else {
    allSponsors = await fs.readJSON(cacheFile)
    t.success(`Loaded from cache ${r(cacheFile)}`)
  }

  allSponsors = await config.onSponsorsReady?.(allSponsors) || allSponsors
  allSponsors = allSponsors.filter(s => config.filter?.(s, allSponsors) !== false)

  await fs.ensureDir(dir)
  if (config.formats?.includes('json')) {
    const path = join(dir, `${config.name}.json`)
    await fs.writeJSON(path, allSponsors, { spaces: 2 })
    t.success(`Wrote to ${r(path)}`)
  }

  t.info('Composing SVG...')
  const composer = new SvgComposer(config)
  await (config.customComposer || defaultComposer)(composer, allSponsors, config)
  let svg = composer.generateSvg()

  svg = await config.onSvgGenerated?.(svg) || svg

  if (config.formats?.includes('svg')) {
    const path = join(dir, `${config.name}.svg`)
    await fs.writeFile(path, svg, 'utf-8')
    t.success(`Wrote to ${r(path)}`)
  }

  if (config.formats?.includes('png')) {
    const path = join(dir, `${config.name}.png`)
    await fs.writeFile(path, await svgToPng(svg))
    t.success(`Wrote to ${r(path)}`)
  }
}

export async function defaultComposer(composer: SvgComposer, sponsors: Sponsorship[], config: SponsorkitConfig) {
  const tiers = config.tiers!.sort((a, b) => (b.monthlyDollars ?? 0) - (a.monthlyDollars ?? 0))

  const finalSponsors = config.tiers!.filter(i => i.monthlyDollars == null || i.monthlyDollars === 0)

  if (finalSponsors.length !== 1)
    throw new Error(`There should be exactly one tier with no \`monthlyDollars\`, but got ${finalSponsors.length}`)

  const partitions: Sponsorship[][] = Array.from({ length: tiers.length }, () => [])

  sponsors
    .sort((a, b) => a.createdAt!.localeCompare(b.createdAt!))
    .forEach((i) => {
      let index = tiers.findIndex(t => i.monthlyDollars >= (t.monthlyDollars || 0)) || 0
      if (index === -1)
        index = 0
      partitions[index].push(i)
    })

  composer.addSpan(config.padding?.top ?? 20)

  tiers
    .forEach((t, i) => {
      const sponsors = partitions[i]
      t.composeBefore?.(composer, sponsors, config)
      if (t.compose) {
        t.compose(composer, sponsors, config)
      }
      else {
        if (sponsors.length) {
          const paddingTop = t.padding?.top ?? 20
          const paddingBottom = t.padding?.bottom ?? 10
          if (paddingTop)
            composer.addSpan(paddingTop)
          if (t.title) {
            composer
              .addTitle(t.title)
              .addSpan(5)
          }
          composer.addSponsorGrid(sponsors, t.preset || presets.base)
          if (paddingBottom)
            composer.addSpan(paddingBottom)
        }
      }
      t.composeAfter?.(composer, sponsors, config)
    })

  composer.addSpan(config.padding?.bottom ?? 20)
}
