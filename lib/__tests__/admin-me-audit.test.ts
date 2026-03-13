import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { supabaseAdminMock } = vi.hoisted(() => ({
  supabaseAdminMock: {
    from: vi.fn(),
    auth: {
      admin: {
        updateUserById: vi.fn(),
      },
    },
  },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseAdminMock),
}))

vi.mock('@/lib/auth', () => ({
  getCurrentAdminSession: vi.fn(),
}))

vi.mock('@/lib/security-audit-log', () => ({
  writeSecurityAuditLog: vi.fn().mockResolvedValue(true),
}))

import { getCurrentAdminSession } from '@/lib/auth'
import { writeSecurityAuditLog } from '@/lib/security-audit-log'
import { GET, PUT } from '../../app/api/admin/me/route'

const mockedGetCurrentAdminSession = vi.mocked(getCurrentAdminSession)
const mockedWriteSecurityAuditLog = vi.mocked(writeSecurityAuditLog)

function createRequest(password: string): NextRequest {
  return new Request('http://localhost/api/admin/me', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  }) as unknown as NextRequest
}

describe('PUT /api/admin/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetCurrentAdminSession.mockResolvedValue({
      user: {
        id: 'admin-1',
        is_super: true,
      },
      session: null,
    } as unknown as Awaited<ReturnType<typeof getCurrentAdminSession>>)
  })

  it('sanitizes password change failures and records an audit log', async () => {
    supabaseAdminMock.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { auth_id: 'auth-admin-1' },
            error: null,
          })),
        })),
      })),
    })
    supabaseAdminMock.auth.admin.updateUserById.mockResolvedValue({
      error: { message: 'internal auth stack trace' },
    })

    const response = await PUT(createRequest('StrongPass123'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('pragma')).toBe('no-cache')
    expect(payload.error).toBe('修改密码失败，请稍后重试')
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'change_own_admin_password',
        actorId: 'admin-1',
        result: 'failed',
        reason: 'auth_password_update_failed',
      }),
    )
  })

  it('returns no-store headers for current admin profile reads', async () => {
    supabaseAdminMock.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: {
              id: 'admin-1',
              phone: '18140044662',
              name: '管理员',
              email: 'admin@system.local',
              is_super: true,
              auth_id: 'auth-admin-1',
            },
            error: null,
          })),
        })),
      })),
    })

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('pragma')).toBe('no-cache')
    expect(payload.success).toBe(true)
  })
})
