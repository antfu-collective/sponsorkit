import { $fetch } from 'ofetch'
import { normalizeUrl } from '../utils'
import type { Provider, Sponsorship } from '../types'

interface SocialLink {
  type: string
  url: string
}

export const OpenCollectiveProvider: Provider = {
  name: 'opencollective',
  fetchSponsors(config) {
    return fetchOpenCollectiveSponsors(
      config.opencollective?.key,
      config.opencollective?.id,
      config.opencollective?.slug,
      config.opencollective?.githubHandle,
      config.includePastSponsors,
    )
  },
}

const API = 'https://api.opencollective.com/graphql/v2/'
const graphql = String.raw

export async function fetchOpenCollectiveSponsors(
  key?: string,
  id?: string,
  slug?: string,
  githubHandle?: string,
  includePastSponsors?: boolean,
): Promise<Sponsorship[]> {
  if (!key)
    throw new Error('OpenCollective api key is required')
  if (!slug && !id && !githubHandle)
    throw new Error('OpenCollective collective id or slug or GitHub handle is required')

  const sponsors: any[] = []
  const monthlyTransactions: any[] = []
  let offset
  offset = 0

  do {
    const query = makeSubscriptionsQuery(id, slug, githubHandle, offset, !includePastSponsors)
    const data = await $fetch(API, {
      method: 'POST',
      body: { query },
      headers: {
        'Api-Key': `${key}`,
        'Content-Type': 'application/json',
      },
    }) as any
    const nodes = data.data.account.orders.nodes
    const totalCount = data.data.account.orders.totalCount

    sponsors.push(...(nodes || []))

    if ((nodes.length) !== 0) {
      if (totalCount > offset + nodes.length)
        offset += nodes.length
      else
        offset = undefined
    }
    else { offset = undefined }
  } while (offset)

  offset = 0
  do {
    const now: Date = new Date()
    const dateFrom: Date | undefined = includePastSponsors
      ? undefined
      : new Date(now.getFullYear(), now.getMonth(), 1)
    const query = makeTransactionsQuery(id, slug, githubHandle, offset, dateFrom)
    const data = await $fetch(API, {
      method: 'POST',
      body: { query },
      headers: {
        'Api-Key': `${key}`,
        'Content-Type': 'application/json',
      },
    }) as any
    const nodes = data.data.account.transactions.nodes
    const totalCount = data.data.account.transactions.totalCount

    monthlyTransactions.push(...(nodes || []))
    if ((nodes.length) !== 0) {
      if (totalCount > offset + nodes.length)
        offset += nodes.length
      else
        offset = undefined
    }
    else { offset = undefined }
  } while (offset)

  const sponsorships: [string, Sponsorship][] = sponsors
    .map(createSponsorFromOrder)
    .filter((sponsorship): sponsorship is [string, Sponsorship] => sponsorship !== null)

  const monthlySponsorships: [string, Sponsorship][] = monthlyTransactions
    .map(t => createSponsorFromTransaction(t, sponsorships.map(i => i[1].raw.id)))
    .filter((sponsorship): sponsorship is [string, Sponsorship] => sponsorship !== null && sponsorship !== undefined)

  const transactionsBySponsorId: Map<string, Sponsorship> = monthlySponsorships.reduce((map, [id, sponsor]) => {
    const existingSponsor = map.get(id)
    if (existingSponsor) {
      const createdAt = new Date(sponsor.createdAt!)
      const existingSponsorCreatedAt = new Date(existingSponsor.createdAt!)
      if (createdAt >= existingSponsorCreatedAt)
        map.set(id, sponsor)

      else if (new Date(existingSponsorCreatedAt.getFullYear(), existingSponsorCreatedAt.getMonth(), 1) === new Date(createdAt.getFullYear(), createdAt.getMonth(), 1))
        existingSponsor.monthlyDollars += sponsor.monthlyDollars
    }
    else { map.set(id, sponsor) }

    return map
  }, new Map())

  const processed: Map<string, Sponsorship> = sponsorships
    .reduce((map, [id, sponsor]) => {
      const existingSponsor = map.get(id)
      if (existingSponsor) {
        const createdAt = new Date(sponsor.createdAt!)
        const existingSponsorCreatedAt = new Date(existingSponsor.createdAt!)
        if (createdAt >= existingSponsorCreatedAt)
          map.set(id, sponsor)
      }
      else { map.set(id, sponsor) }
      return map
    }, new Map())

  const result: Sponsorship[] = Array.from(processed.values()).concat(Array.from(transactionsBySponsorId.values()))
  return result
}

function createSponsorFromOrder(order: any): [string, Sponsorship] | undefined {
  const slug = order.fromAccount.slug
  if (slug === 'github-sponsors') // ignore github sponsors
    return undefined

  let monthlyDollars: number = order.amount.value
  if (order.status !== 'ACTIVE')
    monthlyDollars = -1

  else if (order.frequency === 'MONTHLY')
    monthlyDollars = order.amount.value

  else if (order.frequency === 'YEARLY')
    monthlyDollars = order.amount.value / 12

  else if (order.frequency === 'ONETIME')
    monthlyDollars = order.amount.value

  const sponsor: Sponsorship = {
    sponsor: {
      name: order.fromAccount.name,
      type: getAccountType(order.fromAccount.type),
      login: slug,
      avatarUrl: order.fromAccount.imageUrl,
      websiteUrl: normalizeUrl(getBestUrl(order.fromAccount.socialLinks)),
      linkUrl: `https://opencollective.com/${slug}`,
      socialLogins: getSocialLogins(order.fromAccount.socialLinks, slug),
    },
    isOneTime: order.frequency === 'ONETIME',
    monthlyDollars,
    privacyLevel: order.fromAccount.isIncognito ? 'PRIVATE' : 'PUBLIC',
    tierName: order.tier?.name,
    createdAt: order.frequency === 'ONETIME' ? order.createdAt : order.order?.createdAt,
    raw: order,
  }

  return [order.fromAccount.id, sponsor]
}

function createSponsorFromTransaction(transaction: any, excludeOrders: string[]): [string, Sponsorship] | undefined {
  const slug = transaction.fromAccount.slug
  if (slug === 'github-sponsors') // ignore github sponsors
    return undefined

  if (excludeOrders.includes(transaction.order?.id))
    return undefined

  let monthlyDollars: number = transaction.amount.value
  if (transaction.order?.status !== 'ACTIVE') {
    const firstDayOfCurrentMonth = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
    if (new Date(transaction.createdAt) < firstDayOfCurrentMonth)
      monthlyDollars = -1
  }
  else if (transaction.order?.frequency === 'MONTHLY') {
    monthlyDollars = transaction.order?.amount.value
  }
  else if (transaction.order?.frequency === 'YEARLY') {
    monthlyDollars = transaction.order?.amount.value / 12
  }

  const sponsor: Sponsorship = {
    sponsor: {
      name: transaction.fromAccount.name,
      type: getAccountType(transaction.fromAccount.type),
      login: slug,
      avatarUrl: transaction.fromAccount.imageUrl,
      websiteUrl: normalizeUrl(getBestUrl(transaction.fromAccount.socialLinks)),
      linkUrl: `https://opencollective.com/${slug}`,
      socialLogins: getSocialLogins(transaction.fromAccount.socialLinks, slug),
    },
    isOneTime: transaction.order?.frequency === 'ONETIME',
    monthlyDollars,
    privacyLevel: transaction.fromAccount.isIncognito ? 'PRIVATE' : 'PUBLIC',
    tierName: transaction.tier?.name,
    createdAt: transaction.order?.frequency === 'ONETIME' ? transaction.createdAt : transaction.order?.createdAt,
    raw: transaction,
  }

  return [transaction.fromAccount.id, sponsor]
}

/**
 * Make a partial query for the OpenCollective API.
 * This is used to query for either a collective or an account.
 * If `id` is set, it will query for a collective.
 * If `slug` is set, it will query for an account.
 * If `githubHandle` is set, it will query for an account.
 * If none of the above are set, an error will be thrown.
 *
 * @param id Collective id
 * @param slug Collective slug
 * @param githubHandle GitHub handle
 * @returns The partial query
 * @see makeQuery
 * @see fetchOpenCollectiveSponsors
 */
function makeAccountQueryPartial(id?: string, slug?: string, githubHandle?: string) {
  if (id)
    return `id: "${id}"`
  else if (slug)
    return `slug: "${slug}"`
  else if (githubHandle)
    return `githubHandle: "${githubHandle}"`
  else
    throw new Error('OpenCollective collective id or slug or GitHub handle is required')
}

function makeTransactionsQuery(
  id?: string,
  slug?: string,
  githubHandle?: string,
  offset?: number,
  dateFrom?: Date,
  dateTo?: Date,
) {
  const accountQueryPartial = makeAccountQueryPartial(id, slug, githubHandle)
  const dateFromParam = dateFrom ? `, dateFrom: "${dateFrom.toISOString()}"` : ''
  const dateToParam = dateTo ? `, dateTo: "${dateTo.toISOString()}"` : ''
  return graphql`{
    account(${accountQueryPartial}) {
      transactions(limit: 1000, offset:${offset}, type: CREDIT ${dateFromParam} ${dateToParam}) {
        offset
        limit
        totalCount
        nodes {
          type
          kind
          id
          order {
            id
            status
            frequency
            tier {
              name
            }
            amount {
              value
            }
          }
          createdAt
          amount {
            value
          }
          fromAccount {
            name
            id
            slug
            type
            githubHandle
            socialLinks {
              url
              type
            }
            isIncognito
            imageUrl(height: 460, format: png)
          }
        }
      }
    }
  }`
}

function makeSubscriptionsQuery(
  id?: string,
  slug?: string,
  githubHandle?: string,
  offset?: number,
  activeOnly?: boolean,
) {
  const activeOrNot = activeOnly ? 'onlyActiveSubscriptions: true' : 'onlySubscriptions: true'
  return graphql`{
    account(${makeAccountQueryPartial(id, slug, githubHandle)}) {
      orders(limit: 1000, offset:${offset}, ${activeOrNot}, filter: INCOMING) {
        nodes {
          id
          createdAt
          frequency
          status
          tier {
            name
          }
          amount {
            value
          }
          totalDonations {
            value
          }
          createdAt
          fromAccount {
            name
            id
            slug
            type
            socialLinks {
              url
              type
            }
            isIncognito
            imageUrl(height: 460, format: png)
          }
        }
      }
    }
  }`
}

/**
 * Get the account type from the API values.
 *
 * @param type The type of the account from the API
 * @returns The account type
 */
function getAccountType(type: string): 'User' | 'Organization' {
  switch (type) {
    case 'INDIVIDUAL':
      return 'User'
    case 'ORGANIZATION':
    case 'COLLECTIVE':
    case 'FUND':
    case 'PROJECT':
    case 'EVENT':
    case 'VENDOR':
    case 'BOT':
      return 'Organization'
    default:
      throw new Error(`Unknown account type: ${type}`)
  }
}

/**
 * Get the best URL from a list of social links.
 * The best URL is the first URL in a priority order,
 * with WEBSITE being the highest priority.
 * The rest of the order is somewhat arbitrary.
 *
 * @param socialLinks List of social links
 * @returns The best URL or `undefined` if no URL is found
 * @see makeQuery
 */
function getBestUrl(socialLinks: SocialLink[]): string | undefined {
  const urls = socialLinks
    .filter(i => i.type === 'WEBSITE' || i.type === 'GITHUB' || i.type === 'GITLAB' || i.type === 'TWITTER'
    || i.type === 'FACEBOOK' || i.type === 'YOUTUBE' || i.type === 'INSTAGRAM'
    || i.type === 'LINKEDIN' || i.type === 'DISCORD' || i.type === 'TUMBLR')
    .map(i => i.url)

  return urls[0]
}

function getSocialLogins(socialLinks: SocialLink[] = [], opencollectiveLogin: string): Record<string, string> {
  const socialLogins: Record<string, string> = {}
  for (const link of socialLinks) {
    if (link.type === 'GITHUB') {
      const login = link.url.match(/github\.com\/([^/]*)/)?.[1]
      if (login)
        socialLogins.github = login
    }
  }
  if (opencollectiveLogin)
    socialLogins.opencollective = opencollectiveLogin
  return socialLogins
}
