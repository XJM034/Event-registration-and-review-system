import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const {
  maybeSingleMock,
  insertMock,
  insertSingleMock,
  updateMock,
  updateSingleMock,
} = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
  insertMock: vi.fn(),
  insertSingleMock: vi.fn(),
  updateMock: vi.fn(),
  updateSingleMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getCurrentAdminSession: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: (table: string) => {
      if (table !== 'registration_settings') {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: maybeSingleMock,
            })),
            is: vi.fn(() => ({
              maybeSingle: maybeSingleMock,
            })),
          })),
        })),
        insert: insertMock,
        update: updateMock,
      }
    },
  })),
}))

import { getCurrentAdminSession } from '@/lib/auth'
import { POST as saveRegistrationSettings } from '../../app/api/events/[id]/registration-settings/route'

const mockedGetCurrentAdminSession = vi.mocked(getCurrentAdminSession)

function createPostRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/events/event-1/registration-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

describe('registration settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetCurrentAdminSession.mockResolvedValue({
      user: {
        id: 'admin-1',
        is_super: true,
      },
      session: null,
    } as never)

    insertMock.mockReturnValue({
      select: vi.fn(() => ({
        single: insertSingleMock,
      })),
    })
    updateMock.mockReturnValue({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: updateSingleMock,
        })),
      })),
    })
  })

  it('creates settings when no row exists for the event and division', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null })
    insertSingleMock.mockResolvedValue({
      data: { id: 'setting-1', event_id: 'event-1', division_id: null },
      error: null,
    })

    const response = await saveRegistrationSettings(
      createPostRequest({
        team_requirements: { registrationStartDate: '2026-07-01T00:00' },
        player_requirements: { roles: [] },
        division_id: null,
      }),
      { params: Promise.resolve({ id: 'event-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(insertMock).toHaveBeenCalledWith({
      event_id: 'event-1',
      division_id: null,
      team_requirements: { registrationStartDate: '2026-07-01T00:00' },
      player_requirements: { roles: [] },
    })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('returns a failure response when the existing-row lookup fails', async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: 'database unavailable' },
    })

    const response = await saveRegistrationSettings(
      createPostRequest({
        team_requirements: {},
        player_requirements: { roles: [] },
      }),
      { params: Promise.resolve({ id: 'event-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.success).toBe(false)
    expect(insertMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })
})
