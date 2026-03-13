export const SENSITIVE_RESPONSE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
})

export function applySensitiveResponseHeaders(headers: Headers) {
  Object.entries(SENSITIVE_RESPONSE_HEADERS).forEach(([key, value]) => {
    headers.set(key, value)
  })
}
