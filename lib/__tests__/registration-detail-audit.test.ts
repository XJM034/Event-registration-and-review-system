import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  getCurrentAdminSession: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/security-audit-log', () => ({
  writeSecurityAuditLog: vi.fn().mockResolvedValue(true),
}))

import { getCurrentAdminSession } from '@/lib/auth'
import { writeSecurityAuditLog } from '@/lib/security-audit-log'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { GET } from '../../app/api/registrations/[id]/route'

const mockedGetCurrentAdminSession = vi.mocked(getCurrentAdminSession)
const mockedWriteSecurityAuditLog = vi.mocked(writeSecurityAuditLog)
const mockedCreateServiceRoleClient = vi.mocked(createServiceRoleClient)

function createRequest(url = 'http://localhost/api/registrations/reg-1?event_id=event-1'): NextRequest {
  return new Request(url) as unknown as NextRequest
}

describe('GET /api/registrations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 and records a denied audit log when admin session is missing', async () => {
    mockedGetCurrentAdminSession.mockResolvedValue(null)

    const response = await GET(createRequest(), {
      params: Promise.resolve({ id: 'reg-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('pragma')).toBe('no-cache')
    expect(payload.success).toBe(false)
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'view_registration_detail',
        resourceId: 'reg-1',
        result: 'denied',
      }),
    )
    expect(mockedCreateServiceRoleClient).not.toHaveBeenCalled()
  })

  it('returns data and records a success audit log for admin views', async () => {
    mockedGetCurrentAdminSession.mockResolvedValue({
      user: {
        id: 'admin-1',
        is_super: false,
      },
      session: null,
    } as unknown as Awaited<ReturnType<typeof getCurrentAdminSession>>)

    mockedCreateServiceRoleClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'reg-1',
                  event_id: 'event-1',
                  coach_id: 'coach-1',
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createServiceRoleClient>)

    const response = await GET(createRequest(), {
      params: Promise.resolve({ id: 'reg-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('pragma')).toBe('no-cache')
    expect(payload.success).toBe(true)
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'view_registration_detail',
        actorId: 'admin-1',
        registrationId: 'reg-1',
        eventId: 'event-1',
        targetUserId: 'coach-1',
        result: 'success',
      }),
    )
  })
})
