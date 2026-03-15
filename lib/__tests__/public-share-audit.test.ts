import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

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

vi.mock('@/lib/security-audit-log', () => ({
  writeSecurityAuditLog: vi.fn().mockResolvedValue(true),
}))

import { writeSecurityAuditLog } from '@/lib/security-audit-log'
import { GET, PUT } from '../../app/api/player-share/[token]/route'
import { POST as uploadPublicShareFile } from '../../app/api/player-share/[token]/upload/route'

const mockedWriteSecurityAuditLog = vi.mocked(writeSecurityAuditLog)

function createJsonRequest(
  url: string,
  method: string,
  body: Record<string, unknown>,
): NextRequest {
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

describe('public share audit routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serviceRoleClientMock.from.mockReset()
    serviceRoleClientMock.storage.from.mockReset()
  })

  it('records denied access when a share token does not exist', async () => {
    serviceRoleClientMock.from.mockImplementation((table: string) => {
      if (table === 'player_share_tokens') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
              })),
            })),
          })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    })

    const response = await GET(
      new Request('http://localhost/api/player-share/share-token-123', {
        method: 'GET',
      }) as unknown as NextRequest,
      { params: Promise.resolve({ token: 'share-token-123' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive')
    expect(payload.success).toBe(false)
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'view_public_share',
        resourceId: 'share:share-to',
        result: 'failed',
        reason: 'share_token_status_404',
      }),
    )
  })

  it('closes GET access when the registration is no longer editable', async () => {
    serviceRoleClientMock.from.mockImplementation((table: string) => {
      if (table === 'player_share_tokens') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  registration_id: 'reg-1',
                  event_id: 'event-1',
                  player_index: 0,
                  player_id: 'player-1',
                  is_active: true,
                  expires_at: '2099-01-01T00:00:00.000Z',
                  used_at: null,
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'registrations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: 'reg-1',
                  status: 'pending',
                  team_data: {},
                  players_data: [{ id: 'player-1', role: 'player', name: '旧名字' }],
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: 'event-1',
                  name: '测试赛事',
                  short_name: '测试',
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'registration_settings') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: [],
                error: null,
              })),
            })),
          })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    })

    const response = await GET(
      new Request('http://localhost/api/player-share/share-token-123', {
        method: 'GET',
      }) as unknown as NextRequest,
      { params: Promise.resolve({ token: 'share-token-123' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.success).toBe(false)
    expect(payload.error).toBe('当前报名状态不允许继续查看分享信息')
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'view_public_share',
        resourceId: 'share:share-to',
        result: 'failed',
        reason: 'registration_not_mutable',
      }),
    )
  })

  it('closes GET access when the share write window has ended', async () => {
    serviceRoleClientMock.from.mockImplementation((table: string) => {
      if (table === 'player_share_tokens') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  registration_id: 'reg-1',
                  event_id: 'event-1',
                  player_index: 0,
                  player_id: 'player-1',
                  is_active: true,
                  expires_at: '2099-01-01T00:00:00.000Z',
                  used_at: null,
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'registrations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: 'reg-1',
                  status: 'draft',
                  team_data: {},
                  players_data: [{ id: 'player-1', role: 'player', name: '旧名字' }],
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: 'event-1',
                  name: '测试赛事',
                  short_name: '测试',
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'registration_settings') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: [
                  {
                    division_id: null,
                    team_requirements: {
                      reviewEndDate: '2024-01-01T00:00:00.000Z',
                    },
                    player_requirements: {},
                  },
                ],
                error: null,
              })),
            })),
          })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    })

    const response = await GET(
      new Request('http://localhost/api/player-share/share-token-123', {
        method: 'GET',
      }) as unknown as NextRequest,
      { params: Promise.resolve({ token: 'share-token-123' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.success).toBe(false)
    expect(payload.error).toBe('报名已截止，不可查看分享信息')
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'view_public_share',
        resourceId: 'share:share-to',
        result: 'failed',
        reason: 'share_window_closed',
      }),
    )
  })

  it('records a success audit log when a shared player submission succeeds', async () => {
    serviceRoleClientMock.from.mockImplementation((table: string) => {
      if (table === 'player_share_tokens') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  registration_id: 'reg-1',
                  event_id: 'event-1',
                  player_index: 0,
                  player_id: 'player-1',
                  is_active: true,
                  expires_at: '2099-01-01T00:00:00.000Z',
                  used_at: null,
                },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        }
      }

      if (table === 'registrations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: 'reg-1',
                  players_data: [{ id: 'player-1', role: 'player', name: '旧名字' }],
                  status: 'draft',
                  team_data: {},
                },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        }
      }

      if (table === 'registration_settings') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: [],
                error: null,
              })),
            })),
          })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    })

    const response = await PUT(
      createJsonRequest('http://localhost/api/player-share/share-token-123', 'PUT', {
        player_data: {
          name: '新名字',
        },
      }),
      { params: Promise.resolve({ token: 'share-token-123' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive')
    expect(payload.success).toBe(true)
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'submit_public_share',
        resourceId: 'share:share-to',
        registrationId: 'reg-1',
        eventId: 'event-1',
        result: 'success',
        metadata: expect.objectContaining({
          player_id_present: true,
          player_index: 0,
        }),
      }),
    )
  })

  it('records denied upload access when a share token does not exist', async () => {
    serviceRoleClientMock.from.mockImplementation((table: string) => {
      if (table === 'player_share_tokens') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
              })),
            })),
          })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    })

    const response = await uploadPublicShareFile(
      new Request('http://localhost/api/player-share/share-token-123/upload', {
        method: 'POST',
      }) as unknown as NextRequest,
      { params: Promise.resolve({ token: 'share-token-123' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive')
    expect(payload.success).toBe(false)
    expect(mockedWriteSecurityAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'upload_public_share_file',
        resourceId: 'share:share-to',
        result: 'failed',
        reason: 'share_token_status_404',
      }),
    )
  })
})
