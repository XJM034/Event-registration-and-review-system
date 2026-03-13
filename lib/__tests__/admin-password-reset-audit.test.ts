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
import { POST as resetAdminPassword } from '../../app/api/admin/admins/[id]/reset-password/route'
import { POST as resetCoachPassword } from '../../app/api/admin/coaches/[id]/reset-password/route'

const mockedGetCurrentAdminSession = vi.mocked(getCurrentAdminSession)
const mockedWriteSecurityAuditLog = vi.mocked(writeSecurityAuditLog)

function createPasswordResetRequest(password: string): NextRequest {
  return new Request('http://localhost/api/reset-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  }) as unknown as NextRequest
}

describe('password reset routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetCurrentAdminSession.mockResolvedValue({
      user: {
        id: 'admin-operator',
        is_super: true,
      },
      session: null,
    } as any)
  })

  it('sanitizes admin reset-password failures and writes audit logs', async () => {
    supabaseAdminMock.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { auth_id: 'auth-admin-1' },
            error: null,
          }),
        }),
      }),
    })
    supabaseAdminMock.auth.admin.updateUserById.mockResolvedValue({
      error: { message: 'internal auth stack trace' },
    })

    const response = await resetAdminPassword(createPasswordResetRequest('StrongPass123'), {
      params: Promise.resolve({ id: 'admin-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe('重置密码失败，请稍后重试')
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reset_admin_password',
        targetUserId: 'admin-1',
        result: 'failed',
      }),
    )
  })

  it('sanitizes coach reset-password failures and writes audit logs', async () => {
    supabaseAdminMock.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { auth_id: 'auth-coach-1', phone: '13800000001' },
            error: null,
          }),
        }),
      }),
    })
    supabaseAdminMock.auth.admin.updateUserById.mockResolvedValue({
      error: { message: 'internal auth stack trace' },
    })

    const response = await resetCoachPassword(createPasswordResetRequest('StrongPass123'), {
      params: Promise.resolve({ id: 'coach-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe('重置密码失败，请稍后重试')
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reset_coach_password',
        targetUserId: 'coach-1',
        result: 'failed',
      }),
    )
  })
})
