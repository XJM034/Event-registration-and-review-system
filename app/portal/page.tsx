'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { getSessionUserWithRetry, withTimeout } from '@/lib/supabase/client-auth'
import type { User } from '@supabase/supabase-js'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Event {
  id: string
  name: string
  short_name?: string
  poster_url?: string
  type: string
  start_date: string
  end_date: string
  address?: string
  is_visible: boolean
  registration_settings?: {
    team_requirements?: {
      registrationStartDate?: string
      registrationEndDate?: string
      reviewEndDate?: string
      [key: string]: any
    }
    [key: string]: any
  }
}

type HomeTab = 'all' | 'registering' | 'ended' | 'mine'
type EventPhaseKey = 'upcoming' | 'registering' | 'reviewing' | 'ended'

const HOME_TABS: Array<{ value: HomeTab; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'registering', label: '报名中' },
  { value: 'ended', label: '已结束' },
  { value: 'mine', label: '我的报名' },
]

const PHASE_STYLE_MAP: Record<EventPhaseKey, string> = {
  upcoming: 'border border-border bg-muted text-muted-foreground',
  registering: 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  reviewing: 'border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  ended: 'border border-border bg-muted text-muted-foreground',
}

function normalizeHomeTab(tab: string | null): HomeTab {
  if (tab === 'registering' || tab === 'ended' || tab === 'mine') {
    return tab
  }
  return 'all'
}

function parseTeamRequirements(event: Event) {
  let teamReq = event.registration_settings?.team_requirements

  if (typeof teamReq === 'string') {
    try {
      teamReq = JSON.parse(teamReq)
    } catch {
      return null
    }
  }

  return teamReq || null
}

function getEventPhase(event: Event) {
  const now = new Date()
  const teamReq = parseTeamRequirements(event)
  const eventStart = new Date(event.start_date)
  const eventEnd = new Date(event.end_date)

  if (teamReq?.registrationStartDate && teamReq?.registrationEndDate) {
    const regStart = new Date(teamReq.registrationStartDate)
    const regEnd = new Date(teamReq.registrationEndDate)
    const reviewEnd = teamReq.reviewEndDate ? new Date(teamReq.reviewEndDate) : null

    if (now < regStart) {
      return { key: 'upcoming' as const, label: '未开始' }
    }

    if (now <= regEnd) {
      return { key: 'registering' as const, label: '报名中' }
    }

    if (reviewEnd && now <= reviewEnd) {
      return { key: 'reviewing' as const, label: '审核中' }
    }

    return { key: 'ended' as const, label: '已结束' }
  }

  if (now < eventStart) {
    return { key: 'upcoming' as const, label: '未开始' }
  }

  if (now <= eventEnd) {
    return { key: 'reviewing' as const, label: '进行中' }
  }

  return { key: 'ended' as const, label: '已结束' }
}

type ActionVariant = 'default' | 'outline' | 'secondary'
const EVENTS_API_TIMEOUT_MS = 5000
const COACH_QUERY_TIMEOUT_MS = 4000

export default function PortalHomePage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [events, setEvents] = useState<Event[]>([])
  const [myRegisteredEventIds, setMyRegisteredEventIds] = useState<string[]>([])
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const hasFetchedRef = useRef(false)
  const activeTab = normalizeHomeTab(searchParams.get('tab'))

  useEffect(() => {
    if (hasFetchedRef.current) {
      return
    }
    hasFetchedRef.current = true
    fetchEvents()
  }, [])

  const handleTabChange = (value: string) => {
    const nextTab = normalizeHomeTab(value)
    const params = new URLSearchParams(searchParams.toString())

    if (nextTab === 'all') {
      params.delete('tab')
    } else {
      params.set('tab', nextTab)
    }

    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
    router.replace(nextUrl, { scroll: false })
  }

  const fetchMyRegisteredEventIds = async (supabase: ReturnType<typeof createClient>, user: User | null) => {
    if (!user) {
      return []
    }

    try {
      const { data: coach } = await withTimeout(
        supabase
          .from('coaches')
          .select('id')
          .eq('auth_id', user.id)
          .maybeSingle(),
        COACH_QUERY_TIMEOUT_MS,
        'Coach lookup timed out'
      )

      if (!coach) {
        return []
      }

      const { data: registrations } = await withTimeout(
        supabase
          .from('registrations')
          .select('event_id')
          .eq('coach_id', coach.id)
          .neq('status', 'cancelled'),
        COACH_QUERY_TIMEOUT_MS,
        'Coach registration lookup timed out'
      )

      const eventIds = (registrations || []).map((registration) => registration.event_id)
      return Array.from(new Set(eventIds))
    } catch {
      return []
    }
  }

  const fetchEvents = async (retryCount = 0) => {
    try {
      const supabase = createClient()
      const { user, error: sessionError, isNetworkError } = await getSessionUserWithRetry(supabase, {
        maxRetries: 2,
        baseDelayMs: 300,
      })

      if (sessionError && isNetworkError) {
        if (retryCount < 2) {
          setTimeout(() => fetchEvents(retryCount + 1), (retryCount + 1) * 900)
        }
        return
      }

      if (!user) {
        if (retryCount < 2) {
          setTimeout(() => fetchEvents(retryCount + 1), (retryCount + 1) * 500)
          return
        }

        router.push('/auth/login')
        return
      }

      const myEventIdsPromise = fetchMyRegisteredEventIds(supabase, user).catch(() => [])

      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
      }, EVENTS_API_TIMEOUT_MS)

      let response: Response
      try {
        response = await fetch('/api/portal/events', {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }

      if (!response.ok) {
        if (response.status === 401) {
          const { user: verifiedUser, error: verifyError, isNetworkError: verifyIsNetworkError } = await getSessionUserWithRetry(supabase, {
            maxRetries: 1,
            baseDelayMs: 300,
          })

          if (verifyError && verifyIsNetworkError) {
            if (retryCount < 2) {
              setTimeout(() => fetchEvents(retryCount + 1), (retryCount + 1) * 900)
            }
            return
          }

          if (!verifiedUser) {
            router.push('/auth/login')
            return
          }

          if (retryCount < 2) {
            setTimeout(() => fetchEvents(retryCount + 1), (retryCount + 1) * 700)
            return
          }

          return
        }

        if (retryCount < 2 && (response.status === 500 || response.status === 503)) {
          setTimeout(() => fetchEvents(retryCount + 1), (retryCount + 1) * 1500)
          return
        }
      }

      const result = await response.json()

      if (result.success) {
        const visibleEvents = result.data.filter((event: Event) => event.is_visible)
        setEvents(visibleEvents)
        const myEventIds = await withTimeout(
          myEventIdsPromise,
          COACH_QUERY_TIMEOUT_MS,
          'My registration ids lookup timed out'
        ).catch(() => [])
        setMyRegisteredEventIds(myEventIds)
      } else if (retryCount < 1) {
        setTimeout(() => fetchEvents(retryCount + 1), 1000)
        return
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (retryCount < 1) {
          setTimeout(() => fetchEvents(retryCount + 1), 800)
          return
        }
      }

      if (retryCount < 1) {
        setTimeout(() => fetchEvents(retryCount + 1), 1500)
        return
      }
    } finally {
      setIsLoading(false)
    }
  }

  const myRegisteredEventSet = useMemo(
    () => new Set(myRegisteredEventIds),
    [myRegisteredEventIds]
  )

  const eventTypes = useMemo(() => {
    const types = new Set<string>()
    events.forEach((event) => {
      if (event.type) {
        types.add(event.type)
      }
    })
    return Array.from(types).sort()
  }, [events])

  const handleEventTypeToggle = (type: string) => {
    setSelectedEventTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const tabCounts = useMemo(() => {
    const counts = {
      all: events.length,
      registering: 0,
      ended: 0,
      mine: 0,
    }

    events.forEach((event) => {
      const phase = getEventPhase(event)

      if (phase.key === 'registering') {
        counts.registering += 1
      }

      if (phase.key === 'ended') {
        counts.ended += 1
      }

      if (myRegisteredEventSet.has(event.id)) {
        counts.mine += 1
      }
    })

    return counts
  }, [events, myRegisteredEventSet])

  const filteredEvents = useMemo(() => {
    let nextEvents = [...events]

    if (selectedEventTypes.length > 0) {
      nextEvents = nextEvents.filter((event) => selectedEventTypes.includes(event.type))
    }

    if (activeTab === 'registering') {
      nextEvents = nextEvents.filter((event) => getEventPhase(event).key === 'registering')
    }

    if (activeTab === 'ended') {
      nextEvents = nextEvents.filter((event) => getEventPhase(event).key === 'ended')
    }

    if (activeTab === 'mine') {
      nextEvents = nextEvents.filter((event) => myRegisteredEventSet.has(event.id))
    }

    const sortPriority: Record<EventPhaseKey, number> = {
      registering: 1,
      reviewing: 2,
      upcoming: 3,
      ended: 4,
    }

    nextEvents.sort((a, b) => {
      const phaseA = getEventPhase(a)
      const phaseB = getEventPhase(b)
      if (phaseA.key !== phaseB.key) {
        return sortPriority[phaseA.key] - sortPriority[phaseB.key]
      }
      return new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
    })

    return nextEvents
  }, [activeTab, events, myRegisteredEventSet, selectedEventTypes])

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('zh-CN')

  const handleEventClick = (eventId: string) => {
    router.push(`/portal/events/${eventId}`)
  }

  const getActionConfig = (event: Event) => {
    const phase = getEventPhase(event)
    const hasMyRegistration = myRegisteredEventSet.has(event.id)

    if (hasMyRegistration) {
      return {
        label: '查看我的报名',
        variant: 'outline' as ActionVariant,
        disabled: false,
        className: 'border border-primary/20 bg-background text-primary hover:bg-primary/10 hover:text-primary',
        onClick: () => router.push(`/portal/events/${event.id}?scrollTo=my-registration`),
      }
    }

    if (phase.key === 'registering') {
      return {
        label: '去报名',
        variant: 'default' as ActionVariant,
        disabled: false,
        className: 'bg-primary text-primary-foreground hover:bg-primary/90',
        onClick: () => router.push(`/portal/events/${event.id}?scrollTo=my-registration`),
      }
    }

    if (phase.key === 'reviewing') {
      return {
        label: '查看详情',
        variant: 'outline' as ActionVariant,
        disabled: false,
        className: 'border border-amber-500/20 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200',
        onClick: () => router.push(`/portal/events/${event.id}`),
      }
    }

    if (phase.key === 'upcoming') {
      return {
        label: '报名未开始',
        variant: 'secondary' as ActionVariant,
        disabled: true,
        className: 'bg-muted text-muted-foreground',
        onClick: () => undefined,
      }
    }

    return {
      label: '已结束',
      variant: 'secondary' as ActionVariant,
      disabled: true,
      className: 'bg-muted text-muted-foreground',
      onClick: () => undefined,
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Skeleton className="h-10 w-full md:w-96" />
          <Skeleton className="h-10 w-full md:w-64" />
        </div>
        <Skeleton className="h-12 w-full md:w-[460px]" />
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid h-auto w-full grid-cols-2 md:w-[460px] md:grid-cols-4">
            {HOME_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                <span className="ml-1 text-xs text-muted-foreground">{tabCounts[tab.value]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full md:w-auto">
              <Filter className="mr-2 h-4 w-4" />
              赛事类型
              {selectedEventTypes.length > 0 && (
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {selectedEventTypes.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {eventTypes.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">暂无赛事类型</div>
            ) : (
              eventTypes.map((type) => (
                <DropdownMenuCheckboxItem
                  key={type}
                  checked={selectedEventTypes.includes(type)}
                  onCheckedChange={() => handleEventTypeToggle(type)}
                >
                  {type}
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div key={activeTab} className="animate-in fade-in-0 duration-200">
        {filteredEvents.length === 0 ? (
          <div className="rounded-xl border border-border/60 bg-card p-12">
            <div className="text-center text-muted-foreground">
              <Calendar className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-lg">暂无赛事活动</p>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {filteredEvents.map((event) => {
                const phase = getEventPhase(event)
                const action = getActionConfig(event)

                return (
                  <div
                    key={event.id}
                    className="rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <button
                      className="mb-3 flex w-full items-start gap-3 text-left"
                      onClick={() => handleEventClick(event.id)}
                    >
                      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                        {event.poster_url ? (
                          <Image
                            src={event.poster_url}
                            alt="赛事海报"
                            fill
                            sizes="64px"
                            unoptimized
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <Calendar className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{event.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDate(event.start_date)} - {formatDate(event.end_date)}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{event.address || '地点待更新'}</p>
                      </div>
                    </button>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', PHASE_STYLE_MAP[phase.key])}>
                        {phase.label}
                      </span>
                      <Button
                        variant={action.variant}
                        size="sm"
                        disabled={action.disabled}
                        className={cn('h-8 px-3 transition-all active:scale-95', action.className)}
                        onClick={action.onClick}
                      >
                        {action.label}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="hidden min-w-0 overflow-hidden rounded-xl border border-border/60 bg-card md:block">
              <div className="max-h-[calc(100vh-220px)] w-full overflow-auto">
                <Table className="min-w-[800px]">
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">封面</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">名称</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">类型</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">比赛地点</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">报名阶段</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.map((event, index) => {
                      const phase = getEventPhase(event)
                      const action = getActionConfig(event)

                      return (
                        <TableRow
                          key={event.id}
                          className={cn(index % 2 === 0 ? 'bg-background' : 'bg-muted/20', 'cursor-pointer transition-colors hover:bg-accent/50')}
                          onClick={() => handleEventClick(event.id)}
                        >
                          <TableCell>
                            <div className="relative h-14 w-14 overflow-hidden rounded-md bg-muted">
                              {event.poster_url ? (
                                <Image
                                  src={event.poster_url}
                                  alt="赛事海报"
                                  fill
                                  sizes="56px"
                                  unoptimized
                                  className="object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                  <Calendar className="h-5 w-5" />
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[280px] truncate font-medium text-foreground">{event.name}</div>
                          </TableCell>
                          <TableCell>{event.type}</TableCell>
                          <TableCell>
                            <div className="max-w-[260px] truncate text-muted-foreground">{event.address || '-'}</div>
                          </TableCell>
                          <TableCell>
                            <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', PHASE_STYLE_MAP[phase.key])}>
                              {phase.label}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant={action.variant}
                              size="sm"
                              disabled={action.disabled}
                              className={cn('h-8 px-3 transition-all active:scale-95', action.className)}
                              onClick={(eventObject) => {
                                eventObject.stopPropagation()
                                action.onClick()
                              }}
                            >
                              {action.label}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
