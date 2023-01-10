import { $fetch } from 'ohmyfetch'
import type { Sponsorship } from '../../types'

const API = 'https://api.opencollective.com/graphql/v2/'
const graphql = String.raw

export async function fetchIndividualSponsors(key?: string, id?: string, slug?: string, githubHandle?: string): Promise<Sponsorship[]> {
  if (!key)
    throw new Error('OpenCollective api key is required')
  if (!slug && !id && !githubHandle)
    throw new Error('OpenCollective collective id or slug or GitHub handle is required')

  const sponsors: any[] = []
  let offset
  offset = 0

  do {
    const query = makeQuery(id, slug, githubHandle, offset)
    const data = await $fetch(API, {
      method: 'POST',
      body: { query },
      headers: {
        'Api-Key': `${key}`,
        'Content-Type': 'application/json',
      },
    }) as any

    sponsors.push(
      ...(data.data.account?.transactions.nodes || []),
    )
    if (data.data.account?.transactions.nodes.length !== 0)
      offset += data.data.account?.transactions.nodes.length
    else
      offset = undefined
  } while (offset)

  const totalAmount: any = {}
  for (const i in sponsors.sort((a, b) => (
    new Date(b.createdAt).getDate() - new Date(a.createdAt).getDate()
  ))) {
    let slug
    let amount
    if (totalAmount[sponsors[i].oppositeAccount.slug]) {
      slug = sponsors[i].oppositeAccount.slug
      amount = sponsors[i].amount.value
      totalAmount[slug] += amount

      delete sponsors[i]
    }
    else {
      slug = sponsors[i].oppositeAccount.slug
      amount = sponsors[i].amount.value
      totalAmount[slug] = amount
    }
  }

  const processed = sponsors
    .filter(i => i !== null)
    .map((raw: any): Sponsorship => ({
      sponsor: {
        type: raw.oppositeAccount.type === 'INDIVIDUAL' ? 'User' : 'Organization',
        login: raw.oppositeAccount.slug,
        name: raw.oppositeAccount.name,
        avatarUrl: raw.oppositeAccount.imageUrl,
        linkUrl: `https://opencollective.com/${raw.oppositeAccount.slug}`,
      },
      isOneTime: true,
      monthlyDollars: totalAmount[raw.oppositeAccount.slug],
      privacyLevel: raw.oppositeAccount.isIncognito ? 'PRIVATE' : 'PUBLIC',
      tierName: undefined,
      createdAt: raw.createdAt,
    }))

  return processed
}

function makeQuery(id?: string, slug?: string, githubHandle?: string, offset?: number) {
  return graphql`{
  account(${id ? `id: "${id}", ` : ''}${slug ? `slug: "${slug}", ` : ''}${githubHandle ? `githubHandle: "${githubHandle}", ` : ''}, throwIfMissing: true) {
    transactions(limit: 100${offset ? ` offset: ${offset}` : ''}) {
      offset
      limit
      totalCount
      nodes {
        id
        createdAt
        amount {
          value
        }
        oppositeAccount {
          name
          slug
          type
          isIncognito
          imageUrl(height: 460, format: png)
        }
      }
    }
  }
}`
}
