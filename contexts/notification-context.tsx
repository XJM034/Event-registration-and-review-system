'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getSessionUser, withTimeout } from '@/lib/supabase/client-auth'

interface NotificationContextType {
  unreadCount: number
  refreshUnreadCount: () => Promise<void>
  setUnreadCount: (count: number) => void
}

const NotificationContext = createContext<NotificationContextType>({
  unreadCount: 0,
  refreshUnreadCount: async () => {},
  setUnreadCount: () => {}
})

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const inFlightRefreshRef = useRef<Promise<void> | null>(null)

  const refreshUnreadCount = useCallback(async () => {
    if (inFlightRefreshRef.current) {
      return inFlightRefreshRef.current
    }

    const refreshTask = (async () => {
      try {
        const supabase = createClient()
        const { user, error: sessionError, isNetworkError } = await getSessionUser(supabase)

        if (sessionError && !isNetworkError) {
          console.error('获取会话失败:', sessionError)
        }

        if (!user) {
          setUnreadCount(0)
          return
        }

        if (user.user_metadata?.role === 'admin') {
          setUnreadCount(0)
          return
        }

        const { data: coach, error: coachError } = await withTimeout(
          supabase
            .from('coaches')
            .select('id')
            .eq('auth_id', user.id)
            .maybeSingle(),
          4000,
          'Unread-count coach lookup timed out'
        )

        if (coachError) {
          setUnreadCount(0)
          return
        }

        if (!coach) {
          setUnreadCount(0)
          return
        }

        const { count, error: countError } = await withTimeout(
          supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('coach_id', coach.id)
            .eq('is_read', false),
          4000,
          'Unread-count notifications lookup timed out'
        )

        if (countError) {
          console.error('Error fetching unread count:', countError)
          setUnreadCount(0)
          return
        }

        setUnreadCount(count || 0)
      } catch (error) {
        console.error('Error refreshing unread count:', error)
        setUnreadCount(0)
      }
    })().finally(() => {
      inFlightRefreshRef.current = null
    })

    inFlightRefreshRef.current = refreshTask
    return refreshTask
  }, [])

  useEffect(() => {
    refreshUnreadCount()

    // 设置定时刷新（每30秒）
    const interval = setInterval(refreshUnreadCount, 30000)

    return () => clearInterval(interval)
  }, [refreshUnreadCount])

  return (
    <NotificationContext.Provider value={{ unreadCount, refreshUnreadCount, setUnreadCount }}>
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotification = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider')
  }
  return context
}
