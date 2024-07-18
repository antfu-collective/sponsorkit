import { createHash } from 'node:crypto'
import { $fetch } from 'ofetch'
import type { Provider, SponsorkitConfig, Sponsorship } from '../types'

// afdian api docs https://afdian.net/p/9c65d9cc617011ed81c352540025c377

export const AfdianProvider: Provider = {
  name: 'afdian',
  fetchSponsors(config) {
    return fetchAfdianSponsors(config.afdian)
  },
}

export async function fetchAfdianSponsors(options: SponsorkitConfig['afdian'] = {}): Promise<Sponsorship[]> {
  const {
    userId,
    token,
    exechangeRate = 6.5,
    includePurchases = true,
    purchaseEffectivity = 30,
  } = options

  if (!userId || !token)
    throw new Error('Afdian id and token are required')

  const sponsors: any[] = []
  const sponsorshipApi = 'https://afdian.com/api/open/query-sponsor'
  let page = 1
  let pages = 1
  do {
    const params = JSON.stringify({ page })
    const ts = Math.round(+new Date() / 1000)
    const sign = md5(token, params, ts, userId)
    const sponsorshipData = await $fetch(sponsorshipApi, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      responseType: 'json',
      body: {
        user_id: userId,
        params,
        ts,
        sign,
      },
    })
    page += 1
    if (sponsorshipData?.ec !== 200)
      break
    pages = sponsorshipData.data.total_page
    if (!includePurchases) {
      sponsorshipData.data.list = sponsorshipData.data.list.filter((sponsor: any) => {
        const current = sponsor.current_plan
        if (!current || current.product_type === 0)
          return true
        return false
      })
    }
    if (purchaseEffectivity > 0) {
      sponsorshipData.data.list = sponsorshipData.data.list.map((sponsor: any) => {
        const current = sponsor.current_plan
        if (!current || current.product_type === 0)
          return sponsor
        const expireTime = current.update_time + purchaseEffectivity * 24 * 3600
        sponsor.current_plan.expire_time = expireTime
        return sponsor
      })
    }
    sponsors.push(...sponsorshipData.data.list)
  } while (page <= pages)

  const processed = sponsors.map((raw: any): Sponsorship => {
    const current = raw.current_plan
    const expireTime = current?.expire_time
    const isExpired = expireTime ? expireTime < Date.now() / 1000 : true
    let name = raw.user.name
    if (name.startsWith('爱发电用户_'))
      name = raw.user.user_id.slice(0, 5)
    const avatarUrl = raw.user.avatar
    return {
      sponsor: {
        type: 'User',
        login: raw.user.user_id,
        name,
        avatarUrl,
        linkUrl: `https://afdian.com/u/${raw.user.user_id}`,
      },
      // all_sum_amount is based on cny
      monthlyDollars: isExpired
        ? -1
        : Number.parseFloat(raw.all_sum_amount) / exechangeRate,
      privacyLevel: 'PUBLIC',
      tierName: 'Afdian',
      createdAt: new Date(raw.first_pay_time * 1000).toISOString(),
      expireAt: expireTime ? new Date(expireTime * 1000).toISOString() : undefined,
      // empty string means no plan, consider as one time sponsor
      isOneTime: Boolean(raw.current_plan?.name),
      provider: 'afdian',
      raw,
    }
  })

  return processed
}

function md5(token: string, params: string, ts: number, userId: string) {
  return createHash('md5').update(`${token}params${params}ts${ts}user_id${userId}`).digest('hex')
}
