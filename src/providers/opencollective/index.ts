import type { Provider } from '../../types'
import { fetchIndividualSponsors } from './individual'
import { fetchCollectiveSponsors } from './collective'

export const OpenCollectiveProvider: Provider = {
  name: 'opencollective',
  fetchSponsors(config) {
    if (config.opencollective?.type !== 'collective') {
      return fetchIndividualSponsors(
        config.opencollective?.key,
        config.opencollective?.id,
        config.opencollective?.slug,
        config.opencollective?.githubHandle,
      )
    }
    else {
      return fetchCollectiveSponsors(
        config.opencollective?.key,
        config.opencollective?.id,
        config.opencollective?.slug,
        config.opencollective?.githubHandle,
      )
    }
  },
}

