import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { serviceRoleClientMock } = vi.hoisted(() => ({
  serviceRoleClientMock: {
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  },
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => serviceRoleClientMock),
}))

vi.mock('@/lib/auth', () => ({
  getCurrentAdminSession: vi.fn(),
  getCurrentCoachSession: vi.fn(),
}))

vi.mock('@/lib/security-audit-log', () => ({
  writeSecurityAuditLog: vi.fn().mockResolvedValue(true),
}))

import { getCurrentAdminSession, getCurrentCoachSession } from '@/lib/auth'
import { GET } from '../../app/api/storage/object/route'

function createStorageRequest(url: string) {
  return new NextRequest(url)
}

function buildSingleRowQuery(data: unknown, error: unknown = null) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data,
          error,
        })),
      })),
    })),
  }
}

function buildListQuery(data: unknown, error: unknown = null) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(async () => ({
        data,
        error,
      })),
    })),
  }
}

describe('GET /api/storage/object', () => {
  const mockedGetCurrentAdminSession = vi.mocked(getCurrentAdminSession)
  const mockedGetCurrentCoachSession = vi.mocked(getCurrentCoachSession)
  const coachSession = {
    user: { id: 'coach-1' },
    session: null,
  } as Awaited<ReturnType<typeof getCurrentCoachSession>>

  beforeEach(() => {
    vi.clearAllMocks()
    serviceRoleClientMock.from.mockReset()
    serviceRoleClientMock.storage.from.mockReset()
    mockedGetCurrentAdminSession.mockResolvedValue(null)
    mockedGetCurrentCoachSession.mockResolvedValue(null)
  })

  it('allows coaches to preview their own pending private uploads before the registration is saved', async () => {
    mockedGetCurrentCoachSession.mockResolvedValue(coachSession)

    const downloadMock = vi.fn(async () => ({
      data: new Blob(['coach preview'], { type: 'image/png' }),
      error: null,
    }))
    serviceRoleClientMock.storage.from.mockReturnValue({
      download: downloadMock,
    })

    const response = await GET(
      createStorageRequest(
        'http://localhost/api/storage/object?bucket=player-photos&path=coach%2Fcoach-1%2Fupload-fixed.png',
      ),
    )

    expect(response.status).toBe(200)
    expect(downloadMock).toHaveBeenCalledWith('coach/coach-1/upload-fixed.png')
    expect(serviceRoleClientMock.from).not.toHaveBeenCalled()
  })

  it('denies a public share token from reading another player scoped upload', async () => {
    serviceRoleClientMock.from.mockImplementation((table: string) => {
      if (table === 'player_share_tokens') {
        return buildSingleRowQuery({
          registration_id: 'reg-1',
          event_id: 'event-1',
          player_id: 'player-1',
          player_index: 0,
          is_active: true,
          expires_at: '2099-01-01T00:00:00.000Z',
          used_at: null,
        })
      }

      if (table === 'registrations') {
        return buildSingleRowQuery({
          id: 'reg-1',
          event_id: 'event-1',
          status: 'draft',
          team_data: {},
          players_data: [{ id: 'player-1' }],
        })
      }

      if (table === 'registration_settings') {
        return buildListQuery([])
      }

      throw new Error(`Unexpected table ${table}`)
    })

    const downloadMock = vi.fn()
    serviceRoleClientMock.storage.from.mockReturnValue({
      download: downloadMock,
    })

    const response = await GET(
      createStorageRequest(
        'http://localhost/api/storage/object?bucket=player-photos&path=public-share%2Freg-1%2Fplayer-player-2%2Fphoto.png&share_token=share-token-1',
      ),
    )
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.success).toBe(false)
    expect(payload.error).toBe('未授权访问')
    expect(downloadMock).not.toHaveBeenCalled()
  })

  it('allows a public share token to preview its own pending player upload before submit', async () => {
    serviceRoleClientMock.from.mockImplementation((table: string) => {
      if (table === 'player_share_tokens') {
        return buildSingleRowQuery({
          registration_id: 'reg-1',
          event_id: 'event-1',
          player_id: 'player-1',
          player_index: 0,
          is_active: true,
          expires_at: '2099-01-01T00:00:00.000Z',
          used_at: null,
        })
      }

      if (table === 'registrations') {
        return buildSingleRowQuery({
          id: 'reg-1',
          event_id: 'event-1',
          status: 'draft',
          team_data: {},
          players_data: [{ id: 'player-1' }],
        })
      }

      if (table === 'registration_settings') {
        return buildListQuery([])
      }

      throw new Error(`Unexpected table ${table}`)
    })

    const downloadMock = vi.fn(async () => ({
      data: new Blob(['share preview'], { type: 'image/png' }),
      error: null,
    }))
    serviceRoleClientMock.storage.from.mockReturnValue({
      download: downloadMock,
    })

    const response = await GET(
      createStorageRequest(
        'http://localhost/api/storage/object?bucket=player-photos&path=public-share%2Freg-1%2Fplayer-player-1%2Fphoto.png&share_token=share-token-1',
      ),
    )

    expect(response.status).toBe(200)
    expect(downloadMock).toHaveBeenCalledWith(
      'public-share/reg-1/player-player-1/photo.png',
    )
  })
})
