const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const ALLOWED_FETCH_SITES = new Set(['same-origin', 'none'])

interface RequestLike {
  method: string
  url: string
  headers: Pick<Headers, 'get'>
}

export function isUnsafeMutationMethod(method: string) {
  return UNSAFE_METHODS.has(String(method || '').toUpperCase())
}

export function isSameOriginMutationRequest(request: RequestLike) {
  if (!isUnsafeMutationMethod(request.method)) {
    return true
  }

  const originHeader = request.headers.get('origin')

  if (originHeader) {
    try {
      const requestOrigin = new URL(request.url).origin
      const origin = new URL(originHeader).origin

      if (origin !== requestOrigin) {
        return false
      }
    } catch {
      return false
    }
  }

  const secFetchSite = request.headers.get('sec-fetch-site')
  if (secFetchSite && !ALLOWED_FETCH_SITES.has(secFetchSite)) {
    return false
  }

  return true
}
