# SponsorKit

[![NPM version](https://img.shields.io/npm/v/sponsorkit?color=a1b858&label=)](https://www.npmjs.com/package/sponsorkit)

Toolkit for generating sponsors images.

## Usage

Create `.env` file with:

```ini
; GitHub provider.
; Token requires the `read:user` and `read:org` scopes.
SPONSORKIT_GITHUB_TOKEN=your_github_token
SPONSORKIT_GITHUB_LOGIN=your_github_username

; Patreon provider.
; Create v2 API key at https://www.patreon.com/portal/registration/register-clients
; and use the "Creator’s Access Token".
SPONSORKIT_PATREON_TOKEN=your_patreon_token

; OpenCollective provider.
; Create an API key at https://opencollective.com/applications
SPONSORKIT_OPENCOLLECTIVE_KEY=your_opencollective_key
; and provide the ID, slug or GitHub handle of your collective.
SPONSORKIT_OPENCOLLECTIVE_ID=your_opencollective_collective_id
; or
SPONSORKIT_OPENCOLLECTIVE_SLUG=your_opencollective_collective_slug
; or
SPONSORKIT_OPENCOLLECTIVE_GH_HANDLE=your_opencollective_collective_github_handle
```

> Only one provider is required to be configured.

Run:

```base
npx sponsorkit
```

[Example Setup](./example/) | [GitHub Actions Setup](https://github.com/antfu/static/blob/master/.github/workflows/scheduler.yml) | [Generated SVG](https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg)

## Configurations

Create `sponsorkit.config.js` file with:

```ts
import { defineConfig, presets } from 'sponsorkit'

export default defineConfig({
  // Providers configs
  github: {
    login: 'antfu',
    type: 'user',
  },

  // Rendering configs
  width: 800,
  formats: ['json', 'svg', 'png'],
  tiers: [
    {
      title: 'Backers',
      preset: presets.base,
    },
    {
      title: 'Sponsors',
      monthlyDollars: 10,
      preset: presets.medium,
    },
    {
      title: 'Silver Sponsors',
      monthlyDollars: 50,
      preset: presets.large,
    },
    {
      title: 'Gold Sponsors',
      monthlyDollars: 100,
      preset: presets.xl,
    },
  ],
})
```

Also check [the example](./example/).

## Utils

You can also use SponsorKit programmatically:

```ts
import { fetchSponsors } from 'sponsorkit'

const sponsors = await fetchSponsors(token, login)
```

Check the type definition or source code for more utils available.

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg">
    <img src='https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg'/>
  </a>
</p>

## License

[MIT](./LICENSE) License © 2022 [Anthony Fu](https://github.com/antfu)
