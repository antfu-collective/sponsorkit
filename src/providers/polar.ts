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
  if (!organization)
    throw new Error('Polar organization is required')

  const apiFetch = ofetch.create({
    baseURL: 'https://api.polar.sh/v1',
    headers: { Authorization: `Bearer ${token}` },
  })

  /**
   * Get the organization by config name. Fetching the ID for future API calls.
   *
   * For backward compatability with existing configs, improved readability & DX,
   * we keep config.polar.organization vs. introducing config.polar.organization_id even
   * though we only need the ID.
   */
  const org = await apiFetch('/organizations', {
    params: {
      slug: organization,
    },
  })
  const orgId = org.items?.[0]?.id
  if (!orgId)
    throw new Error(`Polar organization "${organization}" not found`)

  /**
   * Fetch the list of all subscriptions. This is a paginated
   * endpoint so loop through all the pages
   */
  let page = 1
  let pages = 1
  const subscriptions = []
  do {
    const params: Record<string, any> = {
      organization_id: orgId,
      page,
    }
    const subs = await apiFetch('/subscriptions', { params })
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
