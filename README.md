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
- [**Ko-fi**](https://ko-fi.com/)

## Usage

Create `.env` file with:

```ini
; GitHub provider.
; Token requires the `read:user` and `read:org` scopes.
SPONSORKIT_GITHUB_TOKEN=
SPONSORKIT_GITHUB_LOGIN=
; Optional data mode:
; - sponsors: people sponsoring you (default)
; - sponsees: people you have sponsored, including past sponsorships
SPONSORKIT_MODE=sponsors

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

; Ko-fi provider.
; Copy the verification token from https://ko-fi.com/manage/webhooks
SPONSORKIT_KOFI_VERIFICATION_TOKEN=
; Optional event store path populated by `sponsorkit kofi-webhook`.
SPONSORKIT_KOFI_DATA_FILE=./sponsorkit/kofi-events.json
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
  // Data mode:
  // - sponsors: people sponsoring you (default)
  // - sponsees: people you have sponsored, including past sponsorships
  mode: 'sponsors',

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
  kofi: {
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

### Ko-fi Webhooks

Ko-fi provides payment webhooks instead of an API for listing sponsors. Start the
SponsorKit receiver:

```bash
npx sponsorkit kofi-webhook
```

Expose `http://127.0.0.1:3456/kofi` through an HTTPS tunnel, then set that public
URL on the [Ko-fi webhooks page](https://ko-fi.com/manage/webhooks). SponsorKit
verifies the webhook token, removes the token and email before persistence,
deduplicates retries by `message_id`, and stores events in
`./sponsorkit/kofi-events.json`.

After Ko-fi sends a payment or test payment, generate the sponsor output normally:

```bash
npx sponsorkit --force
```

Ko-fi does not send an event when a membership ends. SponsorKit therefore treats
subscription payments as active for 35 days by default. Configure
`kofi.subscriptionEffectivity` to change this window.

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
    <img src='https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg' alt="Sponsors"/>
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
    <img src='https://cdn.jsdelivr.net/gh/antfu/static/sponsors.circles.svg' alt="Sponsors"/>
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

## License

[MIT](./LICENSE) License © 2022 [Anthony Fu](https://github.com/antfu)
