import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { registrationsFromMock, settingsFromMock } = vi.hoisted(() => ({
  registrationsFromMock: vi.fn(() => ({
    select: vi.fn((columns?: string) => ({
      eq: vi.fn(() => ({
        neq: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'reg-1',
                team_data: { team_name: '测试队伍' },
                players_data: [{ name: '队员甲' }],
                status: 'approved',
                submitted_at: '2026-03-13T00:00:00.000Z',
                reviewed_at: '2026-03-13T01:00:00.000Z',
              },
            ],
            error: null,
          }),
        })),
      })),
    })),
  })),
  settingsFromMock: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'setting-1',
            event_id: 'event-1',
            division_id: null,
            team_requirements: { registrationEndDate: '2026-03-20T23:59' },
            player_requirements: { roles: [] },
          },
        ],
        error: null,
      }),
    })),
  })),
}))

vi.mock('@/lib/auth', () => ({
  getCurrentAdminSession: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'registrations') {
        return registrationsFromMock()
      }

      if (table === 'registration_settings') {
        return settingsFromMock()
      }

      throw new Error(`Unexpected table ${table}`)
    },
  })),
}))

import { getCurrentAdminSession } from '@/lib/auth'
import { GET as getEventRegistrations } from '../../app/api/events/[id]/registrations/route'
import { GET as getRegistrationSettings } from '../../app/api/events/[id]/registration-settings/route'

const mockedGetCurrentAdminSession = vi.mocked(getCurrentAdminSession)

function createRequest(url: string): NextRequest {
  return new Request(url, { method: 'GET' }) as unknown as NextRequest
}

describe('admin registration cache control', () => {
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

  it('returns no-store headers for event registration list reads', async () => {
    const response = await getEventRegistrations(
      createRequest('http://localhost/api/events/event-1/registrations'),
      { params: Promise.resolve({ id: 'event-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('pragma')).toBe('no-cache')
    expect(payload.success).toBe(true)
    expect(Array.isArray(payload.data)).toBe(true)
    const registrationSelect = registrationsFromMock.mock.results[0]?.value?.select as ReturnType<typeof vi.fn> | undefined
    expect(registrationSelect).toHaveBeenCalledWith('id, team_data, status, submitted_at, reviewed_at')
  })

  it('returns no-store headers for registration settings reads', async () => {
    const response = await getRegistrationSettings(
      createRequest('http://localhost/api/events/event-1/registration-settings'),
      { params: Promise.resolve({ id: 'event-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('pragma')).toBe('no-cache')
    expect(payload.success).toBe(true)
  })
})
