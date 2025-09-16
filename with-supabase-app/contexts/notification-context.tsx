'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

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

  const refreshUnreadCount = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setUnreadCount(0)
        return
      }

      const { data: coach, error: coachError } = await supabase
        .from('coaches')
        .select('id')
        .eq('auth_id', user.id)
        .single()

      if (coachError || !coach) {
        console.error('Error fetching coach:', coachError)
        setUnreadCount(0)
        return
      }

      const { count, error: countError } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('coach_id', coach.id)
        .eq('is_read', false)

      if (countError) {
        console.error('Error fetching unread count:', countError)
        setUnreadCount(0)
        return
      }

      console.log('Refreshed unread count:', count, 'for coach:', coach.id)
      setUnreadCount(count || 0)
    } catch (error) {
      console.error('Error refreshing unread count:', error)
      setUnreadCount(0)
    }
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