'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Send, CheckCircle, Loader2, Upload, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { parseIdCard, validateAgainstDivisionRules } from '@/lib/id-card-validator'

interface PlayerField {
  id: string
  label: string
  type: 'text' | 'date' | 'select' | 'multiselect' | 'image' | 'attachment' | 'attachments'
  required?: boolean
  options?: Array<string | { id?: string; label?: string; value?: string; text?: string; name?: string }>
  placeholder?: string
  conditionalRequired?: {
    dependsOn?: string
    values?: unknown[]
  }
}

interface RoleConfig {
  id: string
  name: string
  commonFields?: PlayerField[]
  customFields?: PlayerField[]
  allFields?: PlayerField[]
}

interface PlayerRequirementsConfig {
  roles?: RoleConfig[]
  genderRequirement?: 'none' | 'male' | 'female'
  minAge?: number
  maxAge?: number
  minAgeDate?: string
  maxAgeDate?: string
}

interface TeamRequirementsConfig {
  registrationEndDate?: string
  reviewEndDate?: string
}

interface RegistrationSettingsConfig {
  division_id?: string | null
  team_requirements?: TeamRequirementsConfig | string
  player_requirements?: PlayerRequirementsConfig
}

interface DivisionRules {
  gender?: 'male' | 'female' | 'mixed' | 'none'
  minAge?: number
  maxAge?: number
  minBirthDate?: string
  maxBirthDate?: string
  minPlayers?: number
  maxPlayers?: number
}

interface AttachmentValue {
  bucket?: string
  name: string
  path: string
  url: string
  size: number
  mimeType: string
  uploadedAt: string
}

const ATTACHMENT_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx']
const ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
const DESKTOP_ATTACHMENT_ACCEPT = [
  'application/pdf',
  '.pdf',
  'application/msword',
  '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.docx',
  'application/vnd.ms-excel',
  '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsx',
].join(',')

const VALIDATION_INPUT_ERROR_CLASS = 'border-destructive/40 bg-destructive/10 text-foreground dark:border-destructive/50 dark:bg-destructive/15'
const VALIDATION_INPUT_SUCCESS_CLASS = 'border-emerald-500/40 bg-emerald-500/10 text-foreground dark:border-emerald-400/40 dark:bg-emerald-500/15'
const VALIDATION_MESSAGE_ERROR_CLASS = 'rounded border border-destructive/20 bg-destructive/10 p-2 text-destructive'
const VALIDATION_MESSAGE_SUCCESS_CLASS = 'rounded border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-300'
const MUTED_BADGE_CLASS = 'rounded bg-muted px-2 py-1 text-xs text-muted-foreground'
const INFO_BADGE_CLASS = 'rounded bg-sky-500/10 px-2 py-1 text-xs text-sky-700 dark:text-sky-300'

function isIdentityDocumentSelected(values: { id_type?: unknown }): boolean {
  return String(values.id_type || '').trim() === '身份证'
}

function isFieldConditionSatisfied(field: PlayerField, values: Record<string, any>): boolean {
  if (!field.conditionalRequired?.dependsOn) return true

  const dependencyValue = values?.[field.conditionalRequired.dependsOn]
  if (!Array.isArray(field.conditionalRequired.values) || field.conditionalRequired.values.length === 0) {
    return Boolean(dependencyValue)
  }

  return field.conditionalRequired.values.includes(dependencyValue)
}

function isFieldRequiredForValues(field: PlayerField, values: Record<string, any>): boolean {
  return Boolean(field.required && isFieldConditionSatisfied(field, values))
}

function getFieldDisplayLabel(field: PlayerField): string {
  if (field.id === 'id_number') return '证件号码'
  return field.label || field.id
}

function parseLocalDate(dateValue?: string | null): Date | undefined {
  if (!dateValue) return undefined

  const normalized = String(dateValue).slice(0, 10)
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return undefined

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined
  }

  return date
}

function calculateAgeFromDateString(
  dateValue?: string | null,
  referenceDate: Date = new Date()
): number | undefined {
  const birthDate = parseLocalDate(dateValue)
  if (!birthDate) return undefined

  let age = referenceDate.getFullYear() - birthDate.getFullYear()
  const monthDiff = referenceDate.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())) {
    age--
  }

  return age >= 0 ? age : undefined
}

function resolveAgeRequirementBounds(rules: {
  minAge?: number
  maxAge?: number
  minBirthDate?: string
  maxBirthDate?: string
}) {
  const hasBirthDateRule = Boolean(rules.minBirthDate || rules.maxBirthDate)

  if (hasBirthDateRule) {
    return {
      minAge: calculateAgeFromDateString(rules.maxBirthDate),
      maxAge: calculateAgeFromDateString(rules.minBirthDate),
      usesBirthDateRule: true,
    }
  }

  return {
    minAge: rules.minAge,
    maxAge: rules.maxAge,
    usesBirthDateRule: false,
  }
}

function formatAgeRequirementLabel(minAge?: number, maxAge?: number): string | null {
  if (minAge !== undefined && maxAge !== undefined) {
    return minAge === maxAge ? `${minAge}岁` : `${minAge}-${maxAge}岁`
  }

  if (minAge !== undefined) return `≥${minAge}岁`
  if (maxAge !== undefined) return `≤${maxAge}岁`

  return null
}

function parseAgeValue(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined

  const normalized = String(value).trim()
  if (!normalized) return undefined

  const age = Number(normalized)
  if (!Number.isInteger(age) || age < 0) return undefined

  return age
}

function validateIdNumber(idNumber: string) {
  const trimmedId = idNumber.trim()

  if (trimmedId.length !== 18) {
    return { valid: false, message: '身份证号码必须为18位' }
  }

  const first17 = trimmedId.slice(0, 17)
  if (!/^\d{17}$/.test(first17)) {
    return { valid: false, message: '身份证号码前17位必须为数字' }
  }

  const last = trimmedId.charAt(17)
  if (!/^[0-9Xx]$/.test(last)) {
    return { valid: false, message: '身份证号码第18位必须为数字或字母X' }
  }

  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']
  let sum = 0

  for (let i = 0; i < 17; i++) {
    sum += parseInt(trimmedId.charAt(i), 10) * weights[i]
  }

  const checkCode = checkCodes[sum % 11]
  const actualCheckCode = last.toUpperCase()

  if (checkCode !== actualCheckCode) {
    return { valid: false, message: '身份证号码校验位错误，请检查输入是否正确' }
  }

  return { valid: true, message: '证件号码格式正确' }
}

function hasFieldValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (value === null || value === undefined) return false
  if (typeof value === 'object') {
    const attachmentValue = value as { url?: unknown }
    if ('url' in attachmentValue) {
      return typeof attachmentValue.url === 'string' && attachmentValue.url.trim().length > 0
    }
    return Object.keys(value as Record<string, unknown>).length > 0
  }
  return String(value).trim().length > 0
}

function getOptionValue(option: string | { id?: string; label?: string; value?: string; text?: string; name?: string }): string {
  if (typeof option === 'string') return option
  return option.value || option.id || option.label || option.text || option.name || ''
}

function getOptionLabel(option: string | { id?: string; label?: string; value?: string; text?: string; name?: string }): string {
  if (typeof option === 'string') return option
  return option.label || option.text || option.name || option.value || option.id || ''
}

function parseTeamRequirements(
  value?: TeamRequirementsConfig | string | null
): TeamRequirementsConfig | undefined {
  if (!value) return undefined

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object') {
        return parsed as TeamRequirementsConfig
      }
      return undefined
    } catch {
      return undefined
    }
  }

  return value
}

function selectMatchingRegistrationSettings(
  eventData: any,
  divisionId?: string | null
): RegistrationSettingsConfig | null {
  const settingsByDivision = Array.isArray(eventData?.registration_settings_by_division)
    ? eventData.registration_settings_by_division
    : []

  if (divisionId) {
    const matched = settingsByDivision.find((setting: RegistrationSettingsConfig) => setting?.division_id === divisionId)
    if (matched) return matched
  }

  return eventData?.registration_settings || settingsByDivision.find((setting: RegistrationSettingsConfig) => !setting?.division_id) || settingsByDivision[0] || null
}

export default function PlayerSharePage() {
  const params = useParams()
  const token = params.token as string

  const [shareToken, setShareToken] = useState<any>(null)
  const [event, setEvent] = useState<any>(null)
  const [registration, setRegistration] = useState<any>(null)
  const [teamData, setTeamData] = useState<any>(null)
  const [sharedPlayerSnapshot, setSharedPlayerSnapshot] = useState<any>({})
  const [playerData, setPlayerData] = useState<any>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRegistrationClosed, setIsRegistrationClosed] = useState(false)
  const [lockedRoleId, setLockedRoleId] = useState('player')

  useEffect(() => {
    if (token) {
      fetchTokenData()
    }
  }, [token])

  const fetchTokenData = async () => {
    try {
      // 使用新的API获取分享令牌信息
      const response = await fetch(`/api/player-share/${token}`, {
        cache: 'no-store',
      })
      const result = await response.json()

      if (!result.success) {
        setError(result.error || '无效的分享链接')
        setIsLoading(false)
        return
      }

      const { token_info, registration, event, shared_player } = result.data

      setShareToken(token_info)
      setEvent(event)
      setRegistration(registration)
      setTeamData(registration.team_data)
      setSharedPlayerSnapshot(shared_player || {})

      // 检查报名是否已截止或已提交
      // 1. 检查报名状态 - 只有草稿和已驳回状态允许修改
      // draft: 草稿，可以修改
      // rejected: 已驳回，可以修改后重新提交
      // pending/submitted: 待审核，不允许修改
      // approved: 已通过，不允许修改
      const allowedStatuses = ['draft', 'rejected']
      if (registration.status && !allowedStatuses.includes(registration.status)) {
        setIsRegistrationClosed(true)
      } else {
        // 2. 检查时间维度
        const matchedSettings = selectMatchingRegistrationSettings(event, registration?.team_data?.division_id)
        const teamReq = parseTeamRequirements(matchedSettings?.team_requirements)
        if (teamReq) {
          const now = new Date()
          const regEndDate = teamReq?.registrationEndDate
          const reviewEndDate = teamReq?.reviewEndDate
          const regEnd = regEndDate ? new Date(regEndDate) : null
          const reviewEnd = reviewEndDate ? new Date(reviewEndDate) : null

          // 如果有审核结束时间，检查是否超过；否则检查报名结束时间
          const isClosed = reviewEnd ? now > reviewEnd : (regEnd ? now > regEnd : false)
          setIsRegistrationClosed(isClosed)
        }
      }

      // 如果指定了队员索引，加载现有数据
      const existingPlayerData = shared_player || {}

      const resolvedRoleId = String(existingPlayerData?.role || 'player')
      setLockedRoleId(resolvedRoleId)
      setPlayerData({
        ...existingPlayerData,
        role: resolvedRoleId,
      })

      setIsLoading(false)
    } catch (error) {
      console.error('获取分享信息失败:', error)
      setError('获取分享信息失败')
      setIsLoading(false)
    }
  }

  const activeRegistrationSettings = useMemo(
    () => selectMatchingRegistrationSettings(event, teamData?.division_id),
    [event, teamData?.division_id]
  )

  const playerRequirements = activeRegistrationSettings?.player_requirements

  const activeDivisionRules = useMemo<DivisionRules>(() => ({
    gender: playerRequirements?.genderRequirement || 'none',
    minAge: playerRequirements?.minAge,
    maxAge: playerRequirements?.maxAge,
    minBirthDate: playerRequirements?.minAgeDate,
    maxBirthDate: playerRequirements?.maxAgeDate,
  }), [playerRequirements?.genderRequirement, playerRequirements?.maxAge, playerRequirements?.maxAgeDate, playerRequirements?.minAge, playerRequirements?.minAgeDate])

  const ageRuleBounds = useMemo(
    () => resolveAgeRequirementBounds(activeDivisionRules),
    [activeDivisionRules]
  )

  const attachmentAccept = useMemo<string | undefined>(() => {
    if (typeof navigator === 'undefined') {
      return DESKTOP_ATTACHMENT_ACCEPT
    }

    const ua = navigator.userAgent.toLowerCase()
    const isMobileFileChooser = /iphone|ipad|ipod|android|mobile|harmonyos/.test(ua)
    return isMobileFileChooser ? undefined : DESKTOP_ATTACHMENT_ACCEPT
  }, [])

  const isValidAttachmentFile = (file: File) => {
    if (ATTACHMENT_MIME_TYPES.has(file.type)) {
      return true
    }

    const extension = file.name.split('.').pop()?.toLowerCase()
    return extension ? ATTACHMENT_EXTENSIONS.includes(extension) : false
  }

  const uploadSharedFile = async (file: File, bucket: 'player-photos' | 'team-documents') => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('bucket', bucket)

    const response = await fetch(`/api/player-share/${token}/upload`, {
      method: 'POST',
      body: formData,
    })

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.error || '上传失败')
    }

    return result.data
  }

  const toAttachmentValue = (data: any): AttachmentValue => ({
    bucket: typeof data.bucket === 'string' ? data.bucket : undefined,
    name: data.originalName || data.fileName || '附件',
    path: data.path,
    url: data.url,
    size: Number(data.size || 0),
    mimeType: data.mimeType || '',
    uploadedAt: new Date().toISOString(),
  })

  const formatFileSize = (size: number) => {
    if (size <= 0) return '0 B'
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  const getPreviewUrl = (url: string, fileName?: string) => {
    const isManagedStorageUrl =
      url.startsWith('/api/storage/object?') || url.includes('/api/storage/object?')
    const ext = (fileName || url).split('.').pop()?.toLowerCase()?.split('?')[0] || ''
    if (ext === 'pdf') return url
    if (!isManagedStorageUrl && ['doc', 'docx', 'xls', 'xlsx'].includes(ext)) {
      return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`
    }
    return url
  }

  const selectedRoleId = lockedRoleId || playerData.role || 'player'
  const selectedRole = playerRequirements?.roles?.find(
    (role: RoleConfig) => role.id === selectedRoleId
  ) || playerRequirements?.roles?.[0]
  const lockedRoleName = selectedRole?.name || '人员'

  let roleFields = selectedRole?.allFields || [
    ...(selectedRole?.commonFields || []),
    ...(selectedRole?.customFields || [])
  ]

  if (!roleFields || roleFields.length === 0) {
    roleFields = [
      { id: 'name', label: '姓名', type: 'text', required: true },
      { id: 'gender', label: '性别', type: 'select', required: true, options: ['男', '女'] },
      { id: 'birthdate', label: '出生日期', type: 'date', required: false },
      { id: 'age', label: '年龄', type: 'text', required: false },
      { id: 'id_type', label: '证件类型', type: 'select', required: false, options: ['身份证', '其他'] },
      { id: 'id_number', label: '证件号码', type: 'text', required: false }
    ]
  }

  const handleSubmit = async () => {
    const mergedPlayerData = {
      ...sharedPlayerSnapshot,
      ...playerData,
      role: selectedRoleId,
    }

    // 验证所有必填字段
    for (const field of roleFields) {
      const fieldLabel = getFieldDisplayLabel(field)
      if (isFieldRequiredForValues(field, mergedPlayerData) && !hasFieldValue(mergedPlayerData[field.id])) {
        alert(`请填写${fieldLabel}`)
        return
      }

      // 特殊验证：身份证号码
      if (field.id === 'id_number' && isIdentityDocumentSelected(mergedPlayerData) && mergedPlayerData[field.id]) {
        const validation = validateIdNumber(mergedPlayerData[field.id])
        if (!validation.valid) {
          alert(`身份证号码格式错误: ${validation.message}`)
          return
        }
      }
    }

    if ((mergedPlayerData.role || 'player') === 'player') {
      const idNumber = String(mergedPlayerData.id_number || '').trim()
      const enteredAge = parseAgeValue(mergedPlayerData.age)
      const useIdentityDocumentValidation = isIdentityDocumentSelected(mergedPlayerData)

      if (useIdentityDocumentValidation && idNumber) {
        const idRuleValidation = validateAgainstDivisionRules(idNumber, activeDivisionRules)
        if (!idRuleValidation.isValid) {
          alert(`当前队员不符合组别要求：\n${idRuleValidation.errors.join('\n')}`)
          return
        }

        const idCardInfo = parseIdCard(idNumber)
        if (enteredAge !== undefined && idCardInfo.isValid && idCardInfo.age !== undefined && enteredAge !== idCardInfo.age) {
          alert(`当前队员填写年龄为 ${enteredAge} 岁，但身份证号对应年龄为 ${idCardInfo.age} 岁，请核对后再提交`)
          return
        }
      } else {
        if (activeDivisionRules.gender && activeDivisionRules.gender !== 'none' && activeDivisionRules.gender !== 'mixed') {
          const requiredGender = activeDivisionRules.gender === 'male' ? '男' : '女'
          const playerGender = mergedPlayerData.gender || mergedPlayerData.sex
          if (!playerGender) {
            alert('当前队员必须填写性别信息')
            return
          }
          if (playerGender !== requiredGender) {
            alert(`该组别仅限${requiredGender}队员，但当前队员的性别为${playerGender}`)
            return
          }
        }

        if (activeDivisionRules.minBirthDate || activeDivisionRules.maxBirthDate) {
          let birthDateStr: string | undefined
          if (mergedPlayerData.birthdate) {
            birthDateStr = String(mergedPlayerData.birthdate).slice(0, 10)
          } else if (mergedPlayerData.birthday) {
            birthDateStr = String(mergedPlayerData.birthday).slice(0, 10)
          }
          if (birthDateStr) {
            if (activeDivisionRules.minBirthDate && birthDateStr < activeDivisionRules.minBirthDate) {
              alert(`当前队员出生日期为 ${birthDateStr}，早于组别要求的 ${activeDivisionRules.minBirthDate}`)
              return
            }
            if (activeDivisionRules.maxBirthDate && birthDateStr > activeDivisionRules.maxBirthDate) {
              alert(`当前队员出生日期为 ${birthDateStr}，晚于组别要求的 ${activeDivisionRules.maxBirthDate}`)
              return
            }
          } else {
            if (enteredAge === undefined) {
              alert('当前队员需补充年龄或出生日期用于组别校验')
              return
            }
            if (ageRuleBounds.minAge !== undefined && enteredAge < ageRuleBounds.minAge) {
              alert(`当前队员年龄为 ${enteredAge} 岁，小于当前允许年龄 ${ageRuleBounds.minAge} 岁`)
              return
            }
            if (ageRuleBounds.maxAge !== undefined && enteredAge > ageRuleBounds.maxAge) {
              alert(`当前队员年龄为 ${enteredAge} 岁，大于当前允许年龄 ${ageRuleBounds.maxAge} 岁`)
              return
            }
          }
        } else if (activeDivisionRules.minAge !== undefined || activeDivisionRules.maxAge !== undefined) {
          let playerAge = enteredAge
          if (playerAge === undefined) {
            playerAge = calculateAgeFromDateString(mergedPlayerData.birthdate || mergedPlayerData.birthday)
          }

          if (playerAge === undefined || Number.isNaN(playerAge)) {
            alert('当前队员需补充年龄或出生日期用于组别年龄校验')
            return
          }
          if (activeDivisionRules.minAge !== undefined && playerAge < activeDivisionRules.minAge) {
            alert(`当前队员年龄为 ${playerAge} 岁，小于组别最小年龄 ${activeDivisionRules.minAge} 岁`)
            return
          }
          if (activeDivisionRules.maxAge !== undefined && playerAge > activeDivisionRules.maxAge) {
            alert(`当前队员年龄为 ${playerAge} 岁，大于组别最大年龄 ${activeDivisionRules.maxAge} 岁`)
            return
          }
        }
      }
    }

    setIsSubmitting(true)

    try {
      // 使用新的API来更新队员信息
      const response = await fetch(`/api/player-share/${token}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          player_data: mergedPlayerData
        }),
      })

      const result = await response.json()

      if (result.success) {
        setSharedPlayerSnapshot(mergedPlayerData)
        setIsSubmitted(true)
        alert('提交成功！您的信息已保存，如需修改请联系教练重新生成新的分享链接')
      } else {
        alert(result.error || '提交失败，请重试')
      }
    } catch (error) {
      console.error('提交失败:', error)
      alert('提交失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  const updatePlayerData = (field: string, value: any) => {
    if (field === 'role') {
      return
    }

    setPlayerData((prev: any) => ({
      ...prev,
      role: lockedRoleId || prev?.role || 'player',
      [field]: value
    }))
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              错误
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isRegistrationClosed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <Badge variant="outline">{event?.name}</Badge>
              {teamData?.team_name && (
                <Badge>{teamData.team_name}</Badge>
              )}
            </div>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
              报名已截止
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              该比赛报名已截止，不可修改报名信息。
            </p>
            <p className="text-sm text-gray-500">
              如有疑问，请联系赛事组织方。
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 sm:py-8">
        <Card className="mx-auto w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              提交成功
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">您的{lockedRoleName}信息已成功提交。</p>
            <p className="mb-4 text-sm text-muted-foreground">该分享链接已自动失效，如需修改请联系教练重新生成新的分享链接。</p>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">已提交的信息：</h4>
              <div className="space-y-3 text-sm">
                {roleFields.map((field: any) => {
                  const value = playerData[field.id]
                  const fieldLabel = getFieldDisplayLabel(field)
                  if (!hasFieldValue(value)) return null

                  // 处理不同类型的显示
                  const isImageField = field.type === 'image' && typeof value === 'string'
                  const displayValue = Array.isArray(value)
                    ? value.join(', ')
                    : field.type === 'date'
                      ? new Date(value).toLocaleDateString('zh-CN')
                      : String(value)

                  return (
                    <div key={field.id} className="space-y-2">
                      <p className="font-medium">{fieldLabel}：</p>
                      {isImageField ? (
                        <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
                          <div className="relative h-16 w-16 overflow-hidden rounded-md border bg-background">
                            <Image
                              src={value}
                              alt={fieldLabel}
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">已上传{fieldLabel}</p>
                            <p className="text-xs text-muted-foreground">图片预览已保存</p>
                          </div>
                        </div>
                      ) : (
                        <p className="break-all text-sm text-foreground">{displayValue}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Badge className="max-w-full justify-center truncate sm:max-w-[70%]" variant="outline">{event?.name}</Badge>
              {teamData?.team_name && (
                <Badge className="max-w-full justify-center truncate sm:max-w-[40%]">{teamData.team_name}</Badge>
              )}
            </div>
            <CardTitle>{lockedRoleName}信息填写</CardTitle>
            <CardDescription>
              请填写您的个人信息，完成后点击提交
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {playerRequirements?.roles && playerRequirements.roles.length > 0 && (
                <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                  <Label className="flex flex-wrap items-center gap-2 text-sm font-medium leading-none">
                    角色
                    <span className={MUTED_BADGE_CLASS}>已锁定</span>
                  </Label>
                  <p className="text-sm font-medium text-foreground">{lockedRoleName}</p>
                  <p className="text-xs text-muted-foreground">该分享链接仅可填写当前角色的信息，提交后将自动失效。</p>
                </div>
              )}

              {/* 动态渲染字段 - 与报名端保持一致 */}
              {roleFields.map((field: any) => {
                const fieldLabel = getFieldDisplayLabel(field)
                const isFieldRequired = isFieldRequiredForValues(field, playerData)
                const useIdentityDocumentValidation = isIdentityDocumentSelected(playerData)
                const isAgeField = field.id === 'age'
                const isBirthdateField = field.id === 'birthdate' || field.id === 'birthday'
                const ageRequirement = isAgeField && (
                  activeDivisionRules.minBirthDate !== undefined ||
                  activeDivisionRules.maxBirthDate !== undefined ||
                  activeDivisionRules.minAge !== undefined ||
                  activeDivisionRules.maxAge !== undefined
                )
                const ageRequirementLabel = formatAgeRequirementLabel(ageRuleBounds.minAge, ageRuleBounds.maxAge)

                switch (field.type) {
                  case 'text':
                    // 检查是否是身份证号码字段
                    const isIdNumberField = field.id === 'id_number'
                    let idValidation = { valid: true, message: '' }
                    let idRuleErrors: string[] = []
                    let ageStatus = ''
                    let ageMessage = ''
                    if (isIdNumberField && useIdentityDocumentValidation && playerData[field.id]) {
                      idValidation = validateIdNumber(playerData[field.id])
                      if (idValidation.valid) {
                        const idRuleValidation = validateAgainstDivisionRules(playerData[field.id], activeDivisionRules)
                        if (!idRuleValidation.isValid) {
                          idRuleErrors = idRuleValidation.errors
                        }
                      }
                    }

                    if (isAgeField && ageRequirement && hasFieldValue(playerData[field.id])) {
                      const currentAge = parseAgeValue(playerData[field.id])
                      const ageErrors: string[] = []
                      const ageSuccessMessages: string[] = []

                      if (currentAge === undefined) {
                        ageErrors.push('请输入有效年龄')
                      } else {
                        if (ageRuleBounds.minAge !== undefined && currentAge < ageRuleBounds.minAge) {
                          ageErrors.push(`年龄不能小于 ${ageRuleBounds.minAge} 岁，当前为 ${currentAge} 岁`)
                        } else if (ageRuleBounds.maxAge !== undefined && currentAge > ageRuleBounds.maxAge) {
                          ageErrors.push(`年龄不能大于 ${ageRuleBounds.maxAge} 岁，当前为 ${currentAge} 岁`)
                        } else {
                          ageSuccessMessages.push(`年龄 ${currentAge} 岁，符合要求`)
                        }

                        const idNumber = String(playerData.id_number || '').trim()
                        if (useIdentityDocumentValidation && idNumber) {
                          const parsedIdCard = parseIdCard(idNumber)
                          if (parsedIdCard.isValid && parsedIdCard.age !== undefined && parsedIdCard.age !== currentAge) {
                            ageErrors.push(`身份证号对应年龄为 ${parsedIdCard.age} 岁，与填写年龄 ${currentAge} 岁不一致`)
                          }
                        }
                      }

                      if (ageErrors.length > 0) {
                        ageStatus = 'invalid'
                        ageMessage = ageErrors.join('；')
                      } else if (ageSuccessMessages.length > 0) {
                        ageStatus = 'valid'
                        ageMessage = ageSuccessMessages.join('；')
                      }
                    }

                    return (
                      <div key={field.id} className="space-y-2">
                        <Label className="flex flex-wrap items-center gap-2 text-sm font-medium leading-none">
                          {fieldLabel}{isFieldRequired && ' *'}
                          {isIdNumberField && useIdentityDocumentValidation && (
                            <span className={MUTED_BADGE_CLASS}>
                              18位
                            </span>
                          )}
                          {isAgeField && ageRequirement && ageRequirementLabel && (
                            <span className={INFO_BADGE_CLASS}>
                              {ageRequirementLabel}
                            </span>
                          )}
                        </Label>
                        <Input
                          value={playerData[field.id] || ''}
                          onChange={(e) => updatePlayerData(field.id, e.target.value)}
                          type={isAgeField ? 'number' : 'text'}
                          placeholder={isIdNumberField
                            ? (useIdentityDocumentValidation ? '请输入18位身份证号码' : '请输入证件号码')
                            : `请输入${fieldLabel}`}
                          maxLength={isIdNumberField && useIdentityDocumentValidation ? 18 : undefined}
                          className={`h-11 ${
                            isIdNumberField && useIdentityDocumentValidation && (!idValidation.valid || idRuleErrors.length > 0)
                              ? VALIDATION_INPUT_ERROR_CLASS
                            : isIdNumberField && useIdentityDocumentValidation && idValidation.valid && playerData[field.id] && idRuleErrors.length === 0
                              ? VALIDATION_INPUT_SUCCESS_CLASS
                              : ageStatus === 'invalid'
                              ? VALIDATION_INPUT_ERROR_CLASS
                              : ageStatus === 'valid'
                              ? VALIDATION_INPUT_SUCCESS_CLASS
                              : ''
                          }`}
                        />
                        {isIdNumberField && useIdentityDocumentValidation && playerData[field.id] && (
                          <p className={`text-xs font-medium ${
                            !idValidation.valid || idRuleErrors.length > 0
                              ? VALIDATION_MESSAGE_ERROR_CLASS
                              : VALIDATION_MESSAGE_SUCCESS_CLASS
                          }`}>
                            {!idValidation.valid ? idValidation.message : idRuleErrors.length > 0 ? idRuleErrors.join('；') : idValidation.message}
                          </p>
                        )}
                        {isAgeField && ageMessage && (
                          <p className={`text-xs font-medium ${
                            ageStatus === 'invalid'
                              ? VALIDATION_MESSAGE_ERROR_CLASS
                              : ageStatus === 'valid'
                              ? VALIDATION_MESSAGE_SUCCESS_CLASS
                              : ''
                          }`}>
                            {ageMessage}
                          </p>
                        )}
                      </div>
                    )
                  case 'date':
                    const birthdateAgeRequirement = isBirthdateField && (
                      activeDivisionRules.minBirthDate !== undefined ||
                      activeDivisionRules.maxBirthDate !== undefined ||
                      activeDivisionRules.minAge !== undefined ||
                      activeDivisionRules.maxAge !== undefined
                    )
                    let birthdateAgeStatus = ''
                    let birthdateAgeMessage = ''

                    if (birthdateAgeRequirement && playerData[field.id]) {
                      const calculatedAge = calculateAgeFromDateString(playerData[field.id])
                      const birthDateStr = String(playerData[field.id]).slice(0, 10)

                      if ((activeDivisionRules.minBirthDate || activeDivisionRules.maxBirthDate) && calculatedAge !== undefined) {
                        if (activeDivisionRules.minBirthDate && birthDateStr < activeDivisionRules.minBirthDate) {
                          birthdateAgeStatus = 'invalid'
                          birthdateAgeMessage = `出生日期不能早于 ${activeDivisionRules.minBirthDate}，当前为 ${calculatedAge} 岁${ageRuleBounds.maxAge !== undefined ? `，超过 ${ageRuleBounds.maxAge} 岁限制` : ''}`
                        } else if (activeDivisionRules.maxBirthDate && birthDateStr > activeDivisionRules.maxBirthDate) {
                          birthdateAgeStatus = 'invalid'
                          birthdateAgeMessage = `出生日期不能晚于 ${activeDivisionRules.maxBirthDate}，当前为 ${calculatedAge} 岁${ageRuleBounds.minAge !== undefined ? `，小于 ${ageRuleBounds.minAge} 岁限制` : ''}`
                        } else {
                          birthdateAgeStatus = 'valid'
                          birthdateAgeMessage = `年龄 ${calculatedAge} 岁，出生日期符合要求`
                        }
                      } else if (calculatedAge !== undefined) {
                        if (ageRuleBounds.minAge !== undefined && calculatedAge < ageRuleBounds.minAge) {
                          birthdateAgeStatus = 'invalid'
                          birthdateAgeMessage = `根据出生日期计算，年龄为 ${calculatedAge} 岁，不能小于 ${ageRuleBounds.minAge} 岁`
                        } else if (ageRuleBounds.maxAge !== undefined && calculatedAge > ageRuleBounds.maxAge) {
                          birthdateAgeStatus = 'invalid'
                          birthdateAgeMessage = `根据出生日期计算，年龄为 ${calculatedAge} 岁，不能大于 ${ageRuleBounds.maxAge} 岁`
                        } else {
                          birthdateAgeStatus = 'valid'
                          birthdateAgeMessage = `年龄 ${calculatedAge} 岁，符合要求`
                        }
                      }
                    }

                    return (
                      <div key={field.id} className="space-y-2">
                        <Label className="flex flex-wrap items-center gap-2 text-sm font-medium leading-none">
                          {fieldLabel}{isFieldRequired && ' *'}
                          {birthdateAgeRequirement && (
                            <span className={INFO_BADGE_CLASS}>
                              {(() => {
                                const dateLabel = `${activeDivisionRules.minBirthDate || '不限'} 至 ${activeDivisionRules.maxBirthDate || '不限'}`
                                return ageRequirementLabel ? `${dateLabel}（${ageRequirementLabel}）` : dateLabel
                              })()}
                            </span>
                          )}
                        </Label>
                        <Input
                          type="date"
                          value={playerData[field.id] || ''}
                          onChange={(e) => updatePlayerData(field.id, e.target.value)}
                          className={`h-11 ${
                            birthdateAgeStatus === 'invalid'
                              ? VALIDATION_INPUT_ERROR_CLASS
                              : birthdateAgeStatus === 'valid'
                              ? VALIDATION_INPUT_SUCCESS_CLASS
                              : ''
                          }`}
                        />
                        {birthdateAgeMessage && (
                          <p className={`text-xs font-medium ${
                            birthdateAgeStatus === 'invalid'
                              ? VALIDATION_MESSAGE_ERROR_CLASS
                              : birthdateAgeStatus === 'valid'
                              ? VALIDATION_MESSAGE_SUCCESS_CLASS
                              : ''
                          }`}>
                            {birthdateAgeMessage}
                          </p>
                        )}
                      </div>
                    )
                  case 'select':
                    const isGenderField = field.id === 'gender' || field.id === 'sex'
                    const genderRequirement = isGenderField && activeDivisionRules.gender && activeDivisionRules.gender !== 'none' && activeDivisionRules.gender !== 'mixed'
                    const currentGender = String(playerData[field.id] || '')

                    return (
                      <div key={field.id} className="space-y-2">
                        <Label className="flex flex-wrap items-center gap-2 text-sm font-medium leading-none">
                          {fieldLabel}{isFieldRequired && ' *'}
                          {genderRequirement && (
                            <span className={INFO_BADGE_CLASS}>
                              仅限{activeDivisionRules.gender === 'male' ? '男性' : '女性'}
                            </span>
                          )}
                        </Label>
                        <Select
                          value={playerData[field.id] || ''}
                          onValueChange={(value) => updatePlayerData(field.id, value)}
                        >
                          <SelectTrigger className={`h-11 w-full ${
                            genderRequirement &&
                            currentGender &&
                            currentGender !== (activeDivisionRules.gender === 'male' ? '男' : '女')
                              ? VALIDATION_INPUT_ERROR_CLASS
                              : ''
                          }`}>
                            <SelectValue placeholder={`请选择${fieldLabel}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options?.map((option: string | { id?: string; label?: string; value?: string; text?: string; name?: string }) => {
                              const optionValue = getOptionValue(option)
                              const optionLabel = getOptionLabel(option)
                              return (
                                <SelectItem key={optionValue} value={optionValue}>
                                  {optionLabel}
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                        {genderRequirement &&
                          currentGender &&
                          currentGender !== (activeDivisionRules.gender === 'male' ? '男' : '女') && (
                            <p className={`text-xs font-medium ${VALIDATION_MESSAGE_ERROR_CLASS}`}>
                              当前组别仅限{activeDivisionRules.gender === 'male' ? '男性' : '女性'}参赛
                            </p>
                          )}
                      </div>
                    )
                  case 'multiselect':
                    return (
                      <div key={field.id} className="space-y-2">
                        <Label className="flex flex-wrap items-center gap-2 text-sm font-medium leading-none">{fieldLabel}{isFieldRequired && ' *'}</Label>
                        <div className="space-y-2">
                          {field.options?.map((option: string | { id?: string; label?: string; value?: string; text?: string; name?: string }) => {
                            const optionValue = getOptionValue(option)
                            const optionLabel = getOptionLabel(option)
                            return (
                              <label key={optionValue} className="flex items-center space-x-2 rounded-md border border-border/60 px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={(playerData[field.id] || []).includes(optionValue)}
                                  onChange={(e) => {
                                    const currentValues = playerData[field.id] || []
                                    if (e.target.checked) {
                                      updatePlayerData(field.id, [...currentValues, optionValue])
                                    } else {
                                      updatePlayerData(field.id, currentValues.filter((v: string) => v !== optionValue))
                                    }
                                  }}
                                  className="rounded border-gray-300"
                                />
                                <span className="text-sm">{optionLabel}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  case 'image':
                    return (
                      <div key={field.id} className="space-y-2">
                        <Label className="flex flex-wrap items-center gap-2 text-sm font-medium leading-none">{fieldLabel}{isFieldRequired && ' *'}</Label>
                        <div>
                          {playerData[field.id] ? (
                            <div className="relative w-32 h-32 border rounded-lg overflow-hidden">
                              <Image
                                src={playerData[field.id]}
                                alt={field.label}
                                fill
                                unoptimized
                                className="object-cover"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="absolute top-1 right-1"
                                onClick={() => updatePlayerData(field.id, '')}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                              <Upload className="h-6 w-6 mx-auto text-gray-400 mb-1" />
                              <p className="text-xs text-gray-600">点击上传{field.label}</p>
                              <p className="text-xs text-gray-500">支持 JPG、PNG 格式，最大 5MB</p>
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

                                      const response = await fetch(`/api/player-share/${token}/upload`, {
                                        method: 'POST',
                                        body: formData,
                                      })

                                      const result = await response.json()

                                      if (result.success) {
                                        updatePlayerData(field.id, result.data.url)
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
                                disabled={isSubmitting}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  case 'attachment':
                    const playerAttachment = playerData[field.id] as AttachmentValue | undefined
                    return (
                      <div key={field.id} className="space-y-2">
                        <Label className="flex flex-wrap items-center gap-2 text-sm font-medium leading-none">{fieldLabel}{isFieldRequired && ' *'}</Label>
                        <div className="space-y-2">
                          {playerAttachment?.url ? (
                            <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="text-sm">
                                <p className="font-medium">{playerAttachment.name}</p>
                                <p className="text-gray-500">{formatFileSize(playerAttachment.size)}</p>
                              </div>
                              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                                <Button type="button" size="sm" variant="outline" className="h-10 w-full justify-center sm:w-auto" asChild>
                                  <a href={getPreviewUrl(playerAttachment.url, playerAttachment.name)} target="_blank" rel="noopener noreferrer">预览</a>
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  className="h-10 w-full justify-center sm:w-auto"
                                  onClick={() => updatePlayerData(field.id, null)}
                                  disabled={isSubmitting}
                                >
                                  删除
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="relative rounded-lg border-2 border-dashed border-gray-300 p-4 text-center transition-colors hover:border-gray-400">
                              <Upload className="mx-auto mb-1 h-6 w-6 text-gray-400" />
                              <p className="text-xs text-gray-600">点击上传{field.label}</p>
                              <p className="text-xs text-gray-500">支持 PDF、Word、Excel，大小不超过20MB</p>
                              <input
                                type="file"
                                accept={attachmentAccept}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  if (!isValidAttachmentFile(file)) {
                                    alert('仅支持 PDF、Word、Excel 文件')
                                    e.target.value = ''
                                    return
                                  }

                                  try {
                                    setIsSubmitting(true)
                                    const data = await uploadSharedFile(file, 'team-documents')
                                    updatePlayerData(field.id, toAttachmentValue(data))
                                    alert('上传成功！')
                                  } catch (error: any) {
                                    alert(error.message || '上传失败')
                                  } finally {
                                    setIsSubmitting(false)
                                    e.target.value = ''
                                  }
                                }}
                                className="absolute inset-0 cursor-pointer opacity-0"
                                disabled={isSubmitting}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  case 'attachments':
                    const playerAttachments = (playerData[field.id] as AttachmentValue[] | undefined) || []
                    return (
                      <div key={field.id} className="space-y-2">
                        <Label className="flex flex-wrap items-center gap-2 text-sm font-medium leading-none">{fieldLabel}{isFieldRequired && ' *'}</Label>
                        <div className="space-y-2">
                          {playerAttachments.map((item, itemIndex) => (
                            <div key={`${item.path}-${itemIndex}`} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="text-sm">
                                <p className="font-medium">{item.name}</p>
                                <p className="text-gray-500">{formatFileSize(item.size)}</p>
                              </div>
                              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                                <Button type="button" size="sm" variant="outline" className="h-10 w-full justify-center sm:w-auto" asChild>
                                  <a href={getPreviewUrl(item.url, item.name)} target="_blank" rel="noopener noreferrer">预览</a>
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  className="h-10 w-full justify-center sm:w-auto"
                                  onClick={() => updatePlayerData(field.id, playerAttachments.filter((_, index) => index !== itemIndex))}
                                  disabled={isSubmitting}
                                >
                                  删除
                                </Button>
                              </div>
                            </div>
                          ))}
                          <div className="relative rounded-lg border-2 border-dashed border-gray-300 p-4 text-center transition-colors hover:border-gray-400">
                            <Upload className="mx-auto mb-1 h-6 w-6 text-gray-400" />
                            <p className="text-xs text-gray-600">继续上传{field.label}</p>
                            <p className="text-xs text-gray-500">支持 PDF、Word、Excel，大小不超过20MB</p>
                            <input
                              type="file"
                              accept={attachmentAccept}
                              onChange={async (e) => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                if (!isValidAttachmentFile(file)) {
                                  alert('仅支持 PDF、Word、Excel 文件')
                                  e.target.value = ''
                                  return
                                }

                                try {
                                  setIsSubmitting(true)
                                  const data = await uploadSharedFile(file, 'team-documents')
                                  updatePlayerData(field.id, [...playerAttachments, toAttachmentValue(data)])
                                  alert('上传成功！')
                                } catch (error: any) {
                                  alert(error.message || '上传失败')
                                } finally {
                                  setIsSubmitting(false)
                                  e.target.value = ''
                                }
                              }}
                              className="absolute inset-0 cursor-pointer opacity-0"
                              disabled={isSubmitting}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  default:
                    return null
                }
              })}
            </div>

            <Button
              className="w-full mt-6"
              onClick={handleSubmit}
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
                  提交信息
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
