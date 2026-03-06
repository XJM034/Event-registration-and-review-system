'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getSessionUserWithRetry } from '@/lib/supabase/client-auth'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Calendar,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
} from 'lucide-react'

interface Registration {
  id: string
  event_id: string
  team_data: any
  players_data: any
  status: 'draft' | 'submitted' | 'pending' | 'approved' | 'rejected' | 'cancelled'
  rejection_reason?: string
  submitted_at?: string
  reviewed_at?: string
  created_at: string
  registration_deadline?: string
  events?: {
    name: string
    start_date: string
    end_date: string
    address?: string
    type: string
    registration_settings?: {
      team_requirements?: {
        registrationEndDate?: string
      }
    }
  }
}

type RegistrationStatus = Registration['status']
type RegistrationFilterTab = 'all' | 'pending' | 'approved' | 'rejected'

const REGISTRATION_TABS: Array<{ value: RegistrationFilterTab; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已拒绝' },
]

function normalizeRegistrationTab(tab: string | null): RegistrationFilterTab {
  if (tab === 'pending' || tab === 'approved' || tab === 'rejected') {
    return tab
  }
  return 'all'
}

function MyRegistrationsContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [filteredRegistrations, setFilteredRegistrations] = useState<Registration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const activeTab = normalizeRegistrationTab(searchParams.get('tab'))
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadRegistrations(true)
  }, [])

  useEffect(() => {
    const highlight = searchParams.get('highlight')
    if (highlight) {
      setHighlightId(highlight)
      setTimeout(() => {
        setHighlightId(null)
        const url = new URL(window.location.href)
        url.searchParams.delete('highlight')
        window.history.replaceState({}, '', url.pathname + url.search)
      }, 3000)
    }

  }, [searchParams])

  useEffect(() => {
    // 当高亮元素加载后滚动到该位置
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightId, filteredRegistrations])

  useEffect(() => {
    filterRegistrations()
  }, [registrations, searchTerm, activeTab])

  const handleTabChange = (value: string) => {
    const nextTab = normalizeRegistrationTab(value)
    const params = new URLSearchParams(searchParams.toString())

    if (nextTab === 'all') {
      params.delete('tab')
    } else {
      params.set('tab', nextTab)
    }

    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
    router.replace(nextUrl, { scroll: false })
  }

  const loadRegistrations = async (showLoading = false) => {
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
        console.error('获取会话失败:', authError)
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
        // 获取报名记录和报名设置
        const { data: regs } = await supabase
          .from('registrations')
          .select(`
            *,
            events (
              id,
              name,
              start_date,
              end_date,
              address,
              type
            )
          `)
          .eq('coach_id', coach.id)
          .order('updated_at', { ascending: false })

        if (regs) {
          // 获取每个赛事的报名设置
          const eventIds = [...new Set(regs.map(r => r.event_id))]
          const { data: settings } = await supabase
            .from('registration_settings')
            .select('event_id, team_requirements')
            .in('event_id', eventIds)

          // 合并报名设置到报名记录
          const regsWithSettings = regs.map(reg => {
            const setting = settings?.find(s => s.event_id === reg.event_id)
            let teamReq = setting?.team_requirements

            // 如果 team_requirements 是字符串（JSON格式），需要解析
            if (typeof teamReq === 'string') {
              try {
                teamReq = JSON.parse(teamReq)
              } catch (e) {
                console.error('解析 team_requirements 失败:', e)
              }
            }

            return {
              ...reg,
              registration_deadline: teamReq?.registrationEndDate,
              // 将 registration_settings 合并到 events 对象中，供 handleCancelRegistration 使用
              events: {
                ...reg.events,
                registration_settings: {
                  team_requirements: teamReq
                }
              }
            }
          })

          setRegistrations(regsWithSettings)
        }

      }
    } catch (error) {
      console.error('加载报名记录失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filterRegistrations = () => {
    let filtered = [...registrations]

    // 搜索过滤
    if (searchTerm) {
      filtered = filtered.filter(reg =>
        reg.events?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        reg.team_data?.team_name?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (activeTab !== 'all') {
      if (activeTab === 'pending') {
        filtered = filtered.filter(reg => reg.status === 'submitted' || reg.status === 'pending')
      } else {
        filtered = filtered.filter(reg => reg.status === activeTab)
      }
    }

    setFilteredRegistrations(filtered)
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<RegistrationStatus, {
      label: string
      variant: 'default' | 'secondary' | 'destructive' | 'outline'
      icon: typeof FileText
      className?: string
    }> = {
      draft: { label: '草稿', variant: 'secondary', icon: FileText, className: 'border-border bg-muted text-muted-foreground' },
      submitted: { label: '待审核', variant: 'default', icon: Clock, className: 'border-amber-500/20 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300' },
      pending: { label: '待审核', variant: 'default', icon: Clock, className: 'border-amber-500/20 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300' },
      approved: { label: '已通过', variant: 'default', icon: CheckCircle, className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300' },
      rejected: { label: '已拒绝', variant: 'outline', icon: XCircle, className: 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300' },
      cancelled: { label: '已取消', variant: 'outline', icon: AlertCircle, className: 'border-border bg-muted text-muted-foreground' }
    }

    const statusKey: RegistrationStatus = status in statusConfig
      ? status as RegistrationStatus
      : 'draft'
    const config = statusConfig[statusKey]
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className={`flex items-center gap-1 ${config.className || ''}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    )
  }

  const getEventStatusBadge = (event: { start_date: string, end_date: string }) => {
    const now = new Date()
    const start = new Date(event.start_date)
    const end = new Date(event.end_date)

    if (now < start) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          未开始
        </Badge>
      )
    } else if (now <= end) {
      return (
        <Badge variant="default" className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          进行中
        </Badge>
      )
    } else {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          已结束
        </Badge>
      )
    }
  }

  const isEventEnded = (event: { end_date: string }) => {
    const now = new Date()
    const end = new Date(event.end_date)
    return now > end
  }

  const handleDeleteRegistration = async (registrationId: string, e: React.MouseEvent) => {
    e.stopPropagation() // 阻止事件冒泡，避免触发卡片点击

    if (!confirm('确认要删除这条报名信息吗？删除后需要重新填写。')) {
      return
    }

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('registrations')
        .delete()
        .eq('id', registrationId)

      if (error) {
        console.error('删除失败:', error)
        alert('删除失败，请重试')
      } else {
        alert('删除成功')
        // 重新加载报名数据
        await loadRegistrations()
      }
    } catch (error) {
      console.error('删除报名失败:', error)
      alert('删除失败，请重试')
    }
  }

  const handleCancelRegistration = async (registrationId: string, status: string, eventData: any, e: React.MouseEvent) => {
    e.stopPropagation() // 阻止事件冒泡

    // 判断当前是否在"报名中"期间（未到审核期）
    const isInRegistrationPeriod = () => {
      const now = new Date()
      const teamReq = eventData?.registration_settings?.team_requirements
      if (!teamReq) return true // 没有设置时间，默认为报名中

      const regEndDate = teamReq.registrationEndDate
      const regEnd = regEndDate ? new Date(regEndDate) : null

      // 如果当前时间小于等于报名结束时间，则在报名中期间
      return regEnd ? now <= regEnd : true
    }

    // 根据报名状态和时间阶段显示不同的提示信息
    let confirmMessage = ''
    if (status === 'draft') {
      // 草稿状态
      confirmMessage = '确认要取消这条报名吗？\n\n取消后：\n• 您的报名状态将变为"已取消"\n• 本条报名信息将不进入报名资料库并失去参赛资格\n• 本条报名信息可以重新提交\n\n确定要继续吗？'
    } else if (status === 'pending' || status === 'submitted') {
      // 待审核状态 - 根据时间阶段显示不同信息
      if (isInRegistrationPeriod()) {
        // 报名中期间的待审核
        confirmMessage = '确认要取消这条待审核的报名吗？\n\n取消后：\n• 您的报名状态将变为"已取消"\n• 本条报名信息将不进入报名资料库并失去参赛资格\n• 本条报名信息可以重新提交\n\n确定要继续吗？'
      } else {
        // 审核期的待审核
        confirmMessage = '确认要取消这条待审核的报名吗？\n\n取消后：\n• 您的报名状态将变为"已取消"\n• 您将失去参赛资格\n• 您的报名信息将无法重新提交\n\n确定要继续吗？'
      }
    } else if (status === 'approved') {
      // 已通过状态 - 根据时间阶段显示不同信息
      if (isInRegistrationPeriod()) {
        // 报名中期间的已通过
        confirmMessage = '确认要取消这条已通过的报名吗？\n\n取消后：\n• 您的报名状态将变为"已取消"\n• 本条报名信息将不进入报名资料库并失去参赛资格\n• 本条报名信息可以重新提交\n\n确定要继续吗？'
      } else {
        // 审核期的已通过
        confirmMessage = '确认要取消这条已通过的报名吗？\n\n取消后：\n• 您的报名状态将变为"已取消"\n• 您将失去参赛资格\n• 您的报名信息将无法重新提交\n\n确定要继续吗？'
      }
    } else {
      confirmMessage = '确认要取消这条报名吗？'
    }

    if (!confirm(confirmMessage)) {
      return
    }

    try {
      const supabase = createClient()

      // 更新状态为已取消
      const { error } = await supabase
        .from('registrations')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        })
        .eq('id', registrationId)

      if (error) {
        console.error('取消报名失败:', error)
        alert(`取消报名失败：${error.message || '请重试'}`)
      } else {
        alert('报名已取消')
        // 重新加载报名数据
        await loadRegistrations()
      }
    } catch (error) {
      console.error('取消报名失败:', error)
      alert('取消报名失败，请重试')
    }
  }

  const handleEditRegistration = (eventId: string, registrationId: string, event: any, e: React.MouseEvent) => {
    e.stopPropagation() // 阻止事件冒泡

    // 检查赛事是否已结束
    const now = new Date()
    const end = new Date(event.end_date)
    const isEventEnded = now > end

    if (isEventEnded) {
      // 已结束的赛事，添加ended=true参数
      router.push(`/portal/events/${eventId}/register?edit=${registrationId}&ended=true`)
    } else {
      // 未结束的赛事，正常跳转
      router.push(`/portal/events/${eventId}/register?edit=${registrationId}`)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-10 w-full md:w-[360px]" />
        <Skeleton className="h-12 w-full md:w-[420px]" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    )
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="space-y-4 py-10 text-center">
          <p className="text-muted-foreground">{loadError}</p>
          <Button onClick={() => loadRegistrations(true)}>重试</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">我的报名</h1>
        <p className="text-muted-foreground">查看和管理您的所有报名记录</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="space-y-4">
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="grid h-auto w-full grid-cols-2 md:w-[420px] md:grid-cols-4">
                {REGISTRATION_TABS.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="relative w-full md:w-[360px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索赛事名称或队伍名称..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {filteredRegistrations.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">
              {searchTerm || activeTab !== 'all'
                ? '没有找到符合条件的报名记录'
                : '暂无报名记录'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div key={activeTab} className="grid gap-4 animate-in fade-in-0 duration-200">
          {filteredRegistrations.map((reg) => {
            const isHighlighted = highlightId === reg.id
            return (
            <Card
              key={reg.id}
              ref={isHighlighted ? highlightRef : null}
              className={`border-border/60 bg-card shadow-sm transition-all duration-500 hover:shadow-md ${
                isHighlighted ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background bg-primary/5' : ''
              }`}
            >
              <CardContent className="p-4 sm:p-6">
                <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <h3
                        className="cursor-pointer text-lg font-semibold transition-colors hover:text-primary hover:underline"
                        onClick={() => router.push(`/portal/events/${reg.event_id}`)}
                      >
                        {reg.events?.name}
                      </h3>
                      {getStatusBadge(reg.status)}
                      {reg.events && getEventStatusBadge(reg.events)}
                    </div>

                    {/* 显示团队信息的前三个字段 */}
                    {reg.team_data && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        {Object.entries(reg.team_data)
                          .filter(([key]) => key !== 'id' && key !== 'team_logo' && key !== 'logo') // 排除ID和图片字段
                          .slice(0, 3) // 只取前3个字段
                          .map(([key, value], index) => (
                            <div key={key} className="flex items-center gap-1">
                              {index > 0 && <span className="text-muted-foreground/50">•</span>}
                              <span className="font-medium">
                                {typeof value === 'string' || typeof value === 'number' ? value : '-'}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex w-full flex-wrap gap-2 lg:ml-4 lg:w-auto lg:justify-end">
                    {/* 赛事已结束时的操作逻辑 */}
                    {reg.events && isEventEnded(reg.events) ? (
                      <>
                        {/* 已结束赛事：草稿和已取消状态可以删除，其他状态只能查看 */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => handleEditRegistration(reg.event_id, reg.id, reg.events, e)}
                        >
                          查看报名
                        </Button>
                        {(reg.status === 'draft' || reg.status === 'cancelled') && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(e) => handleDeleteRegistration(reg.id, e)}
                          >
                            删除报名
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        {/* 赛事未结束时的正常操作逻辑 */}

                        {/* 草稿状态 */}
                        {reg.status === 'draft' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => handleEditRegistration(reg.event_id, reg.id, reg.events, e)}
                            >
                              继续编辑
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(e) => handleDeleteRegistration(reg.id, e)}
                            >
                              删除报名
                            </Button>
                          </>
                        )}

                        {/* 已驳回状态 */}
                        {reg.status === 'rejected' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => handleEditRegistration(reg.event_id, reg.id, reg.events, e)}
                            >
                              重新报名
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(e) => handleDeleteRegistration(reg.id, e)}
                            >
                              删除报名
                            </Button>
                          </>
                        )}

                        {/* 已通过状态 */}
                        {reg.status === 'approved' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => handleEditRegistration(reg.event_id, reg.id, reg.events, e)}
                            >
                              查看报名
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(e) => handleCancelRegistration(reg.id, reg.status, reg.events, e)}
                            >
                              取消报名
                            </Button>
                          </>
                        )}

                        {/* 已取消状态 */}
                        {reg.status === 'cancelled' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => handleEditRegistration(reg.event_id, reg.id, reg.events, e)}
                            >
                              重新报名
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(e) => handleDeleteRegistration(reg.id, e)}
                            >
                              删除报名
                            </Button>
                          </>
                        )}

                        {/* 待审核状态 */}
                        {(reg.status === 'submitted' || reg.status === 'pending') && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => handleEditRegistration(reg.event_id, reg.id, reg.events, e)}
                            >
                              查看报名
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(e) => handleCancelRegistration(reg.id, reg.status, reg.events, e)}
                            >
                              取消报名
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* 驳回原因 */}
                {reg.status === 'rejected' && reg.rejection_reason && (
                  <div className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3">
                    <p className="text-sm text-rose-700 dark:text-rose-300">
                      <strong>驳回原因:</strong> {reg.rejection_reason}
                    </p>
                  </div>
                )}

                {/* 时间信息 */}
                <div className="flex flex-col gap-2 border-t pt-3 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                  {reg.submitted_at && (
                    <span>提交时间: {new Date(reg.submitted_at).toLocaleString('zh-CN')}</span>
                  )}
                  {reg.reviewed_at && (
                    <span>审核时间: {new Date(reg.reviewed_at).toLocaleString('zh-CN')}</span>
                  )}
                  {reg.registration_deadline && (
                    <span className="text-amber-700 dark:text-amber-300">
                      报名截止: {new Date(reg.registration_deadline).toLocaleString('zh-CN')}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function MyRegistrationsPage() {
  return (
    <Suspense fallback={<div className="space-y-3"><Skeleton className="h-10 w-48" /><Skeleton className="h-32 w-full" /></div>}>
      <MyRegistrationsContent />
    </Suspense>
  )
}
