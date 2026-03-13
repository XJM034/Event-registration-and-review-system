import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/env'
import { buildRateLimitKey, clearRateLimit, createRateLimitResponse, getRequestIp, readRateLimit, takeRateLimit } from '@/lib/rate-limit'
import { writeSecurityAuditLog } from '@/lib/security-audit-log'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
}

const LOGIN_RATE_LIMIT = {
  limit: 8,
  windowMs: 10 * 60_000,
}

const AUDIT_BACKED_LOGIN_LIMIT = {
  windowMs: 15 * 60_000,
  ipFailures: 12,
  phoneFailures: 6,
  retryAfterSeconds: 15 * 60,
}

function applyNoStoreHeaders(headers: Headers) {
  Object.entries(NO_STORE_HEADERS).forEach(([key, value]) => {
    headers.set(key, value)
  })
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...(init?.headers ?? {}),
    },
  })
}

function createNoStoreRateLimitResponse(
  body: unknown,
  decision: ReturnType<typeof takeRateLimit>,
  init?: ResponseInit,
) {
  const response = createRateLimitResponse(body, decision, init)
  applyNoStoreHeaders(response.headers)
  return response
}

function createAnonClient() {
  return createClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )
}

function maskPhone(phone: string) {
  return phone.length >= 7
    ? `${phone.slice(0, 3)}****${phone.slice(-4)}`
    : phone
}

async function hasTooManyRecentLoginFailures(request: NextRequest, phone: string) {
  const maskedPhone = maskPhone(phone)
  const ipAddress = getRequestIp(request)
  const cutoff = new Date(Date.now() - AUDIT_BACKED_LOGIN_LIMIT.windowMs).toISOString()
  const auditClient = createServiceRoleClient()

  try {
    const ipCountPromise = ipAddress && ipAddress !== 'unknown'
      ? auditClient
          .from('security_audit_logs')
          .select('id', { count: 'exact', head: true })
          .eq('action', 'login')
          .eq('ip_address', ipAddress)
          .gte('created_at', cutoff)
          .in('reason', ['invalid_credentials', 'rate_limited'])
      : Promise.resolve({ count: 0, error: null } as const)

    const phoneCountPromise = maskedPhone
      ? auditClient
          .from('security_audit_logs')
          .select('id', { count: 'exact', head: true })
          .eq('action', 'login')
          .gte('created_at', cutoff)
          .contains('metadata', { phone_masked: maskedPhone })
          .in('reason', ['invalid_credentials', 'rate_limited'])
      : Promise.resolve({ count: 0, error: null } as const)

    const [ipResult, phoneResult] = await Promise.all([ipCountPromise, phoneCountPromise])

    if (ipResult.error || phoneResult.error) {
      console.warn('Audit-backed login throttling lookup failed:', ipResult.error || phoneResult.error)
      return { blocked: false as const, ipAddress, maskedPhone, reason: null as string | null }
    }

    if ((ipResult.count || 0) >= AUDIT_BACKED_LOGIN_LIMIT.ipFailures) {
      return { blocked: true as const, ipAddress, maskedPhone, reason: 'audit_ip_failures' }
    }

    if ((phoneResult.count || 0) >= AUDIT_BACKED_LOGIN_LIMIT.phoneFailures) {
      return { blocked: true as const, ipAddress, maskedPhone, reason: 'audit_phone_failures' }
    }

    return { blocked: false as const, ipAddress, maskedPhone, reason: null as string | null }
  } catch (error) {
    console.warn('Audit-backed login throttling exception:', error)
    return { blocked: false as const, ipAddress, maskedPhone, reason: null as string | null }
  }
}

export async function POST(request: NextRequest) {
  let phone = ''
  let rateLimitKey: string | null = null

  try {
    const body = await request.json().catch(() => null)
    phone = typeof body?.phone === 'string' ? body.phone.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!phone || !password) {
      return jsonNoStore(
        { success: false, error: '请输入手机号和密码' },
        { status: 400 },
      )
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return jsonNoStore(
        { success: false, error: '请输入正确的手机号格式' },
        { status: 400 },
      )
    }

    rateLimitKey = buildRateLimitKey({
      request,
      scope: 'auth:login',
      subject: phone,
    })
    const rateLimit = readRateLimit({
      key: rateLimitKey,
      limit: LOGIN_RATE_LIMIT.limit,
      windowMs: LOGIN_RATE_LIMIT.windowMs,
    })

    if (!rateLimit.allowed) {
      await writeSecurityAuditLog({
        request,
        action: 'login',
        actorType: 'system',
        resourceType: 'auth_session',
        result: 'denied',
        reason: 'rate_limited',
        metadata: {
          phone_masked: maskPhone(phone),
        },
      })
      return createNoStoreRateLimitResponse(
        { success: false, error: '登录尝试过于频繁，请稍后再试' },
        rateLimit,
        { status: 429 },
      )
    }

    const auditBackedThrottle = await hasTooManyRecentLoginFailures(request, phone)
    if (auditBackedThrottle.blocked) {
      await writeSecurityAuditLog({
        request,
        action: 'login',
        actorType: 'system',
        resourceType: 'auth_session',
        result: 'denied',
        reason: 'rate_limited',
        metadata: {
          phone_masked: auditBackedThrottle.maskedPhone,
          throttle_source: auditBackedThrottle.reason,
        },
      })

      return jsonNoStore(
        { success: false, error: '登录尝试过于频繁，请稍后再试' },
        {
          status: 429,
          headers: {
            'Retry-After': String(AUDIT_BACKED_LOGIN_LIMIT.retryAfterSeconds),
          },
        },
      )
    }

    const email = `${phone}@system.local`
    const supabase = createAnonClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.user || !data.session) {
      const failedAttemptRateLimit = takeRateLimit({
        key: rateLimitKey,
        limit: LOGIN_RATE_LIMIT.limit,
        windowMs: LOGIN_RATE_LIMIT.windowMs,
      })
      await writeSecurityAuditLog({
        request,
        action: 'login',
        actorType: 'system',
        resourceType: 'auth_session',
        result: 'failed',
        reason: 'invalid_credentials',
        metadata: {
          phone_masked: maskPhone(phone),
        },
      })
      return createNoStoreRateLimitResponse(
        {
          success: false,
          error: failedAttemptRateLimit.allowed
            ? '手机号或密码错误'
            : '登录尝试过于频繁，请稍后再试',
        },
        failedAttemptRateLimit,
        { status: failedAttemptRateLimit.allowed ? 401 : 429 },
      )
    }

    clearRateLimit(rateLimitKey)
    const successRateLimit = readRateLimit({
      key: rateLimitKey,
      limit: LOGIN_RATE_LIMIT.limit,
      windowMs: LOGIN_RATE_LIMIT.windowMs,
    })
    const role = data.user.user_metadata?.role
    await writeSecurityAuditLog({
      request,
      action: 'login',
      actorType: role === 'admin' ? 'admin' : role === 'coach' ? 'coach' : 'system',
      actorId: data.user.id,
      actorRole: typeof role === 'string' ? role : null,
      resourceType: 'auth_session',
      result: 'success',
      metadata: {
        phone_masked: maskPhone(phone),
      },
    })

    return createNoStoreRateLimitResponse(
      {
        success: true,
        data: {
          user: {
            id: data.user.id,
            email: data.user.email,
            user_metadata: data.user.user_metadata || {},
          },
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at ?? null,
            expires_in: data.session.expires_in ?? null,
            token_type: data.session.token_type ?? 'bearer',
          },
        },
      },
      successRateLimit,
      { status: 200 },
    )
  } catch (error) {
    console.error('POST /api/auth/login error:', error)
    await writeSecurityAuditLog({
      request,
      action: 'login',
      actorType: 'system',
      resourceType: 'auth_session',
      result: 'failed',
      reason: 'server_error',
      metadata: {
        phone_masked: phone ? maskPhone(phone) : null,
      },
    })
    return jsonNoStore(
      { success: false, error: '登录失败，请稍后重试' },
      { status: 500 },
    )
  }
}
