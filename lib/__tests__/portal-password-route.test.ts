import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { supabaseServerMock } = vi.hoisted(() => ({
  supabaseServerMock: {
    auth: {
      updateUser: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth', () => ({
  createSupabaseServer: vi.fn(async () => supabaseServerMock),
  getCurrentCoachSession: vi.fn(),
}))

vi.mock('@/lib/security-audit-log', () => ({
  writeSecurityAuditLog: vi.fn().mockResolvedValue(true),
}))

import { createSupabaseServer, getCurrentCoachSession } from '@/lib/auth'
import { writeSecurityAuditLog } from '@/lib/security-audit-log'
import { PUT } from '../../app/api/portal/me/password/route'

const mockedCreateSupabaseServer = vi.mocked(createSupabaseServer)
const mockedGetCurrentCoachSession = vi.mocked(getCurrentCoachSession)
const mockedWriteSecurityAuditLog = vi.mocked(writeSecurityAuditLog)

function createRequest(password: string): NextRequest {
  return new Request('http://localhost/api/portal/me/password', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  }) as unknown as NextRequest
}

describe('PUT /api/portal/me/password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedCreateSupabaseServer.mockResolvedValue(supabaseServerMock as never)
    mockedGetCurrentCoachSession.mockResolvedValue({
      user: {
        id: 'coach-1',
      },
      session: {
        user: {
          id: 'auth-coach-1',
        },
      },
    } as never)
  })

  it('rejects weak passwords before hitting Supabase', async () => {
    const response = await PUT(createRequest('123456'))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(payload.error).toContain('密码至少10位')
    expect(supabaseServerMock.auth.updateUser).not.toHaveBeenCalled()
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'change_own_coach_password',
        actorId: 'coach-1',
        reason: 'password_policy_violation',
        result: 'failed',
      }),
    )
  })

  it('sanitizes Supabase update failures', async () => {
    supabaseServerMock.auth.updateUser.mockResolvedValue({
      error: { message: 'upstream stack trace' },
    })

    const response = await PUT(createRequest('Abcdef1234'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(response.headers.get('pragma')).toBe('no-cache')
    expect(payload.error).toBe('修改密码失败，请稍后重试')
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'change_own_coach_password',
        actorId: 'coach-1',
        reason: 'auth_password_update_failed',
        result: 'failed',
      }),
    )
  })

  it('updates the password via the controlled server route', async () => {
    supabaseServerMock.auth.updateUser.mockResolvedValue({ error: null })

    const response = await PUT(createRequest('Abcdef1234'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(supabaseServerMock.auth.updateUser).toHaveBeenCalledWith({
      password: 'Abcdef1234',
    })
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'change_own_coach_password',
        actorId: 'coach-1',
        result: 'success',
      }),
    )
  })
})
