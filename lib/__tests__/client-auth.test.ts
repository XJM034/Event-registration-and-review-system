import { describe, expect, it, vi } from 'vitest'
import {
  getSessionUser,
  getSessionUserWithRetry,
  isTimeoutError,
  TimeoutError,
  withTimeout,
} from '../supabase/client-auth'

type SessionResponse = {
  data: {
    session: {
      user: { id: string }
    } | null
  }
  error: unknown
}

function createSessionClient(responses: Array<SessionResponse | Error>) {
  const getSession = vi.fn<() => Promise<SessionResponse>>()

  for (const response of responses) {
    if (response instanceof Error) {
      getSession.mockRejectedValueOnce(response)
    } else {
      getSession.mockResolvedValueOnce(response)
    }
  }

  return {
    auth: {
      getSession,
    },
  }
}

const asGetSessionUserClient = (client: ReturnType<typeof createSessionClient>) =>
  client as Parameters<typeof getSessionUser>[0]

describe('getSessionUser', () => {
  it('returns current user when session exists', async () => {
    const supabase = createSessionClient([
      {
        data: {
          session: {
            user: { id: 'user-1' },
          },
        },
        error: null,
      },
    ])

    const result = await getSessionUser(asGetSessionUserClient(supabase))

    expect(result.user).toEqual({ id: 'user-1' })
    expect(result.error).toBeNull()
    expect(result.isNetworkError).toBe(false)
  })

  it('marks rejected network errors correctly', async () => {
    const supabase = createSessionClient([new Error('Failed to fetch')])

    const result = await getSessionUser(asGetSessionUserClient(supabase))

    expect(result.user).toBeNull()
    expect(result.error).toBeInstanceOf(Error)
    expect(result.isNetworkError).toBe(true)
  })
})

describe('getSessionUserWithRetry', () => {
  it('retries network errors and succeeds later', async () => {
    const supabase = createSessionClient([
      {
        data: { session: null },
        error: new Error('Network timeout'),
      },
      {
        data: { session: null },
        error: new Error('Failed to fetch'),
      },
      {
        data: {
          session: {
            user: { id: 'user-2' },
          },
        },
        error: null,
      },
    ])

    const result = await getSessionUserWithRetry(asGetSessionUserClient(supabase), {
      maxRetries: 2,
      baseDelayMs: 0,
    })

    expect(result.user).toEqual({ id: 'user-2' })
    expect(result.error).toBeNull()
    expect(result.isNetworkError).toBe(false)
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(3)
  })

  it('does not retry non-network auth errors', async () => {
    const supabase = createSessionClient([
      {
        data: { session: null },
        error: new Error('Invalid JWT'),
      },
    ])

    const result = await getSessionUserWithRetry(asGetSessionUserClient(supabase), {
      maxRetries: 2,
      baseDelayMs: 0,
    })

    expect(result.user).toBeNull()
    expect(result.isNetworkError).toBe(false)
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(1)
  })

  it('returns last network error after retries are exhausted', async () => {
    const supabase = createSessionClient([
      {
        data: { session: null },
        error: new Error('Load failed'),
      },
      {
        data: { session: null },
        error: new Error('Timed out'),
      },
      {
        data: { session: null },
        error: new Error('Network request failed'),
      },
    ])

    const result = await getSessionUserWithRetry(asGetSessionUserClient(supabase), {
      maxRetries: 2,
      baseDelayMs: 0,
    })

    expect(result.user).toBeNull()
    expect(result.isNetworkError).toBe(true)
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(3)
  })
})

describe('withTimeout', () => {
  it('rejects with TimeoutError when the promise exceeds the limit', async () => {
    await expect(
      withTimeout(new Promise(() => {}), 1, 'Custom timeout message')
    ).rejects.toBeInstanceOf(TimeoutError)

    await expect(
      withTimeout(new Promise(() => {}), 1, 'Custom timeout message')
    ).rejects.toMatchObject({
      message: 'Custom timeout message',
      timeoutMs: 1,
    })
  })

  it('exposes a helper to detect timeout errors', () => {
    expect(isTimeoutError(new TimeoutError('timeout', 1000))).toBe(true)
    expect(isTimeoutError(new Error('timeout'))).toBe(false)
  })
})
