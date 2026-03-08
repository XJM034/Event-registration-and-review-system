import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_TAB_SESSION_COOKIE_NAME,
  verifyAdminSessionToken,
} from './admin-session'

const cookieBaseOptions = {
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

function tryClearAdminSessionCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  try {
    cookieStore.set({
      name: ADMIN_TAB_SESSION_COOKIE_NAME,
      value: '',
      httpOnly: false,
      ...cookieBaseOptions,
      maxAge: 0,
    })
    cookieStore.set({
      name: ADMIN_SESSION_COOKIE_NAME,
      value: '',
      httpOnly: true,
      ...cookieBaseOptions,
      maxAge: 0,
    })
  } catch {
    // 在 Server Component 中调用时 cookies 可能是只读的；忽略清理失败。
  }
}

export async function createSupabaseServer() {
  const cookieStore = await cookies()

  return createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

// 获取当前管理员会话（使用 Supabase Auth）
export async function getCurrentAdminSession() {
  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  const headerStore = await headers()
  const cookieStore = await cookies()
  const adminSessionTokenFromHeader = headerStore.get('x-admin-session-token')
  const adminSessionToken = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value
  const adminTabSessionToken = cookieStore.get(ADMIN_TAB_SESSION_COOKIE_NAME)?.value
  const adminHeaderSession = await verifyAdminSessionToken(adminSessionTokenFromHeader)
  const adminTabSession = await verifyAdminSessionToken(adminTabSessionToken)
  const adminSession = adminHeaderSession || adminTabSession || await verifyAdminSessionToken(adminSessionToken)

  // 优先使用独立管理端会话（允许与教练端会话并存）
  if (adminSession) {
    // 始终以数据库中的最新权限为准，避免 token 内 is_super 过期
    const { data: adminById, error: adminByIdError } = await supabase
      .from('admin_users')
      .select('id, auth_id, is_super')
      .eq('id', adminSession.adminId)
      .maybeSingle()

    if (adminByIdError) {
      console.warn('Admin lookup by id failed, fallback to token:', adminByIdError)
      return {
        user: {
          id: adminSession.adminId,
          auth_id: adminSession.authId,
          is_super: adminSession.isSuper,
        },
        session: session || null,
      }
    }

    if (adminById?.id) {
      return {
        user: {
          id: adminById.id,
          auth_id: adminById.auth_id || adminSession.authId,
          is_super: adminById.is_super === true,
        },
        session: session || null,
      }
    }

    // 管理员记录已删除/撤权时，拒绝 token 回退并清理会话 cookie。
    tryClearAdminSessionCookies(cookieStore)
    return null
  }

  // 兼容：仅有 Supabase 管理员会话时仍可访问
  if (!session || session.user.user_metadata?.role !== 'admin') {
    return null
  }

  const { data: admin } = await supabase
    .from('admin_users')
    .select('*')
    .eq('auth_id', session.user.id)
    .maybeSingle()

  if (!admin) return null

  return { user: admin, session }
}

// 检查是否为超级管理员
export async function isSuperAdmin(): Promise<boolean> {
  const session = await getCurrentAdminSession()
  return session?.user?.is_super === true
}

// 获取当前教练会话（使用 Supabase Auth）
export async function getCurrentCoachSession() {
  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session || session.user.user_metadata?.role === 'admin') {
    return null
  }

  // 查询 coaches 表获取完整信息
  const { data: coach } = await supabase
    .from('coaches')
    .select('*')
    .eq('auth_id', session.user.id)
    .single()

  if (!coach) {
    return null
  }

  return {
    user: coach,
    session: session,
  }
}
