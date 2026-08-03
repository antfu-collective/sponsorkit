import type { Mock } from 'vitest'
import type { SponsorkitConfig } from '../types.ts'
import { $fetch } from 'ofetch'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchGitHubSponsors,
  makeQuery,
  makeSponsoringQuery,
  makeSponsoringTotalAmountQuery,
} from './github.ts'

vi.mock('ofetch', () => ({ $fetch: vi.fn() }))

const fetchMock = $fetch as unknown as Mock

beforeEach(() => {
  fetchMock.mockReset()
})

describe('makeQuery', () => {
  it('embeds the login and account type', () => {
    expect(makeQuery('antfu', 'user')).toContain('user(login: "antfu")')
    expect(makeQuery('antfu', 'organization')).toContain('organization(login: "antfu")')
  })

  it('queries sponsorships as a maintainer', () => {
    expect(makeQuery('antfu', 'user')).toContain('sponsorshipsAsMaintainer(')
  })

  it('interpolates the activeOnly flag', () => {
    expect(makeQuery('antfu', 'user', true)).toContain('activeOnly: true')
    expect(makeQuery('antfu', 'user', false)).toContain('activeOnly: false')
  })

  it('adds an after cursor only when provided', () => {
    expect(makeQuery('antfu', 'user', true)).not.toContain('after:')
    expect(makeQuery('antfu', 'user', true, 'CURSOR')).toContain('after: "CURSOR"')
  })
})

describe('makeSponsoringQuery', () => {
  it('queries sponsorships as a sponsor', () => {
    const query = makeSponsoringQuery('antfu', 'user', false, 'CURSOR')
    expect(query).toContain('sponsorshipsAsSponsor(')
    expect(query).toContain('activeOnly: false')
    expect(query).toContain('after: "CURSOR"')
  })
})

describe('makeSponsoringTotalAmountQuery', () => {
  it('omits parameters when no options are given', () => {
    const query = makeSponsoringTotalAmountQuery('antfu', 'user')
    expect(query).toContain('totalSponsorshipAmountAsSponsorInCents\n')
    expect(query).not.toContain('totalSponsorshipAmountAsSponsorInCents(')
  })

  it('serializes since, until and sponsorableLogins', () => {
    const query = makeSponsoringTotalAmountQuery('antfu', 'user', {
      since: '2024-01-01',
      until: '2024-12-31',
      sponsorableLogins: ['vuejs', 'vitejs'],
    })
    expect(query).toContain('since: "2024-01-01"')
    expect(query).toContain('until: "2024-12-31"')
    expect(query).toContain('sponsorableLogins: ["vuejs", "vitejs"]')
  })
})

describe('fetchGitHubSponsors', () => {
  it('validates its required arguments', async () => {
    await expect(fetchGitHubSponsors('', 'antfu', 'user', {}))
      .rejects
      .toThrow('GitHub token is required')
    await expect(fetchGitHubSponsors('token', '', 'user', {}))
      .rejects
      .toThrow('GitHub login is required')
    await expect(fetchGitHubSponsors('token', 'antfu', 'invalid' as any, {}))
      .rejects
      .toThrow('GitHub type must be either `user` or `organization`')
  })

  it('paginates and maps the response into sponsorships', async () => {
    const page = (login: string, hasNextPage: boolean, endCursor: string | null) => ({
      data: {
        user: {
          sponsorshipsAsMaintainer: {
            totalCount: 2,
            pageInfo: { hasNextPage, endCursor },
            nodes: [
              {
                createdAt: '2024-01-01T00:00:00Z',
                privacyLevel: 'PUBLIC',
                isActive: true,
                tier: { name: 'Gold', isOneTime: false, monthlyPriceInCents: 1000, monthlyPriceInDollars: 10 },
                sponsorEntity: { __typename: 'User', login, name: login, avatarUrl: 'a', websiteUrl: 'example.com' },
              },
            ],
          },
        },
      },
    })

    fetchMock
      .mockResolvedValueOnce(page('alice', true, 'CURSOR'))
      .mockResolvedValueOnce(page('bob', false, null))

    const sponsors = await fetchGitHubSponsors('token', 'antfu', 'user', {})

    expect(fetchMock).toHaveBeenCalledTimes(2)
    // second request carries the cursor from the first page
    expect(fetchMock.mock.calls[1][1].body.query).toContain('after: "CURSOR"')

    expect(sponsors.map(s => s.sponsor.login)).toEqual(['alice', 'bob'])
    expect(sponsors[0]).toMatchObject({
      monthlyDollars: 10,
      tierName: 'Gold',
      isOneTime: false,
      sponsor: {
        login: 'alice',
        type: 'User',
        websiteUrl: 'https://example.com',
        linkUrl: 'https://github.com/alice',
      },
    })
  })

  it('marks inactive non-prorated sponsors as past sponsors', async () => {
    fetchMock.mockResolvedValueOnce({
      data: {
        user: {
          sponsorshipsAsMaintainer: {
            totalCount: 1,
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                createdAt: '2024-01-01T00:00:00Z',
                privacyLevel: 'PUBLIC',
                isActive: false,
                tier: { name: 'Gold', isOneTime: false, monthlyPriceInCents: 1000, monthlyPriceInDollars: 10 },
                sponsorEntity: { __typename: 'User', login: 'past', name: 'past', avatarUrl: 'a' },
              },
            ],
          },
        },
      },
    })

    const sponsors = await fetchGitHubSponsors('token', 'antfu', 'user', {})
    expect(sponsors[0].monthlyDollars).toBe(-1)
  })

  it('throws when the API returns errors', async () => {
    fetchMock.mockResolvedValueOnce({ errors: [{ type: 'INSUFFICIENT_SCOPES' }] })
    await expect(fetchGitHubSponsors('token', 'antfu', 'user', {} as SponsorkitConfig))
      .rejects
      .toThrow('read:user')
  })
})
