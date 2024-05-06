import { ofetch } from 'ofetch'
import type { Provider, Sponsorship } from '../types'

export const PolarProvider: Provider = {
  name: 'polar',
  fetchSponsors(config) {
    return fetchPolarSponsors(config.polar?.token || config.token!)
  },
}

export async function fetchPolarSponsors(token: string): Promise<Sponsorship[]> {
  if (!token)
    throw new Error('Polar token is required')

  const apiFetch = ofetch.create({
    baseURL: 'https://api.polar.sh/api/v1',
    headers: { Authorization: `Bearer ${token}` },
  })

  /**
   * First fetch the list of all subscriptions. This is a paginated
   * endpoint so loop through all the pages
   */
  let page = 1
  let pages = 1
  const subscriptions = []
  do {
    const subs = await apiFetch('/subscriptions/subscriptions/search', { params: { page } })
    subscriptions.push(...subs.items)

    pages = subs.pagination.max_page
    page += 1
  } while (page <= pages)

  /**
   * People can subscribe for free on Polar : the price is null in this case
   * so we filter out those subscriptions
   */
  return subscriptions.filter(sub => !!sub.price)
    .map(sub => ({
      sponsor: {
        name: sub.user.public_name,
        avatarUrl: sub.user.avatar_url,
        login: sub.user.github_username,
        type: sub.subscription_tier.type === 'individual' ? 'User' : 'Organization',
      },
      isOneTime: false,
      provider: 'polar',
      privacyLevel: 'PUBLIC',
      createdAt: new Date(sub.created_at).toISOString(),
      tierName: sub.subscription_tier.name,
      monthlyDollars: sub.price.price_amount / 100,
    }))
}
