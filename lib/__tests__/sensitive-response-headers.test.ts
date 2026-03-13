import { describe, expect, it } from 'vitest'
import { applySensitiveResponseHeaders, SENSITIVE_RESPONSE_HEADERS } from '../sensitive-response-headers'

describe('sensitive response headers', () => {
  it('applies no-store and noindex style headers to a response header bag', () => {
    const headers = new Headers()

    applySensitiveResponseHeaders(headers)

    expect(headers.get('cache-control')).toBe(SENSITIVE_RESPONSE_HEADERS['Cache-Control'])
    expect(headers.get('pragma')).toBe(SENSITIVE_RESPONSE_HEADERS.Pragma)
    expect(headers.get('x-robots-tag')).toBe(SENSITIVE_RESPONSE_HEADERS['X-Robots-Tag'])
  })
})
