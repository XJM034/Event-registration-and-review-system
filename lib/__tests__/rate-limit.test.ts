import { describe, expect, it } from 'vitest'
import {
  applyRateLimitHeaders,
  buildRateLimitKey,
  createRateLimitResponse,
  getRequestIp,
  takeRateLimit,
} from '@/lib/rate-limit'

describe('rate limit helpers', () => {
  it('extracts client ip from forwarded headers', () => {
    const request = new Request('https://example.com', {
      headers: {
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
      },
    })

    expect(getRequestIp(request)).toBe('203.0.113.10')
    expect(
      buildRateLimitKey({
        request,
        scope: 'player-share:get',
        subject: 'share-token-1',
      }),
    ).toBe('player-share:get:203.0.113.10:share-token-1')
  })

  it('allows requests within the same window and blocks when the limit is exceeded', () => {
    const now = 1_700_000_000_000
    const key = 'export:203.0.113.9:admin-1'

    const first = takeRateLimit({ key, limit: 2, windowMs: 60_000, now })
    const second = takeRateLimit({ key, limit: 2, windowMs: 60_000, now: now + 1_000 })
    const third = takeRateLimit({ key, limit: 2, windowMs: 60_000, now: now + 2_000 })

    expect(first.allowed).toBe(true)
    expect(first.remaining).toBe(1)
    expect(second.allowed).toBe(true)
    expect(second.remaining).toBe(0)
    expect(third.allowed).toBe(false)
    expect(third.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('resets counters after the window expires', () => {
    const now = 1_800_000_000_000
    const key = 'admin-session:203.0.113.7:unknown'

    takeRateLimit({ key, limit: 1, windowMs: 10_000, now })
    const afterReset = takeRateLimit({ key, limit: 1, windowMs: 10_000, now: now + 10_001 })

    expect(afterReset.allowed).toBe(true)
    expect(afterReset.remaining).toBe(0)
  })

  it('writes standard rate limit headers onto responses', () => {
    const decision = takeRateLimit({
      key: 'player-share:198.51.100.1:token-1',
      limit: 1,
      windowMs: 30_000,
      now: 1_900_000_000_000,
    })
    const blocked = takeRateLimit({
      key: 'player-share:198.51.100.1:token-1',
      limit: 1,
      windowMs: 30_000,
      now: 1_900_000_000_100,
    })

    const headers = new Headers()
    applyRateLimitHeaders(headers, blocked)
    expect(headers.get('Retry-After')).not.toBeNull()
    expect(headers.get('X-RateLimit-Limit')).toBe('1')

    const response = createRateLimitResponse(
      { error: '请求过于频繁，请稍后重试', success: false },
      decision,
      { status: 200 },
    )

    expect(response.headers.get('X-RateLimit-Limit')).toBe('1')
    expect(response.status).toBe(200)
  })
})
