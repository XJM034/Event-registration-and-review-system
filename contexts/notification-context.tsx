'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getSessionUser, isTimeoutError, withTimeout } from '@/lib/supabase/client-auth'
import {
  clearCachedPortalCoachId,
  readCachedPortalCoachId,
  writeCachedPortalCoachId,
} from '@/lib/portal/coach-session-cache'

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
          clearCachedPortalCoachId()
          setUnreadCount(0)
          return
        }

        if (user.user_metadata?.role === 'admin') {
          clearCachedPortalCoachId()
          setUnreadCount(0)
          return
        }

        let coach: { id: string } | null = null
        const cachedCoachId = readCachedPortalCoachId(user.id)
        if (cachedCoachId) {
          coach = { id: cachedCoachId }
        }

        try {
          if (!coach) {
            const coachResult = await withTimeout(
              supabase
                .from('coaches')
                .select('id')
                .eq('auth_id', user.id)
                .maybeSingle(),
              4000,
              'Unread-count coach lookup timed out'
            )

            if (coachResult.error) {
              setUnreadCount(0)
              return
            }

            coach = coachResult.data

            if (coach?.id) {
              writeCachedPortalCoachId(user.id, coach.id)
            }
          }
        } catch (error) {
          if (!isTimeoutError(error)) {
            console.error('Error fetching coach for unread count:', error)
          }
          setUnreadCount(0)
          return
        }

        if (!coach) {
          clearCachedPortalCoachId()
          setUnreadCount(0)
          return
        }

        let count = 0
        let countError: unknown = null
        try {
          const countResult = await withTimeout(
            supabase
              .from('notifications')
              .select('*', { count: 'exact', head: true })
              .eq('coach_id', coach.id)
              .eq('is_read', false),
            4000,
            'Unread-count notifications lookup timed out'
          )

          count = countResult.count || 0
          countError = countResult.error
        } catch (error) {
          if (!isTimeoutError(error)) {
            console.error('Error fetching unread notifications count:', error)
          }
          setUnreadCount(0)
          return
        }

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
    void refreshUnreadCount()

    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible') {
        return
      }
      void refreshUnreadCount()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshUnreadCount()
      }
    }

    // 设置定时刷新（每30秒）
    const interval = setInterval(refreshIfVisible, 30000)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleVisibilityChange)
    }
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
