'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminHeader from '@/components/admin-header'
import EventList from '@/components/event-list'
import type { Event } from '@/lib/types'

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([])
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    fetchEvents()
  }, [])

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/events')
      const result = await response.json()

      if (result.success) {
        setEvents(result.data)
        setFilteredEvents(result.data)
      } else {
        setError(result.error || '获取赛事列表失败')
      }
    } catch (error) {
      console.error('Fetch events error:', error)
      setError('网络错误，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = (keyword: string) => {
    if (!keyword.trim()) {
      setFilteredEvents(events)
    } else {
      const filtered = events.filter(event =>
        event.name.toLowerCase().includes(keyword.toLowerCase()) ||
        event.short_name?.toLowerCase().includes(keyword.toLowerCase())
      )
      setFilteredEvents(filtered)
    }
  }

  const handleCreateEvent = () => {
    router.push('/events/create')
  }

  const handleToggleVisibility = async (eventId: string, isVisible: boolean) => {
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_visible: isVisible }),
      })

      const result = await response.json()

      if (result.success) {
        // 更新本地状态
        const updatedEvents = events.map(event =>
          event.id === eventId ? { ...event, is_visible: isVisible } : event
        )
        setEvents(updatedEvents)
        setFilteredEvents(updatedEvents.filter(event => {
          const currentFilter = filteredEvents.length !== events.length
          if (!currentFilter) return true
          return event.name.toLowerCase().includes('') // 保持当前搜索结果
        }))
      } else {
        setError(result.error || '更新显示设置失败')
      }
    } catch (error) {
      console.error('Toggle visibility error:', error)
      setError('网络错误，请稍后重试')
    }
  }

  const handleManageEvent = (eventId: string) => {
    router.push(`/events/${eventId}`)
  }

  const handleDeleteEvent = async (eventId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        // 从本地状态中移除
        const updatedEvents = events.filter(event => event.id !== eventId)
        setEvents(updatedEvents)
        setFilteredEvents(updatedEvents)
      } else {
        setError(result.error || '删除赛事失败')
      }
    } catch (error) {
      console.error('Delete event error:', error)
      setError('网络错误，请稍后重试')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">加载中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader
        onSearch={handleSearch}
        onCreateEvent={handleCreateEvent}
      />
      
      <main className="p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
            {error}
          </div>
        )}

        <EventList
          events={filteredEvents}
          onToggleVisibility={handleToggleVisibility}
          onManageEvent={handleManageEvent}
          onDeleteEvent={handleDeleteEvent}
        />
      </main>
    </div>
  )
}
