import fs from 'fs-extra'
import { $fetch } from 'ohmyfetch'
import type { Sponsorship } from './types'

const API = 'https://api.github.com/graphql'
const graphql = String.raw

const CACHE_FILE = '.cache.json'

export async function fetchSponsors(token: string, login: string): Promise<Sponsorship[]> {
  if (fs.existsSync(CACHE_FILE))
    return await fs.readJSON(CACHE_FILE)

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
