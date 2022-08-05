import dotenv from 'dotenv'
import type { SponsorkitConfig } from './types'

function getDeprecatedEnv(name: string, replacement: string) {
  const value = process.env[name]
  if (value)
    console.warn(`[sponsorkit] env.${name} is deprecated, use env.${replacement} instead`)
  return value
}

export function loadEnv(): Partial<SponsorkitConfig> {
  dotenv.config()

  const config: Partial<SponsorkitConfig> = {
    github: {
      login: process.env.SPONSORKIT_GITHUB_LOGIN || process.env.GITHUB_LOGIN || getDeprecatedEnv('SPONSORKIT_LOGIN', 'SPONSORKIT_GITHUB_LOGIN'),
      token: process.env.SPONSORKIT_GITHUB_TOKEN || process.env.GITHUB_TOKEN || getDeprecatedEnv('SPONSORKIT_TOKEN', 'SPONSORKIT_GITHUB_TOKEN'),
      type: process.env.SPONSORKIT_GITHUB_TYPE,
    },
    patreon: {
      token: process.env.SPONSORKIT_PATREON_TOKEN,
    },
    outputDir: process.env.SPONSORKIT_DIR,
  }

  // remove undefined keys
  return JSON.parse(JSON.stringify(config))
}
