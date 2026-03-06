'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getSessionUserWithRetry } from '@/lib/supabase/client-auth'
import { useNotification } from '@/contexts/notification-context'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Bell,
  BellOff,
  Info,
  Eye,
  Trash2,
  CheckCheck,
  FileText,
  Calendar,
  RefreshCw
} from 'lucide-react'

interface Notification {
  id: string
  type: 'system' | 'registration' | 'event'
  title: string
  originalTitle?: string
  message: string
  is_read: boolean
  created_at: string
  event_id?: string
  registration_id?: string
  metadata?: any
  registration?: {
    team_data?: any
  }
  eventName?: string
}

type NotificationTab = 'all' | 'unread' | 'read'

function normalizeNotificationTab(tab: string | null): NotificationTab {
  if (tab === 'unread' || tab === 'read') {
    return tab
  }
  return 'all'
}

function mapNotificationType(type: unknown): Notification['type'] {
  if (type === 'approval' || type === 'rejection') {
    return 'registration'
  }
  if (type === 'reminder') {
    return 'event'
  }
  return 'system'
}

export default function MyNotificationsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { unreadCount, refreshUnreadCount } = useNotification()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const activeTab = normalizeNotificationTab(searchParams.get('tab'))

  useEffect(() => {
    if (!hasLoaded || notifications.length === 0) {
      loadNotifications()
      refreshUnreadCount()
    }
  }, [])

  const handleTabChange = (value: string) => {
    const nextTab = normalizeNotificationTab(value)
    const params = new URLSearchParams(searchParams.toString())

    if (nextTab === 'all') {
      params.delete('tab')
    } else {
      params.set('tab', nextTab)
    }

    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
    router.replace(nextUrl, { scroll: false })
  }

  const loadNotifications = async (showLoading = true) => {
    if (showLoading) {
      setIsLoading(true)
    }
    setLoadError(null)

    try {
      const supabase = createClient()

      // 获取当前用户
      const { user, error: authError, isNetworkError } = await getSessionUserWithRetry(supabase, {
        maxRetries: 2,
        baseDelayMs: 500,
      })

      if (authError && !isNetworkError) {
        console.error('Auth error:', authError)
      }

      if (authError && isNetworkError) {
        console.error('会话请求网络异常（已重试）:', authError)
        setLoadError('网络连接异常，无法获取登录状态，请检查网络后重试。')
        return
      }

      if (!user) {
        router.push('/auth/login')
        return
      }

      // 获取教练信息
      const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('auth_id', user.id)
        .single()

      if (coach) {
        console.log('Loading notifications for coach:', coach.id)

        // 从数据库获取真实通知，并关联报名信息和赛事信息
        const { data: notificationData, error: notifError } = await supabase
          .from('notifications')
          .select(`
            *,
            registrations:registration_id (
              team_data
            ),
            events:event_id (
              name,
              short_name
            )
          `)
          .eq('coach_id', coach.id)
          .order('created_at', { ascending: false })

        if (notifError) {
          console.error('获取通知失败:', notifError)
        } else if (notificationData) {
          console.log(`Loaded ${notificationData.length} notifications`)

          // 转换类型以匹配前端接口
          const formattedNotifications: Notification[] = notificationData.map((n: any) => {
            // 获取赛事名称
            const eventName = n.events?.short_name || n.events?.name || ''

            // 根据通知类型构建新的标题
            let enhancedTitle = n.title
            if (eventName && (n.type === 'approval' || n.type === 'rejection' || n.type === 'cancellation')) {
              // 替换标题格式
              if (n.type === 'approval') {
                enhancedTitle = `${eventName}报名审核通过`
              } else if (n.type === 'rejection') {
                enhancedTitle = `${eventName}报名已驳回`
              } else if (n.type === 'cancellation') {
                enhancedTitle = `${eventName}报名已取消`
              }
            }

            return {
              id: n.id,
              type: mapNotificationType(n.type),
              title: enhancedTitle,
              originalTitle: n.title, // 保留原始标题
              message: n.message,
              is_read: n.is_read,
              created_at: n.created_at,
              event_id: n.event_id,
              registration_id: n.registration_id,
              registration: n.registrations, // 关联的报名信息
              eventName: eventName // 保存赛事名称
            }
          })

          // 排序：未读在前，已读在后，同类按时间倒序
          const sortedNotifications = formattedNotifications.sort((a, b) => {
            if (a.is_read !== b.is_read) {
              return a.is_read ? 1 : -1 // 未读在前
            }
            // 同类按时间倒序
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          })

          setNotifications(sortedNotifications)
          setHasLoaded(true)
        } else {
          console.log('No notifications found')
          setNotifications([])
        }
      }
    } catch (error) {
      console.error('加载通知失败:', error)
    } finally {
      setIsLoading(false)
      setHasLoaded(true)
    }
  }

  const markAsRead = async (id: string) => {
    const supabase = createClient()

    // 更新数据库
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)

    if (!error) {
      setNotifications(prev => {
        // 先更新通知状态
        const updated = prev.map(n => n.id === id ? { ...n, is_read: true } : n)
        // 重新排序：未读在前，已读在后，同类按时间倒序
        return updated.sort((a, b) => {
          if (a.is_read !== b.is_read) {
            return a.is_read ? 1 : -1 // 未读在前
          }
          // 同类按时间倒序
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
      })
      // 刷新未读数量
      await refreshUnreadCount()
    }
  }

  const markAllAsRead = async () => {
    try {
      const supabase = createClient()

      // 获取所有未读通知
      const unreadNotifications = notifications.filter(n => !n.is_read)
      if (unreadNotifications.length === 0) {
        console.log('No unread notifications to mark')
        return
      }

      console.log(`Marking ${unreadNotifications.length} notifications as read`)

      // 方法1：尝试使用简单的RPC函数
      try {
        const { data: rpcResult, error: rpcError } = await supabase
          .rpc('simple_mark_all_read')

        if (!rpcError && rpcResult?.success) {
          console.log(`Simple RPC succeeded: marked ${rpcResult.updated_count} notifications as read`)

          // 重新加载通知列表
          await loadNotifications()
          await refreshUnreadCount()
          return
        }

        if (rpcError) {
          console.log('Simple RPC failed, trying complex RPC:', rpcError)

          // 尝试复杂的RPC函数
          const { data: complexResult, error: complexError } = await supabase
            .rpc('mark_all_notifications_as_read')

          if (!complexError && complexResult?.success) {
            console.log(`Complex RPC succeeded: marked ${complexResult.updated_count} notifications as read`)
            await loadNotifications()
            await refreshUnreadCount()
            return
          }
        }
      } catch (rpcErr) {
        console.log('RPC call error:', rpcErr)
      }

      // 方法2：直接批量更新（简单直接）
      const unreadIds = unreadNotifications.map(n => n.id)
      console.log('Trying direct update for IDs:', unreadIds)

      const { error: updateError } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', unreadIds)

      if (updateError) {
        console.error('Direct update failed:', updateError)

        // 方法3：逐个更新（最后的备选方案）
        console.log('Trying individual updates...')
        let successCount = 0
        for (const notif of unreadNotifications) {
          const { error: singleError } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notif.id)

          if (!singleError) {
            successCount++
          } else {
            console.error(`Failed to update notification ${notif.id}:`, singleError)
          }
        }

        if (successCount === 0) {
          alert('无法标记通知为已读，请检查网络连接并重试')
          return
        }

        console.log(`Successfully marked ${successCount}/${unreadNotifications.length} notifications as read`)
      } else {
        console.log('Direct batch update succeeded')
      }

      // 更新本地状态并重新排序
      setNotifications(prev => {
        const updated = prev.map(n => ({ ...n, is_read: true }))
        // 已读的通知保持时间倒序
        return updated.sort((a, b) => {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
      })

      // 刷新未读计数
      await refreshUnreadCount()

      console.log('All updates completed')
    } catch (error) {
      console.error('Unexpected error in markAllAsRead:', error)

      // 即使出错也尝试更新本地状态
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true }))
      )

      // 延迟刷新，给数据库时间同步
      setTimeout(() => {
        loadNotifications()
        refreshUnreadCount()
      }, 1000)
    }
  }

  const deleteNotification = async (id: string) => {
    const supabase = createClient()

    // 先检查是否是未读通知
    const notif = notifications.find(n => n.id === id)
    const wasUnread = notif && !notif.is_read

    // 从数据库删除
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)

    if (!error) {
      setNotifications(prev => prev.filter(n => n.id !== id))
      // 如果删除的是未读通知，刷新未读数量
      if (wasUnread) {
        await refreshUnreadCount()
      }
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'registration':
        return <FileText className="h-4 w-4" />
      case 'event':
        return <Calendar className="h-4 w-4" />
      case 'system':
        return <Info className="h-4 w-4" />
      default:
        return <Bell className="h-4 w-4" />
    }
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'registration':
        return 'bg-primary/10 text-primary'
      case 'event':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      case 'system':
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`
    return date.toLocaleDateString('zh-CN')
  }

  const filteredNotifications = activeTab === 'all'
    ? notifications
    : activeTab === 'unread'
      ? notifications.filter(n => !n.is_read)
      : notifications.filter(n => n.is_read)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="space-y-4 py-10 text-center">
          <p className="text-muted-foreground">{loadError}</p>
          <Button onClick={() => loadNotifications(true)}>重试</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">我的通知</h1>
          <p className="text-muted-foreground">
            查看系统通知和消息 {unreadCount > 0 && `(${unreadCount}条未读)`}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => {
              loadNotifications(true)  // 改为 true，显示加载状态
              refreshUnreadCount()
            }}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" onClick={markAllAsRead} className="w-full sm:w-auto">
              <CheckCheck className="h-4 w-4 mr-2" />
              全部标记已读
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-2 grid h-auto w-full grid-cols-3 sm:inline-flex sm:w-auto">
          <TabsTrigger value="all">
            全部
            {notifications.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {notifications.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="unread">
            未读
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="read">已读</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="animate-in fade-in-0 duration-200">
          {filteredNotifications.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <BellOff className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {activeTab === 'unread' ? '没有未读通知' : '暂无通知'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((notification) => (
                <Card
                  key={notification.id}
                  className={`border-border/60 bg-card transition-all ${!notification.is_read ? 'border-primary/20 bg-primary/5' : ''}`}
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${getNotificationColor(notification.type)}`}>
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1">
                        <div className="mb-1 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <h3 className="font-medium">
                            {notification.title}
                            {!notification.is_read && (
                              <Badge variant="destructive" className="ml-2 text-xs">
                                新
                              </Badge>
                            )}
                          </h3>
                          <span className="text-xs text-muted-foreground">
                            {getTimeAgo(notification.created_at)}
                          </span>
                        </div>
                        {/* 显示团队信息预览作为第二行 */}
                        {notification.registration?.team_data && (
                          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-2">
                            {Object.entries(notification.registration.team_data)
                              .filter(([key]) => key !== 'id' && key !== 'team_logo' && key !== 'logo')
                              .slice(0, 3)
                              .map(([key, value], index) => (
                                <div key={key} className="flex items-center gap-1">
                                  {index > 0 && <span className="text-muted-foreground/40">•</span>}
                                  <span>
                                    {typeof value === 'string' || typeof value === 'number' ? value : '-'}
                                  </span>
                                </div>
                              ))}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          {!notification.is_read && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => markAsRead(notification.id)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              标记已读
                            </Button>
                          )}
                          {notification.event_id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.preventDefault()
                                // 在新标签页打开，避免当前页面状态丢失
                                window.open(`/portal/events/${notification.event_id}`, '_blank')
                              }}
                            >
                              查看赛事
                            </Button>
                          )}
                          {notification.registration_id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.preventDefault()
                                // 跳转到我的报名页面并传递要高亮的报名ID
                                router.push(`/portal/my/registrations?highlight=${notification.registration_id}`)
                              }}
                            >
                              查看报名
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteNotification(notification.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
