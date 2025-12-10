'use client'

import { useState, useEffect, useMemo } from 'react'
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
  Check,
  Clock
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
      reviewEndDate?: string  // 新增：审核结束时间
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
  const isEventEndedView = searchParams.get('ended') === 'true'  // 检查是否是已结束赛事的查看模式
  
  const [event, setEvent] = useState<Event | null>(null)
  const [registration, setRegistration] = useState<Registration | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [playersByRole, setPlayersByRole] = useState<{[roleId: string]: Player[]}>({})

  // 组织按角色分组的数据
  const organizePlayersByRole = (playersData: Player[]) => {
    const grouped: {[roleId: string]: Player[]} = {}
    playersData.forEach(player => {
      const roleId = player.role || 'player'
      if (!grouped[roleId]) {
        grouped[roleId] = []
      }
      grouped[roleId].push(player)
    })
    return grouped
  }

  // 获取有序的角色列表（非队员角色在前，队员角色在后）
  const getOrderedRoles = () => {
    const roles = event?.registration_settings?.player_requirements?.roles || []
    // 返回排序后的角色：非队员角色在前，队员角色在后
    return roles.sort((a: any, b: any) => {
      if (a.id === 'player' && b.id !== 'player') return 1
      if (a.id !== 'player' && b.id === 'player') return -1
      return 0
    })
  }
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

  // 判断是否在审核期内
  const isInReviewPeriod = () => {
    const now = new Date()
    let teamReq = event?.registration_settings?.team_requirements
    if (typeof teamReq === 'string') {
      try {
        teamReq = JSON.parse(teamReq)
      } catch (e) {
        return false
      }
    }

    const regEndDate = teamReq?.registrationEndDate
    const reviewEndDate = teamReq?.reviewEndDate
    const regEnd = regEndDate ? new Date(regEndDate) : null
    const reviewEnd = reviewEndDate ? new Date(reviewEndDate) : null

    return regEnd && reviewEnd && now > regEnd && now <= reviewEnd
  }

  // 判断报名是否已截止（超过审核结束时间）
  const isRegistrationClosed = () => {
    const now = new Date()
    let teamReq = event?.registration_settings?.team_requirements
    if (typeof teamReq === 'string') {
      try {
        teamReq = JSON.parse(teamReq)
      } catch (e) {
        return false
      }
    }

    const regEndDate = teamReq?.registrationEndDate
    const reviewEndDate = teamReq?.reviewEndDate
    const regEnd = regEndDate ? new Date(regEndDate) : null
    const reviewEnd = reviewEndDate ? new Date(reviewEndDate) : null

    // 如果有审核结束时间，检查是否超过
    if (reviewEnd) {
      return now > reviewEnd
    }
    // 如果没有审核结束时间，检查是否超过报名结束时间
    if (regEnd) {
      return now > regEnd
    }
    return false
  }

  // 判断是否显示保存和提交按钮
  const shouldShowActionButtons = () => {
    // 赛事结束时不显示
    if (isEventEndedView) return false

    // 已通过状态不显示按钮
    if (registration?.status === 'approved') return false

    // 审核期内的草稿不显示
    if (isInReviewPeriod() && registration?.status === 'draft') return false

    // 审核期内的新建报名不显示
    if (isInReviewPeriod() && isNewRegistration) return false

    // 待审核状态和被驳回状态在审核期内都显示按钮
    if (isInReviewPeriod() && (registration?.status === 'submitted' || registration?.status === 'rejected')) return true

    // 报名期内，除了已通过状态外都显示
    if (!isInReviewPeriod() && registration?.status !== 'approved') return true

    return true
  }

  // 获取字段配置 - 使用管理端设置的字段顺序
  const teamRequirements = event?.registration_settings?.team_requirements
  const rawFields = teamRequirements?.allFields || [
    ...(teamRequirements?.commonFields || []),
    ...(teamRequirements?.customFields || [])
  ]

  // 去重字段，避免重复显示
  const allFields = rawFields.filter((field: any, index: number, array: any[]) =>
    array.findIndex((f: any) => f.id === field.id) === index
  )



  // 创建动态表单 - 使用 useMemo 确保 schema 正确更新
  const teamSchema = useMemo(() => createTeamSchema(allFields), [allFields])

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
        setPlayersByRole(organizePlayersByRole(registration.players_data))
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
            const updatedPlayers = [...players, newPlayer]
            setPlayers(updatedPlayers)
            setPlayersByRole(organizePlayersByRole(updatedPlayers))
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
      const response = await fetch(`/api/portal/events/${eventId}`)
      const result = await response.json()

      if (result.success) {
        const eventData = result.data
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
              setPlayersByRole({})
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
              const playersData = regToLoad.players_data || []
              setPlayers(playersData)
              setPlayersByRole(organizePlayersByRole(playersData))

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
      formData.append('bucket', 'registration-files')

      const response = await fetch('/api/portal/upload', {
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
  const generatePlayerShareLink = async (playerId: string, playerNumber: number, roleName: string = '队员') => {
    try {
      // 检查报名是否已截止（时间维度）
      if (isRegistrationClosed()) {
        alert('报名已截止，不可修改报名信息')
        return
      }

      // 检查报名状态 - 只有草稿和已驳回状态允许分享链接
      // draft: 草稿，可以分享
      // rejected: 已驳回，可以修改后重新提交
      // pending/submitted: 待审核，不允许修改
      // approved: 已通过，不允许修改
      const allowedStatuses = ['draft', 'rejected']
      if (registration?.status && !allowedStatuses.includes(registration.status)) {
        alert('报名已提交待审核，不可修改报名信息')
        return
      }

      // 如果还没有registration，提醒用户需要先保存草稿
      if (!registration?.id) {
        alert('请先填写团队信息并保存草稿后，再生成分享链接')
        setActiveTab('team') // 切换到团队信息标签
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

      // 复制到剪贴板（兼容性处理）
      let copySuccessful = false

      // 优先使用降级方案，因为它更稳定
      try {
        // 创建临时文本输入框
        const textArea = document.createElement('textarea')
        textArea.value = shareUrl
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()

        try {
          const successful = document.execCommand('copy')
          document.body.removeChild(textArea)

          if (successful) {
            copySuccessful = true
            setCopiedPlayerId(playerId)
            setTimeout(() => setCopiedPlayerId(null), 3000)
          }
        } catch (err) {
          document.body.removeChild(textArea)
          console.error('execCommand复制失败:', err)
        }
      } catch (err) {
        console.error('降级方案复制失败:', err)
      }

      // 如果降级方案失败，尝试现代 API
      if (!copySuccessful) {
        try {
          // 确保文档有焦点
          window.focus()

          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(shareUrl)
            copySuccessful = true
            setCopiedPlayerId(playerId)
            setTimeout(() => setCopiedPlayerId(null), 3000)
          }
        } catch (err) {
          console.error('Clipboard API复制失败:', err)
        }
      }

      // 显示结果消息
      if (copySuccessful) {
        alert(`${roleName}${playerNumber}的专属填写链接已复制到剪贴板！\n\n${shareUrl}\n\n请将此链接发送给${roleName}${playerNumber}填写个人信息`)
      } else {
        // 如果所有方法都失败，显示链接让用户手动复制
        alert(`请手动复制${roleName}${playerNumber}的专属填写链接：\n\n${shareUrl}\n\n请将此链接发送给${roleName}${playerNumber}填写个人信息`)
      }
    } catch (error) {
      console.error('生成分享链接失败:', error)
      alert('生成分享链接失败')
    }
  }

  const addPlayer = () => {
    // 向后兼容，默认添加队员角色
    addPlayerByRole('player')
  }

  const addPlayerByRole = (roleId: string) => {
    // 只在启用人数要求时才检查人数限制
    const countRequirementEnabled = event?.registration_settings?.player_requirements?.countRequirementEnabled

    if (countRequirementEnabled) {
      const maxCount = event?.registration_settings?.player_requirements?.maxCount || 20

      if (players.length >= maxCount) {
        alert(`人员数量不能超过 ${maxCount} 人`)
        return
      }
    }

    const newPlayer: Player = {
      id: Date.now().toString(),
      name: '', // 修复 TypeScript 错误
      role: roleId
    }

    const updatedPlayers = [...players, newPlayer]
    setPlayers(updatedPlayers)
    setPlayersByRole(organizePlayersByRole(updatedPlayers))
  }

  const removePlayer = (playerId: string) => {
    const updatedPlayers = players.filter(p => p.id !== playerId)
    setPlayers(updatedPlayers)
    setPlayersByRole(organizePlayersByRole(updatedPlayers))
  }

  // 验证身份证号码格式
  const validateIdNumber = (idNumber: string) => {
    // 去除空格
    const trimmedId = idNumber.trim()

    // 检查长度
    if (trimmedId.length !== 18) {
      return { valid: false, message: '身份证号码必须为18位' }
    }

    // 检查前17位是否为数字
    const first17 = trimmedId.slice(0, 17)
    if (!/^\d{17}$/.test(first17)) {
      return { valid: false, message: '身份证号码前17位必须为数字' }
    }

    // 检查第18位是否为数字或X/x
    const last = trimmedId.charAt(17)
    if (!/^[0-9Xx]$/.test(last)) {
      return { valid: false, message: '身份证号码第18位必须为数字或字母X' }
    }

    // 验证身份证号码的校验位
    const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
    const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']
    let sum = 0

    for (let i = 0; i < 17; i++) {
      sum += parseInt(trimmedId.charAt(i)) * weights[i]
    }

    const checkCode = checkCodes[sum % 11]
    const actualCheckCode = last.toUpperCase()

    if (checkCode !== actualCheckCode) {
      return { valid: false, message: '身份证号码校验位错误，请检查输入是否正确' }
    }

    return { valid: true, message: '身份证号码格式正确' }
  }

  const updatePlayer = (playerId: string, field: string, value: any) => {
    console.log('Updating player:', playerId, 'field:', field, 'value:', value)

    // 更新队员信息
    const updatedPlayers = players.map(p =>
      p.id === playerId ? { ...p, [field]: value } : p
    )
    setPlayers(updatedPlayers)

    // 同时更新按角色分组的数据
    setPlayersByRole(organizePlayersByRole(updatedPlayers))

    // 实时验证性别和年龄要求
    const playerRequirements = event?.registration_settings?.player_requirements
    const updatedPlayer = updatedPlayers.find(p => p.id === playerId)
    const playerIndex = players.findIndex(p => p.id === playerId)

    if (updatedPlayer && playerRequirements) {
      // 验证性别要求
      if (field === 'gender' || field === 'sex') {
        const genderRequirement = playerRequirements.genderRequirement
        if (genderRequirement && genderRequirement !== 'none') {
          const requiredGender = genderRequirement === 'male' ? '男' : '女'
          if (value && value !== requiredGender) {
            setTimeout(() => {
              alert(`注意：此赛事要求所有队员必须为${requiredGender}性，请确认队员 ${playerIndex + 1} 的性别信息`)
            }, 100)
          }
        }
      }

      // 验证年龄要求 - 支持更多字段名
      if ((field === 'age' || field === 'birthdate' || field === 'birthday') && playerRequirements?.ageRequirementEnabled) {
        // 获取出生日期范围
        const minAgeDate = playerRequirements.minAgeDate  // 最早出生日期
        const maxAgeDate = playerRequirements.maxAgeDate  // 最晚出生日期

        // 获取年龄范围（向后兼容）
        const minAge = playerRequirements.minAge
        const maxAge = playerRequirements.maxAge

        let playerAge = value
        let playerBirthDate = null

        // 如果是出生日期字段
        if ((field === 'birthdate' || field === 'birthday') && value) {
          playerBirthDate = new Date(value)
          const today = new Date()
          playerAge = today.getFullYear() - playerBirthDate.getFullYear()
          const monthDiff = today.getMonth() - playerBirthDate.getMonth()
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < playerBirthDate.getDate())) {
            playerAge--
          }
        } else if (field === 'age') {
          playerAge = parseInt(value) || 0
        }

        // 验证逻辑
        if (field === 'birthdate' || field === 'birthday') {
          // 出生日期字段：直接比较日期范围
          if (playerBirthDate && (minAgeDate || maxAgeDate)) {
            const birthDateStr = playerBirthDate.toISOString().split('T')[0]
            let dateWarning = ''

            if (minAgeDate && birthDateStr < minAgeDate) {
              const minYear = new Date(minAgeDate).getFullYear()
              dateWarning = `此赛事要求队员出生日期不早于 ${minAgeDate}（不超过 ${new Date().getFullYear() - minYear} 岁）`
            } else if (maxAgeDate && birthDateStr > maxAgeDate) {
              const maxYear = new Date(maxAgeDate).getFullYear()
              dateWarning = `此赛事要求队员出生日期不晚于 ${maxAgeDate}（不小于 ${new Date().getFullYear() - maxYear} 岁）`
            }

            if (dateWarning) {
              setTimeout(() => {
                alert(`⚠️ 出生日期不符合要求\n\n队员 ${playerIndex + 1}：${dateWarning}\n\n当前选择：${birthDateStr}\n请重新选择出生日期`)
              }, 300)
            }
          }
        } else if (field === 'age' && (minAge || maxAge)) {
          // 年龄字段：比较年龄范围
          if (playerAge && playerAge > 0) {
            let ageWarning = ''
            if (minAge && playerAge < minAge) {
              ageWarning = `此赛事要求队员年龄不小于 ${minAge} 岁，当前为 ${playerAge} 岁`
            } else if (maxAge && playerAge > maxAge) {
              ageWarning = `此赛事要求队员年龄不大于 ${maxAge} 岁，当前为 ${playerAge} 岁`
            }

            if (ageWarning) {
              setTimeout(() => {
                alert(`⚠️ 年龄不符合要求\n\n队员 ${playerIndex + 1}：${ageWarning}\n\n请检查并修改年龄信息`)
              }, 300)
            }
          }
        }
      }
    }
  }

  const validatePlayers = () => {
    const playerRequirements = event?.registration_settings?.player_requirements

    // 1. 验证人数要求
    const countRequirementEnabled = playerRequirements?.countRequirementEnabled
    if (countRequirementEnabled) {
      const minCount = playerRequirements?.minCount || 1
      const maxCount = playerRequirements?.maxCount || 20

      if (players.length < minCount) {
        alert(`队员人数不能少于 ${minCount} 人`)
        return false
      }

      if (players.length > maxCount) {
        alert(`队员人数不能超过 ${maxCount} 人`)
        return false
      }
    }

    // 2. 验证性别要求
    const genderRequirement = playerRequirements?.genderRequirement
    if (genderRequirement && genderRequirement !== 'none') {
      const requiredGender = genderRequirement === 'male' ? '男' : '女'

      for (let i = 0; i < players.length; i++) {
        const player = players[i]

        // 查找性别字段 - 可能是 'gender' 或 'sex'
        const playerGender = player.gender || player.sex

        if (!playerGender) {
          alert(`队员 ${i + 1} 必须填写性别信息`)
          return false
        }

        // 检查性别是否符合要求
        if (playerGender !== requiredGender) {
          alert(`此赛事要求所有队员必须为${requiredGender}性，但队员 ${i + 1} 的性别为${playerGender}`)
          return false
        }
      }
    }

    // 3. 验证年龄要求
    if (playerRequirements?.ageRequirementEnabled) {
      const minAgeDate = playerRequirements.minAgeDate
      const maxAgeDate = playerRequirements.maxAgeDate
      const minAge = playerRequirements.minAge
      const maxAge = playerRequirements.maxAge

      for (let i = 0; i < players.length; i++) {
        const player = players[i]
        const today = new Date()

        // 优先使用出生日期范围验证
        if ((minAgeDate || maxAgeDate) && player.birthdate) {
          const birthDate = new Date(player.birthdate)
          const birthDateStr = birthDate.toISOString().split('T')[0]

          if (minAgeDate && birthDateStr < minAgeDate) {
            const minYear = new Date(minAgeDate).getFullYear()
            const maxAgeFromDate = today.getFullYear() - minYear
            alert(`此赛事要求队员出生日期不早于 ${minAgeDate}（不超过 ${maxAgeFromDate} 岁），但队员 ${i + 1} 的出生日期为 ${birthDateStr}`)
            return false
          }

          if (maxAgeDate && birthDateStr > maxAgeDate) {
            const maxYear = new Date(maxAgeDate).getFullYear()
            const minAgeFromDate = today.getFullYear() - maxYear
            alert(`此赛事要求队员出生日期不晚于 ${maxAgeDate}（不小于 ${minAgeFromDate} 岁），但队员 ${i + 1} 的出生日期为 ${birthDateStr}`)
            return false
          }
        }
        // 兼容旧的年龄范围验证
        else if (minAge || maxAge) {
          // 查找年龄字段 - 可能是 'age' 或通过 'birthdate' 计算
          let playerAge = player.age

          // 如果没有直接的年龄，尝试从出生日期计算
          if (!playerAge && player.birthdate) {
            const birthDate = new Date(player.birthdate)
            playerAge = today.getFullYear() - birthDate.getFullYear()

            // 考虑月份和日期的影响
            const monthDiff = today.getMonth() - birthDate.getMonth()
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              playerAge--
            }
          }

          if (!playerAge) {
            alert(`队员 ${i + 1} 必须填写年龄或出生日期信息`)
            return false
          }

          // 检查年龄范围
          if (minAge && playerAge < minAge) {
            alert(`此赛事要求队员年龄不小于 ${minAge} 岁，但队员 ${i + 1} 年龄为 ${playerAge} 岁`)
            return false
          }

          if (maxAge && playerAge > maxAge) {
            alert(`此赛事要求队员年龄不大于 ${maxAge} 岁，但队员 ${i + 1} 年龄为 ${playerAge} 岁`)
            return false
          }
        }
        // 如果启用了年龄要求但没有设置具体的范围，至少要求填写出生日期或年龄
        else if (!player.birthdate && !player.age) {
          alert(`队员 ${i + 1} 必须填写出生日期或年龄信息`)
          return false
        }
      }
    }

    // 4. 验证必填字段
    for (let i = 0; i < players.length; i++) {
      const player = players[i]
      const selectedRoleId = player.role || 'player'
      const selectedRole = playerRequirements?.roles?.find(
        (r: any) => r.id === selectedRoleId
      ) || playerRequirements?.roles?.[0]

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
      return null
    }

    // 验证团队信息必填项
    const teamFields = event?.registration_settings?.team_requirements?.allFields ||
                      [...(event?.registration_settings?.team_requirements?.commonFields || []),
                       ...(event?.registration_settings?.team_requirements?.customFields || [])]

    const missingFields: string[] = []
    for (const field of teamFields) {
      if (field.required && !data[field.id]) {
        missingFields.push(field.label)
      }
    }

    if (missingFields.length > 0) {
      alert(`请填写团队信息必填项：${missingFields.join('、')}`)
      setActiveTab('team')
      return null
    }

    // 检查是否是已通过或待审核状态
    if (registration?.status === 'approved') {
      alert('已报名成功，无法保存草稿。请取消报名后再进行相应的操作。')
      return null
    }

    if (registration?.status === 'pending' || registration?.status === 'submitted') {
      // 根据是否在审核期显示不同提醒
      if (isInReviewPeriod()) {
        alert('报名正在审核中，无法保存草稿。')
      } else {
        alert('报名正在审核中，无法保存草稿。请取消报名后再进行相应的操作。')
      }
      return null
    }

    // 检查是否在审核期内（报名已结束但审核未结束）
    const now = new Date()
    let teamReq = event?.registration_settings?.team_requirements
    if (typeof teamReq === 'string') {
      try {
        teamReq = JSON.parse(teamReq)
      } catch (e) {
        console.error('解析 team_requirements 失败:', e)
      }
    }

    const regEndDate = teamReq?.registrationEndDate
    const reviewEndDate = teamReq?.reviewEndDate
    const regEnd = regEndDate ? new Date(regEndDate) : null
    const reviewEnd = reviewEndDate ? new Date(reviewEndDate) : null

    const inReviewPeriod = regEnd && reviewEnd && now > regEnd && now <= reviewEnd

    // 审核期内的限制
    if (inReviewPeriod) {
      if (isNewRegistration) {
        alert('报名已结束，现在处于审核期。审核期内不能新建报名，只能重新提交被驳回的报名。')
        return null
      }
      // 草稿在审核期内不能编辑
      if (registration?.status === 'draft') {
        alert('报名已结束，现在处于审核期。审核期内草稿不能继续编辑，只能查看或删除。')
        return null
      }
      // 只有被驳回的才能在审核期内重新编辑
      if (!registration || registration.status !== 'rejected') {
        alert('报名已结束，现在处于审核期。审核期内只能重新提交被驳回的报名。')
        return null
      }
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

      let savedRegistration = null

      if (registration?.id && !isNewRegistration) {
        // 更新现有报名（包括编辑特定报名和默认模式）
        const { error } = await supabase
          .from('registrations')
          .update(registrationData)
          .eq('id', registration.id)

        if (error) throw error
        savedRegistration = registration
      } else {
        // 创建新报名（新建模式或没有现有报名时）
        const { data: newReg, error } = await supabase
          .from('registrations')
          .insert(registrationData)
          .select()
          .single()

        if (error) throw error
        setRegistration(newReg)
        savedRegistration = newReg
      }

      alert('保存成功')
      return savedRegistration // 返回registration对象
    } catch (error: any) {
      console.error('保存失败:', error)
      alert(`保存失败：${error.message || '请重试'}`)
      return null // 返回null表示失败
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubmitRegistration = async (data: any) => {
    if (!coach) {
      alert('请先登录')
      return
    }

    // 检查是否是已通过或待审核状态
    if (registration?.status === 'approved') {
      alert('已报名成功，无法重复提交报名。请取消报名后再进行相应的操作。')
      return
    }

    if (registration?.status === 'pending' || registration?.status === 'submitted') {
      // 根据是否在审核期显示不同提醒
      if (isInReviewPeriod()) {
        alert('报名正在审核中，无法重复提交。')
      } else {
        alert('报名正在审核中，无法重复提交。请取消报名后再进行相应的操作。')
      }
      return
    }

    // 检查是否在审核期内（报名已结束但审核未结束）
    const now = new Date()
    let teamReq = event?.registration_settings?.team_requirements
    if (typeof teamReq === 'string') {
      try {
        teamReq = JSON.parse(teamReq)
      } catch (e) {
        console.error('解析 team_requirements 失败:', e)
      }
    }

    const regEndDate = teamReq?.registrationEndDate
    const reviewEndDate = teamReq?.reviewEndDate
    const regEnd = regEndDate ? new Date(regEndDate) : null
    const reviewEnd = reviewEndDate ? new Date(reviewEndDate) : null

    const inReviewPeriod = regEnd && reviewEnd && now > regEnd && now <= reviewEnd

    // 审核期内的限制
    if (inReviewPeriod) {
      if (isNewRegistration) {
        alert('报名已结束，现在处于审核期。审核期内不能新建报名，只能重新提交被驳回的报名。')
        return
      }
      // 草稿在审核期内不能提交
      if (registration?.status === 'draft') {
        alert('报名已结束，现在处于审核期。审核期内草稿不能提交，只能查看或删除。')
        return
      }
      // 只有被驳回的才能在审核期内重新提交
      if (!registration || registration.status !== 'rejected') {
        alert('报名已结束，现在处于审核期。审核期内只能重新提交被驳回的报名。')
        return
      }
    }

    if (!validatePlayers()) {
      setActiveTab('players')
      return
    }

    // 添加确认提交弹窗
    let confirmMessage = '确认提交报名？\n\n'
    if (registration?.status === 'draft') {
      confirmMessage += '当前为草稿状态，提交后将进入审核流程。'
    } else if (registration?.status === 'rejected') {
      confirmMessage += '当前报名已被驳回，确认要重新提交吗？\n驳回原因：' + (registration.rejection_reason || '未说明')
    } else if (registration?.status === 'cancelled') {
      confirmMessage += '当前报名已取消，确认要重新提交吗？'
    } else {
      confirmMessage += '提交后将进入审核流程，请确保信息填写正确。'
    }

    if (!window.confirm(confirmMessage)) {
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

  // 检查赛事是否已结束
  const isEventEnded = () => {
    if (!event) return false
    const now = new Date()

    // 获取报名相关时间
    let teamReq = event.registration_settings?.team_requirements
    if (typeof teamReq === 'string') {
      try {
        teamReq = JSON.parse(teamReq)
      } catch (e) {
        console.error('解析 team_requirements 失败:', e)
      }
    }

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

  // 如果赛事已结束且不是查看模式，不允许报名
  if (isEventEnded() && !isEventEndedView) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-lg text-gray-600">报名已截止</p>
          <p className="text-sm text-gray-500 mt-2">该比赛报名已截止，不能再进行报名</p>
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
      {/* 赛事已结束提示 */}
      {isEventEndedView && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-800">该比赛报名已截止</h3>
              <p className="text-red-600 mt-1">此赛事报名已截止，您只能查看报名信息，不能再次提交或修改。</p>
            </div>
          </div>
        </div>
      )}

      {/* 被驳回提示 */}
      {registration?.status === 'rejected' && registration?.rejection_reason && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-800">您的报名已被驳回</h3>
              <div className="mt-2">
                <p className="text-red-600 font-medium mb-2">驳回原因：</p>
                <div className="text-red-600 whitespace-pre-line pl-4">
                  {registration.rejection_reason}
                </div>
              </div>
              <p className="text-sm text-red-500 mt-3">请根据以上驳回原因修改后重新提交</p>
            </div>
          </div>
        </div>
      )}

      {/* 已取消提示 - 仅在报名期内显示 */}
      {registration?.status === 'cancelled' && !isInReviewPeriod() && !isEventEndedView && (
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
              <p className="text-green-600 mt-1">当前为查看模式，无法进行修改；如需修改，可取消此条报名信息，重新提交报名。</p>
            </div>
          </div>
        </div>
      )}

      {/* 待审核提示 */}
      {(registration?.status === 'pending' || registration?.status === 'submitted') && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-800">报名正在审核中</h3>
              <p className="text-blue-600 mt-1">当前为查看模式，无法修改或重新提交</p>
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
        
        {/* 根据状态判断是否显示保存和提交按钮 */}
        {shouldShowActionButtons() && (
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
        )}
      </div>

      {/* 审核期内新建报名的提示 */}
      {isInReviewPeriod() && isNewRegistration && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-red-900">不能新建报名</p>
              <p className="text-sm text-red-700">
                报名已结束，现在处于审核期。审核期内不接受新的报名申请，只能重新提交被驳回的报名。
              </p>
            </div>
          </div>
        </div>
      )}

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
                人员信息
                {players.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {players.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="team" className="mt-6">
              <form className="space-y-6">
                {allFields.map((field: any, index: number) => {
                  // Logo字段特殊处理
                  if (field.type === 'image' && (field.id === 'logo' || field.id === 'team_logo')) {
                    return (
                      <div key={`${field.id}-${index}`}>
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
                      <div key={`${field.id}-${index}`}>
                        <Label htmlFor={field.id}>
                          {field.label}{field.required && ' *'}
                        </Label>
                        <Input
                          id={field.id}
                          {...register(field.id)}
                          placeholder={field.placeholder || `请输入${field.label}`}
                          className="mt-1"
                          disabled={isEventEndedView}
                          readOnly={isEventEndedView}
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
                      <div key={`${field.id}-${index}`}>
                        <Label htmlFor={field.id}>
                          {field.label}{field.required && ' *'}
                        </Label>
                        <Input
                          id={field.id}
                          type="date"
                          {...register(field.id)}
                          className="mt-1"
                          disabled={isEventEndedView}
                          readOnly={isEventEndedView}
                        />
                        {errors[field.id] && (
                          <p className="text-red-600 text-sm mt-1">
                            {errors[field.id]?.message as string}
                          </p>
                        )}
                      </div>
                    )
                  }
                  
                  // 单选字段
                  if (field.type === 'select' && field.options) {
                    return (
                      <div key={`${field.id}-${index}`}>
                        <Label htmlFor={field.id}>
                          {field.label}
                          <span className="text-xs text-gray-500 font-normal ml-2">(单选)</span>
                          {field.required && ' *'}
                        </Label>
                        <div className="mt-2 space-y-2">
                          {field.options.map((option: string) => (
                            <div key={option} className="flex items-center space-x-2">
                              <input
                                type="radio"
                                id={`${field.id}-${option}`}
                                name={field.id}
                                value={option}
                                checked={watch(field.id) === option}
                                onChange={(e) => setValue(field.id, e.target.value)}
                                className="rounded-full border-gray-300"
                                disabled={isEventEndedView}
                              />
                              <label htmlFor={`${field.id}-${option}`} className="text-sm font-normal text-gray-700">
                                {option}
                              </label>
                            </div>
                          ))}
                        </div>
                        {errors[field.id] && (
                          <p className="text-red-600 text-sm mt-1">
                            {errors[field.id]?.message as string}
                          </p>
                        )}
                      </div>
                    )
                  }

                  // 其他图片上传字段（非logo字段）
                  if (field.type === 'image' && field.id !== 'logo' && field.id !== 'team_logo') {
                    return (
                      <div key={`${field.id}-${index}`}>
                        <Label htmlFor={field.id}>
                          {field.label}{field.required && ' *'}
                        </Label>
                        <div className="mt-2">
                          {watch(field.id) ? (
                            <div className="relative w-32 h-32 border rounded-lg overflow-hidden">
                              <Image
                                src={watch(field.id) as string}
                                alt={field.label}
                                fill
                                className="object-cover"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="absolute top-2 right-2"
                                onClick={() => setValue(field.id, '')}
                              >
                                移除
                              </Button>
                            </div>
                          ) : (
                            <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                              <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                              <p className="text-sm text-gray-600">点击上传{field.label}</p>
                              <p className="text-xs text-gray-500">支持 JPG、PNG 格式，大小不超过5MB</p>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    if (file.size > 5 * 1024 * 1024) {
                                      alert('图片大小不能超过 5MB')
                                      return
                                    }
                                    try {
                                      setIsSubmitting(true)
                                      const formData = new FormData()
                                      formData.append('file', file)
                                      formData.append('bucket', 'team-documents')
                                      const response = await fetch('/api/portal/upload', {
                                        method: 'POST',
                                        body: formData,
                                      })
                                      const result = await response.json()
                                      if (result.success) {
                                        setValue(field.id, result.data.url)
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
                                disabled={isEventEndedView}
                              />
                            </div>
                          )}
                        </div>
                        {errors[field.id] && (
                          <p className="text-red-600 text-sm mt-1">
                            {errors[field.id]?.message as string}
                          </p>
                        )}
                      </div>
                    )
                  }

                  // 多选字段
                  if (field.type === 'multiselect' && field.options) {
                    return (
                      <div key={`${field.id}-${index}`}>
                        <Label htmlFor={field.id}>
                          {field.label}
                          <span className="text-xs text-gray-500 font-normal ml-2">(可多选)</span>
                          {field.required && ' *'}
                        </Label>
                        <div className="mt-2 space-y-2">
                          {field.options.map((option: any, optionIndex: number) => (
                            <div key={`${field.id}-${option.value || optionIndex}`} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`${field.id}-${option.value || option.text || option.name || optionIndex}`}
                                checked={(watch(field.id) as string[] || []).includes(option.value || option.text || option.name || option)}
                                onChange={(e) => {
                                  const optionValue = option.value || option.text || option.name || option
                                  const currentValues = watch(field.id) as string[] || []
                                  if (e.target.checked) {
                                    setValue(field.id, [...currentValues, optionValue])
                                  } else {
                                    setValue(field.id, currentValues.filter(v => v !== optionValue))
                                  }
                                }}
                                className="rounded border-gray-300"
                                disabled={isEventEndedView}
                              />
                              <label htmlFor={`${field.id}-${option.value || option.text || option.name || optionIndex}`} className="text-sm font-normal text-gray-700">
                                {option.label || option.text || option.name || option}
                              </label>
                            </div>
                          ))}
                        </div>
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
                    <h3 className="text-lg font-semibold">人员列表</h3>
                    {/* 显示所有要求信息 */}
                    {(() => {
                      const playerReqs = event?.registration_settings?.player_requirements
                      const hasCountReq = playerReqs?.countRequirementEnabled
                      const hasGenderReq = playerReqs?.genderRequirement && playerReqs.genderRequirement !== 'none'
                      const hasAgeReq = playerReqs?.ageRequirementEnabled

                      if (hasCountReq || hasGenderReq || hasAgeReq) {
                        return (
                          <div className="text-sm text-gray-600 mt-2 space-y-1">
                            <p className="font-medium text-gray-700">报名要求：</p>

                            {/* 人数要求 */}
                            {hasCountReq && (
                              <div className="flex items-center gap-2">
                                <span className="text-blue-600">•</span>
                                <span>
                                  人数：{playerReqs.minCount || 1} - {playerReqs.maxCount || 20} 人
                                </span>
                              </div>
                            )}

                            {/* 性别要求 */}
                            {hasGenderReq && (
                              <div className="flex items-center gap-2">
                                <span className="text-blue-600">•</span>
                                <span>
                                  性别：仅限{playerReqs.genderRequirement === 'male' ? '男性' : '女性'}队员
                                </span>
                              </div>
                            )}

                            {/* 年龄要求 */}
                            {hasAgeReq && (
                              <div className="flex items-center gap-2">
                                <span className="text-blue-600">•</span>
                                <span>
                                  年龄：
                                  {playerReqs.minAge && playerReqs.maxAge ?
                                    `${playerReqs.minAge} - ${playerReqs.maxAge} 岁` :
                                    playerReqs.minAge ?
                                      `不小于 ${playerReqs.minAge} 岁` :
                                      playerReqs.maxAge ?
                                        `不大于 ${playerReqs.maxAge} 岁` :
                                        '有年龄限制'
                                  }
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {getOrderedRoles().map((role: any) => {
                      const rolePlayerCount = players.filter(p => (p.role || 'player') === role.id).length
                      return (
                        <Button
                          key={role.id}
                          type="button"
                          onClick={() => addPlayerByRole(role.id)}
                          size="sm"
                          disabled={isEventEndedView}
                          variant="default"
                          className="relative"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          <span>添加{role.name}</span>
                          {rolePlayerCount > 0 && (
                            <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold bg-blue-500 text-white">
                              {rolePlayerCount}
                            </span>
                          )}
                        </Button>
                      )
                    })}
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
                  <div className="space-y-6">
                    {getOrderedRoles().map((role: any) => {
                      const rolePlayers = players.filter(p => (p.role || 'player') === role.id)
                      if (rolePlayers.length === 0) return null

                      return (
                        <div key={role.id} className="space-y-4">
                          <div className="border-b pb-2">
                            <h4 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                              <span className={`w-3 h-3 rounded-full ${
                                role.id === 'player' ? 'bg-blue-500' : 'bg-green-500'
                              }`}></span>
                              {role.name}
                              <Badge variant="outline" className="ml-2">
                                {rolePlayers.length}人
                              </Badge>
                            </h4>
                          </div>

                          {rolePlayers.map((player, index) => {
                            const globalIndex = players.indexOf(player)
                            return (
                              <Card key={player.id}>
                                <CardContent className="p-4">
                                  <div className="flex items-start justify-between mb-4">
                                    <h5 className="font-medium">{role.name} {index + 1}</h5>
                                    <div className="flex gap-2">
                                      <Button
                                        type="button"
                                        variant={copiedPlayerId === player.id ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => generatePlayerShareLink(player.id, globalIndex + 1, role.name)}
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
                                            分享给{role.name}
                                          </>
                                        )}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removePlayer(player.id)}
                                        disabled={isEventEndedView}
                                      >
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                      </Button>
                                    </div>
                                  </div>
                          
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            
                                  {/* 根据角色动态渲染字段 */}
                                  {(() => {
                                    const selectedRole = role
                                    if (!selectedRole) return null

                                    // 获取队员要求配置
                                    const playerRequirements = event?.registration_settings?.player_requirements

                                    // 使用管理端设置的字段顺序
                                    const roleFields = selectedRole.allFields || [
                                      ...(selectedRole.commonFields || []),
                                      ...(selectedRole.customFields || [])
                                    ]

                                    return roleFields.map((field: any) => {
                                // 根据字段类型渲染不同的输入组件
                                switch (field.type) {
                                  case 'text':
                                    // 检查是否是身份证号码字段
                                    const isIdNumberField = field.id === 'id_number'
                                    let idValidation = { valid: true, message: '' }
                                    if (isIdNumberField && player[field.id]) {
                                      idValidation = validateIdNumber(player[field.id])
                                    }

                                    // 检查是否是年龄字段并有要求
                                    const isAgeField = field.id === 'age'
                                    const ageRequirement = isAgeField && playerRequirements?.ageRequirementEnabled
                                    const currentAge = parseInt(player[field.id]) || 0

                                    let ageStatus = ''
                                    let ageMessage = ''
                                    if (ageRequirement && currentAge > 0) {
                                      if (playerRequirements.minAge && currentAge < playerRequirements.minAge) {
                                        ageStatus = 'too_young'
                                        ageMessage = `年龄不能小于 ${playerRequirements.minAge} 岁，当前为 ${currentAge} 岁`
                                      } else if (playerRequirements.maxAge && currentAge > playerRequirements.maxAge) {
                                        ageStatus = 'too_old'
                                        ageMessage = `年龄不能大于 ${playerRequirements.maxAge} 岁，当前为 ${currentAge} 岁`
                                      } else if (
                                        (!playerRequirements.minAge || currentAge >= playerRequirements.minAge) &&
                                        (!playerRequirements.maxAge || currentAge <= playerRequirements.maxAge)
                                      ) {
                                        ageStatus = 'valid'
                                        ageMessage = `年龄 ${currentAge} 岁，符合要求`
                                      }
                                    }

                                    return (
                                      <div key={`${field.id}-${index}`}>
                                        <Label className="flex items-center gap-2">
                                          {field.label}{field.required && ' *'}
                                          {isIdNumberField && (
                                            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                                              18位
                                            </span>
                                          )}
                                          {ageRequirement && (
                                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                              {playerRequirements.minAge && playerRequirements.maxAge ?
                                                `${playerRequirements.minAge}-${playerRequirements.maxAge}岁` :
                                                playerRequirements.minAge ?
                                                  `≥${playerRequirements.minAge}岁` :
                                                  `≤${playerRequirements.maxAge}岁`
                                              }
                                            </span>
                                          )}
                                        </Label>
                                        <Input
                                          type={isAgeField ? "number" : "text"}
                                          value={player[field.id] || ''}
                                          onChange={(e) => updatePlayer(player.id, field.id, e.target.value)}
                                          placeholder={isIdNumberField ? '请输入18位身份证号码' : `请输入${field.label}`}
                                          maxLength={isIdNumberField ? 18 : undefined}
                                          disabled={isEventEndedView}
                                          readOnly={isEventEndedView}
                                          className={`mt-1 ${
                                            isIdNumberField && !idValidation.valid
                                              ? 'border-red-300 bg-red-50'
                                              : isIdNumberField && idValidation.valid && player[field.id]
                                              ? 'border-green-300 bg-green-50'
                                              : ageStatus === 'too_young' || ageStatus === 'too_old'
                                              ? 'border-red-300 bg-red-50'
                                              : ageStatus === 'valid'
                                              ? 'border-green-300 bg-green-50'
                                              : ''
                                          }`}
                                        />
                                        {isIdNumberField && player[field.id] && (
                                          <p className={`text-xs mt-1 font-medium ${
                                            !idValidation.valid
                                              ? 'text-red-600 bg-red-50 p-2 rounded border border-red-200'
                                              : 'text-green-600 bg-green-50 p-2 rounded border border-green-200'
                                          }`}>
                                            {idValidation.message}
                                          </p>
                                        )}
                                        {ageMessage && (
                                          <p className={`text-xs mt-1 font-medium ${
                                            ageStatus === 'too_young' || ageStatus === 'too_old'
                                              ? 'text-red-600 bg-red-50 p-2 rounded border border-red-200'
                                              : ageStatus === 'valid'
                                              ? 'text-green-600 bg-green-50 p-2 rounded border border-green-200'
                                              : ''
                                          }`}>
                                            {ageMessage}
                                          </p>
                                        )}
                                      </div>
                                    )
                                  case 'date':
                                    // 检查是否是出生日期字段并有年龄要求
                                    const isBirthdateField = field.id === 'birthdate' || field.id === 'birthday'
                                    const birthdateAgeRequirement = isBirthdateField && playerRequirements?.ageRequirementEnabled

                                    let birthdateAgeStatus = ''
                                    let calculatedAge = 0
                                    let birthdateAgeMessage = ''

                                    if (birthdateAgeRequirement && player[field.id]) {
                                      const birthDate = new Date(player[field.id])
                                      const today = new Date()
                                      calculatedAge = today.getFullYear() - birthDate.getFullYear()
                                      const monthDiff = today.getMonth() - birthDate.getMonth()
                                      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                                        calculatedAge--
                                      }

                                      const birthDateStr = birthDate.toISOString().split('T')[0]
                                      const minAgeDate = playerRequirements.minAgeDate
                                      const maxAgeDate = playerRequirements.maxAgeDate

                                      // 优先使用出生日期范围验证
                                      if (minAgeDate || maxAgeDate) {
                                        if (minAgeDate && birthDateStr < minAgeDate) {
                                          const minYear = new Date(minAgeDate).getFullYear()
                                          const maxAgeFromDate = today.getFullYear() - minYear
                                          birthdateAgeStatus = 'too_old'
                                          birthdateAgeMessage = `出生日期不能早于 ${minAgeDate}，当前 ${calculatedAge} 岁（超过 ${maxAgeFromDate} 岁限制）`
                                        } else if (maxAgeDate && birthDateStr > maxAgeDate) {
                                          const maxYear = new Date(maxAgeDate).getFullYear()
                                          const minAgeFromDate = today.getFullYear() - maxYear
                                          birthdateAgeStatus = 'too_young'
                                          birthdateAgeMessage = `出生日期不能晚于 ${maxAgeDate}，当前 ${calculatedAge} 岁（小于 ${minAgeFromDate} 岁限制）`
                                        } else {
                                          birthdateAgeStatus = 'valid'
                                          birthdateAgeMessage = `年龄 ${calculatedAge} 岁，出生日期符合要求`
                                        }
                                      }
                                      // 兼容旧的年龄范围设置
                                      else if (calculatedAge > 0) {
                                        if (playerRequirements.minAge && calculatedAge < playerRequirements.minAge) {
                                          birthdateAgeStatus = 'too_young'
                                          birthdateAgeMessage = `根据出生日期计算，年龄为 ${calculatedAge} 岁，不能小于 ${playerRequirements.minAge} 岁`
                                        } else if (playerRequirements.maxAge && calculatedAge > playerRequirements.maxAge) {
                                          birthdateAgeStatus = 'too_old'
                                          birthdateAgeMessage = `根据出生日期计算，年龄为 ${calculatedAge} 岁，不能大于 ${playerRequirements.maxAge} 岁`
                                        } else if (
                                          (!playerRequirements.minAge || calculatedAge >= playerRequirements.minAge) &&
                                          (!playerRequirements.maxAge || calculatedAge <= playerRequirements.maxAge)
                                        ) {
                                          birthdateAgeStatus = 'valid'
                                          birthdateAgeMessage = `年龄 ${calculatedAge} 岁，符合要求`
                                        }
                                      }
                                    }

                                    return (
                                      <div key={`${field.id}-${index}`}>
                                        <Label className="flex items-center gap-2">
                                          {field.label}{field.required && ' *'}
                                          {birthdateAgeRequirement && (
                                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                              {(() => {
                                                const minAgeDate = playerRequirements.minAgeDate
                                                const maxAgeDate = playerRequirements.maxAgeDate
                                                const minAge = playerRequirements.minAge
                                                const maxAge = playerRequirements.maxAge
                                                const currentYear = new Date().getFullYear()

                                                // 优先显示出生日期范围
                                                if (minAgeDate && maxAgeDate) {
                                                  const minYear = new Date(minAgeDate).getFullYear()
                                                  const maxYear = new Date(maxAgeDate).getFullYear()
                                                  const maxAgeFromDate = currentYear - minYear
                                                  const minAgeFromDate = currentYear - maxYear
                                                  return `${minAgeDate} 至 ${maxAgeDate}（${minAgeFromDate}-${maxAgeFromDate}岁）`
                                                } else if (minAgeDate) {
                                                  const maxAgeFromDate = currentYear - new Date(minAgeDate).getFullYear()
                                                  return `不早于 ${minAgeDate}（≤${maxAgeFromDate}岁）`
                                                } else if (maxAgeDate) {
                                                  const minAgeFromDate = currentYear - new Date(maxAgeDate).getFullYear()
                                                  return `不晚于 ${maxAgeDate}（≥${minAgeFromDate}岁）`
                                                }
                                                // 兼容旧的年龄范围
                                                else if (minAge && maxAge) {
                                                  return `需${minAge}-${maxAge}岁`
                                                } else if (minAge) {
                                                  return `需≥${minAge}岁`
                                                } else if (maxAge) {
                                                  return `需≤${maxAge}岁`
                                                }
                                                return '有年龄限制'
                                              })()}
                                            </span>
                                          )}
                                        </Label>
                                        <Input
                                          type="date"
                                          value={player[field.id] || ''}
                                          onChange={(e) => updatePlayer(player.id, field.id, e.target.value)}
                                          disabled={isEventEndedView}
                                          readOnly={isEventEndedView}
                                          className={`mt-1 ${
                                            birthdateAgeStatus === 'too_young' || birthdateAgeStatus === 'too_old'
                                              ? 'border-red-300 bg-red-50'
                                              : birthdateAgeStatus === 'valid'
                                              ? 'border-green-300 bg-green-50'
                                              : ''
                                          }`}
                                        />
                                        {birthdateAgeMessage && (
                                          <p className={`text-xs mt-1 font-medium ${
                                            birthdateAgeStatus === 'too_young' || birthdateAgeStatus === 'too_old'
                                              ? 'text-red-600 bg-red-50 p-2 rounded border border-red-200'
                                              : birthdateAgeStatus === 'valid'
                                              ? 'text-green-600 bg-green-50 p-2 rounded border border-green-200'
                                              : ''
                                          }`}>
                                            {birthdateAgeMessage}
                                          </p>
                                        )}
                                      </div>
                                    )
                                  case 'select':
                                    // 检查是否是性别字段并有要求
                                    const isGenderField = field.id === 'gender' || field.id === 'sex'
                                    const genderRequirement = isGenderField && playerRequirements?.genderRequirement && playerRequirements.genderRequirement !== 'none'
                                    const currentGender = player[field.id]

                                    return (
                                      <div key={`${field.id}-${index}`}>
                                        <Label className="flex items-center gap-2">
                                          {field.label}{field.required && ' *'}
                                          {genderRequirement && (
                                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                              仅限{playerRequirements.genderRequirement === 'male' ? '男性' : '女性'}
                                            </span>
                                          )}
                                        </Label>
                                        <Select
                                          value={player[field.id] || ''}
                                          onValueChange={(value) => updatePlayer(player.id, field.id, value)}
                                          disabled={isEventEndedView}
                                        >
                                          <SelectTrigger className={`mt-1 ${
                                            genderRequirement && currentGender &&
                                            currentGender !== (playerRequirements.genderRequirement === 'male' ? '男' : '女')
                                              ? 'border-red-300 bg-red-50'
                                              : ''
                                          }`}>
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
                                        {genderRequirement && currentGender &&
                                         currentGender !== (playerRequirements.genderRequirement === 'male' ? '男' : '女') && (
                                          <p className="text-red-600 text-xs mt-1">
                                            此赛事要求所有队员必须为{playerRequirements.genderRequirement === 'male' ? '男性' : '女性'}
                                          </p>
                                        )}
                                      </div>
                                    )
                                  case 'multiselect':
                                    // TODO: 实现多选逻辑
                                    return null
                                  case 'image':
                                    return (
                                      <div key={`${field.id}-${index}`}>
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
                            )
                          })}
                        </div>
                      )
                    })}
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