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
        <div className="text-center text-muted-foreground">
          <div className="mb-4 text-4xl">📋</div>
          <p className="text-lg font-medium">暂无赛事活动</p>
          <p className="text-sm">点击右上角&quot;创建赛事&quot;开始创建第一个赛事</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
        {/* Tab Navigation */}
        <div className="border-b border-border px-4 pt-4 sm:px-6">
          <div className="flex gap-5 overflow-x-auto pb-1">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'pb-3 text-sm transition-colors relative',
                  activeTab === tab
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Row */}
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索赛事名称"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full pl-10 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-muted-foreground">报名：</span>
            {['全部', '未开始', '报名中', '审核中', '已截止'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'px-3 py-1 text-xs rounded-full transition-colors',
                  statusFilter === s
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 p-4 md:hidden">
          {paginatedEvents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
              没有符合条件的赛事
            </div>
          ) : (
            paginatedEvents.map(event => {
              const evtStatus = getEventStatus(event.start_date, event.end_date)
              const regStatus = getRegistrationStatus(event)
              return (
                <div key={event.id} className="rounded-xl border border-border bg-background p-4 shadow-sm">
                  <button
                    className="flex w-full items-start gap-3 text-left"
                    onClick={() => onManageEvent(event.id)}
                  >
                    <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {event.poster_url ? (
                        <Image src={event.poster_url} alt={event.name} fill className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl text-muted-foreground/60">📷</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-sm font-semibold text-foreground">{event.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {event.type}{event.short_name ? ` · ${event.short_name}` : ''}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <Badge variant={evtStatus.variant} className="h-5 whitespace-nowrap px-1.5 py-0 text-[10px]">
                          比赛{evtStatus.text}
                        </Badge>
                        <Badge variant={regStatus.variant} className="h-5 whitespace-nowrap px-1.5 py-0 text-[10px]">
                          {regStatus.text}
                        </Badge>
                      </div>
                    </div>
                  </button>

                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">比赛时间</div>
                      <div className="truncate text-foreground">{formatDate(event.start_date)} 至 {formatDate(event.end_date)}</div>
                    </div>
                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={event.is_visible}
                        onCheckedChange={(checked) => onToggleVisibility(event.id, checked)}
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => onManageEvent(event.id)}>
                      <Settings className="mr-2 h-4 w-4" />
                      管理
                    </Button>
                    <Button variant="destructive" onClick={() => handleDelete(event.id)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      删除
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[136px] text-xs font-normal text-muted-foreground">海报</TableHead>
                <TableHead className="max-w-[240px] text-xs font-normal text-muted-foreground">名称</TableHead>
                <TableHead className="w-[200px] text-xs font-normal text-muted-foreground">状态</TableHead>
                <TableHead className="w-[120px] text-xs font-normal text-muted-foreground">比赛时间</TableHead>
                <TableHead className="w-[80px] text-xs font-normal text-muted-foreground">显示设置</TableHead>
                <TableHead className="w-[100px] text-xs font-normal text-muted-foreground">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    没有符合条件的赛事
                  </TableCell>
                </TableRow>
              ) : (
                paginatedEvents.map((event, index) => {
                  const evtStatus = getEventStatus(event.start_date, event.end_date)
                  const regStatus = getRegistrationStatus(event)
                  return (
                    <TableRow
                      key={event.id}
                      className={cn(
                        'group cursor-pointer border-b border-border/70',
                        index % 2 === 0 ? 'bg-background' : 'bg-muted/10',
                        'hover:bg-accent/50'
                      )}
                      onClick={() => onManageEvent(event.id)}
                    >
                      <TableCell className="py-3">
                        <div className="relative h-[68px] w-[120px] overflow-hidden rounded-lg bg-muted">
                          {event.poster_url ? (
                            <Image src={event.poster_url} alt={event.name} fill className="object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-2xl text-muted-foreground/60">📷</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="text-sm font-semibold leading-5 text-foreground">{event.name}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {event.type}{event.short_name ? ` · ${event.short_name}` : ''}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge variant={evtStatus.variant} className="h-5 w-fit whitespace-nowrap px-1.5 py-0 text-[10px]">
                            比赛{evtStatus.text}
                          </Badge>
                          <span className="text-xs text-muted-foreground/60">/</span>
                          <Badge variant={regStatus.variant} className="h-5 w-fit whitespace-nowrap px-1.5 py-0 text-[10px]">
                            {regStatus.text}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-foreground">
                          <div>{formatDate(event.start_date)}</div>
                          <div className="text-muted-foreground">至 {formatDate(event.end_date)}</div>
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={event.is_visible}
                          onCheckedChange={(checked) => onToggleVisibility(event.id, checked)}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center space-x-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onManageEvent(event.id)} title="管理">
                            <Settings className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDelete(event.id)} title="删除">
                            <Trash2 className="h-4 w-4 text-muted-foreground transition-colors hover:text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col gap-3 border-t border-border px-4 py-4 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
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
          <div className="flex items-center justify-end space-x-1">
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
                <p>请输入赛事名称 <span className="font-semibold text-foreground">{secondConfirmEvent?.name}</span> 以确认删除：</p>
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
