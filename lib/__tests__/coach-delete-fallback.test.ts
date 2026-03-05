import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockedCreateClient = vi.hoisted(() => vi.fn(() => ({ from: vi.fn() })))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockedCreateClient,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentAdminSession: vi.fn(),
}))

import { ensureCoachRowDeleted } from '../../app/api/admin/coaches/[id]/route'

type SelectStep = {
  type: 'select'
  result: {
    data: { id: string } | null
    error: { message: string } | null
  }
}

type DeleteStep = {
  type: 'delete'
  result: {
    error: { message: string } | null
  }
}

type Step = SelectStep | DeleteStep

function createMockClient(steps: Step[]) {
  const queue = [...steps]

  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => {
            const step = queue.shift()
            if (!step || step.type !== 'select') {
              throw new Error(`Unexpected step for select: ${JSON.stringify(step)}`)
            }
            return step.result
          }),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(async () => {
          const step = queue.shift()
          if (!step || step.type !== 'delete') {
            throw new Error(`Unexpected step for delete: ${JSON.stringify(step)}`)
          }
          return step.result
        }),
      })),
    })),
  }

  return { client, queue }
}

describe('ensureCoachRowDeleted', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns true when cascade deletion has already removed the coach row', async () => {
    const { client, queue } = createMockClient([
      {
        type: 'select',
        result: { data: null, error: null },
      },
    ])

    const result = await ensureCoachRowDeleted('coach-1', {
      client: client as unknown as ReturnType<typeof mockedCreateClient>,
      retryDelayMs: 0,
    })

    expect(result).toBe(true)
    expect(queue).toHaveLength(0)
  })

  it('returns true when fallback manual delete succeeds', async () => {
    const { client, queue } = createMockClient([
      {
        type: 'select',
        result: { data: { id: 'coach-1' }, error: null },
      },
      {
        type: 'delete',
        result: { error: null },
      },
      {
        type: 'select',
        result: { data: null, error: null },
      },
    ])

    const result = await ensureCoachRowDeleted('coach-1', {
      client: client as unknown as ReturnType<typeof mockedCreateClient>,
      retryDelayMs: 0,
    })

    expect(result).toBe(true)
    expect(queue).toHaveLength(0)
  })

  it('returns false when final verification query fails', async () => {
    const { client, queue } = createMockClient([
      {
        type: 'select',
        result: { data: { id: 'coach-1' }, error: null },
      },
      {
        type: 'delete',
        result: { error: { message: 'delete failed' } },
      },
      {
        type: 'select',
        result: { data: null, error: { message: 'verification failed' } },
      },
    ])

    const result = await ensureCoachRowDeleted('coach-1', {
      client: client as unknown as ReturnType<typeof mockedCreateClient>,
      retryDelayMs: 0,
    })

    expect(result).toBe(false)
    expect(queue).toHaveLength(0)
  })
})
