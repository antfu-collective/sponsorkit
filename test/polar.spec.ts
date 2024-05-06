import nock from 'nock'
import { expect, it } from 'vitest'
import { fetchPolarSponsors } from '../src/providers/polar'

it('works fine', async () => {
  nock('https://api.polar.sh')
    .get('/api/v1/subscriptions/subscriptions/search')
    .query({ page: 1 })
    .reply(200, {
      items: [
        /**
         * Active subscription
         */
        {
          user: { public_name: 'user', avatar_url: 'avatar', github_username: 'login' },
          subscription_tier: { type: 'individual' },
          status: 'active',
          created_at: '2021-10-01',
          subscription: { price: { price_amount: 100 } },
          price: {
            created_at: '2024-05-01T20:51:56.335096Z',
            id: 'e7143e00-221a-40f8-8904-b3284e1325a9',
            price_amount: 1500,
            price_currency: 'usd',
          },
        },
        /**
         * Inactive subscription ( past sponsor )
         */
        {
          user: { public_name: 'user', avatar_url: 'avatar', github_username: 'login' },
          subscription_tier: { type: 'individual' },
          status: 'inactive',
          created_at: '2021-10-01',
          subscription: { price: { price_amount: 100 } },
          price: {
            created_at: '2024-05-01T20:51:56.335096Z',
            id: 'e7143e00-221a-40f8-8904-b3284e1325a9',
            price_amount: 1500,
            price_currency: 'usd',
          },
        },
      ],
      pagination: { max_page: 1 },
    })

  const result = await fetchPolarSponsors('token')
  expect(result).toEqual([
    {
      sponsor: { name: 'user', avatarUrl: 'avatar', login: 'login', type: 'User' },
      isOneTime: false,
      provider: 'polar',
      privacyLevel: 'PUBLIC',
      createdAt: '2021-10-01T00:00:00.000Z',
      tierName: undefined,
      monthlyDollars: 1,
    },
    {
      sponsor: { name: 'user', avatarUrl: 'avatar', login: 'login', type: 'User' },
      isOneTime: false,
      provider: 'polar',
      privacyLevel: 'PUBLIC',
      createdAt: '2021-10-01T00:00:00.000Z',
      tierName: undefined,
      monthlyDollars: -1,
    },
  ])
})
