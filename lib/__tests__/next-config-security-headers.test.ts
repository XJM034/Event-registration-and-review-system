import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config'

describe('next.config security headers', () => {
  it('publishes the expected baseline browser security headers', async () => {
    const rules = await nextConfig.headers?.()
    const rootRule = rules?.find((rule) => rule.source === '/(.*)')
    const headerMap = Object.fromEntries(
      (rootRule?.headers || []).map((header) => [header.key, header.value]),
    )

    expect(headerMap['X-Frame-Options']).toBe('DENY')
    expect(headerMap['X-Content-Type-Options']).toBe('nosniff')
    expect(headerMap['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headerMap['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains; preload')
    expect(headerMap['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=(), browsing-topics=()')
    expect(headerMap['Cross-Origin-Opener-Policy']).toBe('same-origin')
    expect(headerMap['Origin-Agent-Cluster']).toBe('?1')
    expect(headerMap['Cross-Origin-Resource-Policy']).toBe('same-site')
    expect(headerMap['Content-Security-Policy']).toBe("base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'")
    expect(headerMap['X-Permitted-Cross-Domain-Policies']).toBe('none')
  })
})
