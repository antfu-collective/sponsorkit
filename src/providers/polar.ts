import { ofetch } from 'ofetch'
import type { Provider, Sponsorship } from '../types'

export const PolarProvider: Provider = {
  name: 'polar',
  fetchSponsors(config) {
    return fetchPolarSponsors(config.polar?.token || config.token!, config.polar?.organization)
  },
}

export async function fetchPolarSponsors(token: string, organization?: string): Promise<Sponsorship[]> {
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
    const params: Record<string, any> = { page }
    if (organization) {
      params.organization_name = organization
      // Polar only supports GitHub for now
      params.platform = 'github'
    }
    const subs = await apiFetch('/subscriptions/subscriptions/search', { params })
    subscriptions.push(...subs.items)

    pages = subs.pagination.max_page
    page += 1
  } while (page <= pages)

  return subscriptions
    /**
     * - People can subscribe for free on Polar : the price is null in this case
     */
    .filter(sub => !!sub.price)
    .map((sub) => {
      const isActive = sub.status === 'active'

      return {
        sponsor: {
          name: sub.user.public_name,
          avatarUrl: sub.user.avatar_url,
          login: sub.user.github_username,
          type: sub.product.type === 'individual' ? 'User' : 'Organization',
          socialLogins: {
            github: sub.user.github_username,
          },
        },
        isOneTime: false,
        provider: 'polar',
        privacyLevel: 'PUBLIC',
        createdAt: new Date(sub.created_at).toISOString(),
        tierName: isActive ? sub.product.name : undefined,
        monthlyDollars: isActive ? sub.price.price_amount / 100 : -1,
      }
    })
}
