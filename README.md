# SponsorKit

[![NPM version](https://img.shields.io/npm/v/sponsorkit?color=a1b858&label=)](https://www.npmjs.com/package/sponsorkit)

Toolkit for fetching sponsors info and generating sponsors images.

Supports:

- [**GitHub Sponsors**](https://github.com/sponsors)
- [**Patreon**](https://www.patreon.com/)
- [**OpenCollective**](https://opencollective.com/)
- [**Afdian**](https://afdian.com/)
- [**Polar**](https://polar.sh/)
- [**Liberapay**](https://liberapay.com/)

## Usage

Create `.env` file with:

```ini
; GitHub provider.
; Token requires the `read:user` and `read:org` scopes.
SPONSORKIT_GITHUB_TOKEN=
SPONSORKIT_GITHUB_LOGIN=

; Patreon provider.
; Create v2 API key at https://www.patreon.com/portal/registration/register-clients
; and use the "Creator’s Access Token".
SPONSORKIT_PATREON_TOKEN=

; OpenCollective provider.
; Create an API key at https://opencollective.com/applications
SPONSORKIT_OPENCOLLECTIVE_KEY=
; and provide the ID, slug or GitHub handle of your account.
SPONSORKIT_OPENCOLLECTIVE_ID=
; or
SPONSORKIT_OPENCOLLECTIVE_SLUG=
; or
SPONSORKIT_OPENCOLLECTIVE_GH_HANDLE=
; If it is a personal account, set it to `person`. Otherwise not set or set to `collective`
SPONSORKIT_OPENCOLLECTIVE_TYPE=

; Afdian provider.
; Get user_id at https://afdian.com/dashboard/dev
SPONSORKIT_AFDIAN_USER_ID=
; Create token at https://afdian.com/dashboard/dev
SPONSORKIT_AFDIAN_TOKEN=

; Polar provider.
; Get your token at https://polar.sh/settings
SPONSORKIT_POLAR_TOKEN=
; The name of the organization to fetch sponsorships from.
SPONSORKIT_POLAR_ORGANIZATION=

; Liberapay provider.
; The name of the profile.
SPONSORKIT_LIBERAPAY_LOGIN=

; YouTube provider
SPONSORKIT_YOUTUBE_CLIENT_ID=
SPONSORKIT_YOUTUBE_CLIENT_SECRET=
SPONSORKIT_YOUTUBE_REFRESH_TOKEN=
```

> Only one provider is required to be configured.

Run:

```base
npx sponsorkit
```

[Example Setup](./example/) | [GitHub Actions Setup](https://github.com/antfu/static/blob/master/.github/workflows/scheduler.yml) | [Generated SVG](https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg)

### Configurations

Create `sponsorkit.config.js` file with:

```ts
import { defineConfig, tierPresets } from 'sponsorkit'

export default defineConfig({
  // Providers configs
  github: {
    login: 'antfu',
    type: 'user',
  },
  opencollective: {
    // ...
  },
  patreon: {
    // ...
  },
  afdian: {
    // ...
  },
  polar: {
    // ...
  },
  liberapay: {
    // ...
  },
  youtube: {
    // ...
  },

  // Rendering configs
  width: 800,
  renderer: 'tiers', // or 'circles'
  formats: ['json', 'svg', 'png', 'webp'],
  tiers: [
    // Past sponsors, currently only supports GitHub
    {
      title: 'Past Sponsors',
      monthlyDollars: -1,
      preset: tierPresets.xs,
    },
    // Default tier
    {
      title: 'Backers',
      preset: tierPresets.base,
    },
    {
      title: 'Sponsors',
      monthlyDollars: 10,
      preset: tierPresets.medium,
    },
    {
      title: 'Silver Sponsors',
      monthlyDollars: 50,
      preset: tierPresets.large,
    },
    {
      title: 'Gold Sponsors',
      monthlyDollars: 100,
      preset: tierPresets.xl,
    },
  ],
})
```

Also check [the example](./example/).

### Programmatic Utilities

You can also use SponsorKit programmatically:

```ts
import { fetchSponsors } from 'sponsorkit'

const sponsors = await fetchSponsors({
  github: {
    token,
    login,
  },
  // ...
})
```

Check the type definition or source code for more utils available.

### Renderers

We provide two renderers built-in:

- `tiers`: Render sponsors in tiers.
- `circles`: Render sponsors in packed circles.

#### Tiers Renderer

```ts
export default defineConfig({
  renderer: 'tiers',
  // ...
})
```

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg">
    <img src='https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg'/>
  </a>
</p>

#### Circles Renderer

```ts
export default defineConfig({
  renderer: 'circles',
  // ...
})
```

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/antfu/static/sponsors.circles.svg">
    <img src='https://cdn.jsdelivr.net/gh/antfu/static/sponsors.circles.svg'/>
  </a>
</p>

### Multiple Renders

We also support rendering multiple images at once with different configurations, via `renders` field:

```ts
import { defineConfig, tierPresets } from 'sponsorkit'

export default defineConfig({
  // Providers configs
  github: { /* ... */ },

  // Default configs
  width: 800,
  tiers: [
    /* ... */
  ],

  // Define multiple renders, each will inherit the top-level configs
  renders: [
    {
      name: 'sponsors.tiers',
      formats: ['svg'],
    },
    {
      name: 'sponsors.wide',
      width: 1200,
    },
    {
      name: 'sponsors.circles',
      renderer: 'circles',
      width: 600,
    },
    // ...
  ],
})
```

## Provider Notes

### YouTube

Fetching YouTube members requires OAuth2 authentication and a refresh token. You can follow the steps below to get the required credentials:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select an existing project or create a new one.
3. Enable the **YouTube Data API v3** under **APIs & Services**.
4. Navigate to **APIs & Services** → **Credentials**.
5. **Click Create Credentials** → **OAuth 2.0 Client ID**.
6. Choose **"Web Application"** and set:
  * Name: "Sponsorkit OAuth" (or any name you want to use)
  * Authorized Redirect URIs: Add **"http://localhost"** (this doesn't matter and won't be called)
7. Click **Create**, then save your **Client ID** and **Client Secret**.

Now that you have the oAuth credentials, we need to fetch the refresh token once.
First, we need to get an Auth Code from the Google OAuth 2.0 Playground. As scope, use the **YouTube Data API v3** → `https://www.googleapis.com/auth/youtube.channel.memberships.creator`, as this is the only information that sponsorkit will request.

After obtaining the auth code, you can run the following terminal command, which will send a POST request to the Google OAuth2 API to get the refresh token.
Please make sure to ***r*eplace the placeholders with your actual credentials**:

```bash
curl -d "client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&redirect_uri=http://localhost&grant_type=authorization_code&code=YOUR_AUTH_CODE" https://oauth2.googleapis.com/token
```

**Last but not least, make sure to save the resulting `refresh_token` as env variable.**

## License

[MIT](./LICENSE) License © 2022 [Anthony Fu](https://github.com/antfu)
