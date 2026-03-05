'use client'

import { useEffect } from 'react'

const ADMIN_SESSION_HEADER = 'x-admin-session-token'

function isApiRequest(url: string) {
  if (url.startsWith('/api/')) return true
  if (typeof window !== 'undefined') {
    return url.startsWith(`${window.location.origin}/api/`)
  }
  return false
}

export default function AdminApiSessionBridge() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const tabToken = sessionStorage.getItem('tab_admin_session_token')
      if (!tabToken) {
        return originalFetch(input, init)
      }

      try {
        const request = new Request(input, init)
        if (!isApiRequest(request.url)) {
          return originalFetch(request)
        }

        if (!request.headers.has(ADMIN_SESSION_HEADER)) {
          request.headers.set(ADMIN_SESSION_HEADER, tabToken)
        }
        return originalFetch(request)
      } catch {
        return originalFetch(input, init)
      }
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return null
}

