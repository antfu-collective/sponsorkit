import { parse } from 'node-html-parser';
import { $fetch } from 'ohmyfetch'

export type TPublicUser = {
    username: string
    avatar: string
}

export type TPrivateUser = {
    isPrivate: true
}

export type TUser = TPublicUser | TPrivateUser

function pickSponsorsInfo(html: string, filter?: (user: TUser) => boolean): TUser[] {
    const root = parse(html)
    let sponsors = root.querySelectorAll('div').map(el => {
        const publicSponsor = el.querySelector('img')

        if (!publicSponsor) {
            return {
                isPrivate: true
            } as TPrivateUser
        }

        return {
            username: publicSponsor?.getAttribute('alt')?.replace('@', ''),
            avatar: publicSponsor?.getAttribute('src')
        } as TPublicUser
    })

    if (filter) {
        sponsors = sponsors.filter(filter)
    }

    return sponsors
}

export default async function (username: string, options: {
    /**
     * @default true
     * */
    privateSponsor?: boolean
} = {}): Promise<TUser[]> {
    const { privateSponsor = true } = options
    const allSponsors: TUser[] = [];
    let newSponsors = []
    let cursor = 1

    do {
        const content = await $fetch(`https://github.com/sponsors/${username}/sponsors_partial?filter=inactive&page=${cursor++}`, { method: "GET" })
        newSponsors = pickSponsorsInfo(content, (user) => {
            const isPrivate = 'isPrivate' in user && user.isPrivate
            if (isPrivate) {
                return privateSponsor
            }
            return true
        })
        allSponsors.push(...newSponsors)
    } while (newSponsors.length)
    return allSponsors
}