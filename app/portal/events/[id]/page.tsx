'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, MapPin, Phone, Clock, Users, ArrowLeft, FileText, AlertCircle, Paperclip, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getSessionUser, getSessionUserWithRetry } from '@/lib/supabase/client-auth'
import { MY_REGISTRATION_SCROLL_TARGET, resolveEventDetailScrollTarget } from '@/lib/portal/event-detail-navigation'
import { toSafeHttpUrl } from '@/lib/url-security'

// 工具函数：将文本中的 URL 转换为可点击的链接
function LinkifyText({ text }: { text: string }) {
  // URL 正则表达式：匹配 http(s)://... 格式的URL
  const urlRegex = /(https?:\/\/[^\s]+)/g

  // 将文本按 URL 分割
  const parts = text.split(urlRegex)

  return (
    <>
      {parts.map((part, index) => {
        // 检查是否是 URL
        if (part.match(urlRegex)) {
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all underline text-primary hover:text-primary/80"
            >
              {part}
            </a>
          )
        }
        // 普通文本，保留换行
        return <span key={index}>{part}</span>
      })}
    </>
  )
}

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
  reference_templates?: EventReferenceTemplate[] | string
  phone?: string
  is_visible: boolean
  registration_settings?: {
    team_requirements?: TeamRequirementsConfig | string
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

interface EventReferenceTemplate {
  name?: string
  path?: string
  url?: string
  size?: number
  mimeType?: string
  uploadedAt?: string
}

interface TeamField {
  id: string
  label?: string
  required?: boolean
  [key: string]: unknown
}

interface TeamRequirementsConfig {
      registrationStartDate?: string
      registrationEndDate?: string
      reviewEndDate?: string  // 新增：审核结束时间
      commonFields?: TeamField[]
      customFields?: TeamField[]
      allFields?: TeamField[]
}

type RegistrationStatus = 'draft' | 'submitted' | 'pending' | 'approved' | 'rejected' | 'cancelled'

interface Registration {
  id: string
  event_id: string
  status: RegistrationStatus
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

function parseTeamRequirements(
  value?: TeamRequirementsConfig | string | null
): TeamRequirementsConfig | undefined {
  if (!value) return undefined
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed as TeamRequirementsConfig : undefined
    } catch (e) {
      console.error('解析 team_requirements 失败:', e)
      return undefined
    }
  }
  return value
}

function parseReferenceTemplates(value?: EventReferenceTemplate[] | string | null): EventReferenceTemplate[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      console.error('解析 reference_templates 失败:', e)
      return []
    }
  }
  return []
}

function getRegistrationPriority(status: unknown): number {
  switch (status) {
    case 'approved':
      return 0
    case 'pending':
    case 'submitted':
      return 1
    case 'rejected':
      return 2
    case 'draft':
      return 3
    case 'cancelled':
      return 4
    default:
      return 99
  }
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
      // 添加小延迟以确保认证状态已建立
      const timer = setTimeout(() => {
        fetchEventDetails()
        checkRegistration()
      }, 100)

      return () => clearTimeout(timer)
    }
  }, [eventId])

  // 处理滚动到"我的报名"部分
  useEffect(() => {
    const scrollTarget = resolveEventDetailScrollTarget(searchParams)

    if (scrollTarget === MY_REGISTRATION_SCROLL_TARGET && !isLoading && event) {
      // 等待页面渲染完成后再滚动
      const scrollTimer = setTimeout(() => {
        const element = document.getElementById('my-registration-section')
        console.log('Scrolling to my-registration-section:', element)
        if (element) {
          // 获取元素位置并滚动
          const elementPosition = element.getBoundingClientRect().top + window.pageYOffset
          window.scrollTo({
            top: elementPosition - 100, // 留出顶部导航栏的空间
            behavior: 'smooth'
          })
        } else {
          console.error('Element with id "my-registration-section" not found')
        }
      }, 800) // 增加延迟确保页面完全渲染

      return () => clearTimeout(scrollTimer)
    }
  }, [searchParams, isLoading, event])

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

  const fetchEventDetails = async (retryCount = 0) => {
    try {
      // 首先检查用户session
      const supabase = createClient()
      const { user, error: sessionError, isNetworkError } = await getSessionUserWithRetry(supabase, {
        maxRetries: 2,
        baseDelayMs: 400,
      })

      if (sessionError && isNetworkError) {
        if (retryCount < 2) {
          console.log('Session error, retrying in 800ms...')
          setTimeout(() => fetchEventDetails(retryCount + 1), 800)
          return
        }
        console.error('Session error after retries, keeping current page state:', sessionError)
        setIsLoading(false)
        return
      }

      if (!user) {
        // 没有session时也尝试重试，可能是初始化延迟
        if (retryCount < 2) {
          console.log('No session yet, retrying in 700ms...')
          setTimeout(() => fetchEventDetails(retryCount + 1), 700)
          return
        }
        console.error('No session found after retries, redirecting to login')
        router.push('/auth/login')
        return
      }

      // 直接获取单个赛事详情，而不是获取所有赛事
      const response = await fetch(`/api/portal/events/${eventId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include' // 确保包含cookies
      })

      if (!response.ok) {
        if (response.status === 401) {
          console.error('Unauthorized, redirecting to login')
          router.push('/auth/login')
          return
        }
        if (response.status === 404) {
          // 404错误时也尝试重试一次，可能是认证状态问题
          if (retryCount < 1) {
            console.log('Event not found, retrying in 1 second...')
            setTimeout(() => fetchEventDetails(retryCount + 1), 1000)
            return
          }
          console.error('Event not found or not visible after retry')
          setEvent(null)
          setIsLoading(false)
          return
        }
        if (response.status === 503) {
          console.error('Service temporarily unavailable')
          if (retryCount < 2) {
            console.log(`Service unavailable, retrying in ${(retryCount + 1) * 2} seconds...`)
            setTimeout(() => fetchEventDetails(retryCount + 1), (retryCount + 1) * 2000)
            return
          }
        }
        console.error(`HTTP error! status: ${response.status}`)
        setEvent(null)
        setIsLoading(false)
        return
      }

      const result = await response.json()

      if (result.success && result.data) {
        console.log('Event data loaded successfully:', {
          id: result.data.id,
          name: result.data.name,
          hasRegistrationSettings: !!result.data.registration_settings,
          registrationSettings: result.data.registration_settings
        })

        setEvent(result.data)
      } else {
        console.error('API returned error:', result.error || '赛事未找到')
        setEvent(null)
      }
    } catch (error) {
      console.error('获取赛事详情失败:', error)

      // 网络错误时重试
      if (retryCount < 2) {
        console.log('Network error, retrying in 3 seconds...')
        setTimeout(() => fetchEventDetails(retryCount + 1), 3000)
        return
      }
    } finally {
      // 确保加载状态结束
      setIsLoading(false)
    }
  }

  const checkRegistration = async () => {
    try {
      const supabase = createClient()
      const { user } = await getSessionUser(supabase)

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

          const registrationRows = (allRegistrations ?? []) as Registration[]

          if (registrationRows.length > 0) {
            // 优先显示已通过的，然后是待审核的，然后是被驳回的，最后是草稿
            const sortedRegistrations = [...registrationRows].sort(
              (a, b) => getRegistrationPriority(a.status) - getRegistrationPriority(b.status)
            )

            const primaryReg = sortedRegistrations[0]
            console.log('获取到的报名信息:', {
              total: registrationRows.length,
              primary: {
                id: primaryReg.id,
                status: primaryReg.status,
                reviewed_at: primaryReg.reviewed_at,
                last_status_read_at: primaryReg.last_status_read_at,
                last_status_change: primaryReg.last_status_change
              },
              allRegistrations: registrationRows
            })

            // 设置主要显示的报名（用于显示状态）
            setRegistration(primaryReg)

            // 存储所有报名记录
            setAllRegistrations(registrationRows)
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
      return { text: '比赛未开始', variant: 'secondary' as const }
    } else if (now <= end) {
      return { text: '比赛进行中', variant: 'default' as const }
    } else {
      return { text: '比赛已结束', variant: 'destructive' as const }
    }
  }

  // 判断赛事是否已结束
  const isEventEnded = () => {
    if (!event) return false
    const now = new Date()

    // 获取报名相关时间
    const teamReq = parseTeamRequirements(event.registration_settings?.team_requirements)

    const regEndDate = teamReq?.registrationEndDate
    const reviewEndDate = teamReq?.reviewEndDate

    // 检查是否报名截止（超过审核结束时间或报名结束时间）
    if (regEndDate) {
      const regEnd = new Date(regEndDate)
      if (reviewEndDate) {
        const reviewEnd = new Date(reviewEndDate)
        return now > reviewEnd  // 超过审核结束时间
      }
      return now > regEnd  // 没有审核结束时间但超过报名结束时间
    }

    // 如果没有设置报名时间，直接返回true（报名截止）
    return true
  }

  // 右上角按钮逻辑：只判断是否可以新建报名，不考虑现有报名状态
  const getNewRegistrationStatus = () => {
    // 如果事件数据还未加载完成，返回加载状态而不是错误状态
    if (!event) {
      return { canRegister: false, text: '加载中...', variant: 'secondary' as const, inReviewPeriod: false }
    }

    // 检查是否存在 registration_settings
    if (!event.registration_settings) {
      console.warn('Registration settings not found for event:', event.id)
      return { canRegister: false, text: '未设置报名时间', variant: 'secondary' as const, inReviewPeriod: false }
    }

    const teamReqRaw = event.registration_settings.team_requirements
    let teamReq: TeamRequirementsConfig | undefined

    // 调试：打印原始数据
    console.log('Team Requirements Raw Data:', {
      type: typeof teamReq,
      value: teamReq
    })

    // 处理各种可能的数据格式
    if (typeof teamReqRaw === 'string') {
      // 处理空字符串情况
      if (!teamReqRaw.trim()) {
        console.warn('Empty team_requirements string for event:', event.id)
        return { canRegister: false, text: '未设置报名时间', variant: 'secondary' as const, inReviewPeriod: false }
      }

      try {
        teamReq = JSON.parse(teamReqRaw) as TeamRequirementsConfig
        console.log('Team Requirements After Parse:', teamReq)
      } catch (e) {
        console.error('解析 team_requirements 失败:', e, 'Raw data:', teamReqRaw)
        return { canRegister: false, text: '报名设置格式错误', variant: 'secondary' as const, inReviewPeriod: false }
      }
    } else {
      teamReq = parseTeamRequirements(teamReqRaw)
    }

    // 确保 teamReq 是对象类型
    if (!teamReq || typeof teamReq !== 'object') {
      console.warn('Invalid team_requirements format for event:', event.id, 'Data:', teamReq)
      return { canRegister: false, text: '未设置报名时间', variant: 'secondary' as const, inReviewPeriod: false }
    }

    const regStartDate = teamReq.registrationStartDate
    const regEndDate = teamReq.registrationEndDate
    const reviewEndDate = teamReq.reviewEndDate  // 新增：审核结束时间

    console.log('Registration Dates:', {
      regStartDate,
      regEndDate,
      reviewEndDate
    })

    // 检查日期字段是否存在且有效
    if (!regStartDate || !regEndDate) {
      console.warn('Missing registration dates for event:', event.id, {
        startDate: regStartDate,
        endDate: regEndDate,
        teamReq
      })
      return { canRegister: false, text: '未设置报名时间', variant: 'secondary' as const, inReviewPeriod: false }
    }

    // 验证日期格式
    const regStart = new Date(regStartDate)
    const regEnd = new Date(regEndDate)
    const reviewEnd = reviewEndDate ? new Date(reviewEndDate) : null

    if (isNaN(regStart.getTime()) || isNaN(regEnd.getTime())) {
      console.error('Invalid date format for event:', event.id, {
        startDate: regStartDate,
        endDate: regEndDate
      })
      return { canRegister: false, text: '报名时间格式错误', variant: 'secondary' as const, inReviewPeriod: false }
    }

    // 检查日期逻辑是否合理
    if (regStart >= regEnd) {
      console.error('Invalid date range for event:', event.id, {
        startDate: regStartDate,
        endDate: regEndDate
      })
      return { canRegister: false, text: '报名时间设置错误', variant: 'secondary' as const, inReviewPeriod: false }
    }

    const now = new Date()

    console.log('Date Comparison:', {
      now: now.toISOString(),
      regStart: regStart.toISOString(),
      regEnd: regEnd.toISOString(),
      reviewEnd: reviewEnd?.toISOString(),
      isBeforeRegStart: now < regStart,
      isDuringReg: now <= regEnd,
      isAfterRegEnd: now > regEnd,
      isDuringReview: reviewEnd && now > regEnd && now <= reviewEnd
    })

    if (now < regStart) {
      return { canRegister: false, text: '报名未开始', variant: 'secondary' as const, inReviewPeriod: false }
    } else if (now <= regEnd) {
      return { canRegister: true, text: '新建报名', variant: 'default' as const, inReviewPeriod: false }
    } else if (reviewEnd && now <= reviewEnd) {
      // 报名已结束，但在审核期内，不允许新建报名
      console.log('>>> IN REVIEW PERIOD <<<')
      return { canRegister: false, text: '报名已结束', variant: 'destructive' as const, inReviewPeriod: true }
    } else {
      return { canRegister: false, text: '报名已结束', variant: 'destructive' as const, inReviewPeriod: false }
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

    const teamReq = parseTeamRequirements(event.registration_settings?.team_requirements)

    const regEndDate = teamReq?.registrationEndDate
    const reviewEndDate = teamReq?.reviewEndDate  // 新增：审核结束时间
    const now = new Date()
    const regEnd = regEndDate ? new Date(regEndDate) : null
    const reviewEnd = reviewEndDate ? new Date(reviewEndDate) : null

    // 判断是否在报名期内、审核期内或已结束
    const isRegistrationOpen = regEnd ? now <= regEnd : false
    const inReviewPeriod = regEnd && reviewEnd && now > regEnd && now <= reviewEnd

    // 检查registration_type字段（草稿/已提交）
    if (registration.status === 'draft') {
      return {
        canContinue: isRegistrationOpen,
        text: '继续报名',
        variant: 'default' as const,
        showDelete: true,
        inReviewPeriod
      }
    }

    switch (registration.status) {
      case 'pending':
      case 'submitted':
        return {
          canContinue: false,
          text: '待审核',
          variant: 'default' as const,
          showDelete: false,
          inReviewPeriod
        }
      case 'approved':
        return {
          canContinue: false,
          text: '已通过',
          variant: 'success' as const,
          showDelete: false,
          inReviewPeriod
        }
      case 'rejected':
        // 被驳回的报名：在报名期内或审核期内都可以重新提交
        return {
          canContinue: isRegistrationOpen || inReviewPeriod,
          text: '重新报名',
          variant: 'destructive' as const,
          showDelete: false,
          inReviewPeriod
        }
      default:
        return {
          canContinue: false,
          text: '待审核',
          variant: 'default' as const,
          showDelete: false,
          inReviewPeriod
        }
    }
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

  const handleCancelRegistration = async (registrationId: string, status: string) => {
    // 判断当前是否在"报名中"期间（未到审核期）
    const isInRegistrationPeriod = () => {
      const now = new Date()
      const teamReq = parseTeamRequirements(event?.registration_settings?.team_requirements)
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
        alert('报名已取消')
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
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
          <p className="mt-4 text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-lg text-muted-foreground">赛事不存在或已下架</p>
          <Button className="mt-4" onClick={() => router.push('/portal')}>
            返回赛事列表
          </Button>
        </div>
      </div>
    )
  }

  const eventStatus = getEventStatus()
  const newRegStatus = getNewRegistrationStatus()
  const referenceTemplates = parseReferenceTemplates(event.reference_templates)
    .map((file) => {
      const safeUrl = toSafeHttpUrl(file.url)
      if (!safeUrl) return null
      return {
        ...file,
        url: safeUrl,
      }
    })
    .filter((file): file is EventReferenceTemplate & { url: string } => Boolean(file))

  // 调试日志
  console.log('Event Details Page - Review Period Check:', {
    eventId: event?.id,
    eventName: event?.name,
    newRegStatus,
    inReviewPeriod: newRegStatus?.inReviewPeriod,
    registrations: allRegistrations.map(r => ({ id: r.id, status: r.status }))
  })

  return (
    <div className="space-y-6">
      {/* 头部导航 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row">
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
                </div>

                <div className="flex gap-2">
                  {eventStatus && (
                    <Badge variant={eventStatus.variant}>{eventStatus.text}</Badge>
                  )}
                  {(() => {
                    // 获取报名阶段
                    const now = new Date()
                    const teamReq = parseTeamRequirements(event.registration_settings?.team_requirements)

                    const regStartDate = teamReq?.registrationStartDate
                    const regEndDate = teamReq?.registrationEndDate
                    const reviewEndDate = teamReq?.reviewEndDate

                    if (regStartDate && regEndDate) {
                      const regStart = new Date(regStartDate)
                      const regEnd = new Date(regEndDate)
                      const reviewEnd = reviewEndDate ? new Date(reviewEndDate) : null

                      if (now >= regStart && now <= regEnd) {
                        return <Badge variant="outline">报名中</Badge>
                      } else if (reviewEnd && now > regEnd && now <= reviewEnd) {
                        return <Badge variant="outline">审核中</Badge>
                      } else {
                        return <Badge variant="outline">已截止报名</Badge>
                      }
                    }
                    return <Badge variant="outline">已截止报名</Badge>
                  })()}
                </div>

                {/* 使用两列布局 */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* 左列：比赛时间和报名时间 */}
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-2">
                      <Calendar className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div>
                        <div>比赛时间</div>
                        <div className="text-muted-foreground">{formatDate(event.start_date)} ~ {formatDate(event.end_date)}</div>
                      </div>
                    </div>

                    {(() => {
                    const teamReq = parseTeamRequirements(event.registration_settings?.team_requirements)

                      if (teamReq?.registrationStartDate && teamReq?.registrationEndDate) {
                        return (
                          <>
                            <div className="flex items-start gap-2">
                              <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                              <div>
                                <div>报名时间</div>
                                <div className="text-muted-foreground">
                                  {formatDateTime(teamReq.registrationStartDate)} ~ {formatDateTime(teamReq.registrationEndDate)}
                                </div>
                              </div>
                            </div>
                          </>
                        )
                      }
                      return null
                    })()}
                  </div>

                  {/* 右列：比赛地点和咨询方式 */}
                  <div className="space-y-3 text-sm">
                    {event.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <div>
                          <div>比赛地点</div>
                          <div className="text-muted-foreground">{event.address}</div>
                        </div>
                      </div>
                    )}

                    {event.phone && (
                      <div className="flex items-start gap-2">
                        <Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <div>
                          <div>咨询方式</div>
                          <div className="text-muted-foreground">{event.phone}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 赛事详情 */}
              {event.details && (
                <div className="mt-4 border-t pt-4">
                  <h3 className="font-semibold mb-2">赛事介绍</h3>
                  <div className="text-sm whitespace-pre-wrap text-muted-foreground">
                    <LinkifyText text={event.details} />
                  </div>
                </div>
              )}

              {/* 报名要求 */}
              {event.requirements && (
                <div className="mt-4 border-t pt-4">
                  <h3 className="font-semibold mb-2">报名要求</h3>
                  <div className="text-sm whitespace-pre-wrap text-muted-foreground">
                    <LinkifyText text={event.requirements} />
                  </div>
                </div>
              )}

              {/* 参考模板 */}
              {referenceTemplates.length > 0 && (
                <div className="mt-4 border-t pt-4">
                  <h3 className="font-semibold mb-2 flex items-center">
                    <Paperclip className="h-4 w-4 mr-1" />
                    参考模板
                  </h3>
                  <div className="space-y-2">
                    {referenceTemplates.map((file, index) => (
                      <div key={`${file.path || file.url || 'file'}-${index}`} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{file.name || `模板${index + 1}`}</p>
                        </div>
                        <a
                          href={file.url}
                          download={file.name || `模板${index + 1}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-sm text-primary hover:text-primary/80"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          下载
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 我的报名卡片 */}
      <Card id="my-registration-section">
        <CardHeader className="relative pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg">我的报名{allRegistrations.length > 0 && `（${allRegistrations.length}）`}</CardTitle>
              <CardDescription className="mt-1">查看和管理您的报名信息</CardDescription>
            </div>
            {/* 根据赛事是否结束显示不同的按钮 */}
            {!isEventEnded() && newRegStatus && (
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

          {/* 报名截止的提示信息 */}
          {isEventEnded() && (
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700 dark:text-amber-300" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-800 dark:text-amber-200">该比赛报名已截止</p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    此赛事报名已截止，您只能查看报名信息，不能再次提交或修改。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 审核期的提示信息 */}
          {!isEventEnded() && newRegStatus?.inReviewPeriod && (
            <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                <div className="space-y-1">
                  <p className="font-semibold text-primary">审核期内</p>
                  <p className="text-sm text-primary/80">
                    报名已结束，现在处于审核期。审核期内仅允许被驳回的报名重新提交，不接受新的报名申请。
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-6 pt-3 sm:px-6">
              {allRegistrations.length > 0 ? (
                <div className="space-y-6">
                  {/* 显示所有报名记录，按审核时间排序（最新的在前） */}
                  {allRegistrations
                    .sort((a, b) => {
                      // 优先按审核时间排序
                      const timeA = a.last_status_change || a.reviewed_at || a.created_at || ''
                      const timeB = b.last_status_change || b.reviewed_at || b.created_at || ''
                      return new Date(timeB).getTime() - new Date(timeA).getTime()
                    })
                    .map((reg, index) => (
                    <div key={reg.id} className="relative space-y-3 rounded-xl border border-border/60 bg-card p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-muted-foreground">报名 {index + 1}</span>
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

                        <div className="flex flex-wrap gap-2">
                          {/* 赛事已结束时，所有状态都只能查看，不能编辑或操作 */}
                          {isEventEnded() ? (
                            <>
                              {/* 已结束赛事：草稿和已取消状态可以删除，其他状态只能查看 */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/portal/events/${eventId}/register?edit=${reg.id}&ended=true`)}
                              >
                                查看报名
                              </Button>
                              {(reg.status === 'draft' || reg.status === 'cancelled' || reg.status === 'rejected') && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDeleteRegistration(reg.id)}
                                >
                                  删除报名
                                </Button>
                              )}
                            </>
                          ) : (
                            <>
                              {/* 赛事未结束时的正常操作逻辑 */}

                              {/* 草稿状态处理：审核期内只能查看和删除，不能编辑 */}
                              {reg.status === 'draft' && (
                                <>
                                  {newRegStatus?.inReviewPeriod ? (
                                    // 审核期内：草稿只能查看或删除
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => router.push(`/portal/events/${eventId}/register?edit=${reg.id}&ended=true`)}
                                      >
                                        查看报名
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => handleDeleteRegistration(reg.id)}
                                      >
                                        删除报名
                                      </Button>
                                    </>
                                  ) : (
                                    // 报名期内：草稿可以继续编辑
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
                                </>
                              )}

                              {/* 被驳回的可以重新编辑和删除（审核期内仍然可以） */}
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
                                    onClick={() => handleCancelRegistration(reg.id, reg.status)}
                                  >
                                    取消报名
                                  </Button>
                                </>
                              )}

                              {/* 已取消状态处理：审核期内只能查看和删除，不能重新报名 */}
                              {reg.status === 'cancelled' && (
                                <>
                                  {newRegStatus?.inReviewPeriod ? (
                                    // 审核期内：已取消只能查看或删除
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => router.push(`/portal/events/${eventId}/register?edit=${reg.id}&ended=true`)}
                                      >
                                        查看报名
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => handleDeleteRegistration(reg.id)}
                                      >
                                        删除报名
                                      </Button>
                                    </>
                                  ) : (
                                    // 报名期内：可以重新报名
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
                                    onClick={() => handleCancelRegistration(reg.id, reg.status)}
                                  >
                                    取消报名
                                  </Button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>
                          {reg.status === 'draft' ? '保存时间' : '提交时间'}：
                          {formatDateTime(reg.submitted_at || reg.created_at || '')}
                        </p>
                        {reg.team_data && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            {(() => {
                              const teamData = reg.team_data
                              const fields: string[] = []

                              // 根据配置的字段顺序显示
                              const teamReq = parseTeamRequirements(event?.registration_settings?.team_requirements)
                              if (teamReq) {
                                const allFields = teamReq.allFields ||
                                                [...(teamReq.commonFields || []),
                                                 ...(teamReq.customFields || [])]

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
                                  .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
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
                        <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/10 p-3">
                          <p className="mb-1 text-sm font-medium text-destructive">驳回原因：</p>
                          <div className="pl-2 text-sm whitespace-pre-line text-destructive">
                            {reg.rejection_reason}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                  <p className="text-muted-foreground">您还未报名此赛事</p>
                  {!isEventEnded() && newRegStatus?.canRegister && (
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
