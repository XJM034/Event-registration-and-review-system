import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { createSupabaseServerMock } = vi.hoisted(() => ({
  createSupabaseServerMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  createSupabaseServer: createSupabaseServerMock,
}))

import { GET } from '../../app/api/portal/events/[id]/route'

function createPortalEventRequest() {
  return new NextRequest('http://localhost/api/portal/events/event-1')
}

function pickColumns<T extends Record<string, unknown>>(row: T, columns: string) {
  const selectedKeys = columns
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !part.includes('(') && !part.includes(')'))

  return Object.fromEntries(
    selectedKeys
      .filter((key) => key in row)
      .map((key) => [key, row[key]])
  )
}

describe('GET /api/portal/events/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps registration setting timestamps so the effective setting stays deterministic', async () => {
    const eventRow = {
      id: 'event-1',
      name: '测试赛事',
      short_name: '测试',
      poster_url: null,
      start_date: '2026-04-01',
      end_date: '2026-04-03',
      address: '场馆',
      details: '详情',
      requirements: '要求',
      reference_templates: [],
      phone: '13800000000',
      is_visible: true,
    }

    const registrationSettingsRows = [
      {
        id: 'settings-old',
        event_id: 'event-1',
        division_id: 'u10',
        team_requirements: {
          registrationStartDate: '2026-03-01T09:00:00.000Z',
          registrationEndDate: '2026-03-20T09:00:00.000Z',
          reviewEndDate: '2026-03-25T09:00:00.000Z',
        },
        player_requirements: { roles: [] },
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-03-10T08:00:00.000Z',
      },
      {
        id: 'settings-new',
        event_id: 'event-1',
        division_id: 'u12',
        team_requirements: {
          registrationStartDate: '2026-03-01T09:00:00.000Z',
          registrationEndDate: '2026-03-20T09:00:00.000Z',
          reviewEndDate: '2026-03-25T09:00:00.000Z',
        },
        player_requirements: { roles: [] },
        created_at: '2026-01-02T00:00:00.000Z',
        updated_at: '2026-03-12T08:00:00.000Z',
      },
    ]

    const eventSelectMock = vi.fn((columns: string) => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: pickColumns(eventRow, columns),
            error: null,
          })),
        })),
      })),
    }))

    const registrationSettingsSelectMock = vi.fn((columns: string) => ({
      eq: vi.fn(async () => ({
        data: registrationSettingsRows.map((row) => pickColumns(row, columns)),
        error: null,
      })),
    }))

    const eventDivisionsSelectMock = vi.fn(() => ({
      eq: vi.fn(async () => ({
        data: [],
        error: null,
      })),
    }))

    createSupabaseServerMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'events') {
          return { select: eventSelectMock }
        }

        if (table === 'registration_settings') {
          return { select: registrationSettingsSelectMock }
        }

        if (table === 'event_divisions') {
          return { select: eventDivisionsSelectMock }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const response = await GET(
      createPortalEventRequest(),
      { params: Promise.resolve({ id: 'event-1' }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(registrationSettingsSelectMock).toHaveBeenCalledWith(expect.stringContaining('created_at'))
    expect(registrationSettingsSelectMock).toHaveBeenCalledWith(expect.stringContaining('updated_at'))
    expect(payload.data.registration_settings.id).toBe('settings-new')
    expect(payload.data.registration_settings).not.toHaveProperty('created_at')
    expect(payload.data.registration_settings).not.toHaveProperty('updated_at')
  })
})
