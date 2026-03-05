'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const ADMIN_TAB_SESSION_COOKIE_NAME = 'admin-session-tab'

function shouldSync(pathname: string) {
  return pathname.startsWith('/events') || pathname.startsWith('/admin')
}

function writeAdminTabSessionCookie(token: string | null) {
  if (typeof document === 'undefined') return
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  if (token) {
    // 会话级 cookie，浏览器关闭后失效，降低可读 token 的持久暴露风险。
    document.cookie = `${ADMIN_TAB_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secure}`
    return
  }
  document.cookie = `${ADMIN_TAB_SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
}

export default function AdminSessionTabSync() {
  const pathname = usePathname()

  useEffect(() => {
    if (!shouldSync(pathname)) return

    const syncSession = async () => {
      const tabToken = sessionStorage.getItem('tab_admin_session_token')
      if (!tabToken) {
        writeAdminTabSessionCookie(null)
        return
      }

      // 先同步可读 cookie，确保刷新首请求也携带当前标签页身份
      writeAdminTabSessionCookie(tabToken)

      try {
        await fetch('/api/auth/admin-session', {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'x-admin-session-token': tabToken,
          },
        })
      } catch (error) {
        console.error('Global admin session sync failed:', error)
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncSession()
      }
    }

    const syncCookieOnly = () => {
      const tabToken = sessionStorage.getItem('tab_admin_session_token')
      writeAdminTabSessionCookie(tabToken)
    }

    syncSession()
    window.addEventListener('focus', syncSession)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', syncCookieOnly)
    window.addEventListener('pagehide', syncCookieOnly)

    return () => {
      window.removeEventListener('focus', syncSession)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', syncCookieOnly)
      window.removeEventListener('pagehide', syncCookieOnly)
    }
  }, [pathname])

  return null
}
