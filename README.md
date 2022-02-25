# SponsorKit

[![NPM version](https://img.shields.io/npm/v/sponsorkit?color=a1b858&label=)](https://www.npmjs.com/package/sponsorkit)

Toolkit for generating sponsors images.

## Usage

Create `.env` file with:

```ini
SPONSORKIT_TOKEN=your_github_token
SPONSORKIT_LOGIN=your_github_username
```

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
  login: 'antfu',
  width: 800,
  tiers: [
    {
      title: 'Backers',
      monthlyDollars: 10,
      preset: presets.base,
    },
    {
      title: 'Sponsors',
      monthlyDollars: 50,
      preset: presets.medium,
    },
    {
      title: 'Silver Sponsors',
      monthlyDollars: 100,
      preset: presets.large,
    },
    {
      title: 'Gold Sponsors',
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
