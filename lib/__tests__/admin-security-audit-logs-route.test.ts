import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const {
  auditLogsQueryMock,
  adminUsersInMock,
  coachesInMock,
  registrationsInMock,
  eventsInMock,
  serviceRoleClientMock,
} = vi.hoisted(() => {
  const auditLogsQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    neq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
  }

  auditLogsQuery.select.mockReturnValue(auditLogsQuery)
  auditLogsQuery.eq.mockReturnValue(auditLogsQuery)
  auditLogsQuery.in.mockReturnValue(auditLogsQuery)
  auditLogsQuery.neq.mockReturnValue(auditLogsQuery)
  auditLogsQuery.gte.mockReturnValue(auditLogsQuery)
  auditLogsQuery.lte.mockReturnValue(auditLogsQuery)
  auditLogsQuery.order.mockReturnValue(auditLogsQuery)

  const adminUsersIn = vi.fn(async () => ({ data: [], error: null }))
  const coachesIn = vi.fn(async () => ({ data: [], error: null }))
  const registrationsIn = vi.fn(async () => ({ data: [], error: null }))
  const eventsIn = vi.fn(async () => ({ data: [], error: null }))

  return {
    auditLogsQueryMock: auditLogsQuery,
    adminUsersInMock: adminUsersIn,
    coachesInMock: coachesIn,
    registrationsInMock: registrationsIn,
    eventsInMock: eventsIn,
    serviceRoleClientMock: {
      from: vi.fn((table: string) => {
        if (table === 'security_audit_logs') {
          return auditLogsQuery
        }

        if (table === 'admin_users') {
          return {
            select: vi.fn(() => ({
              in: adminUsersIn,
            })),
          }
        }

        if (table === 'coaches') {
          return {
            select: vi.fn(() => ({
              in: coachesIn,
            })),
          }
        }

        if (table === 'registrations') {
          return {
            select: vi.fn(() => ({
              in: registrationsIn,
            })),
          }
        }

        if (table === 'events') {
          return {
            select: vi.fn(() => ({
              in: eventsIn,
            })),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    },
  }
})

vi.mock('@/lib/auth', () => ({
  getCurrentAdminSession: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => serviceRoleClientMock),
}))

import { getCurrentAdminSession } from '@/lib/auth'
import { GET } from '../../app/api/admin/security-audit-logs/route'

const mockedGetCurrentAdminSession = vi.mocked(getCurrentAdminSession)

function createRequest(url: string): NextRequest {
  return new Request(url, { method: 'GET' }) as unknown as NextRequest
}

describe('GET /api/admin/security-audit-logs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetCurrentAdminSession.mockResolvedValue({
      user: {
        id: 'admin-1',
        is_super: true,
      },
      session: null,
    } as never)
    adminUsersInMock.mockResolvedValue({ data: [], error: null })
    coachesInMock.mockResolvedValue({ data: [], error: null })
    registrationsInMock.mockResolvedValue({ data: [], error: null })
    eventsInMock.mockResolvedValue({ data: [], error: null })
  })

  it('rejects unauthenticated requests', async () => {
    mockedGetCurrentAdminSession.mockResolvedValue(null as never)

    const response = await GET(createRequest('http://localhost/api/admin/security-audit-logs'))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(payload.error).toBe('未授权访问')
  })

  it('rejects non-super admins', async () => {
    mockedGetCurrentAdminSession.mockResolvedValue({
      user: {
        id: 'admin-2',
        is_super: false,
      },
      session: null,
    } as never)

    const response = await GET(createRequest('http://localhost/api/admin/security-audit-logs'))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error).toBe('Forbidden')
  })

  it('groups account-login filters and enriches logs with names', async () => {
    auditLogsQueryMock.range.mockResolvedValue({
      data: [
        {
          id: 'log-1',
          created_at: '2026-03-13T10:00:00.000Z',
          actor_type: 'admin',
          actor_id: 'auth-admin-1',
          actor_role: 'super_admin',
          action: 'create_admin_session',
          resource_type: 'admin_session',
          resource_id: null,
          event_id: 'event-1',
          registration_id: 'registration-1',
          target_user_id: 'coach-1',
          result: 'success',
          reason: null,
          metadata: {
            review_status: 'approved',
          },
          ip_address: null,
          user_agent: null,
          request_id: 'req-1',
        },
      ],
      error: null,
      count: 1,
    })

    adminUsersInMock.mockResolvedValue({
      data: [
        { id: 'admin-1', auth_id: 'auth-admin-1', name: '超级管理员张三', phone: '13800000001' },
      ] as any,
      error: null,
    })
    coachesInMock.mockResolvedValue({
      data: [
        { id: 'coach-1', auth_id: 'auth-coach-1', name: '李教练', phone: '13900000002' },
      ] as any,
      error: null,
    })
    registrationsInMock.mockResolvedValue({
      data: [
        { id: 'registration-1', event_id: 'event-1', team_data: { team_name: '晨星队' } },
      ] as any,
      error: null,
    })
    eventsInMock.mockResolvedValue({
      data: [
        { id: 'event-1', name: '春季联赛', short_name: '春季联赛' },
      ] as any,
      error: null,
    })

    const response = await GET(
      createRequest('http://localhost/api/admin/security-audit-logs?page=2&pageSize=5&action=account_login&actorType=admin&result=success&from=2026-03-01&to=2026-03-31'),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(auditLogsQueryMock.in).toHaveBeenCalledWith('action', ['login', 'create_admin_session'])
    expect(auditLogsQueryMock.eq).toHaveBeenCalledWith('actor_type', 'admin')
    expect(auditLogsQueryMock.eq).toHaveBeenCalledWith('result', 'success')
    expect(auditLogsQueryMock.gte).toHaveBeenCalledWith('created_at', '2026-03-01')
    expect(auditLogsQueryMock.lte).toHaveBeenCalledWith('created_at', '2026-03-31')
    expect(auditLogsQueryMock.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(auditLogsQueryMock.range).toHaveBeenCalledWith(5, 9)
    expect(payload.success).toBe(true)
    expect(payload.data.total).toBe(1)
    expect(payload.data.logs[0].actor_name).toBe('超级管理员张三')
    expect(payload.data.logs[0].actor_phone).toBe('13800000001')
    expect(payload.data.logs[0].target_user_name).toBe('李教练')
    expect(payload.data.logs[0].registration_name).toBe('晨星队')
    expect(payload.data.logs[0].event_name).toBe('春季联赛')
  })

  it('defaults to key-operation scopes when no explicit action is provided', async () => {
    auditLogsQueryMock.range.mockResolvedValue({
      data: [],
      error: null,
      count: 0,
    })

    const response = await GET(
      createRequest('http://localhost/api/admin/security-audit-logs?page=1&pageSize=20'),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(auditLogsQueryMock.in).toHaveBeenCalledWith('action', [
      'review_registration',
      'view_registration_detail',
      'create_admin_account',
      'update_admin_account',
      'delete_admin_account',
      'reset_admin_password',
      'change_own_admin_password',
      'create_coach_account',
      'update_coach_account',
      'delete_coach_account',
      'reset_coach_password',
      'change_own_coach_password',
      'set_coach_active_status',
      'batch_set_coach_active_status',
      'import_coach_accounts',
      'export_registrations',
      'download_private_file',
      'view_public_share',
      'submit_public_share',
      'upload_public_share_file',
    ])
    expect(payload.success).toBe(true)
    expect(payload.data.total).toBe(0)
  })
})
