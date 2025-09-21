'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Settings, Users, ClipboardList } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import BasicInfoTab from '@/components/event-manage/basic-info-tab'
import RegistrationSettingsTab from '@/components/event-manage/registration-settings-tab'
import ReviewListTab from '@/components/event-manage/review-list-tab'
import RegistrationListTab from '@/components/event-manage/registration-list-tab'

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
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('basic-info')
  const [pendingReviewCount, setPendingReviewCount] = useState(0)

  useEffect(() => {
    fetchEvent()
    fetchPendingReviewCount()
  }, [params.id])

  useEffect(() => {
    // 当切换到审核列表时，重新获取数量
    if (activeTab === 'review-list') {
      fetchPendingReviewCount()
    }
  }, [activeTab])

  const fetchEvent = async () => {
    try {
      const response = await fetch(`/api/events/${params.id}`)
      const result = await response.json()
      
      if (result.success) {
        setEvent(result.data)
      } else {
        console.error('Failed to fetch event:', result.error)
      }
    } catch (error) {
      console.error('Error fetching event:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPendingReviewCount = async () => {
    try {
      const response = await fetch(`/api/events/${params.id}/registrations?status=pending`)
      const result = await response.json()
      
      if (result.success) {
        setPendingReviewCount(result.data.length)
      }
    } catch (error) {
      console.error('Error fetching pending review count:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600">赛事不存在</p>
          <Button
            className="mt-4"
            onClick={() => router.push('/')}
          >
            返回主页
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* 左侧边栏 */}
        <div className="w-64 bg-white shadow-lg min-h-screen">
          <div className="p-4">
            <Link href="/" className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-6">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回赛事列表
            </Link>
            
            {event.poster_url && (
              <div className="mb-4">
                <div className="relative w-full rounded-lg overflow-hidden bg-gray-100">
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
            
            <h2 className="font-semibold text-lg mb-2">{event.name}</h2>
            <p className="text-sm text-gray-600 mb-4">类型: {event.type}</p>
            
            <div className="space-y-2">
              <Button
                variant={activeTab === 'basic-info' ? 'default' : 'ghost'}
                className="w-full justify-start"
                onClick={() => setActiveTab('basic-info')}
              >
                <Settings className="h-4 w-4 mr-2" />
                基本信息
              </Button>
              
              <div className="pl-2">
                <p className="text-xs text-gray-500 font-semibold mb-2">报名管理</p>
                <div className="space-y-1">
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
        <div className="flex-1 p-6">
          {activeTab === 'basic-info' && (
            <BasicInfoTab event={event} onUpdate={fetchEvent} />
          )}
          
          {activeTab === 'registration-settings' && (
            <RegistrationSettingsTab eventId={event.id} eventStartDate={event.start_date} />
          )}
          
          {activeTab === 'review-list' && (
            <ReviewListTab
              eventId={event.id}
              onReviewComplete={fetchPendingReviewCount}
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