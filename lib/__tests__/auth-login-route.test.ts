import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  signInWithPasswordMock,
  supabaseClientMock,
  serviceRoleClientMock,
  auditCountState,
} = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
  supabaseClientMock: {
    auth: {
      signInWithPassword: vi.fn(),
    },
  },
  serviceRoleClientMock: {
    from: vi.fn(),
  },
  auditCountState: {
    ipCount: 0,
    phoneCount: 0,
    shouldError: false,
  },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseClientMock),
}))

vi.mock('@/lib/env', () => ({
  getSupabaseAnonKey: vi.fn(() => 'anon-key'),
  getSupabaseUrl: vi.fn(() => 'https://project-ref.supabase.co'),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => serviceRoleClientMock),
}))

vi.mock('@/lib/security-audit-log', () => ({
  writeSecurityAuditLog: vi.fn().mockResolvedValue(true),
}))

import { writeSecurityAuditLog } from '@/lib/security-audit-log'
import { POST } from '../../app/api/auth/login/route'

const mockedWriteSecurityAuditLog = vi.mocked(writeSecurityAuditLog)

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (globalThis as { __eventRegistrationRateLimitStore__?: unknown }).__eventRegistrationRateLimitStore__
    supabaseClientMock.auth.signInWithPassword = signInWithPasswordMock
    signInWithPasswordMock.mockReset()
    auditCountState.ipCount = 0
    auditCountState.phoneCount = 0
    auditCountState.shouldError = false
    serviceRoleClientMock.from.mockImplementation((table: string) => {
      if (table !== 'security_audit_logs') {
        throw new Error(`Unexpected table ${table}`)
      }

      const filters = {
        ipAddress: null as string | null,
        phoneMasked: null as string | null,
      }

      const chain = {
        eq: vi.fn((column: string, value: string) => {
          if (column === 'ip_address') {
            filters.ipAddress = value
          }
          return chain
        }),
        gte: vi.fn(() => chain),
        contains: vi.fn((column: string, value: Record<string, string>) => {
          if (column === 'metadata') {
            filters.phoneMasked = value.phone_masked || null
          }
          return chain
        }),
        in: vi.fn(async () => {
          if (auditCountState.shouldError) {
            return {
              count: null,
              error: { message: 'audit lookup failed' },
            }
          }

          if (filters.ipAddress) {
            return {
              count: auditCountState.ipCount,
              error: null,
            }
          }

          if (filters.phoneMasked) {
            return {
              count: auditCountState.phoneCount,
              error: null,
            }
          }

          return {
            count: 0,
            error: null,
          }
        }),
      }

      return {
        select: vi.fn(() => chain),
      }
    })
  })

  it('returns a no-store session payload for successful logins', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: {
        user: {
          id: 'coach-auth-1',
          email: '13800000001@system.local',
          user_metadata: {
            role: 'coach',
            name: '测试教练',
          },
        },
        session: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_at: 1_900_000_000,
          expires_in: 3600,
          token_type: 'bearer',
        },
      },
      error: null,
    })

    const response = await POST(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify({
        phone: '13800000001',
        password: '000000',
      }),
    }) as never)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('x-ratelimit-limit')).toBe('8')
    expect(payload.success).toBe(true)
    expect(payload.data.user.id).toBe('coach-auth-1')
    expect(payload.data.session.access_token).toBe('access-token')
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'login',
        actorType: 'coach',
        actorId: 'coach-auth-1',
        result: 'success',
      }),
    )
  })

  it('rate limits repeated failed login attempts before hitting Supabase again', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: {
        user: null,
        session: null,
      },
      error: {
        message: 'Invalid login credentials',
      },
    })

    for (let index = 0; index < 8; index += 1) {
      const response = await POST(new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.11',
        },
        body: JSON.stringify({
          phone: '13800000002',
          password: 'bad-password',
        }),
      }) as never)

      expect(response.status).toBe(401)
    }

    const rateLimitedResponse = await POST(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.11',
      },
      body: JSON.stringify({
        phone: '13800000002',
        password: 'bad-password',
      }),
    }) as never)
    const payload = await rateLimitedResponse.json()

    expect(rateLimitedResponse.status).toBe(429)
    expect(payload.error).toContain('过于频繁')
    expect(signInWithPasswordMock).toHaveBeenCalledTimes(8)
  })

  it('blocks login when audit-backed failure thresholds are already exceeded across instances', async () => {
    auditCountState.ipCount = 12

    const response = await POST(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.12',
      },
      body: JSON.stringify({
        phone: '13800000003',
        password: 'bad-password',
      }),
    }) as never)
    const payload = await response.json()

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('900')
    expect(payload.error).toContain('过于频繁')
    expect(signInWithPasswordMock).not.toHaveBeenCalled()
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'login',
        result: 'denied',
        reason: 'rate_limited',
        metadata: expect.objectContaining({
          throttle_source: 'audit_ip_failures',
        }),
      }),
    )
  })
})
