import { base64ToArrayBuffer, pngToDataUri, round } from '../processing/image'
import { generateBadge, SvgComposer } from '../processing/svg'
import type { Sponsor, SponsorkitRenderer, Sponsorship } from '../types'

export const circlesRenderer: SponsorkitRenderer = {
  name: 'sponsorkit:circles',
  async renderSVG(config, sponsors) {
    const { hierarchy, pack } = await import('d3-hierarchy')
    const composer = new SvgComposer(config)

    const amountMax = Math.max(...sponsors.map(sponsor => sponsor.monthlyDollars))
    const {
      radiusMax = 300,
      radiusMin = 10,
      radiusPast = 5,
      weightInterop = defaultInterop,
    } = config.circles || {}

    function defaultInterop(sponsor: Sponsorship) {
      return sponsor.monthlyDollars < 0
        ? radiusPast
        : lerp(radiusMin, radiusMax, (Math.max(0.1, sponsor.monthlyDollars || 0) / amountMax) ** 0.9)
    }

    if (!config.includePastSponsors)
      sponsors = sponsors.filter(sponsor => sponsor.monthlyDollars > 0)

    const root = hierarchy({ ...sponsors[0], children: sponsors, id: 'root' })
      .sum(d => weightInterop(d, amountMax))
      .sort((a, b) => (b.value || 0) - (a.value || 0))

    const p = pack<typeof sponsors[0]>()
    p.size([config.width, config.width])
    p.padding(config.width / 400)
    const circles = p(root as any).descendants().slice(1)

    for (const circle of circles) {
      composer.addRaw(generateBadge(
        circle.x - circle.r,
        circle.y - circle.r,
        await getRoundedAvatars(circle.data.sponsor),
        {
          name: false,
          boxHeight: circle.r * 2,
          boxWidth: circle.r * 2,
          avatar: {
            size: circle.r * 2,
          },
        },
      ))
    }

    composer.height = config.width

    return composer.generateSvg()
  },
}

function lerp(a: number, b: number, t: number) {
  if (t < 0)
    return a
  return a + (b - a) * t
}

async function getRoundedAvatars(sponsor: Sponsor) {
  if (!sponsor.avatarBuffer || sponsor.type === 'User')
    return sponsor

  const data = base64ToArrayBuffer(sponsor.avatarBuffer)
  /// keep-sorted
  return {
    ...sponsor,
    avatarUrlHighRes: pngToDataUri(await round(data, 0.5, 120)),
    avatarUrlLowRes: pngToDataUri(await round(data, 0.5, 50)),
    avatarUrlMediumRes: pngToDataUri(await round(data, 0.5, 80)),
  }
}
