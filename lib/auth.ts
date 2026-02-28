import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from './admin-session'

export async function createSupabaseServer() {
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
  const cookieStore = await cookies()
  const adminSessionToken = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value
  const adminSession = await verifyAdminSessionToken(adminSessionToken)

  // 优先使用独立管理端会话（允许与教练端会话并存）
  if (adminSession) {
    return {
      user: {
        id: adminSession.adminId,
        auth_id: adminSession.authId,
        is_super: adminSession.isSuper,
      },
      session: session || null,
    }
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
