'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Calendar,
  MapPin,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  Filter
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
  }
  registration_settings?: {
    team_requirements?: {
      registrationEndDate?: string
    }
  }
}

function MyRegistrationsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [filteredRegistrations, setFilteredRegistrations] = useState<Registration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 获取URL中的highlight参数
    const highlight = searchParams.get('highlight')
    if (highlight) {
      setHighlightId(highlight)
      // 3秒后清除高亮效果，但不改变URL
      setTimeout(() => {
        setHighlightId(null)
        // 使用 window.history.replaceState 静默更新URL，不触发页面刷新
        const url = new URL(window.location.href)
        url.searchParams.delete('highlight')
        window.history.replaceState({}, '', url.pathname + url.search)
      }, 3000)
    }
    loadRegistrations()
  }, [])

  useEffect(() => {
    // 当高亮元素加载后滚动到该位置
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightId, filteredRegistrations])

  useEffect(() => {
    filterRegistrations()
  }, [registrations, searchTerm, statusFilter])

  const loadRegistrations = async () => {
    try {
      const supabase = createClient()

      // 获取当前用户
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
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
              registration_deadline: teamReq?.registrationEndDate
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

    // 状态过滤 - 处理 pending 和 submitted 作为同一种状态
    if (statusFilter !== 'all') {
      if (statusFilter === 'submitted') {
        // 如果筛选"待审核"，同时匹配 submitted 和 pending
        filtered = filtered.filter(reg => reg.status === 'submitted' || reg.status === 'pending')
      } else {
        filtered = filtered.filter(reg => reg.status === statusFilter)
      }
    }

    setFilteredRegistrations(filtered)
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { label: '草稿', variant: 'secondary' as const, icon: FileText },
      submitted: { label: '待审核', variant: 'default' as const, icon: Clock },
      pending: { label: '待审核', variant: 'default' as const, icon: Clock }, // 处理 pending 状态
      approved: { label: '已通过', variant: 'success' as const, icon: CheckCircle },
      rejected: { label: '已驳回', variant: 'destructive' as const, icon: XCircle },
      cancelled: { label: '已取消', variant: 'outline' as const, icon: AlertCircle }
    }

    const config = statusConfig[status] || statusConfig.draft
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
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

  const handleCancelRegistration = async (registrationId: string, e: React.MouseEvent) => {
    e.stopPropagation() // 阻止事件冒泡

    if (!confirm('确认要取消这条已通过的报名吗？\n\n取消后：\n• 您的报名状态将变为"已取消"\n• 您将失去参赛资格\n• 报名信息会保留，您可以重新提交\n\n确定要继续吗？')) {
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
        alert('报名已取消，您可以在需要时重新提交')
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
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">加载中...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">我的报名</h1>
        <p className="text-muted-foreground">查看和管理您的所有报名记录</p>
      </div>

      {/* 搜索和筛选 */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索赛事名称或队伍名称..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="w-full md:w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <SelectValue placeholder="筛选状态" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="submitted">待审核</SelectItem>
                  <SelectItem value="approved">已通过</SelectItem>
                  <SelectItem value="rejected">已驳回</SelectItem>
                  <SelectItem value="cancelled">已取消</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 报名列表 */}
      {filteredRegistrations.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">
              {searchTerm || statusFilter !== 'all'
                ? '没有找到符合条件的报名记录'
                : '暂无报名记录'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredRegistrations.map((reg) => {
            const isHighlighted = highlightId === reg.id
            return (
            <Card
              key={reg.id}
              ref={isHighlighted ? highlightRef : null}
              className={`hover:shadow-md transition-all duration-500 ${
                isHighlighted ? 'ring-2 ring-blue-500 ring-offset-2 bg-blue-50/50' : ''
              }`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3
                        className="text-lg font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                        onClick={() => router.push(`/portal/events/${reg.event_id}`)}
                      >
                        {reg.events?.name}
                      </h3>
                      {getStatusBadge(reg.status)}
                      {reg.events && getEventStatusBadge(reg.events)}
                    </div>

                    {/* 显示团队信息的前三个字段 */}
                    {reg.team_data && (
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-2">
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
                  <div className="flex gap-2 ml-4">
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
                              onClick={(e) => handleCancelRegistration(reg.id, e)}
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
                              onClick={(e) => handleCancelRegistration(reg.id, e)}
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
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                    <p className="text-sm text-red-600">
                      <strong>驳回原因:</strong> {reg.rejection_reason}
                    </p>
                  </div>
                )}

                {/* 时间信息 */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground pt-3 border-t">
                  {reg.submitted_at && (
                    <span>提交时间: {new Date(reg.submitted_at).toLocaleString('zh-CN')}</span>
                  )}
                  {reg.reviewed_at && (
                    <span>审核时间: {new Date(reg.reviewed_at).toLocaleString('zh-CN')}</span>
                  )}
                  {reg.registration_deadline && (
                    <span className="text-orange-600">
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
    <Suspense fallback={<div>加载中...</div>}>
      <MyRegistrationsContent />
    </Suspense>
  )
}