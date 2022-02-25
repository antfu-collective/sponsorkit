import dotenv from 'dotenv'
import type { SponsorkitConfig } from './types'

export function loadEnv(): Partial<SponsorkitConfig> {
  dotenv.config()

  return {
    login: process.env.SPONSORKIT_LOGIN || process.env.SPONSORS_LOGIN || process.env.GITHUB_ID,
    token: process.env.SPONSORKIT_TOKEN || process.env.SPONSORS_TOKEN || process.env.GITHUB_TOKEN,
    outputDir: process.env.SPONSORKIT_DIR,
  }
}
