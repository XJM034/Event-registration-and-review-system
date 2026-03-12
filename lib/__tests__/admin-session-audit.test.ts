import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  supabaseClientMock,
  createAdminSessionTokenMock,
  getAdminSessionMaxAgeMock,
} = vi.hoisted(() => ({
  supabaseClientMock: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
  createAdminSessionTokenMock: vi.fn(),
  getAdminSessionMaxAgeMock: vi.fn(() => 3600),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseClientMock),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
      }),
    },
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: vi.fn(),
  })),
}))

vi.mock('@/lib/admin-session', () => ({
  ADMIN_SESSION_COOKIE_NAME: 'admin-session',
  ADMIN_TAB_SESSION_COOKIE_NAME: 'admin-session-tab',
  createAdminSessionToken: createAdminSessionTokenMock,
  getAdminSessionMaxAge: getAdminSessionMaxAgeMock,
  verifyAdminSessionToken: vi.fn(),
}))

vi.mock('@/lib/security-audit-log', () => ({
  writeSecurityAuditLog: vi.fn().mockResolvedValue(true),
}))

import { writeSecurityAuditLog } from '@/lib/security-audit-log'
import { POST } from '../../app/api/auth/admin-session/route'

const mockedWriteSecurityAuditLog = vi.mocked(writeSecurityAuditLog)

describe('POST /api/auth/admin-session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseClientMock.auth.getUser.mockReset()
    supabaseClientMock.from.mockReset()
    createAdminSessionTokenMock.mockReset()
    getAdminSessionMaxAgeMock.mockReset()
    getAdminSessionMaxAgeMock.mockReturnValue(3600)
  })

  it('records a denied audit log when no authenticated user is resolved', async () => {
    supabaseClientMock.auth.getUser.mockResolvedValue({
      data: { user: null },
    })

    const response = await POST(new Request('http://localhost/api/auth/admin-session', {
      method: 'POST',
      headers: {
        authorization: 'Bearer access-token',
      },
    }))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.success).toBe(false)
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create_admin_session',
        resourceType: 'admin_session',
        result: 'denied',
        reason: 'unauthorized',
      }),
    )
  })

  it('records a success audit log when an admin session is created', async () => {
    supabaseClientMock.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'auth-admin-1',
          email: '18140044662@system.local',
          user_metadata: {
            role: 'admin',
            is_super: false,
          },
        },
      },
    })

    supabaseClientMock.from.mockImplementation((table: string) => {
      if (table !== 'admin_users') {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        select: vi.fn((columns: string) => {
          if (columns === 'id') {
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: 'admin-1' },
                  error: null,
                })),
              })),
            }
          }

          if (columns === 'is_super') {
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { is_super: true },
                  error: null,
                })),
              })),
            }
          }

          throw new Error(`Unexpected select columns ${columns}`)
        }),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      }
    })

    createAdminSessionTokenMock.mockResolvedValue('signed-admin-session')

    const response = await POST(new Request('http://localhost/api/auth/admin-session', {
      method: 'POST',
      headers: {
        authorization: 'Bearer access-token',
      },
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data.id).toBe('admin-1')
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create_admin_session',
        actorId: 'admin-1',
        actorRole: 'super_admin',
        resourceType: 'admin_session',
        result: 'success',
        metadata: expect.objectContaining({
          auth_id: 'auth-admin-1',
        }),
      }),
    )
  })
})
