'use client'

import { useState, useMemo, useEffect } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Filter,
  Settings,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Event } from '@/lib/types'

interface EventListProps {
  events: Event[]
  onToggleVisibility: (eventId: string, isVisible: boolean) => void
  onManageEvent: (eventId: string) => void
  onDeleteEvent: (eventId: string) => void
}

const KNOWN_TYPES = ['体育', '科创', '艺术']
type RegistrationDateConfig = {
  registrationStartDate?: string
  registrationEndDate?: string
  reviewEndDate?: string
}

function parseRegistrationDateConfig(value: unknown): RegistrationDateConfig | null {
  if (!value) return null

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as RegistrationDateConfig)
        : null
    } catch {
      console.warn('解析 team_requirements 失败')
      return null
    }
  }

  if (typeof value === 'object') {
    return value as RegistrationDateConfig
  }

  return null
}

export default function EventList({
  events,
  onToggleVisibility,
  onManageEvent,
  onDeleteEvent,
}: EventListProps) {
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null)
  const [secondConfirmEventId, setSecondConfirmEventId] = useState<string | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [activeTab, setActiveTab] = useState('全部')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('全部')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const getEventStatus = (startDate: string, endDate: string) => {
    const now = new Date()
    const start = new Date(startDate)
    const end = new Date(endDate)
    if (now < start) return { text: '未开始', variant: 'secondary' as const }
    if (now <= end) return { text: '进行中', variant: 'default' as const }
    return { text: '已结束', variant: 'destructive' as const }
  }

  const getRegistrationStatus = (event: Event) => {
    const now = new Date()
    let registrationStart: Date | null = null
    let registrationEnd: Date | null = null
    let reviewEnd: Date | null = null

    const parsed = parseRegistrationDateConfig(event.registration_settings?.team_requirements)
    if (parsed) {
      registrationStart = parsed.registrationStartDate ? new Date(parsed.registrationStartDate) : null
      registrationEnd = parsed.registrationEndDate ? new Date(parsed.registrationEndDate) : null
      reviewEnd = parsed.reviewEndDate ? new Date(parsed.reviewEndDate) : null
    }

    if (!registrationStart && event.registration_start_date)
      registrationStart = new Date(event.registration_start_date)
    if (!registrationEnd)
      registrationEnd = event.registration_end_date ? new Date(event.registration_end_date) : new Date(event.end_date)
    if (!reviewEnd && event.review_end_date)
      reviewEnd = new Date(event.review_end_date)

    if (registrationStart && now < registrationStart)
      return { text: '未开始', variant: 'secondary' as const }
    if (registrationEnd && now <= registrationEnd)
      return { text: '报名中', variant: 'default' as const }
    if (reviewEnd && registrationEnd && now > registrationEnd && now <= reviewEnd)
      return { text: '审核中', variant: 'secondary' as const }
    return { text: '已截止', variant: 'destructive' as const }
  }

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('zh-CN')

  // Dynamic tabs from event types
  const tabs = useMemo(() => {
    const types = Array.from(new Set(events.map(e => e.type)))
    const known = KNOWN_TYPES.filter(t => types.includes(t))
    const hasOther = types.some(t => !KNOWN_TYPES.includes(t))
    return ['全部', ...known, ...(hasOther ? ['其他'] : [])]
  }, [events])

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1) }, [activeTab, searchQuery, statusFilter])

  // Three-stage filter pipeline
  const filteredEvents = useMemo(() => {
    let result = events
    if (activeTab !== '全部') {
      result = activeTab === '其他'
        ? result.filter(e => !KNOWN_TYPES.includes(e.type))
        : result.filter(e => e.type === activeTab)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(e =>
        e.name.toLowerCase().includes(q) || e.short_name?.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== '全部') {
      result = result.filter(e => getRegistrationStatus(e).text === statusFilter)
    }
    return result
  }, [events, activeTab, searchQuery, statusFilter])

  // Pagination
  const totalItems = filteredEvents.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const startIdx = (safePage - 1) * pageSize
  const endIdx = Math.min(startIdx + pageSize, totalItems)
  const paginatedEvents = filteredEvents.slice(startIdx, endIdx)

  const handleDelete = (eventId: string) => setDeleteEventId(eventId)
  const confirmDelete = () => {
    if (deleteEventId) {
      setSecondConfirmEventId(deleteEventId)
      setDeleteEventId(null)
      setConfirmName('')
    }
  }
  const secondConfirmEvent = secondConfirmEventId ? events.find(e => e.id === secondConfirmEventId) : null
  const nameMatches = secondConfirmEvent ? confirmName.trim() === secondConfirmEvent.name : false
  const finalConfirmDelete = () => {
    if (secondConfirmEventId && nameMatches) {
      onDeleteEvent(secondConfirmEventId)
      setSecondConfirmEventId(null)
      setConfirmName('')
    }
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
          <div className="text-gray-500 text-center">
            <div className="text-4xl mb-4">📋</div>
            <p className="text-lg font-medium">暂无赛事活动</p>
            <p className="text-sm">点击右上角&quot;创建赛事&quot;开始创建第一个赛事</p>
          </div>
        </div>
      )
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow">
        {/* Tab Navigation */}
        <div className="px-6 pt-4 border-b border-gray-200">
          <div className="flex space-x-6">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'pb-3 text-sm transition-colors relative',
                  activeTab === tab
                    ? 'text-gray-900 font-semibold'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {tab}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Row */}
        <div className="flex items-center justify-between px-6 py-3">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="搜索赛事名称"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-64 h-8 text-sm"
            />
          </div>
          <div className="flex items-center space-x-1">
            <span className="text-xs text-gray-400 mr-1">报名：</span>
            {['全部', '未开始', '报名中', '审核中', '已截止'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'px-3 py-1 text-xs rounded-full transition-colors',
                  statusFilter === s
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-gray-500 hover:bg-gray-100'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow className="bg-[#fafafa] hover:bg-[#fafafa] border-b border-gray-200">
              <TableHead className="text-xs text-gray-400 font-normal w-[136px]">海报</TableHead>
              <TableHead className="text-xs text-gray-400 font-normal max-w-[240px]">名称</TableHead>
              <TableHead className="text-xs text-gray-400 font-normal w-[200px]">状态</TableHead>
              <TableHead className="text-xs text-gray-400 font-normal w-[120px]">比赛时间</TableHead>
              <TableHead className="text-xs text-gray-400 font-normal w-[80px]">显示设置</TableHead>
              <TableHead className="text-xs text-gray-400 font-normal w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedEvents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-gray-400">
                  没有符合条件的赛事
                </TableCell>
              </TableRow>
            ) : (
              paginatedEvents.map(event => {
                const evtStatus = getEventStatus(event.start_date, event.end_date)
                const regStatus = getRegistrationStatus(event)
                return (
                  <TableRow
                    key={event.id}
                    className="group border-b border-gray-100 hover:bg-[#f8f8f8] cursor-pointer"
                    onClick={() => onManageEvent(event.id)}
                  >
                    {/* Poster */}
                    <TableCell className="py-3">
                      <div className="w-[120px] h-[68px] relative bg-gray-100 rounded overflow-hidden flex-shrink-0">
                        {event.poster_url ? (
                          <Image src={event.poster_url} alt={event.name} fill className="object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">📷</div>
                        )}
                      </div>
                    </TableCell>
                    {/* Name */}
                    <TableCell>
                      <div>
                        <div className="text-sm font-semibold text-gray-900 leading-5">{event.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {event.type}{event.short_name ? ` · ${event.short_name}` : ''}
                        </div>
                      </div>
                    </TableCell>
                    {/* Status */}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge variant={evtStatus.variant} className="text-[10px] px-1.5 py-0 h-5 w-fit whitespace-nowrap">
                          比赛{evtStatus.text}
                        </Badge>
                        <span className="text-gray-300 text-xs">/</span>
                        <Badge variant={regStatus.variant} className="text-[10px] px-1.5 py-0 h-5 w-fit whitespace-nowrap">
                          {regStatus.text}
                        </Badge>
                      </div>
                    </TableCell>
                    {/* Date */}
                    <TableCell>
                      <div className="text-sm text-gray-700">
                        <div>{formatDate(event.start_date)}</div>
                        <div className="text-gray-400">至 {formatDate(event.end_date)}</div>
                      </div>
                    </TableCell>
                    {/* Visibility */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={event.is_visible}
                        onCheckedChange={(checked) => onToggleVisibility(event.id, checked)}
                      />
                    </TableCell>
                    {/* Actions */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onManageEvent(event.id)} title="管理">
                          <Settings className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDelete(event.id)} title="删除">
                          <Trash2 className="h-4 w-4 text-gray-500 hover:text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-end space-x-4 px-6 py-3 border-t border-gray-100 text-sm text-gray-500">
          <div className="flex items-center space-x-2">
            <span>每页行数:</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1) }}>
              <SelectTrigger className="w-16 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <span>第 {totalItems === 0 ? 0 : startIdx + 1}-{endIdx} 条，共 {totalItems} 条</span>
          <div className="flex items-center space-x-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={safePage <= 1} onClick={() => setCurrentPage(1)}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={safePage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={safePage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={safePage >= totalPages} onClick={() => setCurrentPage(totalPages)}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog - Step 1 */}
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

      {/* Delete Confirmation Dialog - Step 2: Input event name to confirm */}
      <AlertDialog open={secondConfirmEventId !== null} onOpenChange={() => { setSecondConfirmEventId(null); setConfirmName('') }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>二次确认删除</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>请输入赛事名称 <span className="font-semibold text-gray-900">{secondConfirmEvent?.name}</span> 以确认删除：</p>
                <Input
                  placeholder="请输入赛事名称"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && nameMatches) finalConfirmDelete() }}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmName('')}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={finalConfirmDelete}
              disabled={!nameMatches}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
