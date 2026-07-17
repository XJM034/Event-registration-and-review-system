import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { fromMock, selectMock, limitMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  limitMock: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: fromMock,
  })),
}))

import { GET as keepSupabaseAlive } from '../../app/api/cron/supabase-keepalive/route'

function createRequest(headers: HeadersInit = {}): NextRequest {
  return new Request('http://localhost/api/cron/supabase-keepalive', {
    method: 'GET',
    headers,
  }) as unknown as NextRequest
}

describe('supabase keepalive cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', 'test-cron-secret')

    limitMock.mockResolvedValue({
      data: [{ id: 'event-1' }],
      error: null,
    })
    selectMock.mockReturnValue({ limit: limitMock })
    fromMock.mockReturnValue({ select: selectMock })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('requires CRON_SECRET to be configured', async () => {
    vi.stubEnv('CRON_SECRET', '')

    const response = await keepSupabaseAlive(
      createRequest({ authorization: 'Bearer test-cron-secret' }),
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.success).toBe(false)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('rejects requests with an invalid bearer token', async () => {
    const response = await keepSupabaseAlive(
      createRequest({ authorization: 'Bearer wrong-secret' }),
    )
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.success).toBe(false)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('performs a lightweight Supabase read when authorized', async () => {
    const response = await keepSupabaseAlive(
      createRequest({
        authorization: 'Bearer test-cron-secret',
        'x-vercel-cron-schedule': '0 3 * * *',
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(payload.success).toBe(true)
    expect(payload.checked).toBe('events')
    expect(payload.rowCount).toBe(1)
    expect(payload.schedule).toBe('0 3 * * *')
    expect(fromMock).toHaveBeenCalledWith('events')
    expect(selectMock).toHaveBeenCalledWith('id')
    expect(limitMock).toHaveBeenCalledWith(1)
  })

  it('returns 503 when Supabase cannot be reached', async () => {
    limitMock.mockResolvedValue({
      data: null,
      error: { message: 'project is paused' },
    })

    const response = await keepSupabaseAlive(
      createRequest({ authorization: 'Bearer test-cron-secret' }),
    )
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload.success).toBe(false)
    expect(payload.message).toBe('project is paused')
  })
})
