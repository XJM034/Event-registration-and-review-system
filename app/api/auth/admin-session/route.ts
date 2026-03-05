import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_TAB_SESSION_COOKIE_NAME,
  createAdminSessionToken,
  getAdminSessionMaxAge,
  verifyAdminSessionToken,
} from '@/lib/admin-session'
import { getCurrentAdminSession } from '@/lib/auth'

async function createSupabaseFromCookies() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {}
        },
      },
    },
  )
}

function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}

function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}

async function resolveAuthUser(request: Request) {
  // 登录后立即创建管理员会话时，优先使用本次登录返回的 Bearer token，
  // 避免并发标签页下读到旧 cookie 会话导致“账号串线”。
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null

  if (bearerToken) {
    const anonClient = createAnonClient()
    const { data: { user } } = await anonClient.auth.getUser(bearerToken)
    if (user) return user
  }

  const supabase = await createSupabaseFromCookies()
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) return session.user

  if (!bearerToken) return null

  const anonClient = createAnonClient()
  const { data: { user } } = await anonClient.auth.getUser(bearerToken)
  return user || null
}

function derivePhoneFromUserEmail(email?: string | null) {
  if (!email) return null
  if (email.endsWith('@system.local')) {
    return email.slice(0, -'@system.local'.length)
  }
  return null
}

function isMissingColumnError(
  error: { message?: string | null; details?: string | null } | null,
  columnName: string,
) {
  if (!error) return false
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  const column = columnName.toLowerCase()
  return (
    text.includes(column)
    && (text.includes('does not exist') || text.includes('could not find') || text.includes('not found'))
  )
}

function applyAdminSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: getAdminSessionMaxAge(),
  })
}

function applyAdminTabSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: ADMIN_TAB_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // 会话级 cookie，减少可读 token 的持久暴露时间窗口。
  })
}

export async function POST(request: Request) {
  try {
    const user = await resolveAuthUser(request)

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (user.user_metadata?.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin role required' }, { status: 403 })
    }

    const phone = derivePhoneFromUserEmail(user.email) || user.user_metadata?.phone || null
    if (!phone) {
      return NextResponse.json({ success: false, error: 'Admin phone not found' }, { status: 403 })
    }

    const serviceRoleClient = createServiceRoleClient()
    let adminId: string | null = null
    let isSuper = user.user_metadata?.is_super === true

    const { data: adminByAuthId, error: adminByAuthIdError } = await serviceRoleClient
      .from('admin_users')
      .select('id')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (adminByAuthIdError && !isMissingColumnError(adminByAuthIdError, 'auth_id')) {
      console.error('Read admin by auth_id failed:', adminByAuthIdError)
      return NextResponse.json({ success: false, error: 'Read admin failed' }, { status: 500 })
    }

    if (adminByAuthId?.id) {
      adminId = adminByAuthId.id
    }

    if (!adminId) {
      const { data: adminByPhone, error: adminByPhoneError } = await serviceRoleClient
        .from('admin_users')
        .select('id')
        .eq('phone', phone)
        .maybeSingle()

      if (adminByPhoneError) {
        console.error('Read admin by phone failed:', adminByPhoneError)
        return NextResponse.json({ success: false, error: 'Read admin failed' }, { status: 500 })
      }

      if (!adminByPhone?.id) {
        return NextResponse.json({ success: false, error: 'Admin not found' }, { status: 403 })
      }

      adminId = adminByPhone.id
    }

    const { data: adminSuperData, error: adminSuperError } = await serviceRoleClient
      .from('admin_users')
      .select('is_super')
      .eq('id', adminId)
      .maybeSingle()

    if (!adminSuperError && adminSuperData && typeof adminSuperData.is_super === 'boolean') {
      isSuper = adminSuperData.is_super
    } else if (adminSuperError && !isMissingColumnError(adminSuperError, 'is_super')) {
      console.warn('Read admin is_super failed, fallback to metadata:', adminSuperError)
    }

    const { error: bindAuthError } = await serviceRoleClient
      .from('admin_users')
      .update({ auth_id: user.id })
      .eq('id', adminId)

    if (bindAuthError && !isMissingColumnError(bindAuthError, 'auth_id')) {
      console.warn('Bind admin auth_id skipped:', bindAuthError)
    }

    if (user.email) {
      const { error: bindEmailError } = await serviceRoleClient
        .from('admin_users')
        .update({ email: user.email })
        .eq('id', adminId)

      if (bindEmailError && !isMissingColumnError(bindEmailError, 'email')) {
        console.warn('Sync admin email skipped:', bindEmailError)
      }
    }

    if (!adminId) {
      return NextResponse.json({ success: false, error: 'Admin not found' }, { status: 403 })
    }

    const token = await createAdminSessionToken(
      user.id,
      adminId,
      isSuper,
    )

    const response = NextResponse.json({
      success: true,
      data: {
        token,
        id: adminId,
        auth_id: user.id,
        is_super: isSuper,
      },
    })
    applyAdminSessionCookie(response, token)
    applyAdminTabSessionCookie(response, token)

    return response
  } catch (error) {
    console.error('Create admin session error:', error)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.set({
    name: ADMIN_TAB_SESSION_COOKIE_NAME,
    value: '',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}

export async function PUT(request: Request) {
  try {
    const tokenFromHeader = request.headers.get('x-admin-session-token')
    const rawToken = tokenFromHeader

    const parsed = await verifyAdminSessionToken(rawToken)
    if (!parsed) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const serviceRoleClient = createServiceRoleClient()
    const { data: adminById, error: adminByIdError } = await serviceRoleClient
      .from('admin_users')
      .select('id, auth_id, is_super')
      .eq('id', parsed.adminId)
      .maybeSingle()

    if (adminByIdError && !isMissingColumnError(adminByIdError, 'auth_id')) {
      console.error('Read admin by id failed:', adminByIdError)
      return NextResponse.json({ success: false, error: 'Read admin failed' }, { status: 500 })
    }

    if (!adminById?.id) {
      return NextResponse.json({ success: false, error: 'Admin not found' }, { status: 403 })
    }

    if (adminById.auth_id && adminById.auth_id !== parsed.authId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const refreshedToken = await createAdminSessionToken(
      parsed.authId,
      adminById.id,
      adminById.is_super === true,
    )

    const response = NextResponse.json({
      success: true,
      data: {
        id: adminById.id,
        auth_id: parsed.authId,
        is_super: adminById.is_super === true,
      },
    })
    applyAdminSessionCookie(response, refreshedToken)
    applyAdminTabSessionCookie(response, refreshedToken)
    return response
  } catch (error) {
    console.error('Sync admin session error:', error)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const current = await getCurrentAdminSession()
    if (!current?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({
      success: true,
      data: {
        id: current.user.id,
        auth_id: current.user.auth_id || null,
        is_super: current.user.is_super === true,
      },
    })
  } catch (error) {
    console.error('Get admin session error:', error)
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 })
  }
}
