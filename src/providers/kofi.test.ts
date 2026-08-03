import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  fetchKofiSponsors,
  parseKofiWebhookBody,
  startKofiWebhookServer,
  storeKofiEvent,
} from './kofi.ts'

const servers: Awaited<ReturnType<typeof startKofiWebhookServer>>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })))
})

describe('ko-fi provider', () => {
  it('verifies and sanitizes webhook payloads', () => {
    const event = parseKofiWebhookBody(createBody(), 'correct-token')

    expect(event).toMatchObject({
      messageId: 'message-1',
      timestamp: '2026-07-27T05:00:00.000Z',
      type: 'Subscription',
      isPublic: true,
      fromName: 'Ada',
      amount: 5,
      currency: 'USD',
      isSubscriptionPayment: true,
      tierName: 'Gold',
    })
    expect(event).not.toHaveProperty('verification_token')
    expect(event).not.toHaveProperty('email')
  })

  it('rejects a webhook with the wrong verification token', () => {
    expect(() => parseKofiWebhookBody(createBody(), 'wrong-token'))
      .toThrow('Invalid Ko-fi verification token')
  })

  it('scrubs the identity of private payments', () => {
    const event = parseKofiWebhookBody(createBody({
      is_public: false,
      from_name: 'Private Name',
      email: 'private@example.com',
    }), 'correct-token')

    expect(event.fromName).toBe('Private Sponsor')
    expect(event.isPublic).toBe(false)
  })

  it('groups private subscription renewals without exposing their identity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sponsorkit-kofi-private-'))
    const dataFile = join(directory, 'events.json')
    const firstPayment = parseKofiWebhookBody(createBody({
      message_id: 'private-payment-1',
      timestamp: '2026-07-01T00:00:00Z',
      is_public: false,
      from_name: 'Private Name',
      email: 'Private@Example.com',
    }), 'correct-token')
    const renewal = parseKofiWebhookBody(createBody({
      message_id: 'private-payment-2',
      timestamp: '2026-07-20T00:00:00Z',
      is_public: false,
      from_name: 'Private Name',
      email: 'private@example.com',
      is_first_subscription_payment: false,
    }), 'correct-token')

    expect(firstPayment.sponsorKey).toBe(renewal.sponsorKey)
    await storeKofiEvent(firstPayment, dataFile)
    await storeKofiEvent(renewal, dataFile)

    const sponsors = await fetchKofiSponsors(
      { dataFile },
      Date.parse('2026-07-27T00:00:00Z'),
    )
    expect(sponsors).toHaveLength(1)
    expect(sponsors[0]).toMatchObject({
      monthlyDollars: 5,
      privacyLevel: 'PRIVATE',
      sponsor: { name: 'Private Sponsor' },
    })
  })

  it('does not merge unrelated anonymous payments', () => {
    const firstPayment = parseKofiWebhookBody(createBody({
      message_id: 'anonymous-payment-1',
      type: 'Tip',
      from_name: '',
      email: '',
      is_subscription_payment: false,
    }), 'correct-token')
    const secondPayment = parseKofiWebhookBody(createBody({
      message_id: 'anonymous-payment-2',
      type: 'Tip',
      from_name: '',
      email: '',
      is_subscription_payment: false,
    }), 'correct-token')

    expect(firstPayment.fromName).toBe('Anonymous')
    expect(firstPayment.sponsorKey).not.toBe(secondPayment.sponsorKey)
  })

  it('keeps public and private payments from the same identity separate', () => {
    const publicPayment = parseKofiWebhookBody(createBody(), 'correct-token')
    const privatePayment = parseKofiWebhookBody(createBody({
      message_id: 'private-payment',
      is_public: false,
    }), 'correct-token')

    expect(publicPayment.sponsorKey).not.toBe(privatePayment.sponsorKey)
  })

  it('deduplicates retries and aggregates recent payments', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sponsorkit-kofi-'))
    const dataFile = join(directory, 'events.json')
    const subscription = parseKofiWebhookBody(createBody({
      timestamp: '2026-07-01T00:00:00Z',
    }), 'correct-token')
    const tip = parseKofiWebhookBody(createBody({
      message_id: 'message-2',
      timestamp: '2026-07-05T00:00:00Z',
      type: 'Tip',
      amount: '2',
      is_subscription_payment: false,
      is_first_subscription_payment: false,
      tier_name: undefined,
    }), 'correct-token')

    expect(await storeKofiEvent(subscription, dataFile)).toBe(true)
    expect(await storeKofiEvent(subscription, dataFile)).toBe(false)
    expect(await storeKofiEvent(tip, dataFile)).toBe(true)

    const sponsors = await fetchKofiSponsors(
      { dataFile },
      Date.parse('2026-07-20T00:00:00Z'),
    )
    expect(sponsors).toHaveLength(1)
    expect(sponsors[0]).toMatchObject({
      monthlyDollars: 7,
      privacyLevel: 'PUBLIC',
      isOneTime: false,
      sponsor: {
        name: 'Ada',
        avatarUrl: '',
      },
    })
  })

  it('receives a live-shaped HTTP form post and persists it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sponsorkit-kofi-http-'))
    const dataFile = join(directory, 'events.json')
    const server = await startKofiWebhookServer({
      verificationToken: 'correct-token',
      dataFile,
      host: '127.0.0.1',
      port: 0,
    })
    servers.push(server)
    const { port } = server.address() as AddressInfo

    const response = await fetch(`http://127.0.0.1:${port}/kofi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: createBody(),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, stored: true })
    const stored = JSON.parse(await readFile(dataFile, 'utf8'))
    expect(stored.events).toHaveLength(1)
    expect(stored.events[0]).not.toHaveProperty('verification_token')
  })

  it('provides a browser-friendly health check', async () => {
    const server = await startKofiWebhookServer({
      verificationToken: 'correct-token',
      host: '127.0.0.1',
      port: 0,
    })
    servers.push(server)
    const { port } = server.address() as AddressInfo

    const response = await fetch(`http://127.0.0.1:${port}/kofi`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      message: expect.stringContaining('receiver is ready'),
    })
  })
})

function createBody(overrides: Record<string, unknown> = {}) {
  const payload = {
    verification_token: 'correct-token',
    message_id: 'message-1',
    timestamp: '2026-07-27T05:00:00Z',
    type: 'Subscription',
    is_public: true,
    from_name: 'Ada',
    message: 'Thank you',
    amount: '5',
    url: 'https://ko-fi.com/example',
    email: 'ada@example.com',
    currency: 'USD',
    is_subscription_payment: true,
    is_first_subscription_payment: true,
    tier_name: 'Gold',
    kofi_transaction_id: 'transaction-1',
    ...overrides,
  }
  return new URLSearchParams({ data: JSON.stringify(payload) }).toString()
}
