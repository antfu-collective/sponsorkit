import { parse } from 'node-html-parser';
import { $fetch } from 'ohmyfetch'
import { Sponsorship } from '../../types';

const privateSponsorAvatar = `<svg aria-label="Private Sponsor" role="img" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true" class="octicon octicon-person color-fg-subtle">
<path fill-rule="evenodd" d="M10.5 5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm.061 3.073a4 4 0 10-5.123 0 6.004 6.004 0 00-3.431 5.142.75.75 0 001.498.07 4.5 4.5 0 018.99 0 .75.75 0 101.498-.07 6.005 6.005 0 00-3.432-5.142z"></path>
</svg>`

export interface IOptions {
    /**
     * @default false
     * */
    includePrivate?: boolean
}

function pickSponsorsInfo(html: string, filter?: (user: Sponsorship) => boolean): Sponsorship[] {
    const root = parse(html)
    const baseDate = new Date();
    let sponsors = root.querySelectorAll('div').map((el, index) => {
        const isPublic = el.querySelector('img')
        const createdAt = new Date(baseDate.getTime() - index * 1000 * 60 * 60 * 24 * 30).toUTCString();
        const name = isPublic ? isPublic?.getAttribute('alt')?.replace('@', '') : 'Private Sponsor'
        const avatarUrl = isPublic ? isPublic?.getAttribute('src') : privateSponsorAvatar

        return {
            sponsor: {
                __typename: undefined,
                login: undefined,
                name,
                avatarUrl,
                type: 'User'
            },
            isOneTime: undefined,
            monthlyDollars: -1,
            privacyLevel: isPublic ? "PUBLIC" : "PRIVATE",
            tierName: undefined,
            createdAt
        } as unknown as Sponsorship
    })

    if (filter) {
        sponsors = sponsors.filter(filter)
    }

    return sponsors
}

export async function getPastSponsors(username: string, options: IOptions = {}): Promise<Sponsorship[]> {
    const { includePrivate } = options
    const allSponsors: Sponsorship[] = [];
    let newSponsors = []
    let cursor = 1

    do {
        const content = await $fetch(`https://github.com/sponsors/${username}/sponsors_partial?filter=inactive&page=${cursor++}`, { method: "GET" })
        newSponsors = pickSponsorsInfo(content, (user) => {
            const isPrivate = user.privacyLevel === 'PRIVATE'

            if (isPrivate) {
                return !!includePrivate
            }
            
            return true
        })
        allSponsors.push(...newSponsors)
    } while (newSponsors.length)
    return allSponsors
}