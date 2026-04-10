import type { GitHubAccountType, Provider, SponsorkitConfig, Sponsorship, Tier } from '../types'
import { $fetch } from 'ofetch'
import { normalizeUrl } from '../utils'

function getMonthDifference(startDate: Date, endDate: Date) {
  return (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth())
}

function getCurrentMonthTier(
  dateNow: Date,
  sponsorDate: Date,
  tiers: Tier[],
  monthlyDollars: number,
) {
  let currentMonths = 0

  for (const tier of tiers) {
    // Calculate how many full months this tier can be funded for
    const monthsAtTier = Math.floor(monthlyDollars / tier.monthlyDollars!)
    if (monthsAtTier === 0) {
      continue
    }

    // Check if the current date falls within the months covered by this tier
    if (currentMonths + monthsAtTier > getMonthDifference(sponsorDate, dateNow)) {
      return tier.monthlyDollars!
    }

    // Deduct the used amount for these months and update the current month counter
    monthlyDollars -= monthsAtTier * tier.monthlyDollars!
    currentMonths += monthsAtTier
  }

  return -1
}

const API = 'https://api.github.com/graphql'
const graphql = String.raw

export const GitHubProvider: Provider = {
  name: 'github',
  fetchSponsors(config) {
    if (config.mode === 'sponsees') {
      return fetchGitHubSponsoringAsSponsorships(
        config.github?.token || config.token!,
        config.github?.login || config.login!,
        config.github?.type || 'user',
      )
    }

    return fetchGitHubSponsors(
      config.github?.token || config.token!,
      config.github?.login || config.login!,
      config.github?.type || 'user',
      config,
    )
  },
}

export async function fetchGitHubSponsors(
  token: string,
  login: string,
  type: GitHubAccountType,
  config: SponsorkitConfig,
): Promise<Sponsorship[]> {
  if (!token)
    throw new Error('GitHub token is required')
  if (!login)
    throw new Error('GitHub login is required')
  if (!['user', 'organization'].includes(type))
    throw new Error('GitHub type must be either `user` or `organization`')

  const sponsors: Sponsorship[] = []
  let cursor

  const tiers = config.tiers?.filter(tier => tier.monthlyDollars && tier.monthlyDollars > 0).sort((a, b) => b.monthlyDollars! - a.monthlyDollars!)
  do {
    const query = makeQuery(login, type, !config.includePastSponsors, cursor)
    const data = await $fetch(API, {
      method: 'POST',
      body: { query },
      headers: {
        'Authorization': `bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }) as any

    if (!data)
      throw new Error(`Get no response on requesting ${API}`)
    else if (data.errors?.[0]?.type === 'INSUFFICIENT_SCOPES')
      throw new Error('Token is missing the `read:user` and/or `read:org` scopes')
    else if (data.errors?.length)
      throw new Error(`GitHub API error:\n${JSON.stringify(data.errors, null, 2)}`)

    sponsors.push(
      ...(data.data[type].sponsorshipsAsMaintainer.nodes || []),
    )
    if (data.data[type].sponsorshipsAsMaintainer.pageInfo.hasNextPage)
      cursor = data.data[type].sponsorshipsAsMaintainer.pageInfo.endCursor
    else
      cursor = undefined
  } while (cursor)

  const dateNow = new Date()
  const processed = sponsors
    .filter((raw: any) => !!raw.tier)
    .map((raw: any): Sponsorship => {
      let monthlyDollars: number = raw.tier.monthlyPriceInDollars

      if (!raw.isActive) {
        if (tiers && raw.tier.isOneTime && config.prorateOnetime) {
          monthlyDollars = getCurrentMonthTier(
            dateNow,
            new Date(raw.createdAt),
            tiers,
            monthlyDollars,
          )
        }
        else {
          monthlyDollars = -1
        }
      }

      return {
        sponsor: {
          ...raw.sponsorEntity,
          websiteUrl: normalizeUrl(raw.sponsorEntity.websiteUrl),
          linkUrl: `https://github.com/${raw.sponsorEntity.login}`,
          __typename: undefined,
          type: raw.sponsorEntity.__typename,
        },
        isOneTime: raw.tier.isOneTime,
        monthlyDollars,
        privacyLevel: raw.privacyLevel,
        tierName: raw.tier.name,
        createdAt: raw.createdAt,
      }
    })

  return processed
}

export function makeQuery(
  login: string,
  type: GitHubAccountType,
  activeOnly = true,
  cursor?: string,
) {
  return graphql`{
  ${type}(login: "${login}") {
    sponsorshipsAsMaintainer(activeOnly: ${Boolean(activeOnly)}, first: 100${cursor ? ` after: "${cursor}"` : ''}) {
      totalCount
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
        createdAt
        privacyLevel
        isActive
        tier {
          name
          isOneTime
          monthlyPriceInCents
          monthlyPriceInDollars
        }
        sponsorEntity {
          __typename
          ...on Organization {
            login
            name
            avatarUrl
            websiteUrl
          }
          ...on User {
            login
            name
            avatarUrl
            websiteUrl
          }
        }
      }
    }
  }
}`
}

export interface GitHubSponsoringRecord {
  sponsorable: {
    type: 'User' | 'Organization'
    login: string
    name: string
    avatarUrl: string
    websiteUrl?: string
    linkUrl: string
  }
  monthlyDollars: number
  monthlyCents: number
  tierName: string
  isOneTime: boolean
  privacyLevel?: 'PUBLIC' | 'PRIVATE'
  createdAt: string
  isActive: boolean
  raw: any
}

export interface GitHubSponsoringTotalOptions {
  since?: string
  until?: string
  sponsorableLogins?: string[]
}

function assertGitHubSponsoringParams(
  token: string,
  login: string,
  type: GitHubAccountType,
) {
  if (!token)
    throw new Error('GitHub token is required')
  if (!login)
    throw new Error('GitHub login is required')
  if (!['user', 'organization'].includes(type))
    throw new Error('GitHub type must be either `user` or `organization`')
}

async function requestGitHubSponsoringGraphQL(token: string, query: string): Promise<any> {
  const data = await $fetch(API, {
    method: 'POST',
    body: { query },
    headers: {
      'Authorization': `bearer ${token}`,
      'Content-Type': 'application/json',
    },
  }) as any

  if (!data)
    throw new Error(`Get no response on requesting ${API}`)
  else if (data.errors?.[0]?.type === 'INSUFFICIENT_SCOPES')
    throw new Error('Token is missing the `read:user` and/or `read:org` scopes')
  else if (data.errors?.length)
    throw new Error(`GitHub API error:\n${JSON.stringify(data.errors, null, 2)}`)

  return data
}

async function fetchGitHubSponsoringNodes(
  token: string,
  login: string,
  type: GitHubAccountType,
  activeOnly: boolean,
): Promise<any[]> {
  const nodes: any[] = []
  let cursor: string | undefined

  do {
    const query = makeSponsoringQuery(login, type, activeOnly, cursor)
    const data = await requestGitHubSponsoringGraphQL(token, query)
    const page = data.data?.[type]?.sponsorshipsAsSponsor
    if (!page)
      throw new Error('Invalid GitHub response: `sponsorshipsAsSponsor` is missing')

    nodes.push(...(page.nodes || []))
    cursor = page.pageInfo?.hasNextPage
      ? page.pageInfo.endCursor
      : undefined
  } while (cursor)

  return nodes
}

function toGitHubSponsoringRecord(raw: any): GitHubSponsoringRecord {
  return {
    sponsorable: {
      type: raw.sponsorable.__typename,
      login: raw.sponsorable.login,
      name: raw.sponsorable.name || raw.sponsorable.login,
      avatarUrl: raw.sponsorable.avatarUrl,
      websiteUrl: normalizeUrl(raw.sponsorable.websiteUrl),
      linkUrl: `https://github.com/${raw.sponsorable.login}`,
    },
    monthlyDollars: raw.tier.monthlyPriceInDollars,
    monthlyCents: raw.tier.monthlyPriceInCents,
    tierName: raw.tier.name,
    isOneTime: raw.tier.isOneTime,
    privacyLevel: raw.privacyLevel,
    createdAt: raw.createdAt,
    isActive: raw.isActive,
    raw,
  }
}

function groupSponsoringRecordsByLogin(records: GitHubSponsoringRecord[]) {
  const recordsBySponsorable = new Map<string, GitHubSponsoringRecord[]>()
  for (const record of records) {
    const list = recordsBySponsorable.get(record.sponsorable.login)
    if (list)
      list.push(record)
    else
      recordsBySponsorable.set(record.sponsorable.login, [record])
  }
  return recordsBySponsorable
}

async function fetchTotalCentsBySponsorable(
  token: string,
  login: string,
  type: GitHubAccountType,
  sponsorableLogins: string[],
) {
  return new Map(
    await Promise.all(
      sponsorableLogins.map(async (sponsorableLogin) => {
        const totalInCents = await fetchGitHubTotalSponsorshipAmountAsSponsor(
          token,
          login,
          type,
          { sponsorableLogins: [sponsorableLogin] },
        )
        return [sponsorableLogin, totalInCents] as const
      }),
    ),
  )
}

function summarizeSponsoringRecords(records: GitHubSponsoringRecord[]) {
  const [first, ...rest] = records
  let latest = first
  let firstCreatedAt = first.createdAt
  let isOneTime = first.isOneTime
  const raws = [first.raw]

  for (const record of rest) {
    raws.push(record.raw)
    if (Date.parse(record.createdAt) > Date.parse(latest.createdAt))
      latest = record
    if (record.createdAt.localeCompare(firstCreatedAt) < 0)
      firstCreatedAt = record.createdAt
    isOneTime &&= record.isOneTime
  }

  return {
    latest,
    firstCreatedAt,
    isOneTime,
    raws,
  }
}

export async function fetchGitHubSponsoring(
  token: string,
  login: string,
  type: GitHubAccountType,
  activeOnly = true,
): Promise<GitHubSponsoringRecord[]> {
  assertGitHubSponsoringParams(token, login, type)

  return (await fetchGitHubSponsoringNodes(token, login, type, activeOnly))
    .filter((raw: any) => !!raw.tier && !!raw.sponsorable)
    .map(toGitHubSponsoringRecord)
}

export async function fetchGitHubSponsoringAsSponsorships(
  token: string,
  login: string,
  type: GitHubAccountType,
): Promise<Sponsorship[]> {
  // Sponsees mode always loads full history regardless of active status.
  const records = await fetchGitHubSponsoring(token, login, type, false)
  const recordsBySponsorable = groupSponsoringRecordsByLogin(records)
  const totalBySponsorable = await fetchTotalCentsBySponsorable(
    token,
    login,
    type,
    [...recordsBySponsorable.keys()],
  )

  return [...recordsBySponsorable.entries()].map(([sponsorableLogin, list]) => {
    const summary = summarizeSponsoringRecords(list)
    const totalInCents = totalBySponsorable.get(sponsorableLogin) || 0

    return {
      sponsor: {
        type: summary.latest.sponsorable.type,
        login: summary.latest.sponsorable.login,
        name: summary.latest.sponsorable.name,
        avatarUrl: summary.latest.sponsorable.avatarUrl,
        websiteUrl: summary.latest.sponsorable.websiteUrl,
        linkUrl: summary.latest.sponsorable.linkUrl,
        socialLogins: {
          github: summary.latest.sponsorable.login,
        },
      },
      isOneTime: summary.isOneTime,
      // In sponsees mode, ranking/tiers are based on lifetime sponsored amount.
      monthlyDollars: totalInCents / 100,
      privacyLevel: summary.latest.privacyLevel,
      tierName: summary.latest.tierName,
      createdAt: summary.firstCreatedAt,
      raw: {
        records: summary.raws,
        totalSponsoredCents: totalInCents,
      },
    }
  })
}

export async function fetchGitHubTotalSponsorshipAmountAsSponsor(
  token: string,
  login: string,
  type: GitHubAccountType,
  options: GitHubSponsoringTotalOptions = {},
): Promise<number> {
  assertGitHubSponsoringParams(token, login, type)

  const query = makeSponsoringTotalAmountQuery(login, type, options)
  const data = await requestGitHubSponsoringGraphQL(token, query)

  const totalInCents = data.data?.[type]?.totalSponsorshipAmountAsSponsorInCents
  if (typeof totalInCents !== 'number')
    throw new Error('Invalid GitHub response: `totalSponsorshipAmountAsSponsorInCents` is missing')

  return totalInCents
}

export function makeSponsoringQuery(
  login: string,
  type: GitHubAccountType,
  activeOnly = true,
  cursor?: string,
) {
  return graphql`{
  ${type}(login: "${login}") {
    sponsorshipsAsSponsor(activeOnly: ${Boolean(activeOnly)}, first: 100${cursor ? ` after: "${cursor}"` : ''}) {
      totalCount
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
        createdAt
        privacyLevel
        isActive
        tier {
          name
          isOneTime
          monthlyPriceInCents
          monthlyPriceInDollars
        }
        sponsorable {
          __typename
          ...on Organization {
            login
            name
            avatarUrl
            websiteUrl
          }
          ...on User {
            login
            name
            avatarUrl
            websiteUrl
          }
        }
      }
    }
  }
}`
}

export function makeSponsoringTotalAmountQuery(
  login: string,
  type: GitHubAccountType,
  options: GitHubSponsoringTotalOptions = {},
) {
  const args: string[] = []
  if (options.since)
    args.push(`since: ${JSON.stringify(options.since)}`)
  if (options.until)
    args.push(`until: ${JSON.stringify(options.until)}`)
  if (options.sponsorableLogins?.length)
    args.push(`sponsorableLogins: [${options.sponsorableLogins.map(v => JSON.stringify(v)).join(', ')}]`)

  const parameters = args.length
    ? `(${args.join(', ')})`
    : ''

  return graphql`{
  ${type}(login: "${login}") {
    totalSponsorshipAmountAsSponsorInCents${parameters}
  }
}`
}
