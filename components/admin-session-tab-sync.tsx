'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  getCurrentTabAdminSessionToken,
  writeAdminTabSessionCookie,
} from '@/lib/admin-session-client'

function shouldSync(pathname: string) {
  return pathname === '/' || pathname.startsWith('/events') || pathname.startsWith('/admin')
}

export default function AdminSessionTabSync() {
  const pathname = usePathname()

  useEffect(() => {
    if (!shouldSync(pathname)) return

    const syncSession = async () => {
      const tabToken = getCurrentTabAdminSessionToken()
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
      const tabToken = getCurrentTabAdminSessionToken()
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
