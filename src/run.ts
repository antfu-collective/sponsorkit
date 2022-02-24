import { dirname, join, relative, resolve } from 'path'
import fs from 'fs-extra'
import consola from 'consola'
import c from 'picocolors'
import { version } from '../package.json'
import { loadConfig } from './config'
import { fetchSponsors } from './fetch'
import { resolveAvatars, svgToPng } from './image'
import { SvgComposer } from './svg'
import { presets } from './presets'
import type { SponsorkitConfig, Sponsorship } from './types'

function r(path: string) {
  return `./${relative(process.cwd(), path)}`
}

export async function run(inlineConfig?: SponsorkitConfig, t = consola) {
  t.log(`\n${c.magenta(c.bold('SponsorKit'))} ${c.dim(`v${version}`)}\n`)

  const config = await loadConfig(inlineConfig)

  if (!config.token || !config.login)
    throw new Error('Environment variable SPONSORKIT_TOKEN & SPONSORKIT_LOGIN must be provided')

  const dir = resolve(process.cwd(), config.outputDir)
  const cacheFile = resolve(dir, config.cacheFile)

  let sponsors: Sponsorship[]
  if (!fs.existsSync(cacheFile) || config.force) {
    t.info('Fetching sponsorships...')
    sponsors = await fetchSponsors(config.token, config.login)
    await config.onSponsorsFetched?.(sponsors)
    t.success(`${sponsors.length} Sponsorships fetched`)

    t.info('Resolving avatars...')
    await resolveAvatars(sponsors)
    t.success('Avatars resolved')

    await fs.ensureDir(dirname(cacheFile))
    await fs.writeJSON(cacheFile, sponsors, { spaces: 2 })
  }
  else {
    sponsors = await fs.readJSON(cacheFile)
    t.success(`Loaded from cache ${r(cacheFile)}`)
  }

  await fs.ensureDir(dir)
  if (config.formats?.includes('json')) {
    const path = join(dir, `${config.name}.json`)
    await fs.writeJSON(path, sponsors, { spaces: 2 })
    t.success(`Wrote to ${r(path)}`)
  }

  t.info('Composing SVG...')
  const composer = new SvgComposer(config)
  await (config.composeSvg || defaultComposer)(composer, sponsors, config)
  const svg = composer.generateSvg()

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
  const tiers = config.tiers!.sort((a, b) => (a.monthlyDollars ?? Infinity) - (b.monthlyDollars ?? Infinity))

  const finalSponsors = config.tiers!.filter(i => i.monthlyDollars == null)

  if (finalSponsors.length !== 1)
    throw new Error(`There should be exactly one tier with no \`monthlyDollars\`, but got ${finalSponsors.length}`)

  const partitions: Sponsorship[][] = Array.from({ length: tiers.length }, () => [])

  sponsors
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach((i) => {
      let index = tiers.findIndex(t => i.monthlyDollars <= (t.monthlyDollars || Infinity))
      if (index === -1)
        index = tiers.length - 1
      partitions[index].push(i)
    })

  partitions.reverse()
  tiers.reverse()

  composer.addSpan(config.padding?.top ?? 20)

  tiers
    .forEach((t, i) => {
      const sponsors = partitions[i]
      if (!sponsors.length)
        return
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
    })

  composer.addSpan(config.padding?.bottom ?? 20)
}
