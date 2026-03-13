import { describe, expect, it } from 'vitest'

import { isSameOriginMutationRequest, isUnsafeMutationMethod } from '@/lib/csrf'

describe('csrf helpers', () => {
  it('recognizes unsafe mutation methods', () => {
    expect(isUnsafeMutationMethod('POST')).toBe(true)
    expect(isUnsafeMutationMethod('put')).toBe(true)
    expect(isUnsafeMutationMethod('GET')).toBe(false)
  })

  it('allows same-origin unsafe requests', () => {
    const request = new Request('https://example.com/api/admin/me', {
      method: 'POST',
      headers: {
        origin: 'https://example.com',
        'sec-fetch-site': 'same-origin',
      },
    })

    expect(isSameOriginMutationRequest(request)).toBe(true)
  })

  it('rejects cross-site unsafe requests', () => {
    const request = new Request('https://example.com/api/admin/me', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
      },
    })

    expect(isSameOriginMutationRequest(request)).toBe(false)
  })

  it('allows proxied same-origin unsafe requests when forwarded host matches origin', () => {
    const request = new Request('http://internal-service/api/auth/login', {
      method: 'POST',
      headers: {
        origin: 'https://joinmatch.preview.huawei-zeabur.cn',
        'x-forwarded-host': 'joinmatch.preview.huawei-zeabur.cn',
        'x-forwarded-proto': 'https',
        'sec-fetch-site': 'same-origin',
      },
    })

    expect(isSameOriginMutationRequest(request)).toBe(true)
  })

  it('allows non-browser or same-origin safe requests', () => {
    const request = new Request('https://example.com/api/admin/me', {
      method: 'POST',
    })

    expect(isSameOriginMutationRequest(request)).toBe(true)
  })
})
