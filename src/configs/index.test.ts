import type { Sponsorship, Tier } from '../types.ts'
import { describe, expect, it } from 'vitest'
import { partitionTiers } from './index.ts'

function sponsor(login: string, monthlyDollars: number, createdAt: string): Sponsorship {
  return {
    sponsor: {
      type: 'User',
      login,
      name: login,
      avatarUrl: '',
    },
    monthlyDollars,
    createdAt,
  }
}

const tiers: Tier[] = [
  { title: 'Backers' }, // the required zero-dollar tier
  { title: 'Sponsors', monthlyDollars: 10 },
  { title: 'Gold', monthlyDollars: 100 },
]

describe('partitionTiers', () => {
  it('requires exactly one tier without monthlyDollars', () => {
    expect(() => partitionTiers([], [{ title: 'a', monthlyDollars: 10 }]))
      .toThrow('There should be exactly one tier with no `monthlyDollars`, but got 0')

    expect(() => partitionTiers([], [{ title: 'a' }, { title: 'b' }]))
      .toThrow('There should be exactly one tier with no `monthlyDollars`, but got 2')
  })

  it('buckets sponsors into the highest tier they qualify for', () => {
    const sponsors = [
      sponsor('gold', 100, '2024-01-01'),
      sponsor('mid', 10, '2024-01-02'),
      sponsor('small', 5, '2024-01-03'),
    ]

    const result = partitionTiers(sponsors, tiers)

    // sorted by monthlyDollars descending
    expect(result.map(t => t.monthlyDollars)).toEqual([100, 10, 0])
    expect(result[0].sponsors.map(s => s.sponsor.login)).toEqual(['gold'])
    expect(result[1].sponsors.map(s => s.sponsor.login)).toEqual(['mid'])
    expect(result[2].sponsors.map(s => s.sponsor.login)).toEqual(['small'])
  })

  it('excludes past sponsors unless includePastSponsors is set', () => {
    const sponsors = [
      sponsor('active', 10, '2024-01-01'),
      sponsor('past', -1, '2024-01-02'),
    ]

    const without = partitionTiers(structuredClone(sponsors), tiers)
    expect(without.flatMap(t => t.sponsors.map(s => s.sponsor.login))).toEqual(['active'])

    const withPast = partitionTiers(structuredClone(sponsors), tiers, true)
    expect(withPast.flatMap(t => t.sponsors.map(s => s.sponsor.login)).sort())
      .toEqual(['active', 'past'])
  })

  it('orders sponsors within a tier by createdAt ascending', () => {
    const sponsors = [
      sponsor('later', 10, '2024-03-01'),
      sponsor('earlier', 10, '2024-01-01'),
    ]

    const result = partitionTiers(sponsors, tiers)
    const bucket = result.find(t => t.monthlyDollars === 10)!
    expect(bucket.sponsors.map(s => s.sponsor.login)).toEqual(['earlier', 'later'])
  })
})
