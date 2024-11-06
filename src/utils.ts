import _normalizeUrl from 'normalize-url'

export function normalizeUrl(url: string | undefined): string | undefined {
  if (!url)
    return undefined

  try {
    return _normalizeUrl(url, {
      defaultProtocol: 'https',
    })
  }
  catch {
    return url
  }
}
