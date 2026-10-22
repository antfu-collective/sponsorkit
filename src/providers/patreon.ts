import type { Provider, Sponsorship } from '../types.ts'
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

/** Patreon's v2 API base. The v1 API was retired on 2026-10-07. */
const PATREON_API = 'https://www.patreon.com/api/oauth2/v2'

/** A JSON:API resource identifier; both members are required, except for client-originated resources. */
interface PatreonIdentifier {
  id: string
  type: string
}

/** A relationship may carry `links` instead of `data`, so both are optional here. */
interface PatreonRelationship {
  data?: PatreonIdentifier | PatreonIdentifier[] | null
  links?: { self?: string, related?: string }
}

/** A JSON:API resource; relationships carry the ids used to join `included` back to members. */
interface PatreonResource<A = unknown> {
  id?: string
  type?: string
  attributes?: A
  relationships?: Record<string, PatreonRelationship>
}

export interface PatreonMemberAttributes {
  currently_entitled_amount_cents?: number | null
  patron_status?: string | null
  pledge_relationship_start?: string | null
}

/** Patreon sends `null` when a member has opted out of sharing their profile. */
export interface PatreonUserAttributes {
  first_name?: string | null
  full_name?: string | null
  image_url?: string | null
  url?: string | null
}

interface PatreonTierAttributes {
  amount_cents?: number | null
}

/** Discriminated on `type` so the two resource kinds can be separated by a type guard. */
interface PatreonUserResource extends PatreonResource<PatreonUserAttributes> {
  type: 'user'
}

interface PatreonTierResource extends PatreonResource<PatreonTierAttributes> {
  type: 'tier'
}

interface PatreonMembersData {
  /** A collection document always carries `data`; `[]` when there are no members. */
  data: PatreonResource<PatreonMemberAttributes>[]
  /** Only present when `include` matched something; joined to members by `firstRelatedId`. */
  included?: (PatreonUserResource | PatreonTierResource)[]
  links?: { next?: string }
}

/** A collection document carries `data`; only the campaign `id` is read. */
interface PatreonCampaignsData {
  data: { id: string }[]
}

/** A member joined to the user and tier it references. */
interface PatreonSponsorRecord {
  membership: PatreonResource<PatreonMemberAttributes>
  patron: PatreonUserResource | undefined
  tier: PatreonTierResource | undefined
}

/** `patron_status` is documented only as a nullable string; these two mark a lapsed sponsor. */
const PAST_PATRON_STATUSES: readonly string[] = ['former_patron', 'declined_patron']

export async function fetchPatreonSponsors(token: string): Promise<Sponsorship[]> {
  if (!token)
    throw new Error('Patreon token is required')

  const campaignId = await fetchPatreonCampaignId(token)

  // v2 pages up to 1000 members and returns a `links.next` cursor.
  const sponsors: PatreonSponsorRecord[] = []
  let sponsorshipApi: string | undefined = `${PATREON_API}/campaigns/${campaignId}/members?include=user,currently_entitled_tiers&fields%5Bmember%5D=currently_entitled_amount_cents,patron_status,pledge_relationship_start&fields%5Buser%5D=image_url,url,first_name,full_name&fields%5Btier%5D=amount_cents`

  do {
    // The annotation is needed: this loop feeds `links.next` back into `sponsorshipApi`, and
    // TypeScript cannot infer the response through that cycle.
    const { included = [], data: members, links }: PatreonMembersData = await $fetch(sponsorshipApi, {
      method: 'GET',
      headers: patreonHeaders(token),
      responseType: 'json',
    })
    // Split by kind so each lookup below searches a homogeneous array.
    const users = included.filter(v => v.type === 'user')
    const tiers = included.filter(v => v.type === 'tier')

    sponsors.push(
      ...members
        .filter(membership => membership.attributes?.patron_status != null)
        .map(membership => ({
          membership,
          patron: users.find(v => v.id === firstRelatedId(membership, 'user')),
          tier: tiers.find(v => v.id === firstRelatedId(membership, 'currently_entitled_tiers')),
        })),
    )
    sponsorshipApi = links?.next
  } while (sponsorshipApi)

  return sponsors.map((raw): Sponsorship => {
    const attributes = raw.membership.attributes
    // Patreon masks the identity of members who opted out of sharing their profile.
    const patronAttributes = raw.patron?.attributes
    const name = patronAttributes?.full_name || patronAttributes?.first_name || 'Anonymous'

    // A gifted membership can have no entitled amount but still name a paid tier.
    const entitledCents = attributes?.currently_entitled_amount_cents
    const tierCents = raw.tier?.attributes?.amount_cents
    const monthlyDollars = entitledCents == null || entitledCents <= 0
      ? Math.floor((tierCents ?? 0) / 100)
      : Math.floor(entitledCents / 100)

    const sponsor: Sponsorship = {
      sponsor: {
        avatarUrl: patronAttributes?.image_url || '',
        login: patronAttributes?.first_name || name,
        name,
        type: 'User', // Patreon only support user
        linkUrl: patronAttributes?.url ?? undefined,
      },
      isOneTime: false, // One-time pledges not supported
      monthlyDollars,
      privacyLevel: 'PUBLIC', // Patreon is all public
      tierName: 'Patreon',
      createdAt: attributes?.pledge_relationship_start ?? undefined,
    }

    // "former_patron" and "declined_patron" are both past sponsors
    const status = attributes?.patron_status
    if (status != null && PAST_PATRON_STATUSES.includes(status))
      sponsor.monthlyDollars = -1

    return sponsor
  })
}

/** Resolve the campaign owned by the authenticated user. */
async function fetchPatreonCampaignId(token: string): Promise<string> {
  const { data: campaigns } = await $fetch<PatreonCampaignsData>(`${PATREON_API}/campaigns`, {
    method: 'GET',
    headers: patreonHeaders(token),
    responseType: 'json',
  })
  const campaignId = campaigns[0]?.id
  if (!campaignId) {
    throw new Error(
      'No Patreon campaign found for the given token. '
      + 'Make sure the token belongs to a creator account and was created for a v2 client '
      + '(the v2 `campaigns` scope is required).',
    )
  }
  return campaignId
}

/**
 * The first id of a relationship that may be a to-one or a to-many. The optional chain is
 * load-bearing: an empty to-many relationship yields `undefined`, which the type of `data[0]` does
 * not show because `noUncheckedIndexedAccess` is off.
 */
function firstRelatedId(resource: PatreonResource, name: string): string | undefined {
  const data = resource.relationships?.[name]?.data
  const entry = Array.isArray(data) ? data[0] : data
  return entry?.id
}

/** Shared by both calls so their headers cannot drift apart. */
function patreonHeaders(token: string) {
  return {
    'Authorization': `bearer ${token}`,
    // Patreon may drop requests without one.
    'User-Agent': 'SponsorKit (https://github.com/antfu-collective/sponsorkit)',
  }
}
