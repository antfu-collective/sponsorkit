import type { Provider, Sponsorship } from '../types'
import { $fetch } from 'ofetch'

export const LiberapayProvider: Provider = {
  name: 'liberapay',
  fetchSponsors(config) {
    if (config.mode === 'sponsees') {
      console.warn('[sponsorkit] Liberapay provider does not support `mode: "sponsees"` yet')
      return Promise.resolve([])
    }

    return fetchLiberapaySponsors(config.liberapay?.login)
  },
}

interface LiberapayRow {
  pledge_date: string
  patron_id: string
  patron_username: string
  patron_public_name: string
  donation_currency: string
  weekly_amount: string
  patron_avatar_url: string
}

interface ExchangeRate {
  code: string
  alphaCode: string
  numericCode: string
  name: string
  rate: number
  date: string
  inverseRate: number
}

interface ExchangeRates {
  [key: string]: ExchangeRate
}

export async function fetchLiberapaySponsors(login?: string): Promise<Sponsorship[]> {
  if (!login)
    throw new Error('Liberapay login is required')

  // Fetch and parse public CSV data
  const csvUrl = `https://liberapay.com/${login}/patrons/public.csv`
  const csvResponse = await $fetch<string>(csvUrl)
  const rows: LiberapayRow[] = []

  const { parseString } = await import('@fast-csv/parse')
  await new Promise((resolve) => {
    parseString(csvResponse, {
      headers: true,
      ignoreEmpty: true,
      trim: true,
    })
      .on('data', row => rows.push(row))
      .on('end', resolve)
  })

  // Only fetch exchange rates if we have patrons with non-USD currencies
  const exchangeRates = rows.some(r => r.donation_currency !== 'USD')
    ? await $fetch<ExchangeRates>('https://www.floatrates.com/daily/usd.json')
    : {}

  return rows.map(row => ({
    sponsor: {
      type: 'User',
      login: row.patron_username,
      name: row.patron_public_name || row.patron_username,
      avatarUrl: row.patron_avatar_url,
      linkUrl: `https://liberapay.com/${row.patron_username}`,
    },
    monthlyDollars: getMonthlyDollarAmount(Number.parseFloat(row.weekly_amount), row.donation_currency, exchangeRates),
    privacyLevel: 'PUBLIC',
    createdAt: new Date(row.pledge_date).toISOString(),
    provider: 'liberapay',
  }))
}

function getMonthlyDollarAmount(weeklyAmount: number, currency: string, exchangeRates: ExchangeRates): number {
  const weeksPerMonth = 4.345
  const monthlyAmount = weeklyAmount * weeksPerMonth

  if (currency === 'USD')
    return monthlyAmount

  // Optionally exchange to USD
  const currencyLower = currency.toLowerCase()
  const inverseRate = exchangeRates[currencyLower]?.inverseRate ?? 1
  return monthlyAmount * inverseRate
}
