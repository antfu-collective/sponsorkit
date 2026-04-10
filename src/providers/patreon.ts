import type { Provider, Sponsorship } from '../types'
import { $fetch } from 'ofetch'

export const PatreonProvider: Provider = {
  name: 'patreon',
  fetchSponsors(config) {
    if (config.mode === 'sponsees') {
      console.warn('[sponsorkit] Patreon provider does not support `mode: "sponsees"` yet')
      return Promise.resolve([])
    }

    return fetchPatreonSponsors(config.patreon?.token || config.token!)
  },
}

export async function fetchPatreonSponsors(token: string): Promise<Sponsorship[]> {
  if (!token)
    throw new Error('Patreon token is required')

  // Get current authenticated user's campaign ID (Everyone has one default campaign)
  const userData = await $fetch(
    'https://www.patreon.com/api/oauth2/api/current_user/campaigns?include=null',
    {
      method: 'GET',
      headers: {
        'Authorization': `bearer ${token}`,
        'Content-Type': 'application/json',
      },
      responseType: 'json',
    },
  )
  const userCampaignId = userData.data[0].id

  const sponsors: any[] = []
  let sponsorshipApi = `https://www.patreon.com/api/oauth2/v2/campaigns/${userCampaignId}/members?include=user,currently_entitled_tiers&fields%5Bmember%5D=currently_entitled_amount_cents,patron_status,pledge_relationship_start,lifetime_support_cents&fields%5Buser%5D=image_url,url,first_name,full_name&fields%5Btier%5D=amount_cents&page%5Bcount%5D=100`
  do {
    // Get pledges from the campaign
    const sponsorshipData = await $fetch(sponsorshipApi, {
      method: 'GET',
      headers: {
        'Authorization': `bearer ${token}`,
        'Content-Type': 'application/json',
      },
      responseType: 'json',
    })
    sponsors.push(
      ...sponsorshipData.data
        // Filter out "never pledged" members
        .filter((membership: any) => membership.attributes.patron_status !== null)
        .map((membership: any) => ({
          membership,
          patron: sponsorshipData.included.find(
            (v: any) => v.type === 'user' && v.id === membership.relationships.user.data.id,
          ),
          tier: sponsorshipData.included.find(
            (v: any) => v.type === 'tier' && v.id === membership.relationships.currently_entitled_tiers.data[0]?.id,
          ),
        })),
    )
    sponsorshipApi = sponsorshipData.links?.next
  } while (sponsorshipApi)

  const processed = sponsors.map((raw: any): Sponsorship => {
    const sponsor: Sponsorship = {
      sponsor: {
        avatarUrl: raw.patron.attributes.image_url,
        login: raw.patron.attributes.first_name,
        name: raw.patron.attributes.full_name,
        type: 'User', // Patreon only support user
        linkUrl: raw.patron.attributes.url,
      },
      isOneTime: false, // One-time pledges not supported
      monthlyDollars: Math.floor(raw.membership.attributes.currently_entitled_amount_cents / 100),
      privacyLevel: 'PUBLIC', // Patreon is all public
      tierName: 'Patreon',
      createdAt: raw.membership.attributes.pledge_relationship_start,
    }

    // The "former_patron" and "declined_patron" both is past sponsors
    if (['former_patron', 'declined_patron'].includes(raw.membership.attributes.patron_status))
      sponsor.monthlyDollars = -1
    // If the sponsor is not a patron but has a gifted membership, we can still show the tier amount
    else if (sponsor.monthlyDollars <= 0 && (raw.tier?.attributes.amount_cents || 0) > 0)
      sponsor.monthlyDollars = Math.floor(raw.tier.attributes.amount_cents / 100)

    return sponsor
  })

  return processed
}
