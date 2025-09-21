import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  let response = NextResponse.next()

  console.log('Middleware checking path:', pathname)

  // 公开路径 - 不需要任何认证
  const publicPaths = [
    '/auth/login',
    '/auth/register',
    '/auth/forgot-password',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/init-admin',
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

  // 检查管理员会话
  const adminSessionToken = request.cookies.get('admin-session')?.value

  // 如果是根路径
  if (pathname === '/') {
    // 如果有管理员会话，允许访问
    if (adminSessionToken) {
      try {
        // 验证管理员 JWT
        const parts = adminSessionToken.split('.')
        if (parts.length !== 3) {
          throw new Error('Invalid JWT format')
        }

        const payload = JSON.parse(atob(parts[1]))

        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
          throw new Error('Token expired')
        }

        console.log('Admin authenticated for root path')
        return response
      } catch (error) {
        console.log('Invalid admin token at root, redirecting to login')
        const redirectResponse = NextResponse.redirect(new URL('/auth/login', request.url))
        redirectResponse.cookies.delete('admin-session')
        return redirectResponse
      }
    }

    // 没有管理员会话，重定向到登录页
    console.log('Root path without admin session, redirecting to login')
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // 创建 Supabase 客户端检查教练登录状态
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
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
        remove(name: string, options: any) {
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

  const { data: { session: coachSession } } = await supabase.auth.getSession()

  // Portal 路径 - 需要教练认证
  if (pathname.startsWith('/portal')) {
    if (!coachSession) {
      console.log('No coach session for portal, redirecting to login')
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
    console.log('Coach authenticated, allowing portal access')
    return response
  }

  // 管理端路径 - 需要管理员认证
  if (pathname.startsWith('/admin') || pathname.startsWith('/events')) {
    if (!adminSessionToken) {
      console.log('No admin session, redirecting to login')
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    try {
      // 验证管理员 JWT
      const parts = adminSessionToken.split('.')
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format')
      }

      const payload = JSON.parse(atob(parts[1]))

      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expired')
      }

      console.log('Admin token valid, allowing access')
      return response
    } catch (error) {
      console.log('Admin token invalid, redirecting to login:', error)
      const redirectResponse = NextResponse.redirect(new URL('/auth/login', request.url))
      redirectResponse.cookies.delete('admin-session')
      return redirectResponse
    }
  }

  // API 路径处理
  if (pathname.startsWith('/api')) {
    // Portal API 需要教练认证
    if (pathname.startsWith('/api/portal')) {
      if (!coachSession) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      console.log('Coach authenticated for API access')
    }
    // 其他 API 路径根据需要检查
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
