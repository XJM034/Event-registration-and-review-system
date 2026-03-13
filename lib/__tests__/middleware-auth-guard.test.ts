import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getUserMock = vi.fn()
const maybeSingleMock = vi.fn()
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
const selectMock = vi.fn(() => ({ eq: eqMock }))
const fromMock = vi.fn(() => ({ select: selectMock }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: getUserMock,
    },
    from: fromMock,
  })),
}))

vi.mock('@/lib/env', () => ({
  getSupabaseAnonKey: vi.fn(() => 'anon-key'),
  getSupabaseUrl: vi.fn(() => 'https://project-ref.supabase.co'),
}))

vi.mock('@/lib/admin-session', () => ({
  ADMIN_SESSION_COOKIE_NAME: 'admin-session',
  ADMIN_TAB_SESSION_COOKIE_NAME: 'admin-session-tab',
  verifyAdminSessionToken: vi.fn(async (token?: string | null) => {
    if (token === 'valid-admin-token') {
      return {
        authId: 'admin-auth-id',
        adminId: 'admin-id',
        isSuper: false,
      }
    }

    return null
  }),
}))

import { middleware } from '../../middleware'

describe('middleware auth guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'coach-auth-id',
          user_metadata: { role: 'coach' },
        },
      },
      error: null,
    })
    maybeSingleMock.mockResolvedValue({
      data: {
        id: 'admin-id',
        is_super: false,
      },
      error: null,
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows /portal when a coach session is active even if an admin session cookie exists', async () => {
    const request = new NextRequest('https://example.com/portal', {
      headers: {
        cookie: 'admin-session=valid-admin-token',
      },
    })

    const response = await middleware(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('allows /api/portal when a coach session is active even if an admin session cookie exists', async () => {
    const request = new NextRequest('https://example.com/api/portal/registrations', {
      headers: {
        cookie: 'admin-session=valid-admin-token',
      },
    })

    const response = await middleware(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('blocks cross-site mutations to protected api routes', async () => {
    const request = new NextRequest('https://example.com/api/portal/me/password', {
      method: 'PUT',
      headers: {
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
      },
    })

    const response = await middleware(request)

    expect(response.status).toBe(403)
  })

  it('allows same-origin mutations to protected api routes', async () => {
    const request = new NextRequest('https://example.com/api/portal/me/password', {
      method: 'PUT',
      headers: {
        origin: 'https://example.com',
        'sec-fetch-site': 'same-origin',
      },
    })

    const response = await middleware(request)

    expect(response.status).toBe(200)
  })

  it('blocks debug and test API routes in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const debugRequest = new NextRequest('https://example.com/api/debug/check-role-mismatch?event_id=1')
    const debugResponse = await middleware(debugRequest)
    expect(debugResponse.status).toBe(404)

    const testRequest = new NextRequest('https://example.com/api/test-connection')
    const testResponse = await middleware(testRequest)
    expect(testResponse.status).toBe(404)
  })

  it('returns 404 for deprecated self-signup pages', async () => {
    const registerRequest = new NextRequest('https://example.com/auth/register')
    const registerResponse = await middleware(registerRequest)
    expect(registerResponse.status).toBe(404)

    const signupRequest = new NextRequest('https://example.com/auth/sign-up')
    const signupResponse = await middleware(signupRequest)
    expect(signupResponse.status).toBe(404)
  })
})
