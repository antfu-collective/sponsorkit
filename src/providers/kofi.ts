import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { Provider, SponsorkitConfig, Sponsorship } from '../types.ts'
import { Buffer } from 'node:buffer'
import { createHash, timingSafeEqual } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { $fetch } from 'ofetch'

export const DEFAULT_KOFI_DATA_FILE = './sponsorkit/kofi-events.json'

export interface KofiWebhookPayload {
  verification_token?: string
  message_id?: string
  timestamp?: string
  type?: string
  is_public?: boolean | string
  from_name?: string
  message?: string
  amount?: string
  url?: string
  email?: string
  currency?: string
  is_subscription_payment?: boolean | string
  is_first_subscription_payment?: boolean | string
  tier_name?: string
  kofi_transaction_id?: string
  [key: string]: unknown
}

export interface StoredKofiEvent {
  messageId: string
  sponsorKey: string
  timestamp: string
  type: string
  isPublic: boolean
  fromName: string
  amount: number
  currency: string
  isSubscriptionPayment: boolean
  isFirstSubscriptionPayment: boolean
  tierName?: string
  transactionId?: string
}

interface KofiEventStore {
  version: 1
  events: StoredKofiEvent[]
}

interface ExchangeRate {
  inverseRate: number
}

type ExchangeRates = Record<string, ExchangeRate>

export interface KofiWebhookServerOptions {
  verificationToken: string
  dataFile?: string
  host?: string
  port?: number
  path?: string
}

export const KofiProvider: Provider = {
  name: 'kofi',
  fetchSponsors(config) {
    if (config.mode === 'sponsees') {
      console.warn('[sponsorkit] Ko-fi provider does not support `mode: "sponsees"` yet')
      return Promise.resolve([])
    }

    return fetchKofiSponsors(config.kofi)
  },
}

export function parseKofiWebhookBody(body: string, verificationToken: string): StoredKofiEvent {
  if (!verificationToken)
    throw new Error('Ko-fi verification token is required')

  const data = new URLSearchParams(body).get('data')
  if (!data)
    throw new Error('Ko-fi webhook body must contain a `data` form field')

  let payload: KofiWebhookPayload
  try {
    payload = JSON.parse(data)
  }
  catch {
    throw new Error('Ko-fi webhook `data` field must contain valid JSON')
  }

  if (!payload.verification_token || !tokensEqual(payload.verification_token, verificationToken))
    throw new Error('Invalid Ko-fi verification token')
  if (!payload.message_id)
    throw new Error('Ko-fi webhook payload is missing `message_id`')
  if (!payload.timestamp || !Number.isFinite(Date.parse(payload.timestamp)))
    throw new Error('Ko-fi webhook payload has an invalid `timestamp`')

  const isPublic = toBoolean(payload.is_public)
  const fromName = isPublic ? payload.from_name?.trim() || 'Anonymous' : 'Private Sponsor'
  const email = payload.email?.trim().toLowerCase()
  const identity = email ? `email:${email}` : `event:${payload.message_id}`

  return {
    messageId: payload.message_id,
    // Keep private activity separate so it can never contribute to public output.
    sponsorKey: sha256(`${isPublic ? 'public' : 'private'}:${identity}`),
    timestamp: new Date(payload.timestamp).toISOString(),
    type: payload.type?.trim() || 'Tip',
    isPublic,
    fromName,
    amount: Number.parseFloat(payload.amount || '0') || 0,
    currency: payload.currency?.trim().toUpperCase() || 'USD',
    isSubscriptionPayment: toBoolean(payload.is_subscription_payment) || payload.type === 'Subscription',
    isFirstSubscriptionPayment: toBoolean(payload.is_first_subscription_payment),
    tierName: payload.tier_name?.trim() || undefined,
    transactionId: payload.kofi_transaction_id?.trim() || undefined,
  }
}

export async function storeKofiEvent(event: StoredKofiEvent, dataFile = DEFAULT_KOFI_DATA_FILE): Promise<boolean> {
  const path = resolve(dataFile)
  const store = await readKofiStore(path)
  if (store.events.some(item => item.messageId === event.messageId))
    return false

  store.events.push(event)
  await fsp.mkdir(dirname(path), { recursive: true })
  const tempPath = `${path}.${process.pid}.tmp`
  await fsp.writeFile(tempPath, JSON.stringify(store, null, 2))
  await fsp.rename(tempPath, path)
  return true
}

export async function fetchKofiSponsors(
  options: SponsorkitConfig['kofi'] = {},
  now = Date.now(),
): Promise<Sponsorship[]> {
  const {
    dataFile = DEFAULT_KOFI_DATA_FILE,
    tipEffectivity = 30,
    subscriptionEffectivity = 35,
  } = options
  const store = await readKofiStore(resolve(dataFile))
  const supportedEvents = store.events.filter(event => ['tip', 'donation', 'subscription'].includes(event.type.toLowerCase()))
  const currencies = new Set(supportedEvents.map(event => event.currency))
  const exchangeRates = currencies.size > 1 || !currencies.has('USD')
    ? await $fetch<ExchangeRates>('https://www.floatrates.com/daily/usd.json', { timeout: 5000 })
    : {}

  const groups = new Map<string, StoredKofiEvent[]>()
  for (const event of supportedEvents) {
    const events = groups.get(event.sponsorKey)
    if (events)
      events.push(event)
    else
      groups.set(event.sponsorKey, [event])
  }

  return [...groups.values()].map(events =>
    createKofiSponsorship(events, exchangeRates, now, tipEffectivity, subscriptionEffectivity))
}

export function createKofiWebhookHandler(options: KofiWebhookServerOptions) {
  const webhookPath = normalizePath(options.path || '/kofi')
  const dataFile = options.dataFile || DEFAULT_KOFI_DATA_FILE
  let writeQueue: Promise<unknown> = Promise.resolve()

  return async (request: IncomingMessage, response: ServerResponse) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname
    if (pathname !== webhookPath)
      return sendJson(response, 404, { error: 'Not found' })
    if (request.method === 'GET') {
      return sendJson(response, 200, {
        ok: true,
        message: 'SponsorKit Ko-fi webhook receiver is ready. Ko-fi payment events must use POST.',
      })
    }
    if (request.method !== 'POST')
      return sendJson(response, 405, { error: 'Method not allowed' })

    try {
      const body = await readBody(request)
      const event = parseKofiWebhookBody(body, options.verificationToken)
      const task = writeQueue.then(() => storeKofiEvent(event, dataFile))
      writeQueue = task.catch(() => undefined)
      const stored = await task
      return sendJson(response, 200, { ok: true, stored })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid Ko-fi webhook'
      const status = message === 'Invalid Ko-fi verification token' ? 401 : 400
      return sendJson(response, status, { error: message })
    }
  }
}

export async function startKofiWebhookServer(options: KofiWebhookServerOptions): Promise<Server> {
  if (!options.verificationToken)
    throw new Error('Ko-fi verification token is required')

  const server = createServer(createKofiWebhookHandler(options))
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 3456, options.host || '127.0.0.1', () => {
      server.off('error', reject)
      resolveListen()
    })
  })
  return server
}

function createKofiSponsorship(
  events: StoredKofiEvent[],
  exchangeRates: ExchangeRates,
  now: number,
  tipEffectivity: number,
  subscriptionEffectivity: number,
): Sponsorship {
  const sorted = [...events].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
  const latest = sorted[0]
  const recurring = sorted.filter(event => event.isSubscriptionPayment)
  const tips = sorted.filter(event => !event.isSubscriptionPayment)
  const latestRecurring = recurring[0]
  const activeRecurring = latestRecurring && isEffective(latestRecurring.timestamp, subscriptionEffectivity, now)
    ? toDollars(latestRecurring.amount, latestRecurring.currency, exchangeRates)
    : 0
  const activeTips = tips
    .filter(event => isEffective(event.timestamp, tipEffectivity, now))
    .reduce((sum, event) => sum + toDollars(event.amount, event.currency, exchangeRates), 0)
  const monthlyDollars = activeRecurring + activeTips || -1
  const activeExpirations = [
    latestRecurring && activeRecurring
      ? effectivityDate(latestRecurring.timestamp, subscriptionEffectivity)
      : undefined,
    ...tips
      .filter(event => isEffective(event.timestamp, tipEffectivity, now))
      .map(event => effectivityDate(event.timestamp, tipEffectivity)),
  ].filter((value): value is string => !!value)

  return {
    sponsor: {
      type: 'User',
      login: `kofi-${latest.sponsorKey.slice(0, 16)}`,
      name: latest.fromName,
      avatarUrl: '',
    },
    monthlyDollars,
    privacyLevel: latest.isPublic ? 'PUBLIC' : 'PRIVATE',
    tierName: latestRecurring?.tierName || 'Ko-fi',
    createdAt: sorted.at(-1)!.timestamp,
    expireAt: activeExpirations.sort().at(-1),
    isOneTime: recurring.length === 0,
    provider: 'kofi',
    raw: sorted,
  }
}

async function readKofiStore(path: string): Promise<KofiEventStore> {
  try {
    const parsed = JSON.parse(await fsp.readFile(path, 'utf8')) as Partial<KofiEventStore>
    if (parsed.version !== 1 || !Array.isArray(parsed.events))
      throw new Error(`Invalid Ko-fi event store: ${path}`)
    return parsed as KofiEventStore
  }
  catch (error: any) {
    if (error?.code === 'ENOENT')
      return { version: 1, events: [] }
    throw error
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 1024 * 1024)
      throw new Error('Ko-fi webhook body exceeds 1 MB')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function tokensEqual(actual: string, expected: string) {
  return timingSafeEqual(Buffer.from(sha256(actual)), Buffer.from(sha256(expected)))
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function toBoolean(value: boolean | string | undefined) {
  return value === true || value === 'true'
}

function toDollars(amount: number, currency: string, exchangeRates: ExchangeRates) {
  return currency === 'USD'
    ? amount
    : amount * (exchangeRates[currency.toLowerCase()]?.inverseRate ?? 1)
}

function isEffective(timestamp: string, days: number, now: number) {
  return days <= 0 || Date.parse(timestamp) + days * 24 * 60 * 60 * 1000 >= now
}

function effectivityDate(timestamp: string, days: number) {
  return days > 0
    ? new Date(Date.parse(timestamp) + days * 24 * 60 * 60 * 1000).toISOString()
    : undefined
}

function normalizePath(path: string) {
  return path.startsWith('/') ? path : `/${path}`
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}
