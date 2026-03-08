import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

const DEFAULT_TIMEOUT_MS = 8000
const DEFAULT_RETRY_DELAY_MS = 400

export class TimeoutError extends Error {
  timeoutMs: number

  constructor(message: string, timeoutMs: number) {
    super(message)
    this.name = 'TimeoutError'
    this.timeoutMs = timeoutMs
  }
}

type SessionUserResult = {
  user: User | null
  error: unknown
  isNetworkError: boolean
}

type SessionClient = {
  auth: {
    getSession: () => Promise<{
      data: { session: { user: User | null } | null }
      error: unknown
    }>
  }
}

export type SessionRetryOptions = {
  maxRetries?: number
  baseDelayMs?: number
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message ?? '')
  }

  return String(error ?? '')
}

export function isAuthNetworkError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase()
  return (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('load failed') ||
    message.includes('timeout') ||
    message.includes('timed out')
  )
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError
}

export async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  timeoutMessage = 'Request timed out'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(timeoutMessage, timeoutMs))
    }, timeoutMs)
  })

  try {
    return await Promise.race([Promise.resolve(promise), timeoutPromise])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

export async function getSessionUser(supabase: SessionClient = createClient()): Promise<SessionUserResult> {
  try {
    const { data: { session }, error } = await withTimeout(
      supabase.auth.getSession(),
      DEFAULT_TIMEOUT_MS,
      'Auth session request timed out'
    )

    if (error) {
      return {
        user: null,
        error,
        isNetworkError: isAuthNetworkError(error),
      }
    }

    return {
      user: session?.user ?? null,
      error: null,
      isNetworkError: false,
    }
  } catch (error) {
    return {
      user: null,
      error,
      isNetworkError: isAuthNetworkError(error),
    }
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function getSessionUserWithRetry(
  supabase: SessionClient = createClient(),
  options: SessionRetryOptions = {}
): Promise<SessionUserResult> {
  const maxRetries = Math.max(0, options.maxRetries ?? 2)
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_RETRY_DELAY_MS)

  let lastResult: SessionUserResult | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const result = await getSessionUser(supabase)
    lastResult = result

    if (!result.error || !result.isNetworkError) {
      return result
    }

    if (attempt < maxRetries) {
      const delayMs = baseDelayMs * 2 ** attempt
      await sleep(delayMs)
    }
  }

  return (
    lastResult ?? {
      user: null,
      error: new Error('Failed to fetch session user after retries'),
      isNetworkError: true,
    }
  )
}
