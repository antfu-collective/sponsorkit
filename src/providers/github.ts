import { $fetch } from 'ohmyfetch'
import type { Provider, Sponsorship } from '../types'

const API = 'https://api.github.com/graphql'
const graphql = String.raw

export const GitHubProvider: Provider = {
  name: 'github',
  fetchSponsors(config) {
    return fetchGitHubSponsors(
      config.github?.token || config.token!,
      config.github?.login || config.login!,
    )
  },
}

export async function fetchGitHubSponsors(token: string, login: string): Promise<Sponsorship[]> {
  if (!token)
    throw new Error('GitHub token is required')
  if (!login)
    throw new Error('GitHub login is required')

  const sponsors: any[] = []
  let cursor
  do {
    const query = makeQuery(login, cursor)
    const data = await $fetch(API, {
      method: 'POST',
      body: { query },
      headers: {
        'Authorization': `bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }) as any

    if (data.errors?.[0]?.type === 'INSUFFICIENT_SCOPES')
      throw new Error('Token is missing the `read:user` and/or `read:org` scopes')

    sponsors.push(
      ...(data.data.user.sponsorshipsAsMaintainer.nodes || []),
    )
    if (data.data.user.sponsorshipsAsMaintainer.pageInfo.hasNextPage)
      cursor = data.data.user.sponsorshipsAsMaintainer.pageInfo.endCursor
    else
      cursor = undefined
  } while (cursor)

  const processed = sponsors
    .map((raw: any): Sponsorship => ({
      sponsor: {
        ...raw.sponsorEntity,
        __typename: undefined,
        type: raw.sponsorEntity.__typename,
      },
      isOneTime: raw.tier.isOneTime,
      monthlyDollars: raw.tier.monthlyPriceInDollars,
      privacyLevel: raw.privacyLevel,
      tierName: raw.tier.name,
      createdAt: raw.createdAt,
    }))

  return processed
}

export function makeQuery(login: string, cursor?: string) {
  return graphql`{
  user(login: "${login}") {
    sponsorshipsAsMaintainer(first: 100${cursor ? ` after: "${cursor}"` : ''}) {
      totalCount
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
        createdAt
        privacyLevel
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
          }
          ...on User {
            login
            name
            avatarUrl
          }
        }
      }
    }
  }
}`
}
