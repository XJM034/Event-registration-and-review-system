import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from '@supabase/ssr'
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from '@/lib/admin-session'

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

  const { data: { session } } = await supabase.auth.getSession()
  const adminSessionToken = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value
  const adminSession = await verifyAdminSessionToken(adminSessionToken)
  let adminChecked = false
  let adminInfo: { isAdmin: boolean; isSuper: boolean } = { isAdmin: false, isSuper: false }

  const checkAdmin = async () => {
    if (adminChecked) return adminInfo

    if (!adminSession?.adminId) {
      adminInfo = { isAdmin: false, isSuper: false }
      adminChecked = true
      return adminInfo
    }

    adminInfo = {
      isAdmin: true,
      isSuper: adminSession.isSuper === true,
    }

    adminChecked = true
    return adminInfo
  }

  // 根路径固定进入登录页，避免因历史会话自动进入系统
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // Portal 路径：按 Supabase 登录态控制
  if (pathname.startsWith('/portal')) {
    if (!session) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
    return response
  }

  // 管理端路径 - 只允许管理员访问
  if (pathname.startsWith('/admin') || pathname.startsWith('/events')) {
    const { isAdmin, isSuper } = await checkAdmin()

    if (!isAdmin) {
      console.log('Non-admin trying to access admin area, redirecting to login')
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    // 项目管理路径 - 需要超级管理员
    if (pathname.startsWith('/admin/project-management')) {
      if (!isSuper) {
        console.log('Non-super admin trying to access project management')
        return NextResponse.redirect(new URL('/', request.url))
      }
    }

    return response
  }

  // API 路径处理
  if (pathname.startsWith('/api')) {
    // Portal API 需要教练认证
    if (pathname.startsWith('/api/portal')) {
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return response
    }

    // 项目管理 API：读取需管理员，写入需超级管理员
    if (pathname.startsWith('/api/project-management')) {
      const { isAdmin, isSuper } = await checkAdmin()

      if (!isAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // 只读接口允许普通管理员访问，写接口仍要求超级管理员
      const method = request.method.toUpperCase()
      const isReadMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'

      if (!isReadMethod && !isSuper) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    return response
  }

  // 默认重定向到登录页
  console.log('No matching route, redirecting to login')
  return NextResponse.redirect(new URL('/auth/login', request.url))
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
