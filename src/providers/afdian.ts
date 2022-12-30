import { createHash } from 'node:crypto'
import { $fetch } from 'ohmyfetch'
import type { Provider, Sponsorship } from '../types'

// afdian api docs https://afdian.net/p/9c65d9cc617011ed81c352540025c377

export const AfdianProvider: Provider = {
  name: 'afdian',
  fetchSponsors(config) {
    return fetchAfdianSponsors(config.afdian?.userId, config.afdian?.token)
  },
}

export async function fetchAfdianSponsors(userId?: string, token?: string): Promise<Sponsorship[]> {
  if (!userId || !token)
    throw new Error('Afdian id and token are required')

  const sponsors: any[] = []
  const sponsorshipApi = 'https://afdian.net/api/open/query-sponsor'
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
    sponsors.push(...sponsorshipData.data.list)
  } while (page <= pages)

  const processed = sponsors.map((raw: any): Sponsorship => ({
    sponsor: {
      type: 'User',
      login: raw.user.user_id,
      name: raw.user.name,
      avatarUrl: raw.user.avatar,
      linkUrl: `https://afdian.net/u/${raw.user.user_id}`,
    },
    // all_sum_amount is based on cny
    monthlyDollars: parseFloat(raw.all_sum_amount) / 6.5,
    privacyLevel: 'PUBLIC',
    tierName: 'Afdian',
    createdAt: new Date(raw.first_pay_time * 1000).toISOString(),
    // empty string means no plan, consider as one time sponsor
    isOneTime: Boolean(raw.current_plan.name),
    provider: 'afdian',
  }))

  return processed
}

function md5(token: string, params: string, ts: number, userId: string) {
  return createHash('md5').update(`${token}params${params}ts${ts}user_id${userId}`).digest('hex')
}
