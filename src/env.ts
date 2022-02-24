import dotenv from 'dotenv'

export function loadEnv() {
  dotenv.config()

  return {
    login: process.env.SPONSORKIT_LOGIN || process.env.SPONSORS_LOGIN || process.env.GITHUB_ID,
    token: process.env.SPONSORKIT_TOKEN || process.env.SPONSORS_TOKEN || process.env.GITHUB_TOKEN,
  }
}
