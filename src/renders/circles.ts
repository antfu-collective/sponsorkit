import type { Sponsor, SponsorkitRenderer } from '../types'
import { SvgComposer, generateBadge } from '../processing/svg'
import { base64ToArrayBuffer, pngToDataUri, round } from '../processing/image'

export const circlesRenderer: SponsorkitRenderer = {
  name: 'sponsorkit:circles',
  async renderSVG(config, _sponsors) {
    const { hierarchy, pack } = await import('d3-hierarchy')
    const composer = new SvgComposer(config)

    const amountMax = Math.max(..._sponsors.map(sponsor => sponsor.monthlyDollars))
    const RADIUS_MIN = 10
    const RADIUS_MAX = 300
    const RADIUS_PAST = 6

    let sponsors = _sponsors
      .map((sponsor, idx) => ({
        id: `sponsor-${idx}`,
        ...sponsor,
      }))

    if (!config.includePastSponsors)
      sponsors = sponsors.filter(sponsor => sponsor.monthlyDollars > 0)

    const root = hierarchy({ ...sponsors[0], children: sponsors, id: 'root' })
      .sum(d => d.monthlyDollars < 0 ? RADIUS_PAST : lerp(RADIUS_MIN, RADIUS_MAX, (Math.max(0.1, d.monthlyDollars || 0) / amountMax) ** 0.9))
      .sort((a, b) => (b.value || 0) - (a.value || 0))

    const p = pack<typeof sponsors[0]>()
    p.size([config.width, config.width])
    p.padding(config.width / 400)
    const circles = p(root as any).descendants().slice(1)

    for (const circle of circles) {
      const id = circle.data.id
      const sponsor = sponsors.find(s => s.id === id)
      if (sponsor) {
        composer.addRaw(generateBadge(
          circle.x - circle.r,
          circle.y - circle.r,
          await getRoundedAvatars(sponsor.sponsor),
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
    }

    composer.height = config.width

    function lerp(a: number, b: number, t: number) {
      if (t < 0)
        return a
      return a + (b - a) * t
    }

    return composer.generateSvg()
  },
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
