'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Search, Calendar, MapPin, Clock, FileText } from 'lucide-react'

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
  const [showNoRegistrationDialog, setShowNoRegistrationDialog] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  useEffect(() => {
    // 延迟一点时间确保认证完成
    const timer = setTimeout(() => {
      fetchEvents()
    }, 300)

    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    // 搜索过滤
    let processedEvents = [...events]

    if (searchKeyword) {
      processedEvents = processedEvents.filter(event =>
        event.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        event.short_name?.toLowerCase().includes(searchKeyword.toLowerCase())
      )
    }

    // 排序逻辑：未开始 > 报名中 > 审核中 > 已截止
    processedEvents.sort((a, b) => {
      const now = new Date()

      // 获取报名阶段的函数
      const getPhaseOrder = (event: Event) => {
        // 获取报名相关时间
        let teamReq = event.registration_settings?.team_requirements
        if (typeof teamReq === 'string') {
          try {
            teamReq = JSON.parse(teamReq)
          } catch (e) {
            return 4 // 解析失败，归类为已截止
          }
        }

        const regStartDate = teamReq?.registrationStartDate
        const regEndDate = teamReq?.registrationEndDate
        const reviewEndDate = teamReq?.reviewEndDate

        if (regStartDate && regEndDate) {
          const regStart = new Date(regStartDate)
          const regEnd = new Date(regEndDate)
          const reviewEnd = reviewEndDate ? new Date(reviewEndDate) : null

          // 未开始 - 优先级1（报名还未开始）
          if (now < regStart) {
            return 1
          }
          // 报名中 - 优先级2
          else if (now >= regStart && now <= regEnd) {
            return 2
          }
          // 审核中 - 优先级3
          else if (reviewEnd && now > regEnd && now <= reviewEnd) {
            return 3
          }
          // 已截止 - 优先级4
          else {
            return 4
          }
        }

        // 没有报名时间配置，按赛事时间判断
        const eventStart = new Date(event.start_date)
        const eventEnd = new Date(event.end_date)

        if (now < eventStart) {
          return 1 // 未开始
        } else if (now <= eventEnd) {
          return 4 // 进行中，归类为已截止
        } else {
          return 4 // 已结束，归类为已截止
        }
      }

      const orderA = getPhaseOrder(a)
      const orderB = getPhaseOrder(b)

      // 如果在同一阶段，按开始时间排序（最近的在前）
      if (orderA === orderB) {
        return new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      }

      return orderA - orderB
    })

    setFilteredEvents(processedEvents)
  }, [searchKeyword, events])

  const fetchEvents = async (retryCount = 0) => {
    try {
      console.log('Fetching events, attempt:', retryCount + 1)

      // 在发起请求前先确保认证状态
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session && retryCount < 1) {
        console.log('No session yet, retrying in 500ms...')
        setTimeout(() => fetchEvents(retryCount + 1), 500)
        return
      }

      const response = await fetch('/api/portal/events', {
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      })

      if (!response.ok) {
        // 处理503服务不可用
        if (response.status === 503) {
          console.error('Service temporarily unavailable')
          if (retryCount < 2) {
            console.log(`Service unavailable, retrying in ${(retryCount + 1) * 2} seconds...`)
            setTimeout(() => fetchEvents(retryCount + 1), (retryCount + 1) * 2000)
            return
          }
        }
        // 处理500内部服务器错误
        if (response.status === 500) {
          console.error('Server error, attempting retry')
          if (retryCount < 2) {
            console.log(`Server error, retrying in ${(retryCount + 1) * 1.5} seconds...`)
            setTimeout(() => fetchEvents(retryCount + 1), (retryCount + 1) * 1500)
            return
          }
          // 重试失败后，设置为空数组，避免崩溃
          console.error('Server error persists after retries')
          setEvents([])
          setFilteredEvents([])
          setIsLoading(false)
          return
        }
        // 处理401未授权
        if (response.status === 401) {
          console.error('Unauthorized, redirecting to login')
          window.location.href = '/auth/login'
          return
        }
        // 其他错误
        console.error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()

      console.log('Events API response:', result)

      if (result.success) {
        // 只显示可见的赛事
        const visibleEvents = result.data.filter((event: Event) => event.is_visible)
        console.log('Visible events found:', visibleEvents.length)
        setEvents(visibleEvents)
        setFilteredEvents(visibleEvents)
      } else {
        console.error('API returned error:', result.error)
        // 如果 API 返回失败，但不是第一次尝试，可以重试
        if (retryCount < 1) {
          console.log('Retrying events fetch...')
          setTimeout(() => fetchEvents(retryCount + 1), 1000)
          return
        }
      }
    } catch (error) {
      console.error('获取赛事列表失败:', error)

      // 网络错误时重试
      if (retryCount < 1) {
        console.log('Network error, retrying in 2 seconds...')
        setTimeout(() => fetchEvents(retryCount + 1), 2000)
        return
      }
    } finally {
      // 确保加载状态结束
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
    const now = new Date()
    const eventStart = new Date(event.start_date)
    const eventEnd = new Date(event.end_date)

    // 首先检查赛事是否已经结束
    if (now > eventEnd) {
      return { canRegister: false, text: '赛事已结束', isEventEnded: true, inReviewPeriod: false }
    }

    // 从 registration_settings 中获取报名时间
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
    const reviewEndDate = teamReq?.reviewEndDate  // 新增：审核结束时间

    if (!regStartDate || !regEndDate) {
      return { canRegister: false, text: '未设置报名时间', isEventEnded: false, inReviewPeriod: false }
    }

    const regStart = new Date(regStartDate)
    const regEnd = new Date(regEndDate)
    const reviewEnd = reviewEndDate ? new Date(reviewEndDate) : null

    if (now < regStart) {
      return { canRegister: false, text: '报名未开始', isEventEnded: false, inReviewPeriod: false }
    } else if (now <= regEnd) {
      return { canRegister: true, text: '去报名', isEventEnded: false, inReviewPeriod: false }
    } else if (reviewEnd && now <= reviewEnd) {
      // 报名已结束但在审核期内
      return { canRegister: false, text: '去报名', isEventEnded: false, inReviewPeriod: true }
    } else {
      return { canRegister: false, text: '去报名', isEventEnded: false, inReviewPeriod: false}
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN')
  }

  const handleEventClick = (event: Event) => {
    // 获取报名阶段
    const now = new Date()
    let teamReq = event.registration_settings?.team_requirements
    if (typeof teamReq === 'string') {
      try {
        teamReq = JSON.parse(teamReq)
      } catch (e) {
        console.error('解析 team_requirements 失败:', e)
      }
    }

    const regStartDate = teamReq?.registrationStartDate
    const regEndDate = teamReq?.registrationEndDate
    const reviewEndDate = teamReq?.reviewEndDate

    // 检查是否报名未开始
    if (regStartDate) {
      const regStart = new Date(regStartDate)
      if (now < regStart) {
        alert(`该赛事报名尚未开始\n\n报名开始时间：${regStart.toLocaleString('zh-CN')}\n请到时间后再来报名`)
        return
      }
    }

    // 检查是否报名截止
    const isRegistrationClosed = () => {
      if (!regEndDate) return true
      const regEnd = new Date(regEndDate)
      if (reviewEndDate) {
        const reviewEnd = new Date(reviewEndDate)
        return now > reviewEnd
      }
      return now > regEnd
    }

    // 报名截止状态
    if (isRegistrationClosed()) {
      if (window.confirm('该赛事报名已截止\n\n您只能查看赛事详情及报名信息，不能再次提交或修改。\n\n点击确认进入赛事详情页')) {
        router.push(`/portal/events/${event.id}`)
      }
      return
    }

    // 检查是否在审核期
    const regStatus = getRegistrationStatus(event)

    if (regStatus.inReviewPeriod && !regStatus.canRegister) {
      // 在审核期且不能报名，显示提醒
      if (window.confirm('该比赛报名已结束\n\n现在处于审核期，您可以：\n• 重新提交被驳回的报名\n• 查看已有的报名信息')) {
        router.push(`/portal/events/${event.id}`)
      }
    } else {
      // 其他情况直接跳转
      router.push(`/portal/events/${event.id}`)
    }
  }

  const handleMyRegistrations = async (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation() // 阻止事件冒泡

    try {
      const supabase = createClient()

      // 获取当前用户
      const { data: { user } } = await supabase.auth.getUser()
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

      if (!coach) {
        alert('未找到教练信息')
        return
      }

      // 检查是否有报名记录
      const { data: registrations } = await supabase
        .from('registrations')
        .select('id')
        .eq('event_id', eventId)
        .eq('coach_id', coach.id)
        .limit(1)

      if (!registrations || registrations.length === 0) {
        // 没有报名记录，显示提醒弹窗
        setSelectedEventId(eventId)
        setShowNoRegistrationDialog(true)
      } else {
        // 有报名记录，跳转到详情页的"我的报名"标签
        router.push(`/portal/events/${eventId}?tab=status`)
      }
    } catch (error) {
      console.error('检查报名记录失败:', error)
      alert('操作失败，请重试')
    }
  }

  const handleNewRegistration = () => {
    if (selectedEventId) {
      router.push(`/portal/events/${selectedEventId}/register?new=true`)
    }
    setShowNoRegistrationDialog(false)
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
                <TableHead></TableHead>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>比赛时间</TableHead>
                <TableHead>比赛地点</TableHead>
                <TableHead>报名阶段</TableHead>
                <TableHead>报名状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEvents.map((event) => {
                const status = getEventStatus(event.start_date, event.end_date)
                const regStatus = getRegistrationStatus(event)

                // 获取报名阶段
                const getEventPhase = () => {
                  const now = new Date()

                  // 获取报名时间
                  let teamReq = event.registration_settings?.team_requirements
                  if (typeof teamReq === 'string') {
                    try {
                      teamReq = JSON.parse(teamReq)
                    } catch (e) {
                      console.error('解析 team_requirements 失败:', e)
                    }
                  }

                  const regStartDate = teamReq?.registrationStartDate
                  const regEndDate = teamReq?.registrationEndDate
                  const reviewEndDate = teamReq?.reviewEndDate

                  if (regStartDate && regEndDate) {
                    const regStart = new Date(regStartDate)
                    const regEnd = new Date(regEndDate)
                    const reviewEnd = reviewEndDate ? new Date(reviewEndDate) : null

                    // 未开始
                    if (now < regStart) {
                      return { text: '未开始', variant: 'secondary' as const }
                    }
                    // 报名中
                    else if (now >= regStart && now <= regEnd) {
                      return { text: '报名中', variant: 'default' as const }
                    }
                    // 审核中
                    else if (reviewEnd && now > regEnd && now <= reviewEnd) {
                      return { text: '审核中', variant: 'secondary' as const }
                    }
                    // 已截止（超过审核结束时间）
                    else if (reviewEnd && now > reviewEnd) {
                      return { text: '已截止', variant: 'destructive' as const }
                    }
                    // 已截止（没有设置审核结束时间但超过报名结束时间）
                    else if (!reviewEnd && now > regEnd) {
                      return { text: '已截止', variant: 'destructive' as const }
                    }
                  }

                  // 其他所有情况都显示为已截止
                  return { text: '已截止', variant: 'destructive' as const }
                }

                const eventPhase = getEventPhase()
                
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
                      <div className="font-medium">{event.name}</div>
                    </TableCell>

                    <TableCell>{event.type}</TableCell>

                    <TableCell>
                      <div className="text-sm">
                        {formatDate(event.start_date)} ~ {formatDate(event.end_date)}
                      </div>
                    </TableCell>

                    <TableCell>
                      {event.address || '-'}
                    </TableCell>

                    <TableCell>
                      <span>{eventPhase.text}</span>
                    </TableCell>

                    <TableCell>
                      {eventPhase.text !== '已截止' && eventPhase.text !== '未开始' && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (regStatus.canRegister) {
                              // 点击"去报名"时，跳转并滚动到"我的报名"部分
                              router.push(`/portal/events/${event.id}?scrollTo=my-registration`)
                            } else if (regStatus.text === '去报名' && !regStatus.canRegister) {
                              if (regStatus.inReviewPeriod) {
                                if (window.confirm('该比赛报名已结束\n\n现在处于审核期，您可以：\n• 重新提交被驳回的报名\n• 查看已有的报名信息')) {
                                  router.push(`/portal/events/${event.id}`)
                                }
                              } else {
                                if (window.confirm('该比赛报名已结束\n\n报名和审核期均已结束，不能再提交新的报名')) {
                                  router.push(`/portal/events/${event.id}`)
                                }
                              }
                            } else if (regStatus.text === '报名未开始') {
                              alert('该比赛报名还未开始')
                            } else {
                              alert('暂时无法报名')
                            }
                          }}
                          disabled={false}
                          className="font-semibold"
                        >
                          {regStatus.text}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 未报名提醒弹窗 */}
      <Dialog open={showNoRegistrationDialog} onOpenChange={setShowNoRegistrationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>提示</DialogTitle>
            <DialogDescription>
              您还没有报名该赛事，请先创建报名信息。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoRegistrationDialog(false)}>
              取消
            </Button>
            <Button onClick={handleNewRegistration}>
              新建报名
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}