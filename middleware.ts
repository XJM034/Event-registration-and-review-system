import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from '@supabase/ssr'
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_TAB_SESSION_COOKIE_NAME,
  verifyAdminSessionToken,
} from '@/lib/admin-session'

const cookieBaseOptions = {
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

function clearAdminSessionCookies(response: NextResponse) {
  response.cookies.set({
    name: ADMIN_TAB_SESSION_COOKIE_NAME,
    value: '',
    httpOnly: false,
    ...cookieBaseOptions,
    maxAge: 0,
  })
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    ...cookieBaseOptions,
    maxAge: 0,
  })
  return response
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  let response = NextResponse.next()

  console.log('Middleware checking path:', pathname)

  // 公开路径 - 不需要任何认证
  const publicPaths = [
    '/auth/login',
    '/auth/forgot-password',
    '/api/player-share',  // 队员分享API，无需登录
    '/init',
    '/_next',
    '/favicon.ico',
    '/player-share'  // 队员分享填写页面，无需登录
  ]

  // 检查是否是公开路径
  const isPublicPath = publicPaths.some(path =>
    pathname === path || pathname.startsWith(path + '/')
  )

  if (isPublicPath) {
    console.log('Public path, allowing access')
    return response
  }

  // 创建 Supabase 客户端
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: Record<string, unknown>) {
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const { data: { user: sessionUser }, error: getUserError } = await supabase.auth.getUser()
  if (getUserError) {
    console.warn('Middleware getUser error:', getUserError)
  }
  const adminSessionTokenFromHeader = request.headers.get('x-admin-session-token')
  const adminSessionToken = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value
  const adminTabSessionToken = request.cookies.get(ADMIN_TAB_SESSION_COOKIE_NAME)?.value
  const adminHeaderSession = await verifyAdminSessionToken(adminSessionTokenFromHeader)
  const adminTabSession = await verifyAdminSessionToken(adminTabSessionToken)
  const adminSession = adminHeaderSession || adminTabSession || await verifyAdminSessionToken(adminSessionToken)
  let adminChecked = false
  let shouldClearAdminSession = false
  let adminInfo: { isAdmin: boolean; isSuper: boolean } = { isAdmin: false, isSuper: false }
  const withSessionCleanup = (res: NextResponse) => (
    shouldClearAdminSession ? clearAdminSessionCookies(res) : res
  )

  const checkAdmin = async () => {
    if (adminChecked) return adminInfo

    if (!adminSession?.adminId) {
      if (!sessionUser) {
        adminInfo = { isAdmin: false, isSuper: false }
        adminChecked = true
        return adminInfo
      }

      // Fallback: verify admin identity from admin_users instead of trusting mutable user_metadata.
      const { data: adminByAuthId, error: adminLookupError } = await supabase
        .from('admin_users')
        .select('id, is_super')
        .eq('auth_id', sessionUser.id)
        .maybeSingle()

      if (adminLookupError) {
        console.warn('Admin fallback lookup failed:', adminLookupError)
      }

      if (adminByAuthId?.id) {
        adminInfo = { isAdmin: true, isSuper: adminByAuthId.is_super === true }
        adminChecked = true
        return adminInfo
      }

      adminInfo = { isAdmin: false, isSuper: false }
      adminChecked = true
      return adminInfo
    }

    // 始终以数据库中的当前权限为准，避免 admin-session 中 isSuper 旧值导致误判
    const { data: adminById, error: adminByIdError } = await supabase
      .from('admin_users')
      .select('id, is_super')
      .eq('id', adminSession.adminId)
      .maybeSingle()

    if (adminByIdError) {
      console.warn('Admin lookup by id failed, fallback to token:', adminByIdError)
      adminInfo = {
        isAdmin: true,
        isSuper: adminSession.isSuper === true,
      }
      adminChecked = true
      return adminInfo
    }

    if (!adminById?.id) {
      // 管理员记录已删除/撤权时，立即失效当前 admin-session。
      shouldClearAdminSession = true
      adminInfo = { isAdmin: false, isSuper: false }
      adminChecked = true
      return adminInfo
    }

    adminInfo = { isAdmin: true, isSuper: adminById.is_super === true }

    adminChecked = true
    return adminInfo
  }

  // 根路径按当前登录状态跳转
  if (pathname === '/') {
    const { isAdmin } = await checkAdmin()
    if (isAdmin) {
      return withSessionCleanup(NextResponse.redirect(new URL('/events', request.url)))
    }
    if (sessionUser) {
      return withSessionCleanup(NextResponse.redirect(new URL('/portal', request.url)))
    }
    return withSessionCleanup(NextResponse.redirect(new URL('/auth/login', request.url)))
  }

  // Portal 路径：按 Supabase 登录态控制
  if (pathname.startsWith('/portal')) {
    if (!sessionUser) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
    return response
  }

  // 管理端路径 - 只允许管理员访问
  if (pathname.startsWith('/admin') || pathname.startsWith('/events')) {
    const { isAdmin, isSuper } = await checkAdmin()

    if (!isAdmin) {
      console.log('Non-admin trying to access admin area, redirecting to login')
      return withSessionCleanup(NextResponse.redirect(new URL('/auth/login', request.url)))
    }

    // 项目管理路径 - 仅允许超级管理员访问
    if (pathname.startsWith('/admin/project-management') && !isSuper) {
      return NextResponse.redirect(new URL('/events', request.url))
    }

    return response
  }

  // API 路径处理
  if (pathname.startsWith('/api')) {
    // Portal API 需要教练认证
    if (pathname.startsWith('/api/portal')) {
      if (!sessionUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return response
    }

    // 项目管理 API：仅允许超级管理员访问
    if (pathname.startsWith('/api/project-management')) {
      const { isAdmin, isSuper } = await checkAdmin()

      if (!isAdmin) {
        return withSessionCleanup(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      }

      if (!isSuper) {
        return withSessionCleanup(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
    }

    // 账号管理 API：需要超级管理员权限
    if (pathname.startsWith('/api/admin/coaches') || pathname.startsWith('/api/admin/admins')) {
      const { isAdmin, isSuper } = await checkAdmin()

      if (!isAdmin) {
        return withSessionCleanup(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      }

      // 账号管理需要超级管理员权限
      if (!isSuper) {
        return withSessionCleanup(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
    }

    return withSessionCleanup(response)
  }

  // 默认重定向到登录页
  console.log('No matching route, redirecting to login')
  return withSessionCleanup(NextResponse.redirect(new URL('/auth/login', request.url)))
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
