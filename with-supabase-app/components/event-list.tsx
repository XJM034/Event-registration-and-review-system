'use client'

import { useState } from 'react'
import Image from 'next/image'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Eye, EyeOff, Settings, Trash2 } from 'lucide-react'
import type { Event } from '@/lib/types'

interface EventListProps {
  events: Event[]
  onToggleVisibility: (eventId: string, isVisible: boolean) => void
  onManageEvent: (eventId: string) => void
  onDeleteEvent: (eventId: string) => void
}

export default function EventList({ 
  events, 
  onToggleVisibility, 
  onManageEvent, 
  onDeleteEvent 
}: EventListProps) {
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null)

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN')
  }

  const handleDelete = (eventId: string) => {
    setDeleteEventId(eventId)
  }

  const confirmDelete = () => {
    if (deleteEventId) {
      onDeleteEvent(deleteEventId)
      setDeleteEventId(null)
    }
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="text-gray-500 text-center">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-lg font-medium">暂无赛事活动</p>
          <p className="text-sm">点击右上角"创建赛事"开始创建第一个赛事</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">海报</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>时间</TableHead>
              <TableHead>显示设置</TableHead>
              <TableHead className="w-32">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => {
              const status = getEventStatus(event.start_date, event.end_date)
              return (
                <TableRow key={event.id}>
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
                          📷
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
                      <div>{formatDate(event.start_date)}</div>
                      <div className="text-gray-500">至 {formatDate(event.end_date)}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant={event.is_visible ? "default" : "outline"}
                        onClick={() => onToggleVisibility(event.id, true)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        显示
                      </Button>
                      <Button
                        size="sm"
                        variant={!event.is_visible ? "default" : "outline"}
                        onClick={() => onToggleVisibility(event.id, false)}
                      >
                        <EyeOff className="h-3 w-3 mr-1" />
                        隐藏
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onManageEvent(event.id)}
                      >
                        <Settings className="h-3 w-3 mr-1" />
                        管理
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(event.id)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteEventId !== null} onOpenChange={() => setDeleteEventId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除赛事</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将无法恢复，同时会删除该赛事的所有报名信息。确定要删除这个赛事活动吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}