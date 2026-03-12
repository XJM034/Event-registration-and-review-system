import { NextResponse } from 'next/server'

type RateLimitState = {
  count: number
  resetAt: number
}

type RateLimitStore = Map<string, RateLimitState>

type RateLimitGlobal = typeof globalThis & {
  __eventRegistrationRateLimitStore__?: RateLimitStore
}

export interface RateLimitDecision {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
  windowMs: number
}

interface TakeRateLimitOptions {
  key: string
  limit: number
  windowMs: number
  now?: number
}

interface BuildRateLimitKeyOptions {
  request: Pick<Request, 'headers'>
  scope: string
  subject?: string | number | null
}

const STORE_LIMIT = 5_000
const STORE_HARD_LIMIT = 10_000

function getStore(): RateLimitStore {
  const globalState = globalThis as RateLimitGlobal

  if (!globalState.__eventRegistrationRateLimitStore__) {
    globalState.__eventRegistrationRateLimitStore__ = new Map()
  }

  return globalState.__eventRegistrationRateLimitStore__
}

function cleanupExpiredEntries(store: RateLimitStore, now: number) {
  if (store.size <= STORE_LIMIT) {
    return
  }

  for (const [key, state] of store.entries()) {
    if (state.resetAt <= now) {
      store.delete(key)
    }
  }

  if (store.size > STORE_HARD_LIMIT) {
    store.clear()
  }
}

function normalizeRateLimitPart(value: string | number | null | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized || 'unknown'
}

export function getRequestIp(request: Pick<Request, 'headers'>) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim()
    if (firstIp) return firstIp
  }

  const forwarded = request.headers.get('x-real-ip')
  if (forwarded) return forwarded.trim()

  const cfIp = request.headers.get('cf-connecting-ip')
  if (cfIp) return cfIp.trim()

  return 'unknown'
}

export function buildRateLimitKey({
  request,
  scope,
  subject,
}: BuildRateLimitKeyOptions) {
  return [
    normalizeRateLimitPart(scope),
    normalizeRateLimitPart(getRequestIp(request)),
    normalizeRateLimitPart(subject),
  ].join(':')
}

export function takeRateLimit({
  key,
  limit,
  windowMs,
  now = Date.now(),
}: TakeRateLimitOptions): RateLimitDecision {
  const store = getStore()
  cleanupExpiredEntries(store, now)

  const existing = store.get(key)

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs
    store.set(key, { count: 1, resetAt })
    return {
      allowed: true,
      limit,
      remaining: Math.max(limit - 1, 0),
      resetAt,
      retryAfterSeconds: Math.max(Math.ceil(windowMs / 1000), 1),
      windowMs,
    }
  }

  existing.count += 1
  store.set(key, existing)

  const retryAfterSeconds = Math.max(Math.ceil((existing.resetAt - now) / 1000), 1)

  return {
    allowed: existing.count <= limit,
    limit,
    remaining: Math.max(limit - existing.count, 0),
    resetAt: existing.resetAt,
    retryAfterSeconds,
    windowMs,
  }
}

export function applyRateLimitHeaders(
  headers: Headers,
  decision: RateLimitDecision,
) {
  headers.set('X-RateLimit-Limit', String(decision.limit))
  headers.set('X-RateLimit-Remaining', String(decision.remaining))
  headers.set('X-RateLimit-Reset', String(Math.ceil(decision.resetAt / 1000)))
  headers.set('X-RateLimit-Policy', `${decision.limit};w=${Math.ceil(decision.windowMs / 1000)}`)

  if (!decision.allowed) {
    headers.set('Retry-After', String(decision.retryAfterSeconds))
  }
}

export function createRateLimitResponse(
  body: unknown,
  decision: RateLimitDecision,
  init?: ResponseInit,
) {
  const response = NextResponse.json(body, init)
  applyRateLimitHeaders(response.headers, decision)
  return response
}
