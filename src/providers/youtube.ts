import type { Provider, Sponsorship } from '../types'
import { $fetch } from 'ofetch'

export const YoutubeProvider: Provider = {
  name: 'youtube',
  fetchSponsors(config) {
    return fetchYouTubeMembers({
      clientId: config.youtube?.clientId,
      clientSecret: config.youtube?.clientSecret,
      refreshToken: config.youtube?.refreshToken,
    })
  },
}

interface YouTubeMemberSnippet {
  memberDetails: {
    displayName: string
    channelId: string
    profileImageUrl: string
  }
  membershipsDuration: {
    totalDurationMonths: number
  }
  membershipsLevelName: string
}

interface YouTubeMember {
  snippet: YouTubeMemberSnippet
}

interface YouTubeMembersResponse {
  items: YouTubeMember[]
  nextPageToken?: string
}

interface AccessTokenArgs {
  clientId: string
  clientSecret: string
  refreshToken: string
}

async function fetchYouTubeMembers(config: Partial<AccessTokenArgs>): Promise<Sponsorship[]> {
  if (!validateConfig(config)) {
    throw new Error('Invalid YouTube config')
  }
  const accessToken = await fetchAccessToken(config)
  return fetchYouTubeMembersWithToken(accessToken)
}

async function fetchAccessToken(config: AccessTokenArgs): Promise<string> {
  const response = await $fetch<{ access_token: string }>(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  return response.access_token
}

async function fetchYouTubeMembersWithToken(accessToken: string): Promise<Sponsorship[]> {
  let members: YouTubeMember[] = []
  let nextPageToken: string | undefined

  try {
    do {
      const response = await $fetch<YouTubeMembersResponse>('https://www.googleapis.com/youtube/v3/members', {
        method: 'GET',
        query: {
          part: 'snippet',
          maxResults: 50, // Max per request
          pageToken: nextPageToken,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      })

      members = members.concat(response.items)
      nextPageToken = response.nextPageToken
    } while (nextPageToken)

    const transformedMembers = members.map((m): Sponsorship => ({
      sponsor: {
        name: m.snippet.memberDetails.displayName,
        avatarUrl: m.snippet.memberDetails.profileImageUrl,
        login: m.snippet.memberDetails.channelId,
        type: 'User',
      },
      isOneTime: false,
      provider: 'youtube',
      privacyLevel: 'PUBLIC',
      createdAt: estimateCreationDate(m.snippet.membershipsDuration.totalDurationMonths),
      tierName: m.snippet.membershipsLevelName,
      monthlyDollars: -1,
    }))

    return transformedMembers
  }
  catch (error) {
    console.error('Error fetching YouTube members:', error)
    return []
  }
}

function estimateCreationDate(totalDurationMonths: number): string {
  return new Date(Date.now() - totalDurationMonths * 30 * 24 * 60 * 60 * 1000).toISOString()
}

function validateConfig(config: Partial<AccessTokenArgs>): config is AccessTokenArgs {
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key)
    throw new Error(`Missing required YouTube config: ${missing.join(', ')}`)
  }
  return true
}
