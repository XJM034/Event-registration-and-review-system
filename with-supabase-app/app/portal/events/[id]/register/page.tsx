'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Save,
  Send,
  Plus,
  Trash2,
  Upload,
  Users,
  FileText,
  Loader2,
  AlertCircle,
  Share2,
  Copy,
  Check
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

interface Event {
  id: string
  name: string
  short_name?: string
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

interface Player {
  id: string
  name: string
  gender?: string
  age?: number
  role?: string
  [key: string]: any
}

interface Registration {
  id?: string
  event_id: string
  coach_id?: string
  team_data: any
  players_data: Player[]
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled'
}

// 动态生成表单 schema
const createTeamSchema = (fields: any[]) => {
  const schemaObject: any = {}
  
  fields?.forEach(field => {
    if (field.required) {
      if (field.type === 'text' || field.type === 'select') {
        schemaObject[field.id] = z.string().min(1, `${field.label}不能为空`)
      } else if (field.type === 'date') {
        schemaObject[field.id] = z.string().min(1, `请选择${field.label}`)
      }
    } else {
      schemaObject[field.id] = z.any().optional()
    }
  })
  
  return z.object(schemaObject)
}

export default function RegisterPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventId = params.id as string
  const isNewRegistration = searchParams.get('new') === 'true'
  const editRegistrationId = searchParams.get('edit')  // 获取要编辑的报名ID
  
  const [event, setEvent] = useState<Event | null>(null)
  const [registration, setRegistration] = useState<Registration | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('team')
  const [coach, setCoach] = useState<any>(null)
  const [teamLogoFile, setTeamLogoFile] = useState<File | null>(null)
  const [teamLogoPreview, setTeamLogoPreview] = useState<string | null>(null)
  const [shareTokens, setShareTokens] = useState<Map<string, string>>(new Map())
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [copiedPlayerId, setCopiedPlayerId] = useState<string | null>(null)

  // 获取字段配置 - 使用管理端设置的字段顺序
  const teamRequirements = event?.registration_settings?.team_requirements
  const allFields = teamRequirements?.allFields || [
    ...(teamRequirements?.commonFields || []),
    ...(teamRequirements?.customFields || [])
  ]
  
  // 创建动态表单
  const teamSchema = createTeamSchema(allFields)
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset
  } = useForm({
    resolver: zodResolver(teamSchema)
  })

  useEffect(() => {
    if (eventId) {
      fetchEventAndRegistration()
    }
  }, [eventId])

  // 当registration数据更新时，确保表单被正确填充
  useEffect(() => {
    if (registration && registration.team_data && !isNewRegistration) {
      console.log('useEffect: 填充表单数据', {
        registration_status: registration.status,
        team_data: registration.team_data,
        players_count: registration.players_data?.length
      })
      
      // 填充表单数据
      Object.keys(registration.team_data).forEach(key => {
        setValue(key, registration.team_data[key])
      })
      
      // 设置logo预览
      if (registration.team_data.team_logo) {
        setTeamLogoPreview(registration.team_data.team_logo)
      }
      
      // 设置队员数据
      if (registration.players_data) {
        setPlayers(registration.players_data)
      }
    } else {
      console.log('useEffect: 跳过数据填充', {
        hasRegistration: !!registration,
        hasTeamData: !!registration?.team_data,
        isNewRegistration
      })
    }
  }, [registration, setValue, isNewRegistration])

  // 定期检查分享的队员信息更新
  useEffect(() => {
    if (!registration?.id) return

    const checkSharedPlayers = async () => {
      const supabase = createClient()

      // 获取所有已填写的分享token
      const { data: filledTokens } = await supabase
        .from('player_share_tokens')
        .select('*')
        .eq('registration_id', registration.id)
        .eq('is_filled', true)

      if (filledTokens && filledTokens.length > 0) {
        // 更新队员列表
        filledTokens.forEach(async (token) => {
          if (token.player_data && !players.some(p => p.shareTokenId === token.id)) {
            // 添加新队员（标记shareTokenId避免重复添加）
            const newPlayer = {
              id: `player-${Date.now()}-${Math.random()}`,
              shareTokenId: token.id,
              ...token.player_data
            }
            setPlayers(prev => [...prev, newPlayer])
          }
        })
      }
    }

    // 立即检查一次
    checkSharedPlayers()

    // 每5秒检查一次
    const interval = setInterval(checkSharedPlayers, 5000)
    return () => clearInterval(interval)
  }, [registration?.id, players])

  const fetchEventAndRegistration = async () => {
    try {
      setIsLoading(true)
      const supabase = createClient()
      
      // 获取当前用户
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }
      
      // 获取教练信息
      const { data: coachData } = await supabase
        .from('coaches')
        .select('*')
        .eq('auth_id', user.id)
        .single()
      
      if (!coachData) {
        // 如果没有教练信息，创建一个
        const { data: newCoach } = await supabase
          .from('coaches')
          .insert({
            auth_id: user.id,
            email: user.email,
            name: user.email?.split('@')[0] || '教练'
          })
          .select()
          .single()
        
        setCoach(newCoach)
      } else {
        setCoach(coachData)
      }
      
      // 获取赛事信息
      const response = await fetch(`/api/portal/events`)
      const result = await response.json()
      
      if (result.success) {
        const eventData = result.data.find((e: Event) => e.id === eventId)
        if (eventData) {
          setEvent(eventData)
          
          // 获取现有报名信息
          if (coachData || coach) {
            let regToLoad = null  // 在外层定义变量

            if (isNewRegistration) {
              // 新建报名：不加载任何现有报名数据，从空白开始
              console.log('新建报名模式，不加载现有数据')
              setRegistration(null)
              setPlayers([])
              reset() // 重置表单为空
            } else if (editRegistrationId) {
              // 编辑特定的报名：根据ID加载指定的报名记录
              console.log('编辑指定报名:', editRegistrationId)
              const { data: specificReg } = await supabase
                .from('registrations')
                .select('*')
                .eq('id', editRegistrationId)
                .eq('coach_id', coachData?.id || coach?.id)  // 确保是自己的报名
                .single()

              if (specificReg) {
                regToLoad = specificReg
                console.log('加载指定的报名数据:', regToLoad)
              } else {
                console.log('未找到指定的报名记录')
              }
            } else {
              // 默认模式：加载最新的草稿
              const { data: existingReg } = await supabase
                .from('registrations')
                .select('*')
                .eq('event_id', eventId)
                .eq('coach_id', coachData?.id || coach?.id)
                .eq('status', 'draft')  // 只加载草稿
                .order('created_at', { ascending: false })
                .limit(1)

              // 如果没有草稿，查找最新的被驳回或已取消的报名
              if (existingReg && existingReg.length > 0) {
                regToLoad = existingReg[0]
              } else {
                const { data: editableReg } = await supabase
                  .from('registrations')
                  .select('*')
                  .eq('event_id', eventId)
                  .eq('coach_id', coachData?.id || coach?.id)
                  .in('status', ['rejected', 'cancelled'])  // 被驳回或已取消的都可以编辑
                  .order('created_at', { ascending: false })
                  .limit(1)

                if (editableReg && editableReg.length > 0) {
                  regToLoad = editableReg[0]
                }
              }
            }

            // 统一处理加载的报名数据（适用于所有非新建模式）
            if (regToLoad) {
              console.log('加载报名数据:', regToLoad)
              setRegistration(regToLoad)
              setPlayers(regToLoad.players_data || [])

              // 填充表单数据
              if (regToLoad.team_data) {
                console.log('填充团队数据:', regToLoad.team_data)
                Object.keys(regToLoad.team_data).forEach(key => {
                  setValue(key, regToLoad.team_data[key])
                })

                // 设置logo预览
                if (regToLoad.team_data.team_logo) {
                  setTeamLogoPreview(regToLoad.team_data.team_logo)
                }
              }
            } else if (!isNewRegistration) {
              console.log('没有找到可编辑的报名数据')
            }
          }
        }
      }
    } catch (error) {
      console.error('获取数据失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('请选择图片文件')
        return
      }
      
      if (file.size > 5 * 1024 * 1024) {
        alert('图片大小不能超过 5MB')
        return
      }

      setTeamLogoFile(file)
      
      const reader = new FileReader()
      reader.onload = (e) => {
        setTeamLogoPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const uploadLogo = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('bucket', 'team-logos')

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()
      
      if (result.success) {
        return result.data.url
      } else {
        throw new Error(result.error || '文件上传失败')
      }
    } catch (error) {
      console.error('Upload error:', error)
      return null
    }
  }

  // 为特定队员生成专属分享链接
  const generatePlayerShareLink = async (playerId: string, playerNumber: number) => {
    try {
      // 如果还没有registration，需要先保存草稿
      if (!registration?.id) {
        alert('正在自动保存草稿，请稍后...')

        // 自动保存草稿
        const formData = getValues()
        await handleSaveDraft(formData)

        // 等待一下让registration更新
        setTimeout(() => {
          generatePlayerShareLink(playerId, playerNumber)
        }, 1000)
        return
      }

      // 确保players数据已经保存到数据库
      const supabase = createClient()

      // 先更新一次players_data确保数据最新
      const { error: updateError } = await supabase
        .from('registrations')
        .update({ players_data: players })
        .eq('id', registration.id)

      if (updateError) {
        console.error('更新队员数据失败:', updateError)
        alert('更新队员数据失败，请重试')
        return
      }

      // 生成唯一的token
      const token = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`

      // 获取正确的player index
      const actualPlayerIndex = players.findIndex(p => p.id === playerId)

      // 创建分享token记录，指定特定队员
      const { data, error } = await supabase
        .from('player_share_tokens')
        .insert({
          registration_id: registration.id,
          event_id: eventId,
          token: token,
          player_id: playerId, // 指定队员ID
          player_index: actualPlayerIndex, // 使用实际的索引
        })
        .select()
        .single()

      if (error) {
        console.error('生成分享链接失败:', error)
        alert(`生成分享链接失败: ${error.message || '未知错误'}`)
        return
      }

      // 生成完整的分享链接
      const shareUrl = `${window.location.origin}/player-share/${token}`

      // 复制到剪贴板
      await navigator.clipboard.writeText(shareUrl)
      setCopiedPlayerId(playerId)

      // 3秒后清除复制状态
      setTimeout(() => setCopiedPlayerId(null), 3000)

      alert(`队员${playerNumber}的专属填写链接已复制到剪贴板！\n\n${shareUrl}\n\n请将此链接发送给队员${playerNumber}填写个人信息`)
    } catch (error) {
      console.error('生成分享链接失败:', error)
      alert('生成分享链接失败')
    }
  }

  const addPlayer = () => {
    // 只在启用人数要求时才检查人数限制
    const countRequirementEnabled = event?.registration_settings?.player_requirements?.countRequirementEnabled

    if (countRequirementEnabled) {
      const maxCount = event?.registration_settings?.player_requirements?.maxCount || 20

      if (players.length >= maxCount) {
        alert(`队员人数不能超过 ${maxCount} 人`)
        return
      }
    }
    
    // 默认使用第一个角色（通常是'player'）
    const defaultRole = event?.registration_settings?.player_requirements?.roles?.[0]?.id || 'player'
    
    const newPlayer: Player = {
      id: Date.now().toString(),
      role: defaultRole
    }
    
    setPlayers([...players, newPlayer])
  }

  const removePlayer = (playerId: string) => {
    setPlayers(players.filter(p => p.id !== playerId))
  }

  const updatePlayer = (playerId: string, field: string, value: any) => {
    console.log('Updating player:', playerId, 'field:', field, 'value:', value)
    setPlayers(players.map(p =>
      p.id === playerId ? { ...p, [field]: value } : p
    ))
  }

  const validatePlayers = () => {
    // 只在启用人数要求时才验证人数限制
    const countRequirementEnabled = event?.registration_settings?.player_requirements?.countRequirementEnabled
    
    if (countRequirementEnabled) {
      const minCount = event?.registration_settings?.player_requirements?.minCount || 1
      const maxCount = event?.registration_settings?.player_requirements?.maxCount || 20
      
      if (players.length < minCount) {
        alert(`队员人数不能少于 ${minCount} 人`)
        return false
      }
      
      if (players.length > maxCount) {
        alert(`队员人数不能超过 ${maxCount} 人`)
        return false
      }
    }
    
    // 验证必填字段
    for (let i = 0; i < players.length; i++) {
      const player = players[i]
      const selectedRoleId = player.role || 'player'
      const selectedRole = event?.registration_settings?.player_requirements?.roles?.find(
        (r: any) => r.id === selectedRoleId
      ) || event?.registration_settings?.player_requirements?.roles?.[0]
      
      if (selectedRole) {
        // 使用管理端设置的字段顺序
        const roleFields = selectedRole.allFields || [
          ...(selectedRole.commonFields || []),
          ...(selectedRole.customFields || [])
        ]
        
        // 检查所有必填字段
        for (const field of roleFields) {
          if (field.required && !player[field.id]) {
            alert(`队员 ${i + 1} 的 ${field.label} 为必填项`)
            return false
          }
        }
      }
    }
    
    return true
  }

  const handleSaveDraft = async (data: any) => {
    if (!coach) {
      alert('请先登录')
      return
    }

    // 检查是否是已通过状态
    if (registration?.status === 'approved') {
      alert('已报名成功，无法保存草稿。请取消报名后再进行相应的操作。')
      return
    }

    setIsSaving(true)
    
    try {
      const supabase = createClient()
      
      // 上传logo
      let logoUrl = teamLogoPreview
      if (teamLogoFile) {
        const uploadedUrl = await uploadLogo(teamLogoFile)
        if (uploadedUrl) {
          logoUrl = uploadedUrl
        }
      }
      
      const teamData = {
        ...data,
        team_logo: logoUrl
      }
      
      console.log('Saving registration with players data:', players)
      const registrationData = {
        event_id: eventId,
        coach_id: coach.id,
        team_data: teamData,
        players_data: players,
        status: 'draft'
      }

      if (registration?.id && !isNewRegistration) {
        // 更新现有报名（包括编辑特定报名和默认模式）
        const { error } = await supabase
          .from('registrations')
          .update(registrationData)
          .eq('id', registration.id)

        if (error) throw error
      } else {
        // 创建新报名（新建模式或没有现有报名时）
        const { data: newReg, error } = await supabase
          .from('registrations')
          .insert(registrationData)
          .select()
          .single()

        if (error) throw error
        setRegistration(newReg)
      }
      
      alert('保存成功')
    } catch (error: any) {
      console.error('保存失败:', error)
      alert(`保存失败：${error.message || '请重试'}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubmitRegistration = async (data: any) => {
    if (!coach) {
      alert('请先登录')
      return
    }

    // 检查是否是已通过状态
    if (registration?.status === 'approved') {
      alert('已报名成功，无法重复提交报名。请取消报名后再进行相应的操作。')
      return
    }

    if (!validatePlayers()) {
      setActiveTab('players')
      return
    }
    
    setIsSubmitting(true)
    
    try {
      const supabase = createClient()
      
      // 上传logo
      let logoUrl = teamLogoPreview
      if (teamLogoFile) {
        const uploadedUrl = await uploadLogo(teamLogoFile)
        if (uploadedUrl) {
          logoUrl = uploadedUrl
        }
      }
      
      const teamData = {
        ...data,
        team_logo: logoUrl
      }
      
      console.log('Submitting registration with players data:', players)
      const registrationData = {
        event_id: eventId,
        coach_id: coach.id,
        team_data: teamData,
        players_data: players,
        status: 'pending',  // 使用 pending 表示待审核
        submitted_at: new Date().toISOString(),
        // 重新提交时清空之前的审核和阅读信息
        rejection_reason: null,
        reviewed_at: null,
        reviewer_id: null,
        last_status_read_at: null,  // 清空已读状态
        last_status_change: null     // 清空状态变更时间
      }
      
      if (registration?.id && !isNewRegistration) {
        // 更新现有报名（包括编辑特定报名和默认模式）
        const { error } = await supabase
          .from('registrations')
          .update(registrationData)
          .eq('id', registration.id)

        if (error) throw error
      } else {
        // 创建新报名（新建模式或没有现有报名时）
        const { error } = await supabase
          .from('registrations')
          .insert(registrationData)

        if (error) throw error
      }
      
      alert('提交成功！请等待审核')
      router.push(`/portal/events/${eventId}`)
    } catch (error: any) {
      console.error('提交失败 - 完整错误:', error)
      console.error('错误消息:', error?.message)
      console.error('错误代码:', error?.code)
      console.error('错误详情:', error?.details)

      // 更详细的错误处理
      let errorMessage = '提交失败，请重试'
      if (error?.message) {
        errorMessage = error.message
      } else if (error?.code === 'PGRST116') {
        errorMessage = '没有权限执行此操作，请检查登录状态'
      } else if (error?.code === '23505') {
        errorMessage = '您已经提交过报名，请前往"我的报名"查看'
      } else if (error?.code === '23503') {
        errorMessage = '赛事不存在或已关闭报名'
      } else if (error?.code === '22P02') {
        errorMessage = '提交的数据格式有误，请检查填写内容'
      } else if (typeof error === 'string') {
        errorMessage = error
      }

      alert(errorMessage)
    } finally {
      setIsSubmitting(false)
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
          <p className="text-lg text-gray-600">赛事不存在</p>
          <Button className="mt-4" onClick={() => router.push('/portal')}>
            返回赛事列表
          </Button>
        </div>
      </div>
    )
  }

  // 检查是否已提交（使用registration_type字段）- 新建报名时跳过此检查，被驳回的也跳过
  // 如果不是新建模式，且不是通过edit参数编辑特定报名，且状态不是可编辑的状态（被驳回、已取消、草稿）
  if (!isNewRegistration && !editRegistrationId &&
      registration?.status !== 'rejected' &&
      registration?.status !== 'cancelled' &&
      registration?.status !== 'draft' &&
      (registration?.status === 'pending' || registration?.status === 'approved')) {
    if (registration?.status === 'approved') {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-lg text-gray-600">您的报名已通过审核</p>
            <Button className="mt-4" onClick={() => router.push(`/portal/events/${eventId}`)}>
              查看报名详情
            </Button>
          </div>
        </div>
      )
    } else {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-blue-500 mx-auto mb-4" />
            <p className="text-lg text-gray-600">您的报名已提交，请等待审核</p>
            <Button className="mt-4" onClick={() => router.push(`/portal/events/${eventId}`)}>
              查看报名状态
            </Button>
          </div>
        </div>
      )
    }
  }

  // 被驳回、已取消或草稿状态的报名允许重新编辑

  return (
    <div className="space-y-6">
      {/* 被驳回提示 */}
      {registration?.status === 'rejected' && registration?.rejection_reason && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-800">您的报名已被驳回</h3>
              <p className="text-red-600 mt-1">驳回原因：{registration.rejection_reason}</p>
              <p className="text-sm text-red-500 mt-2">请根据驳回原因修改后重新提交</p>
            </div>
          </div>
        </div>
      )}

      {/* 已取消提示 */}
      {registration?.status === 'cancelled' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-800">您的报名已取消</h3>
              <p className="text-yellow-600 mt-1">您之前取消了这个报名，现在可以修改并重新提交</p>
              <p className="text-sm text-yellow-500 mt-2">所有信息已保留，您可以继续编辑</p>
            </div>
          </div>
        </div>
      )}

      {/* 已通过提示 */}
      {registration?.status === 'approved' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <Check className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-green-800">报名已通过审核</h3>
              <p className="text-green-600 mt-1">当前为查看模式，无法修改或重新提交</p>
            </div>
          </div>
        </div>
      )}
      
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => router.push(`/portal/events/${eventId}`)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
          <h1 className="text-2xl font-bold">{event.name} - 报名</h1>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSubmit(handleSaveDraft)}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                保存草稿
              </>
            )}
          </Button>
          <Button
            onClick={handleSubmit(handleSubmitRegistration)}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                提交中...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                提交报名
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 报名表单 */}
      <Card>
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="team">
                <FileText className="h-4 w-4 mr-2" />
                团队信息
              </TabsTrigger>
              <TabsTrigger value="players">
                <Users className="h-4 w-4 mr-2" />
                队员信息
                {players.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {players.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="team" className="mt-6">
              <form className="space-y-6">
                {allFields.map((field: any) => {
                  // Logo字段特殊处理
                  if (field.type === 'image' && field.id === 'team_logo') {
                    return (
                      <div key={field.id}>
                        <Label>{field.label}{field.required && ' *'}</Label>
                        <div className="mt-2">
                          {teamLogoPreview ? (
                            <div className="relative w-32 h-32 border rounded-lg overflow-hidden">
                              <Image
                                src={teamLogoPreview}
                                alt="队伍logo"
                                fill
                                className="object-cover"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="absolute top-2 right-2"
                                onClick={() => {
                                  setTeamLogoFile(null)
                                  setTeamLogoPreview(null)
                                }}
                              >
                                移除
                              </Button>
                            </div>
                          ) : (
                            <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                              <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                              <p className="text-sm text-gray-600">点击上传队伍Logo</p>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleLogoChange}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  }
                  
                  // 文本字段
                  if (field.type === 'text') {
                    return (
                      <div key={field.id}>
                        <Label htmlFor={field.id}>
                          {field.label}{field.required && ' *'}
                        </Label>
                        <Input
                          id={field.id}
                          {...register(field.id)}
                          placeholder={field.placeholder || `请输入${field.label}`}
                          className="mt-1"
                        />
                        {errors[field.id] && (
                          <p className="text-red-600 text-sm mt-1">
                            {errors[field.id]?.message as string}
                          </p>
                        )}
                      </div>
                    )
                  }
                  
                  // 日期字段
                  if (field.type === 'date') {
                    return (
                      <div key={field.id}>
                        <Label htmlFor={field.id}>
                          {field.label}{field.required && ' *'}
                        </Label>
                        <Input
                          id={field.id}
                          type="date"
                          {...register(field.id)}
                          className="mt-1"
                        />
                        {errors[field.id] && (
                          <p className="text-red-600 text-sm mt-1">
                            {errors[field.id]?.message as string}
                          </p>
                        )}
                      </div>
                    )
                  }
                  
                  // 下拉选择字段
                  if (field.type === 'select' && field.options) {
                    return (
                      <div key={field.id}>
                        <Label htmlFor={field.id}>
                          {field.label}{field.required && ' *'}
                        </Label>
                        <Select 
                          onValueChange={(value) => setValue(field.id, value)}
                          value={watch(field.id)}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder={`请选择${field.label}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options.map((option: string) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors[field.id] && (
                          <p className="text-red-600 text-sm mt-1">
                            {errors[field.id]?.message as string}
                          </p>
                        )}
                      </div>
                    )
                  }
                  
                  return null
                })}
              </form>
            </TabsContent>
            
            <TabsContent value="players" className="mt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">队员列表</h3>
                    {/* 只在有要求时显示要求信息 */}
                    {(event.registration_settings?.player_requirements?.countRequirementEnabled || 
                      (event.registration_settings?.player_requirements?.genderRequirement && 
                       event.registration_settings.player_requirements.genderRequirement !== 'none')) && (
                      <p className="text-sm text-gray-600 mt-1">
                        {/* 人数要求 */}
                        {event.registration_settings?.player_requirements?.countRequirementEnabled && (
                          <span>
                            人数要求：
                            {event.registration_settings.player_requirements.minCount || 1} - {' '}
                            {event.registration_settings.player_requirements.maxCount || 20} 人
                          </span>
                        )}
                        
                        {/* 性别要求 */}
                        {event.registration_settings?.player_requirements?.genderRequirement && 
                         event.registration_settings.player_requirements.genderRequirement !== 'none' && (
                          <span className={event.registration_settings.player_requirements.countRequirementEnabled ? "ml-2" : ""}>
                            {event.registration_settings.player_requirements.countRequirementEnabled && ' | '}
                            性别要求：
                            {event.registration_settings.player_requirements.genderRequirement === 'male' ? '男' : '女'}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={addPlayer}
                      size="sm"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      添加队员
                    </Button>
                  </div>
                </div>
                
                {players.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">暂未添加队员</p>
                      <p className="text-sm text-gray-400 mt-2">点击上方"添加队员"按钮开始</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {players.map((player, index) => (
                      <Card key={player.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-4">
                            <h4 className="font-medium">队员 {index + 1}</h4>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant={copiedPlayerId === player.id ? "default" : "outline"}
                                size="sm"
                                onClick={() => generatePlayerShareLink(player.id, index + 1)}
                                className={`text-xs px-2 py-1 ${
                                  copiedPlayerId === player.id
                                    ? "bg-green-600 hover:bg-green-700 text-white"
                                    : "text-blue-600 hover:text-blue-700"
                                }`}
                              >
                                {copiedPlayerId === player.id ? (
                                  <>
                                    <Check className="h-3 w-3 mr-1" />
                                    已复制
                                  </>
                                ) : (
                                  <>
                                    <Share2 className="h-3 w-3 mr-1" />
                                    分享给队员{index + 1}
                                  </>
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removePlayer(player.id)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* 角色选择 - 如果有多个角色 */}
                            {event.registration_settings?.player_requirements?.roles && 
                             event.registration_settings.player_requirements.roles.length > 1 && (
                              <div className="md:col-span-2">
                                <Label>角色 *</Label>
                                <Select
                                  value={player.role || 'player'}
                                  onValueChange={(value) => updatePlayer(player.id, 'role', value)}
                                >
                                  <SelectTrigger className="mt-1">
                                    <SelectValue placeholder="请选择角色" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {event.registration_settings.player_requirements.roles.map((role: any) => (
                                      <SelectItem key={role.id} value={role.id}>
                                        {role.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            
                            {/* 根据选中的角色动态渲染字段 */}
                            {(() => {
                              const selectedRoleId = player.role || 'player'
                              const selectedRole = event.registration_settings?.player_requirements?.roles?.find(
                                (r: any) => r.id === selectedRoleId
                              ) || event.registration_settings?.player_requirements?.roles?.[0]
                              
                              if (!selectedRole) return null
                              
                              // 使用管理端设置的字段顺序
                              const roleFields = selectedRole.allFields || [
                                ...(selectedRole.commonFields || []),
                                ...(selectedRole.customFields || [])
                              ]
                              
                              return roleFields.map((field: any) => {
                                // 根据字段类型渲染不同的输入组件
                                switch (field.type) {
                                  case 'text':
                                    return (
                                      <div key={field.id}>
                                        <Label>{field.label}{field.required && ' *'}</Label>
                                        <Input
                                          value={player[field.id] || ''}
                                          onChange={(e) => updatePlayer(player.id, field.id, e.target.value)}
                                          placeholder={`请输入${field.label}`}
                                          className="mt-1"
                                        />
                                      </div>
                                    )
                                  case 'date':
                                    return (
                                      <div key={field.id}>
                                        <Label>{field.label}{field.required && ' *'}</Label>
                                        <Input
                                          type="date"
                                          value={player[field.id] || ''}
                                          onChange={(e) => updatePlayer(player.id, field.id, e.target.value)}
                                          className="mt-1"
                                        />
                                      </div>
                                    )
                                  case 'select':
                                    return (
                                      <div key={field.id}>
                                        <Label>{field.label}{field.required && ' *'}</Label>
                                        <Select
                                          value={player[field.id] || ''}
                                          onValueChange={(value) => updatePlayer(player.id, field.id, value)}
                                        >
                                          <SelectTrigger className="mt-1">
                                            <SelectValue placeholder={`请选择${field.label}`} />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {field.options?.map((option: string) => (
                                              <SelectItem key={option} value={option}>
                                                {option}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    )
                                  case 'multiselect':
                                    // TODO: 实现多选逻辑
                                    return null
                                  case 'image':
                                    return (
                                      <div key={field.id}>
                                        <Label>{field.label}{field.required && ' *'}</Label>
                                        <div className="mt-2">
                                          {player[field.id] ? (
                                            <div className="relative w-32 h-32 border rounded-lg overflow-hidden">
                                              <Image
                                                src={player[field.id]}
                                                alt={field.label}
                                                fill
                                                className="object-cover"
                                              />
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="destructive"
                                                className="absolute top-1 right-1"
                                                onClick={() => {
                                                  updatePlayer(player.id, field.id, '')
                                                }}
                                              >
                                                <Trash2 className="h-3 w-3" />
                                              </Button>
                                            </div>
                                          ) : (
                                            <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                                              <Upload className="h-6 w-6 mx-auto text-gray-400 mb-1" />
                                              <p className="text-xs text-gray-600">点击上传{field.label}</p>
                                              <p className="text-xs text-gray-500">支持 JPG、PNG 格式</p>
                                              <input
                                                type="file"
                                                accept="image/*"
                                                onChange={async (e) => {
                                                  const file = e.target.files?.[0]
                                                  if (file) {
                                                    // 验证文件大小
                                                    if (file.size > 5 * 1024 * 1024) {
                                                      alert('图片大小不能超过 5MB')
                                                      return
                                                    }

                                                    // 上传图片
                                                    try {
                                                      setIsSubmitting(true)
                                                      const formData = new FormData()
                                                      formData.append('file', file)
                                                      formData.append('bucket', 'player-photos')

                                                      const response = await fetch('/api/portal/upload', {
                                                        method: 'POST',
                                                        body: formData,
                                                      })

                                                      const result = await response.json()
                                                      console.log('Upload result:', result)

                                                      if (result.success) {
                                                        console.log('Updating player with image URL:', result.data.url)
                                                        updatePlayer(player.id, field.id, result.data.url)
                                                        alert('上传成功！')
                                                      } else {
                                                        alert(result.error || '上传失败')
                                                      }
                                                    } catch (error) {
                                                      console.error('Upload error:', error)
                                                      alert('上传失败，请重试')
                                                    } finally {
                                                      setIsSubmitting(false)
                                                    }
                                                  }
                                                }}
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                              />
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  default:
                                    return null
                                }
                              })
                            })()}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}