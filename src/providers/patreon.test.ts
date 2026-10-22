import type { Mock } from 'vitest'
import type { PatreonMemberAttributes, PatreonUserAttributes } from './patreon.ts'
import { $fetch } from 'ofetch'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPatreonSponsors } from './patreon.ts'

vi.mock('ofetch', () => ({ $fetch: vi.fn() }))

const fetchMock = $fetch as unknown as Mock

beforeEach(() => {
  fetchMock.mockReset()
})

const CAMPAIGNS_URL = 'https://www.patreon.com/api/oauth2/v2/campaigns'

function member(id: string, userId: string, attributes: PatreonMemberAttributes = {}, tierId?: string) {
  return {
    id,
    type: 'member',
    attributes: {
      currently_entitled_amount_cents: 500,
      patron_status: 'active_patron',
      pledge_relationship_start: '2024-01-01T00:00:00+00:00',
      ...attributes,
    },
    relationships: {
      user: { data: { id: userId, type: 'user' } },
      currently_entitled_tiers: { data: tierId ? [{ id: tierId, type: 'tier' }] : [] },
    },
  }
}

function user(id: string, attributes: PatreonUserAttributes = {}) {
  return {
    id,
    type: 'user',
    attributes: {
      first_name: 'Ada',
      full_name: 'Ada Lovelace',
      image_url: 'https://example.com/ada.png',
      url: 'https://patreon.com/ada',
      ...attributes,
    },
  }
}

describe('fetchPatreonSponsors', () => {
  it('requires a token', async () => {
    await expect(fetchPatreonSponsors(''))
      .rejects
      .toThrow('Patreon token is required')
  })

  it('uses the v2 campaigns endpoint instead of the retired v1 endpoint', async () => {
    fetchMock.mockResolvedValueOnce({ data: [{ id: '999', type: 'campaign' }] })
      .mockResolvedValueOnce({ data: [], included: [], links: {} })

    await fetchPatreonSponsors('token')

    const urls = fetchMock.mock.calls.map(call => call[0])
    expect(urls[0]).toBe(CAMPAIGNS_URL)
    expect(urls[1]).toContain('/api/oauth2/v2/campaigns/999/members?')
    expect(urls.every((url: string) => !url.includes('/oauth2/api/'))).toBe(true)
  })

  it('requests exactly the fields it reads, and no deprecated ones', async () => {
    fetchMock.mockResolvedValueOnce({ data: [{ id: '999', type: 'campaign' }] })
      .mockResolvedValueOnce({ data: [], links: {} })

    await fetchPatreonSponsors('token')

    const url = fetchMock.mock.calls[1][0] as string
    expect(decodeURIComponent(url)).toContain('fields[member]=currently_entitled_amount_cents,patron_status,pledge_relationship_start')
    expect(decodeURIComponent(url)).toContain('fields[user]=image_url,url,first_name,full_name')
    expect(decodeURIComponent(url)).toContain('fields[tier]=amount_cents')
    // Deprecated in the docs and never read, so it must not be requested.
    expect(url).not.toContain('lifetime_support_cents')
  })

  it('sends bearer auth and a User-Agent header', async () => {
    fetchMock.mockResolvedValueOnce({ data: [{ id: '999', type: 'campaign' }] })
      .mockResolvedValueOnce({ data: [], included: [], links: {} })

    await fetchPatreonSponsors('secret-token')

    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers.Authorization).toBe('bearer secret-token')
    expect(headers['User-Agent']).toContain('SponsorKit')
  })

  it('maps members into sponsorships', async () => {
    fetchMock.mockResolvedValueOnce({ data: [{ id: '999', type: 'campaign' }] })
      .mockResolvedValueOnce({
        data: [member('m-1', 'u-1', { currently_entitled_amount_cents: 1000 })],
        included: [user('u-1')],
        links: {},
      })

    const sponsors = await fetchPatreonSponsors('token')

    expect(sponsors).toHaveLength(1)
    expect(sponsors[0]).toMatchObject({
      isOneTime: false,
      monthlyDollars: 10,
      tierName: 'Patreon',
      createdAt: '2024-01-01T00:00:00+00:00',
      sponsor: {
        type: 'User',
        login: 'Ada',
        name: 'Ada Lovelace',
        avatarUrl: 'https://example.com/ada.png',
        linkUrl: 'https://patreon.com/ada',
      },
    })
  })

  it('filters out members that have never pledged', async () => {
    fetchMock.mockResolvedValueOnce({ data: [{ id: '999', type: 'campaign' }] })
      .mockResolvedValueOnce({
        data: [
          member('m-1', 'u-1', { patron_status: null }),
          member('m-2', 'u-2'),
        ],
        included: [user('u-1'), user('u-2')],
        links: {},
      })

    const sponsors = await fetchPatreonSponsors('token')

    expect(sponsors).toHaveLength(1)
    expect(sponsors[0].sponsor.name).toBe('Ada Lovelace')
  })

  it('marks former and declined patrons as past sponsors', async () => {
    fetchMock.mockResolvedValueOnce({ data: [{ id: '999', type: 'campaign' }] })
      .mockResolvedValueOnce({
        data: [
          member('m-1', 'u-1', { patron_status: 'former_patron' }),
          member('m-2', 'u-2', { patron_status: 'declined_patron' }),
        ],
        included: [user('u-1'), user('u-2')],
        links: {},
      })

    const sponsors = await fetchPatreonSponsors('token')

    expect(sponsors.map(s => s.monthlyDollars)).toEqual([-1, -1])
  })

  it('falls back to the entitled tier amount for gifted memberships', async () => {
    fetchMock.mockResolvedValueOnce({ data: [{ id: '999', type: 'campaign' }] })
      .mockResolvedValueOnce({
        data: [member('m-1', 'u-1', { currently_entitled_amount_cents: 0 }, 't-1')],
        included: [user('u-1'), { id: 't-1', type: 'tier', attributes: { amount_cents: 2500 } }],
        links: {},
      })

    const sponsors = await fetchPatreonSponsors('token')

    expect(sponsors[0].monthlyDollars).toBe(25)
  })

  it('follows the links.next cursor across pages', async () => {
    fetchMock.mockResolvedValueOnce({ data: [{ id: '999', type: 'campaign' }] })
      .mockResolvedValueOnce({
        data: [member('m-1', 'u-1')],
        included: [user('u-1', { full_name: 'First' })],
        links: { next: 'https://www.patreon.com/api/oauth2/v2/campaigns/999/members?page%5Bcursor%5D=NEXT' },
      })
      .mockResolvedValueOnce({
        data: [member('m-2', 'u-2')],
        included: [user('u-2', { full_name: 'Second' })],
        links: {},
      })

    const sponsors = await fetchPatreonSponsors('token')

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2][0]).toContain('page%5Bcursor%5D=NEXT')
    // The cursor page is a fresh request, so it must carry the credentials too.
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('bearer token')
    expect(sponsors.map(s => s.sponsor.name)).toEqual(['First', 'Second'])
  })

  it('survives responses without an included array', async () => {
    fetchMock.mockResolvedValueOnce({ data: [{ id: '999', type: 'campaign' }] })
      .mockResolvedValueOnce({ data: [member('m-1', 'u-1')], links: {} })

    const sponsors = await fetchPatreonSponsors('token')

    expect(sponsors).toHaveLength(1)
    expect(sponsors[0].monthlyDollars).toBe(5)
  })

  it('handles an empty member collection', async () => {
    fetchMock.mockResolvedValueOnce({ data: [{ id: '999', type: 'campaign' }] })
      .mockResolvedValueOnce({ data: [], links: {} })

    await expect(fetchPatreonSponsors('token')).resolves.toEqual([])
  })

  it('fails loudly when a collection response has no data member', async () => {
    // A collection document always carries `data`, so this is malformed and must fail rather
    // than be read as "no sponsors".
    fetchMock.mockResolvedValueOnce({ data: [{ id: '999', type: 'campaign' }] })
      .mockResolvedValueOnce({ links: {} })

    await expect(fetchPatreonSponsors('token'))
      .rejects
      .toThrow(TypeError)
  })

  it('handles identity-masked members without throwing', async () => {
    fetchMock.mockResolvedValueOnce({ data: [{ id: '999', type: 'campaign' }] })
      .mockResolvedValueOnce({
        data: [member('m-1', 'u-1')],
        included: [user('u-1', { first_name: null, full_name: null, image_url: null, url: null })],
        links: {},
      })

    const sponsors = await fetchPatreonSponsors('token')

    expect(sponsors[0].sponsor).toMatchObject({
      login: 'Anonymous',
      name: 'Anonymous',
      avatarUrl: '',
    })
  })

  it('reports a clear error when the token has no campaign', async () => {
    fetchMock.mockResolvedValueOnce({ data: [] })

    await expect(fetchPatreonSponsors('token'))
      .rejects
      .toThrow(/No Patreon campaign found/)
  })

  it('handles a member whose user resource is absent from included', async () => {
    fetchMock.mockResolvedValueOnce({ data: [{ id: '999', type: 'campaign' }] })
      .mockResolvedValueOnce({
        data: [member('m-1', 'u-1')],
        included: [{ id: 't-1', type: 'tier', attributes: { amount_cents: 300 } }],
        links: {},
      })

    const sponsors = await fetchPatreonSponsors('token')

    expect(sponsors[0].sponsor).toMatchObject({ login: 'Anonymous', name: 'Anonymous', avatarUrl: '' })
    expect(sponsors[0].monthlyDollars).toBe(5)
  })

  it('propagates HTTP failures unchanged', async () => {
    fetchMock.mockRejectedValueOnce(new Error('[GET] "https://www.patreon.com/api/oauth2/v2/campaigns": 401 Unauthorized'))

    await expect(fetchPatreonSponsors('token'))
      .rejects
      .toThrow(/401 Unauthorized/)
  })
})
