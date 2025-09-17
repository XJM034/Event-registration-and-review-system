'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, MapPin, Phone, Clock, Users, ArrowLeft, FileText, AlertCircle } from 'lucide-react'
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
  requirements?: string
  phone?: string
  is_visible: boolean
  registration_settings?: {
    team_requirements?: {
      registrationStartDate?: string
      registrationEndDate?: string
      commonFields?: any[]
      customFields?: any[]
    }
    player_requirements?: {
      roles?: any[]
      genderRequirement?: string
      ageRequirementEnabled?: boolean
      countRequirementEnabled?: boolean
      minCount?: number
      maxCount?: number
    }
  }
}

interface Registration {
  id: string
  event_id: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  team_data: any
  players_data: any
  submitted_at: string
  created_at?: string
  rejection_reason?: string
  reviewed_at?: string
  last_status_read_at?: string
  last_status_change?: string  // 状态变更时间
  cancelled_at?: string
}

export default function EventDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventId = params.id as string

  const [event, setEvent] = useState<Event | null>(null)
  const [registration, setRegistration] = useState<Registration | null>(null)
  const [allRegistrations, setAllRegistrations] = useState<Registration[]>([])  // 存储所有报名记录
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (eventId) {
      fetchEventDetails()
      checkRegistration()
    }
  }, [eventId])

  // 监听页面获得焦点，重新检查报名状态（用于从报名页面返回时更新状态）
  useEffect(() => {
    const handleFocus = () => {
      checkRegistration()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [eventId])

  // 定期检查报名状态更新（每30秒检查一次）
  useEffect(() => {
    const interval = setInterval(() => {
      checkRegistration()
    }, 30000) // 30秒

    return () => clearInterval(interval)
  }, [eventId])

  const fetchEventDetails = async () => {
    try {
      // 获取赛事详情
      const response = await fetch(`/api/portal/events`)
      const result = await response.json()
      
      if (result.success) {
        const eventData = result.data.find((e: Event) => e.id === eventId)
        if (eventData) {
          setEvent(eventData)
        }
      }
    } catch (error) {
      console.error('获取赛事详情失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const checkRegistration = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // 获取教练信息
        const { data: coach } = await supabase
          .from('coaches')
          .select('*')
          .eq('auth_id', user.id)
          .single()

        if (coach) {
          // 获取所有报名记录（支持多个报名）
          const { data: allRegistrations, error } = await supabase
            .from('registrations')
            .select('*')
            .eq('event_id', eventId)
            .eq('coach_id', coach.id)
            .order('created_at', { ascending: false })

          if (error) {
            console.error('获取报名信息失败:', error)
            return
          }

          if (allRegistrations && allRegistrations.length > 0) {
            // 优先显示已通过的，然后是待审核的，然后是被驳回的，最后是草稿
            const sortedRegistrations = allRegistrations.sort((a, b) => {
              const statusOrder = { 'approved': 0, 'pending': 1, 'rejected': 2 }
              // 按状态排序
              return (statusOrder[a.status] || 3) - (statusOrder[b.status] || 3)
            })

            const primaryReg = sortedRegistrations[0]
            console.log('获取到的报名信息:', {
              total: allRegistrations.length,
              primary: {
                id: primaryReg.id,
                status: primaryReg.status,
                reviewed_at: primaryReg.reviewed_at,
                last_status_read_at: primaryReg.last_status_read_at,
                last_status_change: primaryReg.last_status_change
              },
              allRegistrations: allRegistrations
            })

            // 设置主要显示的报名（用于显示状态）
            setRegistration(primaryReg)

            // 存储所有报名记录
            setAllRegistrations(allRegistrations)
          } else {
            setRegistration(null)
            setAllRegistrations([])
          }
        }
      }
    } catch (error) {
      console.error('检查报名状态失败:', error)
    }
  }

  const getEventStatus = () => {
    if (!event) return null
    
    const now = new Date()
    const start = new Date(event.start_date)
    const end = new Date(event.end_date)

    if (now < start) {
      return { text: '未开始', variant: 'secondary' as const }
    } else if (now <= end) {
      return { text: '进行中', variant: 'default' as const }
    } else {
      return { text: '已结束', variant: 'destructive' as const }
    }
  }

  // 右上角按钮逻辑：只判断是否可以新建报名，不考虑现有报名状态
  const getNewRegistrationStatus = () => {
    if (!event) return null

    let teamReq = event.registration_settings?.team_requirements

    // 如果 team_requirements 是字符串（JSON格式），需要解析
    if (typeof teamReq === 'string') {
      try {
        teamReq = JSON.parse(teamReq)
      } catch (e) {
        console.error('解析 team_requirements 失败:', e)
      }
    }

    const regStartDate = teamReq?.registrationStartDate
    const regEndDate = teamReq?.registrationEndDate

    if (!regStartDate || !regEndDate) {
      return { canRegister: false, text: '未设置报名时间', variant: 'secondary' as const }
    }

    const now = new Date()
    const regStart = new Date(regStartDate)
    const regEnd = new Date(regEndDate)

    if (now < regStart) {
      return { canRegister: false, text: '报名未开始', variant: 'secondary' as const }
    } else if (now <= regEnd) {
      return { canRegister: true, text: '新建报名', variant: 'default' as const }
    } else {
      return { canRegister: false, text: '报名已结束', variant: 'destructive' as const }
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  const handleRegister = () => {
    // 新建报名：直接跳转到报名页面，开启全新的报名流程
    router.push(`/portal/events/${eventId}/register?new=true`)
  }

  const handleContinueRegistration = () => {
    // 继续报名：基于现有报名继续填写
    router.push(`/portal/events/${eventId}/register`)
  }


  // 我的报名标签页的状态逻辑：基于现有报名状态显示不同操作
  const getMyRegistrationStatus = () => {
    if (!event || !registration) return null
    
    const regEndDate = event.registration_settings?.team_requirements?.registrationEndDate
    const now = new Date()
    const regEnd = regEndDate ? new Date(regEndDate) : null
    const isRegistrationOpen = regEnd ? now <= regEnd : false
    
    // 检查registration_type字段（草稿/已提交）
    if (registration.status === 'draft') {
      return { 
        canContinue: isRegistrationOpen, 
        text: '继续报名', 
        variant: 'default' as const,
        showDelete: true
      }
    } else if (registration.status === 'pending') {
      // 再检查审核状态
      switch (registration.status) {
        case 'pending':
          return { 
            canContinue: false, 
            text: '待审核', 
            variant: 'default' as const,
            showDelete: false
          }
        case 'approved':
          return { 
            canContinue: false, 
            text: '已通过', 
            variant: 'success' as const,
            showDelete: false
          }
        case 'rejected':
          return { 
            canContinue: isRegistrationOpen, 
            text: '重新报名', 
            variant: 'destructive' as const,
            showDelete: false
          }
        default:
          return { 
            canContinue: false, 
            text: '待审核', 
            variant: 'default' as const,
            showDelete: false
          }
      }
    }
    return null
  }

  const handleDeleteRegistration = async (registrationId: string) => {
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
        // 重新加载所有报名数据
        await checkRegistration()
      }
    } catch (error) {
      console.error('删除报名失败:', error)
      alert('删除失败，请重试')
    }
  }

  const handleCancelRegistration = async (registrationId: string) => {
    if (!confirm('确认要取消这条已通过的报名吗？\n\n取消后：\n• 您的报名状态将变为"已取消"\n• 您将失去参赛资格\n• 报名信息会保留，您可以重新提交\n\n确定要继续吗？')) {
      return
    }

    try {
      const supabase = createClient()

      // 更新状态为已取消（保留记录但标记为已取消）
      const { error } = await supabase
        .from('registrations')
        .update({
          status: 'cancelled',  // 更新状态为已取消
          cancelled_at: new Date().toISOString()  // 记录取消时间
        })
        .eq('id', registrationId)

      if (error) {
        console.error('取消报名失败:', error)
        alert(`取消报名失败：${error.message || '请重试'}`)
      } else {
        alert('报名已取消，您可以在需要时重新提交')
        // 重新加载所有报名数据
        await checkRegistration()
      }
    } catch (error) {
      console.error('取消报名失败:', error)
      alert('取消报名失败，请重试')
    }
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

  if (!event) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-lg text-gray-600">赛事不存在或已下架</p>
          <Button className="mt-4" onClick={() => router.push('/portal')}>
            返回赛事列表
          </Button>
        </div>
      </div>
    )
  }

  const eventStatus = getEventStatus()
  const newRegStatus = getNewRegistrationStatus()

  return (
    <div className="space-y-6">
      {/* 头部导航 */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => router.push('/portal')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          返回赛事列表
        </Button>
      </div>

      {/* 赛事信息卡片 - 包含所有赛事相关信息 */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex gap-6">
            {/* 海报 */}
            {event.poster_url && (
              <div className="flex-shrink-0">
                <Image
                  src={event.poster_url}
                  alt={event.name}
                  width={200}
                  height={280}
                  className="rounded-lg object-contain w-auto h-auto max-w-[200px] max-h-[280px]"
                />
              </div>
            )}

            {/* 基本信息 */}
            <div className="flex-1">
              <div className="space-y-4">
                <div>
                  <h1 className="text-2xl font-bold">{event.name}</h1>
                  {event.short_name && (
                    <p className="text-gray-600">{event.short_name}</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Badge>{event.type}</Badge>
                  {eventStatus && (
                    <Badge variant={eventStatus.variant}>{eventStatus.text}</Badge>
                  )}
                </div>

                {/* 使用两列布局 */}
                <div className="grid grid-cols-2 gap-4">
                  {/* 左列：比赛时间和报名时间 */}
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-2">
                      <Calendar className="h-4 w-4 text-gray-400 mt-0.5" />
                      <div>
                        <div>比赛时间</div>
                        <div className="text-gray-600">{formatDate(event.start_date)} ~ {formatDate(event.end_date)}</div>
                      </div>
                    </div>

                    {(() => {
                      let teamReq = event.registration_settings?.team_requirements
                      if (typeof teamReq === 'string') {
                        try {
                          teamReq = JSON.parse(teamReq)
                        } catch (e) {
                          return null
                        }
                      }

                      if (teamReq?.registrationStartDate && teamReq?.registrationEndDate) {
                        return (
                          <div className="flex items-start gap-2">
                            <Clock className="h-4 w-4 text-gray-400 mt-0.5" />
                            <div>
                              <div>报名时间</div>
                              <div className="text-gray-600">
                                {formatDateTime(teamReq.registrationStartDate)} ~ {formatDateTime(teamReq.registrationEndDate)}
                              </div>
                            </div>
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>

                  {/* 右列：比赛地点和咨询方式 */}
                  <div className="space-y-3 text-sm">
                    {event.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                        <div>
                          <div>比赛地点</div>
                          <div className="text-gray-600">{event.address}</div>
                        </div>
                      </div>
                    )}

                    {event.phone && (
                      <div className="flex items-start gap-2">
                        <Phone className="h-4 w-4 text-gray-400 mt-0.5" />
                        <div>
                          <div>咨询方式</div>
                          <div className="text-gray-600">{event.phone}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 赛事详情 */}
              {event.details && (
                <div className="border-t pt-4 mt-4">
                  <h3 className="font-semibold mb-2">赛事介绍</h3>
                  <div className="text-sm text-gray-600 whitespace-pre-wrap">
                    {event.details}
                  </div>
                </div>
              )}

              {/* 报名要求 */}
              {event.requirements && (
                <div className="border-t pt-4 mt-4">
                  <h3 className="font-semibold mb-2">报名要求</h3>
                  <div className="text-sm text-gray-600 whitespace-pre-wrap">
                    {event.requirements}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 我的报名卡片 */}
      <Card>
        <CardHeader className="relative pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">我的报名{allRegistrations.length > 0 && `（${allRegistrations.length}）`}</CardTitle>
              <CardDescription className="mt-1">查看和管理您的报名信息</CardDescription>
            </div>
            {newRegStatus && (
              <Button
                variant={newRegStatus.canRegister ? 'default' : 'outline'}
                onClick={handleRegister}
                disabled={!newRegStatus.canRegister}
                size="sm"
              >
                {newRegStatus.text}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-3 px-6 pb-6">
              {allRegistrations.length > 0 ? (
                <div className="space-y-6">
                  {/* 显示所有报名记录，按审核时间排序（最新的在前） */}
                  {allRegistrations
                    .sort((a, b) => {
                      // 优先按审核时间排序
                      const timeA = a.last_status_change || a.reviewed_at || a.created_at
                      const timeB = b.last_status_change || b.reviewed_at || b.created_at
                      return new Date(timeB).getTime() - new Date(timeA).getTime()
                    })
                    .map((reg, index) => (
                    <div key={reg.id} className="border rounded-lg p-4 space-y-3 relative">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-500">报名 {index + 1}</span>
                          <Badge
                            className="text-sm"
                            variant={
                              reg.status === 'approved' ? 'success' as any :
                              reg.status === 'rejected' ? 'destructive' :
                              reg.status === 'cancelled' ? 'secondary' as any :
                              reg.status === 'draft' ? 'secondary' as any :
                              'default'
                            }
                          >
                            {reg.status === 'draft' && '草稿'}
                            {reg.status === 'pending' && '待审核'}
                            {reg.status === 'approved' && '已通过'}
                            {reg.status === 'rejected' && '已驳回'}
                            {reg.status === 'cancelled' && '已取消'}
                          </Badge>
                        </div>

                        <div className="flex gap-2">
                          {/* 草稿可以继续编辑 */}
                          {reg.status === 'draft' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/portal/events/${eventId}/register?edit=${reg.id}`)}
                              >
                                继续编辑
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteRegistration(reg.id)}
                              >
                                删除报名
                              </Button>
                            </>
                          )}

                          {/* 被驳回的可以重新编辑和删除 */}
                          {reg.status === 'rejected' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/portal/events/${eventId}/register?edit=${reg.id}`)}
                              >
                                重新报名
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteRegistration(reg.id)}
                              >
                                删除报名
                              </Button>
                            </>
                          )}

                          {/* 已通过的可以查看和取消报名 */}
                          {reg.status === 'approved' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/portal/events/${eventId}/register?edit=${reg.id}`)}
                              >
                                查看报名
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleCancelRegistration(reg.id)}
                              >
                                取消报名
                              </Button>
                            </>
                          )}

                          {/* 已取消的可以重新报名和删除（类似已驳回） */}
                          {reg.status === 'cancelled' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/portal/events/${eventId}/register?edit=${reg.id}`)}
                              >
                                重新报名
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteRegistration(reg.id)}
                              >
                                删除报名
                              </Button>
                            </>
                          )}

                          {/* 待审核状态 - 可以查看和取消 */}
                          {reg.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/portal/events/${eventId}/register?edit=${reg.id}`)}
                              >
                                查看报名
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleCancelRegistration(reg.id)}
                              >
                                取消报名
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-sm text-gray-600 space-y-1">
                        <p>
                          {reg.status === 'draft' ? '保存时间' : '提交时间'}：
                          {formatDateTime(reg.submitted_at || reg.created_at || '')}
                        </p>
                        {reg.team_data && (
                          <div className="flex items-center gap-2 text-gray-500">
                            {(() => {
                              const teamData = reg.team_data
                              const fields = []

                              // 根据配置的字段顺序显示
                              if (event?.registration_settings?.team_requirements) {
                                const allFields = event.registration_settings.team_requirements.allFields ||
                                                [...(event.registration_settings.team_requirements.commonFields || []),
                                                 ...(event.registration_settings.team_requirements.customFields || [])]

                                // 取前三个字段的值
                                for (let i = 0; i < Math.min(3, allFields.length); i++) {
                                  const field = allFields[i]
                                  const value = teamData[field.id]
                                  if (value && typeof value === 'string' && value.trim()) {
                                    fields.push(value.trim())
                                  }
                                }
                              }

                              // 如果没有配置字段或者没有获取到值，使用固定的字段顺序
                              if (fields.length === 0) {
                                const priorityKeys = [
                                  'reportCampus',      // 报名校区
                                  'teamName',          // 队伍名称
                                  'participationGroup' // 参与组别
                                ]

                                for (const key of priorityKeys) {
                                  const value = teamData[key]
                                  if (value && typeof value === 'string' && value.trim()) {
                                    fields.push(value.trim())
                                  }
                                }
                              }

                              // 如果还是没有，按照对象键的顺序取前三个
                              if (fields.length === 0) {
                                const allValues = Object.values(teamData)
                                  .filter(value => value && typeof value === 'string' && value.trim())
                                  .slice(0, 3)
                                fields.push(...allValues)
                              }

                              return fields.length > 0 ? (
                                <span>{fields.join(' • ')}</span>
                              ) : null
                            })()}
                          </div>
                        )}
                      </div>

                      {reg.status === 'rejected' && reg.rejection_reason && (
                        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
                          <p className="text-red-600 text-sm">驳回原因：{reg.rejection_reason}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">您还未报名此赛事</p>
                  {newRegStatus?.canRegister && (
                    <Button className="mt-4" onClick={handleRegister}>
                      立即报名
                    </Button>
                  )}
                </div>
              )}
        </CardContent>
      </Card>
    </div>
  )
}