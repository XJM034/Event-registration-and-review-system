'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useNotification } from '@/contexts/notification-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Bell,
  BellOff,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  Clock,
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

export default function MyNotificationsPage() {
  const router = useRouter()
  const { unreadCount, refreshUnreadCount, setUnreadCount } = useNotification()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [activeTab, setActiveTab] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)

  useEffect(() => {
    // 只在第一次加载或没有数据时加载
    if (!hasLoaded || notifications.length === 0) {
      loadNotifications()
      // 页面加载时刷新未读数量
      refreshUnreadCount()
    }
  }, [])

  const loadNotifications = async (showLoading = true) => {
    if (showLoading) {
      setIsLoading(true)
    }

    try {
      const supabase = createClient()

      // 获取当前用户
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        console.error('Auth error:', authError)
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
          const formattedNotifications = notificationData.map(n => {
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
              type: n.type === 'approval' ? 'registration' :
                    n.type === 'rejection' ? 'registration' :
                    n.type === 'reminder' ? 'event' : 'system',
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

      // 先尝试获取用户信息
      let user = null
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        user = authUser
      } catch (authError) {
        console.error('Auth error, trying alternative method:', authError)
      }

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
        return 'text-blue-600 bg-blue-50'
      case 'event':
        return 'text-green-600 bg-green-50'
      case 'system':
        return 'text-orange-600 bg-orange-50'
      default:
        return 'text-gray-600 bg-gray-50'
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
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">加载中...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* 页面标题 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">我的通知</h1>
          <p className="text-muted-foreground">
            查看系统通知和消息 {unreadCount > 0 && `(${unreadCount}条未读)`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              loadNotifications(true)  // 改为 true，显示加载状态
              refreshUnreadCount()
            }}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" onClick={markAllAsRead}>
              <CheckCheck className="h-4 w-4 mr-2" />
              全部标记已读
            </Button>
          )}
        </div>
      </div>

      {/* 标签页 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
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

        <TabsContent value={activeTab}>
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
                  className={`transition-all ${!notification.is_read ? 'border-blue-200 bg-blue-50/30' : ''}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${getNotificationColor(notification.type)}`}>
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-1">
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
                        <div className="flex items-center gap-2">
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
                            className="text-red-600 hover:text-red-700"
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