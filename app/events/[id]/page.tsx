'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Settings, Users, ClipboardList } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import BasicInfoTab from '@/components/event-manage/basic-info-tab'
import RegistrationSettingsTab from '@/components/event-manage/registration-settings-tab'
import ReviewListTab from '@/components/event-manage/review-list-tab'
import RegistrationListTab from '@/components/event-manage/registration-list-tab'
import { ThemeSwitcher } from '@/components/theme-switcher'

interface Event {
  id: string
  name: string
  short_name?: string
  poster_url?: string
  type: string
  start_date: string
  end_date: string
  address?: string
  details?: string
  phone?: string
  is_visible: boolean
}

export default function EventManagePage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'basic-info')
  const [pendingReviewCount, setPendingReviewCount] = useState(0)

  const fetchEvent = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/events/${id}`)
      const result = await response.json()

      if (result.success) {
        setEvent(result.data)
      } else {
        if (response.status !== 404) {
          console.error('Failed to fetch event:', result.error)
        }
        // 如果是未授权访问，重定向到登录页
        if (response.status === 401 || result.error === '未授权访问') {
          router.push('/auth/login')
        }
      }
    } catch (error) {
      console.error('Error fetching event:', error)
    } finally {
      setLoading(false)
    }
  }, [router])

  const fetchPendingReviewCount = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/events/${id}/registrations?status=pending`)
      const result = await response.json()

      if (result.success) {
        setPendingReviewCount(result.data.length)
      } else {
        // 如果是未授权访问，重定向到登录页
        if (response.status === 401 || result.error === '未授权访问') {
          router.push('/auth/login')
        }
      }
    } catch (error) {
      console.error('Error fetching pending review count:', error)
    }
  }, [router])

  useEffect(() => {
    if (!eventId || typeof eventId !== 'string') return
    fetchEvent(eventId)
    fetchPendingReviewCount(eventId)
  }, [eventId, fetchEvent, fetchPendingReviewCount])

  useEffect(() => {
    // 当切换到审核列表时，重新获取数量
    if (activeTab === 'review-list' && eventId && typeof eventId === 'string') {
      fetchPendingReviewCount(eventId)
    }
  }, [activeTab, eventId, fetchPendingReviewCount])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
          <p className="mt-4 text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">赛事不存在</p>
          <Button
            className="mt-4"
            onClick={() => router.push('/events')}
          >
            返回主页
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen flex-col lg:flex-row">
        {/* 左侧边栏 */}
        <div className="w-full shrink-0 border-b border-border bg-card/95 shadow-sm backdrop-blur lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col gap-6 p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <Link href="/events" className="inline-flex items-center text-primary transition-colors hover:text-primary/80">
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回赛事列表
              </Link>
              <ThemeSwitcher />
            </div>

            {event.poster_url && (
              <div>
                <div className="relative w-full overflow-hidden rounded-xl bg-muted">
                  <Image
                    src={event.poster_url}
                    alt={event.name}
                    width={224}
                    height={150}
                    className="object-contain w-full h-auto"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">{event.name}</h2>
              <p className="text-sm text-muted-foreground">类型: {event.type}</p>
            </div>

            <div className="space-y-4">
              <Button
                variant={activeTab === 'basic-info' ? 'default' : 'ghost'}
                className="w-full justify-start text-sm"
                onClick={() => setActiveTab('basic-info')}
              >
                <Settings className="h-4 w-4 mr-2" />
                基本信息
              </Button>

              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">报名管理</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <Button
                    variant={activeTab === 'registration-list' ? 'default' : 'ghost'}
                    className="w-full justify-start text-sm"
                    onClick={() => setActiveTab('registration-list')}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    报名列表
                  </Button>
                  <Button
                    variant={activeTab === 'review-list' ? 'default' : 'ghost'}
                    className="w-full justify-start text-sm relative"
                    onClick={() => setActiveTab('review-list')}
                  >
                    <ClipboardList className="h-4 w-4 mr-2" />
                    审核列表
                    {pendingReviewCount > 0 && (
                      <Badge variant="destructive" className="absolute right-2">
                        {pendingReviewCount}
                      </Badge>
                    )}
                  </Button>
                  <Button
                    variant={activeTab === 'registration-settings' ? 'default' : 'ghost'}
                    className="w-full justify-start text-sm"
                    onClick={() => setActiveTab('registration-settings')}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    报名设置
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          {activeTab === 'basic-info' && (
            <BasicInfoTab event={event} onUpdate={() => fetchEvent(event.id)} />
          )}
          
          {activeTab === 'registration-settings' && (
            <RegistrationSettingsTab eventId={event.id} eventStartDate={event.start_date} />
          )}
          
          {activeTab === 'review-list' && (
            <ReviewListTab
              eventId={event.id}
              onReviewComplete={() => fetchPendingReviewCount(event.id)}
            />
          )}

          {activeTab === 'registration-list' && (
            <RegistrationListTab eventId={event.id} />
          )}
        </div>
      </div>
    </div>
  )
}
