import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { queryMock, serviceRoleClientMock } = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
  }

  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.gte.mockReturnValue(query)
  query.lte.mockReturnValue(query)
  query.order.mockReturnValue(query)

  return {
    queryMock: query,
    serviceRoleClientMock: {
      from: vi.fn(() => query),
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

  it('lists audit logs with filters and pagination', async () => {
    queryMock.range.mockResolvedValue({
      data: [
        {
          id: 'log-1',
          action: 'create_admin_account',
          result: 'success',
        },
      ],
      error: null,
      count: 1,
    })

    const response = await GET(
      createRequest('http://localhost/api/admin/security-audit-logs?page=2&pageSize=5&action=create_admin_account&actorType=admin&result=success&from=2026-03-01&to=2026-03-31'),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(queryMock.eq).toHaveBeenCalledWith('action', 'create_admin_account')
    expect(queryMock.eq).toHaveBeenCalledWith('actor_type', 'admin')
    expect(queryMock.eq).toHaveBeenCalledWith('result', 'success')
    expect(queryMock.gte).toHaveBeenCalledWith('created_at', '2026-03-01')
    expect(queryMock.lte).toHaveBeenCalledWith('created_at', '2026-03-31')
    expect(queryMock.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(queryMock.range).toHaveBeenCalledWith(5, 9)
    expect(payload.success).toBe(true)
    expect(payload.data.total).toBe(1)
    expect(payload.data.page).toBe(2)
    expect(payload.data.pageSize).toBe(5)
  })
})
