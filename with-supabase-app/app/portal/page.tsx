'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Search, Calendar, MapPin, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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
  registration_settings?: {
    team_requirements?: {
      registrationStartDate?: string
      registrationEndDate?: string
      [key: string]: any
    }
    [key: string]: any
  }
}

export default function PortalHomePage() {
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([])
  const [searchKeyword, setSearchKeyword] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchEvents()
  }, [])

  useEffect(() => {
    // 搜索过滤
    if (searchKeyword) {
      const filtered = events.filter(event =>
        event.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        event.short_name?.toLowerCase().includes(searchKeyword.toLowerCase())
      )
      setFilteredEvents(filtered)
    } else {
      setFilteredEvents(events)
    }
  }, [searchKeyword, events])

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/portal/events')
      const result = await response.json()
      
      if (result.success) {
        // 只显示可见的赛事
        const visibleEvents = result.data.filter((event: Event) => event.is_visible)
        setEvents(visibleEvents)
        setFilteredEvents(visibleEvents)
      }
    } catch (error) {
      console.error('获取赛事列表失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getEventStatus = (startDate: string, endDate: string) => {
    const now = new Date()
    const start = new Date(startDate)
    const end = new Date(endDate)

    if (now < start) {
      return { text: '未开始', variant: 'secondary' as const }
    } else if (now <= end) {
      return { text: '进行中', variant: 'default' as const }
    } else {
      return { text: '已结束', variant: 'destructive' as const }
    }
  }

  const getRegistrationStatus = (event: any) => {
    // 从 registration_settings 中获取报名时间
    const regStartDate = event.registration_settings?.team_requirements?.registrationStartDate
    const regEndDate = event.registration_settings?.team_requirements?.registrationEndDate
    
    if (!regStartDate || !regEndDate) {
      return { canRegister: false, text: '未设置报名时间' }
    }

    const now = new Date()
    const regStart = new Date(regStartDate)
    const regEnd = new Date(regEndDate)

    if (now < regStart) {
      return { canRegister: false, text: '报名未开始' }
    } else if (now <= regEnd) {
      return { canRegister: true, text: '去报名' }
    } else {
      return { canRegister: false, text: '已完结' }
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN')
  }

  const handleEventClick = (event: Event) => {
    router.push(`/portal/events/${event.id}`)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页面标题和搜索栏 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">赛事活动</h1>
        
        <div className="flex items-center space-x-4">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="请输入赛事名称"
              className="pl-10"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 赛事列表 */}
      {filteredEvents.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12">
          <div className="text-center text-gray-500">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg">暂无赛事活动</p>
            <p className="text-sm mt-2">请稍后再来查看</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20"></TableHead>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>时间</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEvents.map((event) => {
                const status = getEventStatus(event.start_date, event.end_date)
                const regStatus = getRegistrationStatus(event)
                
                return (
                  <TableRow 
                    key={event.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleEventClick(event)}
                  >
                    <TableCell>
                      <div className="w-16 h-16 relative bg-gray-100 rounded-lg overflow-hidden">
                        {event.poster_url ? (
                          <Image
                            src={event.poster_url}
                            alt={event.name}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <Calendar className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <div>
                        <div className="font-medium">{event.name}</div>
                        {event.short_name && (
                          <div className="text-sm text-gray-500">{event.short_name}</div>
                        )}
                      </div>
                    </TableCell>
                    
                    <TableCell>{event.type}</TableCell>
                    
                    <TableCell>
                      <Badge variant={status.variant}>{status.text}</Badge>
                    </TableCell>
                    
                    <TableCell>
                      <div className="text-sm">
                        <div className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatDate(event.start_date)}</span>
                        </div>
                        <div className="text-gray-500">至 {formatDate(event.end_date)}</div>
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <Button
                        size="sm"
                        variant={regStatus.canRegister ? "default" : "outline"}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (regStatus.canRegister) {
                            handleEventClick(event)
                          } else if (regStatus.text === '已完结') {
                            alert('该比赛报名已结束')
                          }
                        }}
                        disabled={!regStatus.canRegister && regStatus.text !== '已完结'}
                      >
                        {regStatus.text}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}