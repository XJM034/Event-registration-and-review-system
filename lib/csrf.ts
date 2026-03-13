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

function readForwardedHeader(
  request: RequestLike,
  headerName: string,
) {
  return request.headers.get(headerName)?.split(',')[0]?.trim() || null
}

function getExpectedRequestOrigin(request: RequestLike) {
  const forwardedHost = readForwardedHeader(request, 'x-forwarded-host')
  const forwardedProto = readForwardedHeader(request, 'x-forwarded-proto')
  const host = forwardedHost || readForwardedHeader(request, 'host')

  if (host) {
    const fallbackOrigin = new URL(request.url).origin
    const fallbackProtocol = new URL(fallbackOrigin).protocol
    const protocol = forwardedProto ? `${forwardedProto.replace(/:$/, '')}:` : fallbackProtocol

    return `${protocol}//${host}`
  }

  return new URL(request.url).origin
}

export function isSameOriginMutationRequest(request: RequestLike) {
  if (!isUnsafeMutationMethod(request.method)) {
    return true
  }

  const originHeader = request.headers.get('origin')

  if (originHeader) {
    try {
      const requestOrigin = getExpectedRequestOrigin(request)
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
