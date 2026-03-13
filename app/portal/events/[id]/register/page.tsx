'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useForm, type FieldErrors } from 'react-hook-form'
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
  Clock,
  Download,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getSessionUserWithRetry } from '@/lib/supabase/client-auth'
import Image from 'next/image'
import { formatGender, parseIdCard, validateAgainstDivisionRules } from '@/lib/id-card-validator'
import { resolveStorageObjectUrl, type UploadBucket } from '@/lib/storage-object'
import {
  readCachedPortalCoachId,
  writeCachedPortalCoachId,
} from '@/lib/portal/coach-session-cache'
import { mergeSharedPlayerUpdates } from '@/lib/player-share-token'
import { generateSecureId } from '@/lib/security-random'

interface DivisionRules {
  gender?: 'male' | 'female' | 'mixed' | 'none'
  minAge?: number
  maxAge?: number
  minBirthDate?: string
  maxBirthDate?: string
  minPlayers?: number
  maxPlayers?: number
}

interface PlayerRuleHints {
  genderRequirement: 'none' | 'male' | 'female'
  ageRequirementEnabled: boolean
  minAge?: number
  maxAge?: number
  minAgeDate?: string
  maxAgeDate?: string
}

interface FieldConfig {
  id: string
  label?: string
  type?: string
  required?: boolean
  options?: Array<string | { label: string; value: string }>
  [key: string]: any
}

interface RoleConfig {
  id: string
  name: string
  commonFields?: FieldConfig[]
  customFields?: FieldConfig[]
  allFields?: FieldConfig[]
  [key: string]: any
}

interface TeamRequirementsConfig {
  registrationStartDate?: string
  registrationEndDate?: string
  reviewEndDate?: string
  commonFields?: FieldConfig[]
  customFields?: FieldConfig[]
  allFields?: FieldConfig[]
}

interface PlayerRequirementsConfig {
  roles?: RoleConfig[]
  genderRequirement?: 'none' | 'male' | 'female'
  ageRequirementEnabled?: boolean
  countRequirementEnabled?: boolean
  minCount?: number
  maxCount?: number
}

interface RegistrationSettingsConfig {
  division_id?: string | null
  team_requirements?: TeamRequirementsConfig | string
  player_requirements?: PlayerRequirementsConfig
}

interface Event {
  id: string
  name: string
  short_name?: string
  registration_settings?: RegistrationSettingsConfig
  registration_settings_by_division?: RegistrationSettingsConfig[]
  divisions?: Array<{
    id: string
    name: string
    rules?: DivisionRules
  }>
}

interface Player {
  id: string
  name: string
  gender?: string
  age?: number
  role?: string
  id_type?: string
  [key: string]: any
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

function normalizeGenderValue(value: unknown): 'male' | 'female' | undefined {
  const rawGender = String(value || '').trim()
  if (rawGender === '男' || rawGender.toLowerCase() === 'male') return 'male'
  if (rawGender === '女' || rawGender.toLowerCase() === 'female') return 'female'
  return undefined
}

function inferPlayerGender(player: Player): 'male' | 'female' | undefined {
  const manualGender = normalizeGenderValue(player.gender || player.sex)
  if (manualGender) return manualGender

  const idNumber = String(player.id_number || '').trim()
  if (isIdentityDocumentSelected(player) && idNumber.length === 18) {
    const parsed = parseIdCard(idNumber)
    if (parsed.isValid && parsed.gender) return parsed.gender
  }

  return undefined
}

interface Registration {
  id?: string
  event_id: string
  coach_id?: string
  team_data: any
  players_data: Player[]
  status: 'draft' | 'submitted' | 'pending' | 'approved' | 'rejected' | 'cancelled'
  rejection_reason?: string | null
}
const REGISTRATION_FORM_COLUMNS =
  'id, event_id, coach_id, team_data, players_data, status, rejection_reason'

interface ShareDialogTarget {
  playerId: string
  playerNumber: number
  roleName: string
  playerLabel: string
}

type CoachTemplateDocumentType = 'registration_form' | 'athlete_info_form'
type CoachTemplateExportFormat = 'pdf'

function normalizeFieldConfig(field: FieldConfig): FieldConfig {
  if (field.id === 'player_number' && field.label !== '比赛服号码') {
    return { ...field, label: '比赛服号码' }
  }
  return field
}

function normalizeFieldList(fields?: FieldConfig[]): FieldConfig[] {
  return (fields || []).map(normalizeFieldConfig)
}

function normalizePlayerRequirements(
  value?: PlayerRequirementsConfig | null
): PlayerRequirementsConfig | undefined {
  if (!value) return undefined

  return {
    ...value,
    roles: (value.roles || []).map((role) => ({
      ...role,
      commonFields: normalizeFieldList(role.commonFields),
      customFields: normalizeFieldList(role.customFields),
      allFields: normalizeFieldList(role.allFields),
    })),
  }
}

function parseTeamRequirements(
  value?: TeamRequirementsConfig | string | null
): TeamRequirementsConfig | undefined {
  if (!value) return undefined

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object') {
        const config = parsed as TeamRequirementsConfig
        return {
          ...config,
          commonFields: normalizeFieldList(config.commonFields),
          customFields: normalizeFieldList(config.customFields),
          allFields: normalizeFieldList(config.allFields),
        }
      }
      return undefined
    } catch {
      return undefined
    }
  }

  return {
    ...value,
    commonFields: normalizeFieldList(value.commonFields),
    customFields: normalizeFieldList(value.customFields),
    allFields: normalizeFieldList(value.allFields),
  }
}

function getMergedFields(config?: {
  allFields?: FieldConfig[]
  commonFields?: FieldConfig[]
  customFields?: FieldConfig[]
}): FieldConfig[] {
  const raw = config?.allFields && config.allFields.length > 0
    ? config.allFields
    : [
        ...(config?.commonFields || []),
        ...(config?.customFields || []),
      ]

  return raw.filter((field): field is FieldConfig => Boolean(field?.id))
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

function getIdCardGenderValidation(
  values: Record<string, any>,
  genderFieldId: 'gender' | 'sex'
): { status: 'idle' | 'valid' | 'invalid'; message: string } {
  if (!isIdentityDocumentSelected(values)) {
    return { status: 'idle', message: '' }
  }

  const idNumber = String(values.id_number || '').trim()
  if (!idNumber) {
    return { status: 'idle', message: '' }
  }

  const parsedIdCard = parseIdCard(idNumber)
  if (!parsedIdCard.isValid || !parsedIdCard.gender) {
    return { status: 'idle', message: '' }
  }

  const selectedGender = normalizeGenderValue(
    values[genderFieldId] || values[genderFieldId === 'gender' ? 'sex' : 'gender']
  )
  if (!selectedGender) {
    return { status: 'idle', message: '' }
  }

  const idCardGenderText = formatGender(parsedIdCard.gender)
  if (selectedGender !== parsedIdCard.gender) {
    return {
      status: 'invalid',
      message: `身份证号对应性别为 ${idCardGenderText}，与填写性别不一致`,
    }
  }

  return {
    status: 'valid',
    message: `身份证号对应性别为 ${idCardGenderText}，与填写性别一致`,
  }
}

function isIdentityDocumentSelected(values: { id_type?: unknown }): boolean {
  return String(values.id_type || '').trim() === '身份证'
}

function isFieldConditionSatisfied(field: FieldConfig, values: Record<string, any>): boolean {
  const conditional = field.conditionalRequired as
    | { dependsOn?: string; values?: unknown[] }
    | undefined

  if (!conditional?.dependsOn) return true

  const dependencyValue = values?.[conditional.dependsOn]
  if (!Array.isArray(conditional.values) || conditional.values.length === 0) {
    return Boolean(dependencyValue)
  }

  return conditional.values.includes(dependencyValue)
}

function isFieldRequiredForValues(field: FieldConfig, values: Record<string, any>): boolean {
  return Boolean(field.required && isFieldConditionSatisfied(field, values))
}

function getFieldDisplayLabel(field: FieldConfig): string {
  if (field.id === 'id_number') return '证件号码'
  if (field.id === 'player_number') return '比赛服号码'
  return field.label || field.id
}

const VALIDATION_INPUT_ERROR_CLASS = 'border-destructive/40 bg-destructive/10 text-foreground dark:border-destructive/50 dark:bg-destructive/15'
const VALIDATION_INPUT_SUCCESS_CLASS = 'border-emerald-500/40 bg-emerald-500/10 text-foreground dark:border-emerald-400/40 dark:bg-emerald-500/15'
const VALIDATION_MESSAGE_ERROR_CLASS = 'rounded border border-destructive/20 bg-destructive/10 p-2 text-destructive'
const VALIDATION_MESSAGE_SUCCESS_CLASS = 'rounded border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-300'
const MUTED_BADGE_CLASS = 'rounded bg-muted px-2 py-1 text-xs text-muted-foreground'
const INFO_BADGE_CLASS = 'rounded bg-sky-500/10 px-2 py-1 text-xs text-sky-700 dark:text-sky-300'
const PLAYER_FIELD_WRAPPER_CLASS = 'space-y-2'
const PLAYER_FIELD_LABEL_CLASS = 'flex min-h-6 flex-wrap items-center gap-2 text-sm font-medium leading-none'

// 动态生成表单 schema
const createTeamSchema = (fields: any[]) => {
  const schemaObject: any = {}
  
  fields?.forEach(field => {
    if (field.required) {
      if (field.type === 'text' || field.type === 'select') {
        schemaObject[field.id] = z.string().min(1, `${field.label}不能为空`)
      } else if (field.type === 'date') {
        schemaObject[field.id] = z.string().min(1, `请选择${field.label}`)
      } else if (field.type === 'image') {
        schemaObject[field.id] = z.string().min(1, `请上传${field.label}`)
      } else if (field.type === 'attachment') {
        schemaObject[field.id] = z.any().refine((value) => {
          if (!value) return false
          return typeof value === 'object' && !!value.url
        }, `请上传${field.label}`)
      } else if (field.type === 'attachments') {
        schemaObject[field.id] = z.any().refine((value) => Array.isArray(value) && value.length > 0, `请上传${field.label}`)
      }
    } else {
      schemaObject[field.id] = z.any().optional()
    }
  })
  
  return z.object(schemaObject)
}

const extractTeamLogoValue = (teamData: Record<string, unknown> | null | undefined) => {
  if (!teamData) return null

  if (typeof teamData.team_logo === 'string' && teamData.team_logo.trim()) {
    return teamData.team_logo.trim()
  }

  if (typeof teamData.logo === 'string' && teamData.logo.trim()) {
    return teamData.logo.trim()
  }

  return null
}

const resolvePreviewImageUrl = (
  value: unknown,
  fallbackBucket?: UploadBucket,
) => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
      return trimmed
    }

    return resolveStorageObjectUrl(trimmed, { fallbackBucket }) || trimmed
  }

  return resolveStorageObjectUrl(value, { fallbackBucket })
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
  const getOrderedRoles = (): RoleConfig[] => {
    const roles = activeRegistrationSettings?.player_requirements?.roles || []
    // 返回排序后的角色：非队员角色在前，队员角色在后
    return [...roles].sort((a, b) => {
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
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('')
  const playersRef = useRef<Player[]>([])

  useEffect(() => {
    playersRef.current = players
  }, [players])
  const [shareDialogTarget, setShareDialogTarget] = useState<ShareDialogTarget | null>(null)
  const [isGeneratingShareLink, setIsGeneratingShareLink] = useState(false)
  const [exportingTemplateKey, setExportingTemplateKey] = useState<string | null>(null)

  const activeRegistrationSettings = useMemo<RegistrationSettingsConfig | null>(() => {
    const settingsByDivision = event?.registration_settings_by_division || []
    const normalizeSettings = (settings?: RegistrationSettingsConfig | null) => {
      if (!settings) return null
      return {
        ...settings,
        team_requirements: parseTeamRequirements(settings.team_requirements),
        player_requirements: normalizePlayerRequirements(settings.player_requirements),
      }
    }

    if (settingsByDivision.length === 0) {
      return normalizeSettings(event?.registration_settings)
    }

    const preferredDivisionId = selectedDivisionId || event?.registration_settings?.division_id || null
    if (preferredDivisionId) {
      const matched = settingsByDivision.find((setting) => setting.division_id === preferredDivisionId)
      if (matched) return normalizeSettings(matched)
    }

    return normalizeSettings(event?.registration_settings || settingsByDivision[0] || null)
  }, [event?.registration_settings, event?.registration_settings_by_division, selectedDivisionId])

  const activeTeamRequirements = parseTeamRequirements(activeRegistrationSettings?.team_requirements)
  const attachmentAccept = useMemo<string | undefined>(() => {
    if (typeof navigator === 'undefined') {
      return DESKTOP_ATTACHMENT_ACCEPT
    }

    // Mobile browsers/webviews often mis-handle extension-only accept filters
    // and incorrectly open the image picker. Let the system file chooser open
    // first, then validate the file after selection.
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

  const uploadPortalFile = async (file: File, bucket: string) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('bucket', bucket)

    const response = await fetch('/api/portal/upload', {
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

  // 判断是否在审核期内
  const isInReviewPeriod = () => {
    const now = new Date()
    const teamReq = activeTeamRequirements
    const regEndDate = teamReq?.registrationEndDate
    const reviewEndDate = teamReq?.reviewEndDate
    const regEnd = regEndDate ? new Date(regEndDate) : null
    const reviewEnd = reviewEndDate ? new Date(reviewEndDate) : null

    return regEnd && reviewEnd && now > regEnd && now <= reviewEnd
  }

  // 判断报名是否已截止（超过审核结束时间）
  const isRegistrationClosed = () => {
    const now = new Date()
    const teamReq = activeTeamRequirements
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
    if (!isInReviewPeriod()) return true

    return true
  }

  const extractDownloadFileName = (contentDisposition: string | null, fallback: string) => {
    if (!contentDisposition) return fallback

    const utf8Match = contentDisposition.match(/filename="([^"]+)"/i)
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1])
      } catch {
        return utf8Match[1]
      }
    }

    return fallback
  }

  const handleTemplateExport = async (
    documentType: CoachTemplateDocumentType,
    format: CoachTemplateExportFormat,
  ) => {
    if (!registration?.id) {
      alert('请先保存草稿或提交报名后，再导出模板文件')
      return
    }

    const exportKey = `${documentType}:${format}`
    setExportingTemplateKey(exportKey)

    try {
      const baseUrl = `/api/portal/registrations/${registration.id}/template-export?documentType=${documentType}&format=${format}`
      const previewResponse = await fetch(`${baseUrl}&preview=1`)
      const previewResult = await previewResponse.json().catch(() => null)

      if (!previewResponse.ok || !previewResult?.success) {
        throw new Error(previewResult?.error || '导出预检查失败')
      }

      const blockingIssues: string[] = Array.isArray(previewResult.data?.blockingIssues)
        ? previewResult.data.blockingIssues
        : []
      if (blockingIssues.length > 0) {
        alert(`当前无法导出：\n\n${blockingIssues.join('\n')}`)
        return
      }

      const warnings: string[] = Array.isArray(previewResult.data?.warnings)
        ? previewResult.data.warnings
        : []

      if (warnings.length > 0) {
        const confirmed = window.confirm(
          `检测到以下待补充项，导出的文件将保留空位供教练后续补充：\n\n${warnings.join('\n')}\n\n是否继续导出？`
        )
        if (!confirmed) return
      }

      const response = await fetch(baseUrl)
      if (!response.ok) {
        const errorResult = await response.json().catch(() => null)
        throw new Error(errorResult?.error || '导出失败')
      }

      const blob = await response.blob()
      const fallbackName = documentType === 'registration_form'
        ? '报名表.pdf'
        : '运动员信息表.pdf'
      const fileName = extractDownloadFileName(
        response.headers.get('Content-Disposition'),
        fallbackName,
      )

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('模板导出失败:', error)
      alert(error instanceof Error ? error.message : '模板导出失败，请稍后重试')
    } finally {
      setExportingTemplateKey(null)
    }
  }

  // 获取字段配置 - 使用管理端设置的字段顺序
  const teamRequirements = activeTeamRequirements
  const rawFields = getMergedFields(teamRequirements)

  // 去重字段，避免重复显示
  const allFields = rawFields.filter((field, index, array) =>
    array.findIndex((f) => f.id === field.id) === index
  )
  const allFieldsSignature = allFields
    .map((field: any) => `${field.type || 'unknown'}:${field.id}`)
    .join('|')

  const activeDivisionRules = useMemo<DivisionRules>(() => {
    if (!event?.divisions || event.divisions.length === 0) return {}
    const preferredDivisionId = selectedDivisionId || activeRegistrationSettings?.division_id
    const matched = preferredDivisionId
      ? event.divisions.find((d) => d.id === preferredDivisionId)
      : undefined
    return (matched || event.divisions[0])?.rules || {}
  }, [activeRegistrationSettings?.division_id, event?.divisions, selectedDivisionId])

  const selectedDivision = useMemo(
    () => event?.divisions?.find((d) => d.id === selectedDivisionId),
    [event?.divisions, selectedDivisionId]
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

  const teamLogoFieldIds = useMemo(
    () => allFieldsSignature
      .split('|')
      .filter(Boolean)
      .flatMap((entry) => {
        const separatorIndex = entry.indexOf(':')
        if (separatorIndex === -1) return []

        const type = entry.slice(0, separatorIndex)
        const id = entry.slice(separatorIndex + 1)
        if (type !== 'image') return []

        return id === 'logo' || id === 'team_logo' ? [id] : []
      }),
    [allFieldsSignature]
  )

  const syncTeamLogoFieldValue = useCallback((
    value: string | null,
    options?: { shouldDirty?: boolean; shouldTouch?: boolean; shouldValidate?: boolean }
  ) => {
    teamLogoFieldIds.forEach((fieldId) => {
      setValue(fieldId, value ?? '', {
        shouldDirty: options?.shouldDirty ?? true,
        shouldTouch: options?.shouldTouch ?? true,
        shouldValidate: options?.shouldValidate ?? true,
      })
    })
  }, [setValue, teamLogoFieldIds])

  const teamLogoPreviewUrl = useMemo(() => {
    if (!teamLogoPreview) return null
    if (teamLogoPreview.startsWith('data:') || teamLogoPreview.startsWith('blob:')) {
      return teamLogoPreview
    }

    return resolveStorageObjectUrl(teamLogoPreview, {
      fallbackBucket: 'registration-files',
    }) || teamLogoPreview
  }, [teamLogoPreview])

  useEffect(() => {
    if (selectedDivision?.name) {
      setValue('participationGroup', selectedDivision.name)
    }
  }, [selectedDivision?.name, setValue])

  useEffect(() => {
    if (eventId) {
      fetchEventAndRegistration()
    }
  }, [eventId])

  // 当registration数据更新时，确保表单被正确填充
  useEffect(() => {
    if (registration && registration.team_data && !isNewRegistration) {
      // 填充表单数据
      Object.keys(registration.team_data).forEach(key => {
        setValue(key, registration.team_data[key])
      })

      if (registration.team_data.division_id) {
        setSelectedDivisionId(registration.team_data.division_id)
      } else if (event?.divisions?.length && !selectedDivisionId) {
        setSelectedDivisionId(event.divisions[0].id)
      }

      const existingTeamLogo = extractTeamLogoValue(registration.team_data)
      setTeamLogoPreview(existingTeamLogo)
      syncTeamLogoFieldValue(existingTeamLogo, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      })
      
      // 设置队员数据
      if (registration.players_data) {
        setPlayers(registration.players_data)
        setPlayersByRole(organizePlayersByRole(registration.players_data))
      }
    }
  }, [registration, setValue, isNewRegistration, event?.divisions, selectedDivisionId, syncTeamLogoFieldValue])

  useEffect(() => {
    if (event?.divisions?.length && !selectedDivisionId) {
      setSelectedDivisionId(event.divisions[0].id)
    }
  }, [event?.divisions, selectedDivisionId])

  // 定期检查分享的队员信息更新
  useEffect(() => {
    if (!registration?.id) return

    const syncFilledShareLinks = async () => {
      try {
        const response = await fetch(`/api/portal/registrations/${registration.id}/share-links`, {
          cache: 'no-store',
        })
        const result = await response.json().catch(() => null) as
          | { success?: boolean; data?: unknown[] }
          | null

        if (!response.ok || !result?.success || !Array.isArray(result.data)) {
          return
        }

        const currentPlayers = playersRef.current
        const updatedPlayers = mergeSharedPlayerUpdates(
          currentPlayers,
          result.data as Array<Record<string, unknown>>
        )

        if (updatedPlayers !== currentPlayers) {
          setPlayers(updatedPlayers)
          setPlayersByRole(organizePlayersByRole(updatedPlayers))
        }
      } catch (error) {
        console.error('同步分享队员信息失败:', error)
      }
    }

    void syncFilledShareLinks()

    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void syncFilledShareLinks()
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncFilledShareLinks()
      }
    }

    const interval = setInterval(() => {
      syncWhenVisible()
    }, 5000)

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', syncWhenVisible)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', syncWhenVisible)
    }
  }, [registration?.id])

  const fetchEventAndRegistration = async (retryCount = 0) => {
    try {
      setIsLoading(true)
      const supabase = createClient()
      
      // 获取当前用户
      const { user, error: authError, isNetworkError } = await getSessionUserWithRetry(supabase, {
        maxRetries: 2,
        baseDelayMs: 400,
      })

      if (authError && isNetworkError) {
        if (retryCount < 2) {
          setTimeout(() => fetchEventAndRegistration(retryCount + 1), (retryCount + 1) * 900)
        }
        return
      }

      if (!user) {
        if (retryCount < 2) {
          setTimeout(() => fetchEventAndRegistration(retryCount + 1), (retryCount + 1) * 700)
          return
        }
        router.push('/auth/login')
        return
      }
      
      let resolvedCoachId = readCachedPortalCoachId(user.id)

      if (!resolvedCoachId) {
        const { data: coachData } = await supabase
          .from('coaches')
          .select('id')
          .eq('auth_id', user.id)
          .single()

        resolvedCoachId = coachData?.id || null
        if (resolvedCoachId) {
          writeCachedPortalCoachId(user.id, resolvedCoachId)
        }
      }

      if (!resolvedCoachId) {
        // 如果没有教练信息，创建一个
        const { data: newCoach } = await supabase
          .from('coaches')
          .insert({
            auth_id: user.id,
            email: user.email,
            name: user.email?.split('@')[0] || '教练'
          })
          .select('id')
          .single()

        resolvedCoachId = newCoach?.id || null
        if (resolvedCoachId) {
          writeCachedPortalCoachId(user.id, resolvedCoachId)
          setCoach({ id: resolvedCoachId })
        }
      } else {
        setCoach({ id: resolvedCoachId })
      }
      
      // 获取赛事信息
      const response = await fetch(`/api/portal/events/${eventId}`)
      const result = await response.json()

      if (result.success) {
        const eventData = result.data
        if (eventData) {
          setEvent(eventData)
          
          // 获取现有报名信息
          if (resolvedCoachId || coach?.id) {
            let regToLoad = null  // 在外层定义变量

            if (isNewRegistration) {
              // 新建报名：不加载任何现有报名数据，从空白开始
              setRegistration(null)
              setPlayers([])
              setPlayersByRole({})
              reset() // 重置表单为空
            } else if (editRegistrationId) {
              // 编辑特定的报名：根据ID加载指定的报名记录
              const { data: specificReg } = await supabase
                .from('registrations')
                .select(REGISTRATION_FORM_COLUMNS)
                .eq('id', editRegistrationId)
                .eq('coach_id', resolvedCoachId || coach?.id)  // 确保是自己的报名
                .single()

              if (specificReg) {
                regToLoad = specificReg
              }
            } else {
              // 默认模式：加载最新的草稿
              const { data: existingReg } = await supabase
                .from('registrations')
                .select(REGISTRATION_FORM_COLUMNS)
                .eq('event_id', eventId)
                .eq('coach_id', resolvedCoachId || coach?.id)
                .eq('status', 'draft')  // 只加载草稿
                .order('created_at', { ascending: false })
                .limit(1)

              // 如果没有草稿，查找最新的被驳回或已取消的报名
              if (existingReg && existingReg.length > 0) {
                regToLoad = existingReg[0]
              } else {
                const { data: editableReg } = await supabase
                  .from('registrations')
                  .select(REGISTRATION_FORM_COLUMNS)
                  .eq('event_id', eventId)
                  .eq('coach_id', resolvedCoachId || coach?.id)
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
              setRegistration(regToLoad)
              const playersData = regToLoad.players_data || []
              setPlayers(playersData)
              setPlayersByRole(organizePlayersByRole(playersData))

              // 填充表单数据
              if (regToLoad.team_data) {
                Object.keys(regToLoad.team_data).forEach(key => {
                  setValue(key, regToLoad.team_data[key])
                })

                const existingTeamLogo = extractTeamLogoValue(regToLoad.team_data)
                setTeamLogoPreview(existingTeamLogo)
                syncTeamLogoFieldValue(existingTeamLogo, {
                  shouldDirty: false,
                  shouldTouch: false,
                  shouldValidate: false,
                })
              }
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
      reader.onload = (event) => {
        const previewUrl = event.target?.result as string
        setTeamLogoPreview(previewUrl)
        syncTeamLogoFieldValue(previewUrl)
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

      const response = await fetch(`/api/portal/registrations/${registration.id}/share-links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          playerId,
          playersData: players,
        }),
      })

      const result = await response.json().catch(() => null) as
        | { success?: boolean; error?: string; data?: { share_url?: string } }
        | null

      if (!response.ok || !result?.success || !result.data?.share_url) {
        console.error('生成分享链接失败:', result)
        alert(result?.error || '生成分享链接失败，请重试')
        return
      }

      const shareUrl = result.data.share_url

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
        alert(`${roleName}${playerNumber}的专属填写链接已复制到剪贴板！\n\n${shareUrl}\n\n请将此链接发送给${roleName}${playerNumber}填写个人信息。\n如之前已生成过链接，旧链接已自动失效。`)
      } else {
        // 如果所有方法都失败，显示链接让用户手动复制
        alert(`请手动复制${roleName}${playerNumber}的专属填写链接：\n\n${shareUrl}\n\n请将此链接发送给${roleName}${playerNumber}填写个人信息。\n如之前已生成过链接，旧链接已自动失效。`)
      }
    } catch (error) {
      console.error('生成分享链接失败:', error)
      alert('生成分享链接失败')
    }
  }

  const openShareLinkDialog = (player: Player, playerNumber: number, roleName: string) => {
    const trimmedName = String(player.name || '').trim()
    const playerLabel = trimmedName
      ? `${roleName}${playerNumber}（${trimmedName}）`
      : `${roleName}${playerNumber}`

    setShareDialogTarget({
      playerId: player.id,
      playerNumber,
      roleName,
      playerLabel,
    })
  }

  const handleConfirmGenerateShareLink = async () => {
    if (!shareDialogTarget || isGeneratingShareLink) return

    setIsGeneratingShareLink(true)
    try {
      await generatePlayerShareLink(
        shareDialogTarget.playerId,
        shareDialogTarget.playerNumber,
        shareDialogTarget.roleName
      )
      setShareDialogTarget(null)
    } finally {
      setIsGeneratingShareLink(false)
    }
  }

  const addPlayer = () => {
    // 向后兼容，默认添加队员角色
    addPlayerByRole('player')
  }

  const addPlayerByRole = (roleId: string) => {
    // 仅队员角色受组别人数规则约束
    if (roleId === 'player' && activeDivisionRules.maxPlayers !== undefined) {
      const currentPlayerCount = players.filter((p) => (p.role || 'player') === 'player').length
      if (currentPlayerCount >= activeDivisionRules.maxPlayers) {
        alert(`队员人数不能超过 ${activeDivisionRules.maxPlayers} 人`)
        return
      }
    }

    const newPlayer: Player = {
      id: generateSecureId('player'),
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
    // 更新队员信息
    const updatedPlayers = players.map(p =>
      p.id === playerId ? { ...p, [field]: value } : p
    )
    setPlayers(updatedPlayers)

    // 同时更新按角色分组的数据
    setPlayersByRole(organizePlayersByRole(updatedPlayers))

    const updatedPlayer = updatedPlayers.find(p => p.id === playerId)
    const playerIndex = players.findIndex(p => p.id === playerId)
    const isPlayerRole = (updatedPlayer?.role || 'player') === 'player'
    const useIdentityDocumentValidation = updatedPlayer ? isIdentityDocumentSelected(updatedPlayer) : false

    if (updatedPlayer && isPlayerRole) {
      if (field === 'id_number' && useIdentityDocumentValidation && typeof value === 'string' && value.trim().length === 18) {
        const idRuleValidation = validateAgainstDivisionRules(value.trim(), activeDivisionRules)
        if (!idRuleValidation.isValid) {
          setTimeout(() => {
            alert(`⚠️ 队员${playerIndex + 1}身份证信息不符合组别要求\n\n${idRuleValidation.errors.join('\n')}`)
          }, 100)
        }
      }

      if ((field === 'gender' || field === 'sex') && activeDivisionRules.gender && activeDivisionRules.gender !== 'none' && activeDivisionRules.gender !== 'mixed') {
        const requiredGender = activeDivisionRules.gender === 'male' ? 'male' : 'female'
        const selectedGender = normalizeGenderValue(value)
        if (selectedGender && selectedGender !== requiredGender) {
          setTimeout(() => {
            alert(`注意：该组别仅限${formatGender(requiredGender)}队员，队员 ${playerIndex + 1} 当前为${formatGender(selectedGender)}`)
          }, 100)
        }
      }
    }
  }

  const validatePlayers = () => {
    const playerRequirements = activeRegistrationSettings?.player_requirements
    const playerOnlyList = players.filter((player) => (player.role || 'player') === 'player')
    const ageBounds = resolveAgeRequirementBounds(activeDivisionRules)

    // 1. 验证队员人数（来源：组别规则）
    if (activeDivisionRules.minPlayers !== undefined && playerOnlyList.length < activeDivisionRules.minPlayers) {
      alert(`队员人数不能少于 ${activeDivisionRules.minPlayers} 人`)
      return false
    }

    if (activeDivisionRules.maxPlayers !== undefined && playerOnlyList.length > activeDivisionRules.maxPlayers) {
      alert(`队员人数不能超过 ${activeDivisionRules.maxPlayers} 人`)
      return false
    }

    // 2. 验证性别与年龄（来源：组别规则）
    for (let i = 0; i < playerOnlyList.length; i++) {
      const player = playerOnlyList[i]
      const idNumber = String(player.id_number || '').trim()
      const enteredAge = parseAgeValue(player.age)
      const useIdentityDocumentValidation = isIdentityDocumentSelected(player)

      if (useIdentityDocumentValidation && idNumber) {
        const idRuleValidation = validateAgainstDivisionRules(idNumber, activeDivisionRules)
        if (!idRuleValidation.isValid) {
          alert(`队员 ${i + 1} 不符合组别要求：\n${idRuleValidation.errors.join('\n')}`)
          return false
        }

        const idCardInfo = parseIdCard(idNumber)
        if (enteredAge !== undefined && idCardInfo.isValid && idCardInfo.age !== undefined && enteredAge !== idCardInfo.age) {
          alert(`队员 ${i + 1} 填写年龄为 ${enteredAge} 岁，但身份证号对应年龄为 ${idCardInfo.age} 岁，请核对后再提交`)
          return false
        }

        const enteredGender = normalizeGenderValue(player.gender || player.sex)
        if (enteredGender && idCardInfo.isValid && idCardInfo.gender && enteredGender !== idCardInfo.gender) {
          alert(`队员 ${i + 1} 填写性别为 ${formatGender(enteredGender)}，但身份证号对应性别为 ${formatGender(idCardInfo.gender)}，请核对后再提交`)
          return false
        }

        continue
      }

      if (activeDivisionRules.gender && activeDivisionRules.gender !== 'none' && activeDivisionRules.gender !== 'mixed') {
        const playerGender = normalizeGenderValue(player.gender || player.sex)
        if (!playerGender) {
          alert(`队员 ${i + 1} 必须填写性别信息`)
          return false
        }
        if (playerGender !== activeDivisionRules.gender) {
          alert(`该组别仅限${formatGender(activeDivisionRules.gender)}队员，但队员 ${i + 1} 的性别为${formatGender(playerGender)}`)
          return false
        }
      }

      if (activeDivisionRules.minBirthDate || activeDivisionRules.maxBirthDate) {
        let birthDateStr: string | undefined
        if (player.birthdate) {
          birthDateStr = String(player.birthdate).slice(0, 10)
        } else if (player.birthday) {
          birthDateStr = String(player.birthday).slice(0, 10)
        }
        if (birthDateStr) {
          if (activeDivisionRules.minBirthDate && birthDateStr < activeDivisionRules.minBirthDate) {
            alert(`队员 ${i + 1} 出生日期为 ${birthDateStr}，早于组别要求的 ${activeDivisionRules.minBirthDate}`)
            return false
          }
          if (activeDivisionRules.maxBirthDate && birthDateStr > activeDivisionRules.maxBirthDate) {
            alert(`队员 ${i + 1} 出生日期为 ${birthDateStr}，晚于组别要求的 ${activeDivisionRules.maxBirthDate}`)
            return false
          }
        } else {
          if (enteredAge === undefined) {
            alert(`队员 ${i + 1} 需补充年龄或出生日期用于组别校验`)
            return false
          }
          if (ageBounds.minAge !== undefined && enteredAge < ageBounds.minAge) {
            alert(`队员 ${i + 1} 年龄为 ${enteredAge} 岁，小于当前允许年龄 ${ageBounds.minAge} 岁`)
            return false
          }
          if (ageBounds.maxAge !== undefined && enteredAge > ageBounds.maxAge) {
            alert(`队员 ${i + 1} 年龄为 ${enteredAge} 岁，大于当前允许年龄 ${ageBounds.maxAge} 岁`)
            return false
          }
        }
      } else if (activeDivisionRules.minAge !== undefined || activeDivisionRules.maxAge !== undefined) {
        let playerAge = enteredAge
        if (playerAge === undefined) {
          playerAge = calculateAgeFromDateString(player.birthdate || player.birthday)
        }

        if (playerAge === undefined || Number.isNaN(playerAge)) {
          alert(`队员 ${i + 1} 需补充年龄或出生日期用于组别年龄校验`)
          return false
        }
        if (activeDivisionRules.minAge !== undefined && playerAge < activeDivisionRules.minAge) {
          alert(`队员 ${i + 1} 年龄为 ${playerAge} 岁，小于组别最小年龄 ${activeDivisionRules.minAge} 岁`)
          return false
        }
        if (activeDivisionRules.maxAge !== undefined && playerAge > activeDivisionRules.maxAge) {
          alert(`队员 ${i + 1} 年龄为 ${playerAge} 岁，大于组别最大年龄 ${activeDivisionRules.maxAge} 岁`)
          return false
        }
      }
    }

    // 2.1 混合组：至少1男1女
    if (activeDivisionRules.gender === 'mixed') {
      let maleCount = 0
      let femaleCount = 0

      for (let i = 0; i < playerOnlyList.length; i++) {
        const gender = inferPlayerGender(playerOnlyList[i])
        if (!gender) {
          alert(`混合组要求至少1男1女，且需识别每位队员性别。请完善队员 ${i + 1} 的性别或身份证信息`)
          return false
        }
        if (gender === 'male') maleCount++
        if (gender === 'female') femaleCount++
      }

      if (maleCount === 0 || femaleCount === 0) {
        alert(`混合组要求至少1名男队员和1名女队员（当前男:${maleCount}，女:${femaleCount}）`)
        return false
      }
    }

    // 3. 验证必填字段
    for (let i = 0; i < players.length; i++) {
      const player = players[i]
      const selectedRoleId = player.role || 'player'
      const selectedRole = playerRequirements?.roles?.find(
        (r) => r.id === selectedRoleId
      ) || playerRequirements?.roles?.[0]

      if (selectedRole) {
        // 使用管理端设置的字段顺序
        const roleFields = getMergedFields(selectedRole)

        // 检查所有必填字段
        for (const field of roleFields) {
          const fieldLabel = getFieldDisplayLabel(field)
          if (isFieldRequiredForValues(field, player) && !player[field.id]) {
            alert(`队员 ${i + 1} 的 ${fieldLabel} 为必填项`)
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

    if (event?.divisions?.length && !selectedDivisionId) {
      alert('请选择参赛组别')
      setActiveTab('team')
      return null
    }

    // 验证团队信息必填项
    const teamFields = getMergedFields(teamRequirements)

    const missingFields: string[] = []
    for (const field of teamFields) {
      if (field.required && !data[field.id]) {
        missingFields.push(field.label || field.id)
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
    const teamReq = activeTeamRequirements
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
        if (!uploadedUrl) {
          alert('队伍Logo上传失败，请重试')
          return null
        }

        logoUrl = uploadedUrl
      }

      const teamData = {
        ...data,
        team_logo: logoUrl,
        division_id: selectedDivisionId || undefined,
        participationGroup: selectedDivision?.name || data?.participationGroup
      }

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

      setTeamLogoPreview(logoUrl)
      setTeamLogoFile(null)
      syncTeamLogoFieldValue(logoUrl, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      })

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

  const handleInvalidTeamForm = (formErrors: FieldErrors<Record<string, unknown>>) => {
    setActiveTab('team')

    const firstErrorKey = Object.keys(formErrors)[0]
    if (!firstErrorKey) {
      alert('请先完善团队信息后再继续。')
      return
    }

    const matchedField = allFields.find((field: any) => field.id === firstErrorKey)
    const fieldLabel = matchedField?.label || firstErrorKey
    const firstError = formErrors[firstErrorKey]
    const errorMessage = typeof firstError?.message === 'string'
      ? firstError.message
      : ''

    alert(
      errorMessage
        ? `请先完善团队信息中的“${fieldLabel}”\n\n${errorMessage}`
        : `请先完善团队信息中的“${fieldLabel}”`
    )
  }

  const handleSubmitRegistration = async (data: any) => {
    if (!coach) {
      alert('请先登录')
      return
    }

    if (event?.divisions?.length && !selectedDivisionId) {
      alert('请选择参赛组别')
      setActiveTab('team')
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
    const teamReq = activeTeamRequirements
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
        if (!uploadedUrl) {
          alert('队伍Logo上传失败，请重试')
          return
        }

        logoUrl = uploadedUrl
      }
      
      const teamData = {
        ...data,
        team_logo: logoUrl,
        division_id: selectedDivisionId || undefined,
        participationGroup: selectedDivision?.name || data?.participationGroup
      }

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

      setTeamLogoPreview(logoUrl)
      setTeamLogoFile(null)
      syncTeamLogoFieldValue(logoUrl, {
        shouldDirty: false,
        shouldTouch: false,
        shouldValidate: false,
      })
      
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
          <p className="text-lg text-muted-foreground">赛事不存在</p>
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
    const teamReq = activeTeamRequirements
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
          <p className="text-lg text-muted-foreground">报名已截止</p>
          <p className="mt-2 text-sm text-muted-foreground">该比赛报名已截止，不能再进行报名</p>
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
            <p className="text-lg text-muted-foreground">您的报名已通过审核</p>
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
            <p className="text-lg text-muted-foreground">您的报名已提交，请等待审核</p>
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
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <h3 className="font-semibold text-destructive">该比赛报名已截止</h3>
              <p className="mt-1 text-destructive">此赛事报名已截止，您只能查看报名信息，不能再次提交或修改。</p>
            </div>
          </div>
        </div>
      )}

      {/* 被驳回提示 */}
      {registration?.status === 'rejected' && registration?.rejection_reason && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
            <div className="flex-1">
              <h3 className="font-semibold text-destructive">您的报名已被驳回</h3>
              <div className="mt-2">
                <p className="mb-2 font-medium text-destructive">驳回原因：</p>
                <div className="whitespace-pre-line pl-4 text-destructive">
                  {registration.rejection_reason}
                </div>
              </div>
              <p className="mt-3 text-sm text-destructive">请根据以上驳回原因修改后重新提交</p>
            </div>
          </div>
        </div>
      )}

      {/* 已取消提示 - 仅在报名期内显示 */}
      {registration?.status === 'cancelled' && !isInReviewPeriod() && !isEventEndedView && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700 dark:text-amber-300" />
            <div>
              <h3 className="font-semibold text-amber-800 dark:text-amber-200">您的报名已取消</h3>
              <p className="mt-1 text-amber-700 dark:text-amber-300">您之前取消了这个报名，现在可以修改并重新提交</p>
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">所有信息已保留，您可以继续编辑</p>
            </div>
          </div>
        </div>
      )}

      {/* 已通过提示 */}
      {registration?.status === 'approved' && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
          <div className="flex items-start gap-2">
            <Check className="mt-0.5 h-5 w-5 text-emerald-700 dark:text-emerald-300" />
            <div>
              <h3 className="font-semibold text-emerald-800 dark:text-emerald-200">报名已通过审核</h3>
              <p className="mt-1 text-emerald-700 dark:text-emerald-300">当前为查看模式，无法进行修改；如需修改，可取消此条报名信息，重新提交报名。</p>
            </div>
          </div>
        </div>
      )}

      {/* 待审核提示 */}
      {(registration?.status === 'pending' || registration?.status === 'submitted') && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold text-primary">报名正在审核中</h3>
              <p className="mt-1 text-primary/80">当前为查看模式，无法修改或重新提交</p>
            </div>
          </div>
        </div>
      )}
      
      {/* 头部 */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <Button
            variant="ghost"
            onClick={() => router.push(`/portal/events/${eventId}`)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
          <h1 className="text-xl font-bold sm:text-2xl">{event.name} - 报名</h1>
        </div>
        
        {/* 根据状态判断是否显示保存和提交按钮 */}
        {shouldShowActionButtons() && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={handleSubmit(handleSaveDraft, handleInvalidTeamForm)}
              disabled={isSaving}
              className="w-full sm:w-auto"
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
              onClick={handleSubmit(handleSubmitRegistration, handleInvalidTeamForm)}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
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
        <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
            <div className="space-y-1">
              <p className="font-semibold text-destructive">不能新建报名</p>
              <p className="text-sm text-destructive">
                报名已结束，现在处于审核期。审核期内不接受新的报名申请，只能重新提交被驳回的报名。
              </p>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">模板导出</CardTitle>
          <CardDescription>
            报名记录保存为草稿或已提交后，可按模板导出报名表和运动员信息表。缺失字段会先提醒，导出文件中对应位置留空。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!registration?.id ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
              请先保存草稿或提交报名，再导出模板文件。
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {[
                {
                  type: 'registration_form' as const,
                  title: '报名表',
                  description: '导出参赛单位、队伍、组别、领队/教练信息和队员报名信息。',
                },
                {
                  type: 'athlete_info_form' as const,
                  title: '运动员信息表',
                  description: '导出领队、教练、队员证件照、姓名和队员比赛服号码。',
                },
              ].map((item) => (
                <div key={item.type} className="rounded-lg border border-border/60 p-4">
                  <div className="space-y-1">
                    <div className="font-semibold">{item.title}</div>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      disabled={Boolean(exportingTemplateKey)}
                      onClick={() => handleTemplateExport(item.type, 'pdf')}
                    >
                      {exportingTemplateKey === `${item.type}:pdf` ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          导出中...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          下载 PDF
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 报名表单 */}
      <Card>
        <CardContent className="p-4 sm:p-6">
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
              {event.divisions && event.divisions.length > 0 && (
                <div className="mb-6 rounded-lg border border-border/60 bg-muted/20 p-4">
                  <Label className="text-sm font-semibold">参赛组别 *</Label>
                  <p className="mb-2 mt-1 text-xs text-muted-foreground">请选择当前报名对应的组别，队员限制将按此组别自动校验</p>
                  <Select
                    value={selectedDivisionId}
                    onValueChange={setSelectedDivisionId}
                    disabled={isEventEndedView}
                  >
                    <SelectTrigger className="mt-2 w-full bg-background sm:max-w-sm">
                      <SelectValue placeholder="请选择组别" />
                    </SelectTrigger>
                    <SelectContent>
                      {event.divisions.map((division) => (
                        <SelectItem key={division.id} value={division.id}>
                          {division.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

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
                                src={teamLogoPreviewUrl || teamLogoPreview}
                                alt="队伍logo"
                                fill
                                className="object-cover"
                                unoptimized
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="absolute top-2 right-2"
                                onClick={() => {
                                  setTeamLogoFile(null)
                                  setTeamLogoPreview(null)
                                  syncTeamLogoFieldValue('')
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
                        {errors[field.id] && (
                          <p className="text-red-600 text-sm mt-1">
                            {errors[field.id]?.message as string}
                          </p>
                        )}
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
                          className="mt-2 h-11"
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
                          className="mt-2 h-11"
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
                    const fieldImagePreviewUrl = resolvePreviewImageUrl(watch(field.id), 'team-documents')
                    return (
                      <div key={`${field.id}-${index}`}>
                        <Label htmlFor={field.id}>
                          {field.label}{field.required && ' *'}
                        </Label>
                        <div className="mt-2">
                          {fieldImagePreviewUrl ? (
                            <div className="relative w-32 h-32 border rounded-lg overflow-hidden">
                              <Image
                                src={fieldImagePreviewUrl}
                                alt={field.label}
                                fill
                                className="object-cover"
                                unoptimized
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

                  if (field.type === 'attachment') {
                    const attachmentValue = watch(field.id) as AttachmentValue | undefined
                    return (
                      <div key={`${field.id}-${index}`}>
                        <Label htmlFor={field.id}>
                          {field.label}{field.required && ' *'}
                        </Label>
                        <div className="mt-2 space-y-2">
                          {attachmentValue?.url ? (
                            <div className="border rounded-lg p-3 flex items-center justify-between">
                              <div className="text-sm">
                                <p className="font-medium">{attachmentValue.name}</p>
                                <p className="text-gray-500">{formatFileSize(attachmentValue.size)}</p>
                              </div>
                              <div className="flex gap-2">
                                <Button type="button" size="sm" variant="outline" asChild>
                                  <a href={getPreviewUrl(attachmentValue.url, attachmentValue.name)} target="_blank" rel="noopener noreferrer">预览</a>
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => setValue(field.id, null)}
                                  disabled={isEventEndedView}
                                >
                                  移除
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                              <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                              <p className="text-sm text-gray-600">点击上传{field.label}</p>
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
                                    const data = await uploadPortalFile(file, 'team-documents')
                                    setValue(field.id, toAttachmentValue(data))
                                    alert('上传成功！')
                                  } catch (error: any) {
                                    alert(error.message || '上传失败')
                                  } finally {
                                    setIsSubmitting(false)
                                    e.target.value = ''
                                  }
                                }}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                disabled={isEventEndedView}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  }

                  if (field.type === 'attachments') {
                    const attachmentValues = (watch(field.id) as AttachmentValue[] | undefined) || []
                    return (
                      <div key={`${field.id}-${index}`}>
                        <Label htmlFor={field.id}>
                          {field.label}{field.required && ' *'}
                        </Label>
                        <div className="mt-2 space-y-2">
                          {attachmentValues.map((item, fileIndex) => (
                            <div key={`${item.path}-${fileIndex}`} className="border rounded-lg p-3 flex items-center justify-between">
                              <div className="text-sm">
                                <p className="font-medium">{item.name}</p>
                                <p className="text-gray-500">{formatFileSize(item.size)}</p>
                              </div>
                              <div className="flex gap-2">
                                <Button type="button" size="sm" variant="outline" asChild>
                                  <a href={getPreviewUrl(item.url, item.name)} target="_blank" rel="noopener noreferrer">预览</a>
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => setValue(field.id, attachmentValues.filter((_, i) => i !== fileIndex))}
                                  disabled={isEventEndedView}
                                >
                                  删除
                                </Button>
                              </div>
                            </div>
                          ))}
                          <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                            <Upload className="h-6 w-6 mx-auto text-gray-400 mb-1" />
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
                                  const data = await uploadPortalFile(file, 'team-documents')
                                  setValue(field.id, [...attachmentValues, toAttachmentValue(data)])
                                  alert('上传成功！')
                                } catch (error: any) {
                                  alert(error.message || '上传失败')
                                } finally {
                                  setIsSubmitting(false)
                                  e.target.value = ''
                                }
                              }}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                              disabled={isEventEndedView}
                            />
                          </div>
                        </div>
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
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold">人员列表</h3>
                    {/* 显示所有要求信息 */}
                    {(() => {
                      const hasCountReq = activeDivisionRules.minPlayers !== undefined || activeDivisionRules.maxPlayers !== undefined
                      const hasGenderReq = activeDivisionRules.gender && activeDivisionRules.gender !== 'none'
                      const hasAgeReq =
                        activeDivisionRules.minBirthDate !== undefined ||
                        activeDivisionRules.maxBirthDate !== undefined ||
                        activeDivisionRules.minAge !== undefined ||
                        activeDivisionRules.maxAge !== undefined

                      if (hasCountReq || hasGenderReq || hasAgeReq) {
                        return (
                          <div className="mt-2 space-y-1 text-sm text-gray-600">
                            <p className="font-medium text-gray-700">报名要求：</p>

                            {/* 人数要求 */}
                            {hasCountReq && (
                              <div className="flex items-center gap-2">
                                <span className="text-blue-600">•</span>
                                <span>
                                  队员人数：{activeDivisionRules.minPlayers ?? '不限'} - {activeDivisionRules.maxPlayers ?? '不限'} 人
                                </span>
                              </div>
                            )}

                            {/* 性别要求 */}
                            {hasGenderReq && (
                              <div className="flex items-center gap-2">
                                <span className="text-blue-600">•</span>
                                <span>
                                  性别：{activeDivisionRules.gender === 'male' ? '仅限男性队员' : activeDivisionRules.gender === 'female' ? '仅限女性队员' : '混合（至少1男1女）'}
                                </span>
                              </div>
                            )}

                            {/* 年龄要求 */}
                            {hasAgeReq && (
                              <div className="flex items-center gap-2">
                                <span className="text-blue-600">•</span>
                                <span>
                                  年龄：
                                  {activeDivisionRules.minBirthDate || activeDivisionRules.maxBirthDate
                                    ? `${activeDivisionRules.minBirthDate || '不限'} 至 ${activeDivisionRules.maxBirthDate || '不限'}`
                                    : activeDivisionRules.minAge !== undefined && activeDivisionRules.maxAge !== undefined
                                      ? `${activeDivisionRules.minAge} - ${activeDivisionRules.maxAge} 岁`
                                      : activeDivisionRules.minAge !== undefined
                                        ? `不小于 ${activeDivisionRules.minAge} 岁`
                                        : activeDivisionRules.maxAge !== undefined
                                          ? `不大于 ${activeDivisionRules.maxAge} 岁`
                                          : '有年龄限制'}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>
                  <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:flex-wrap lg:w-auto lg:justify-end">
                    {getOrderedRoles().map((role) => {
                      const rolePlayerCount = players.filter(p => (p.role || 'player') === role.id).length
                      return (
                        <Button
                          key={role.id}
                          type="button"
                          onClick={() => addPlayerByRole(role.id)}
                          size="sm"
                          disabled={isEventEndedView}
                          variant="default"
                          className="relative w-full justify-center sm:w-auto"
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
                    {getOrderedRoles().map((role) => {
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
                                        onClick={() => openShareLinkDialog(player, globalIndex + 1, role.name)}
                                        disabled={isEventEndedView}
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

                                    const isPlayerRole = role.id === 'player'
                                    const playerRequirements: PlayerRuleHints = isPlayerRole
                                      ? {
                                          genderRequirement:
                                            activeDivisionRules.gender === 'male' || activeDivisionRules.gender === 'female'
                                              ? activeDivisionRules.gender
                                              : 'none',
                                          ageRequirementEnabled:
                                            activeDivisionRules.minBirthDate !== undefined ||
                                            activeDivisionRules.maxBirthDate !== undefined ||
                                            activeDivisionRules.minAge !== undefined ||
                                            activeDivisionRules.maxAge !== undefined,
                                          minAge:
                                            activeDivisionRules.minBirthDate || activeDivisionRules.maxBirthDate
                                              ? undefined
                                              : activeDivisionRules.minAge,
                                          maxAge:
                                            activeDivisionRules.minBirthDate || activeDivisionRules.maxBirthDate
                                              ? undefined
                                              : activeDivisionRules.maxAge,
                                          minAgeDate: activeDivisionRules.minBirthDate,
                                          maxAgeDate: activeDivisionRules.maxBirthDate,
                                        }
                                      : {
                                          genderRequirement: 'none',
                                          ageRequirementEnabled: false,
                                          minAge: undefined,
                                          maxAge: undefined,
                                          minAgeDate: undefined,
                                          maxAgeDate: undefined,
                                        }

                                    // 使用管理端设置的字段顺序
                                    const roleFields = getMergedFields(selectedRole)

                                    return roleFields.map((field) => {
                                const ageRuleBounds = resolveAgeRequirementBounds({
                                  minAge: playerRequirements.minAge,
                                  maxAge: playerRequirements.maxAge,
                                  minBirthDate: playerRequirements.minAgeDate,
                                  maxBirthDate: playerRequirements.maxAgeDate,
                                })
                                const ageRequirementLabel = formatAgeRequirementLabel(ageRuleBounds.minAge, ageRuleBounds.maxAge)
                                const fieldLabel = getFieldDisplayLabel(field)
                                const isFieldRequired = isFieldRequiredForValues(field, player)
                                const useIdentityDocumentValidation = isIdentityDocumentSelected(player)

                                // 根据字段类型渲染不同的输入组件
                                switch (field.type) {
                                  case 'text':
                                    // 检查是否是身份证号码字段
                                    const isIdNumberField = field.id === 'id_number'
                                    let idValidation = { valid: true, message: '' }
                                    let idRuleErrors: string[] = []
                                    if (isIdNumberField && useIdentityDocumentValidation && player[field.id]) {
                                      idValidation = validateIdNumber(player[field.id])
                                      if (idValidation.valid && isPlayerRole) {
                                        const idRuleValidation = validateAgainstDivisionRules(player[field.id], activeDivisionRules)
                                        idRuleErrors = idRuleValidation.errors
                                      }
                                    }

                                    // 检查是否是年龄字段并有要求
                                    const isAgeField = field.id === 'age'
                                    const ageRequirement = isAgeField && playerRequirements?.ageRequirementEnabled
                                    const currentAge = isAgeField ? parseAgeValue(player[field.id]) : undefined

                                    let ageStatus = ''
                                    let ageMessage = ''
                                    if (isAgeField && currentAge !== undefined) {
                                      const ageErrors: string[] = []
                                      const ageSuccessMessages: string[] = []

                                      if (ageRequirement) {
                                        if (ageRuleBounds.minAge !== undefined && currentAge < ageRuleBounds.minAge) {
                                          ageErrors.push(`年龄不能小于 ${ageRuleBounds.minAge} 岁，当前为 ${currentAge} 岁`)
                                        } else if (ageRuleBounds.maxAge !== undefined && currentAge > ageRuleBounds.maxAge) {
                                          ageErrors.push(`年龄不能大于 ${ageRuleBounds.maxAge} 岁，当前为 ${currentAge} 岁`)
                                        } else if (ageRequirementLabel) {
                                          ageSuccessMessages.push(`年龄 ${currentAge} 岁，符合要求`)
                                        }
                                      }

                                      const idNumber = String(player.id_number || '').trim()
                                      if (useIdentityDocumentValidation && idNumber) {
                                        const parsedIdCard = parseIdCard(idNumber)
                                        if (parsedIdCard.isValid && parsedIdCard.age !== undefined) {
                                          if (parsedIdCard.age !== currentAge) {
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
                                      <div key={`${field.id}-${index}`} className={PLAYER_FIELD_WRAPPER_CLASS}>
                                        <Label className={PLAYER_FIELD_LABEL_CLASS}>
                                          {fieldLabel}{isFieldRequired && ' *'}
                                          {isIdNumberField && useIdentityDocumentValidation && (
                                            <span className={MUTED_BADGE_CLASS}>
                                              18位
                                            </span>
                                          )}
                                          {ageRequirement && ageRequirementLabel && (
                                            <span className={INFO_BADGE_CLASS}>
                                              {ageRequirementLabel}
                                            </span>
                                          )}
                                        </Label>
                                        <Input
                                          type={isAgeField ? "number" : "text"}
                                          value={player[field.id] || ''}
                                          onChange={(e) => updatePlayer(player.id, field.id, e.target.value)}
                                          placeholder={isIdNumberField
                                            ? (useIdentityDocumentValidation ? '请输入18位身份证号码' : '请输入证件号码')
                                            : `请输入${fieldLabel}`}
                                          maxLength={isIdNumberField && useIdentityDocumentValidation ? 18 : undefined}
                                          disabled={isEventEndedView}
                                          readOnly={isEventEndedView}
                                          className={`h-11 w-full ${
                                            isIdNumberField && useIdentityDocumentValidation && (!idValidation.valid || idRuleErrors.length > 0)
                                              ? VALIDATION_INPUT_ERROR_CLASS
                                            : isIdNumberField && useIdentityDocumentValidation && idValidation.valid && player[field.id]
                                              ? VALIDATION_INPUT_SUCCESS_CLASS
                                              : ageStatus === 'invalid'
                                              ? VALIDATION_INPUT_ERROR_CLASS
                                              : ageStatus === 'valid'
                                              ? VALIDATION_INPUT_SUCCESS_CLASS
                                              : ''
                                          }`}
                                        />
                                        {isIdNumberField && useIdentityDocumentValidation && player[field.id] && (
                                          <p className={`text-xs mt-1 font-medium ${
                                            !idValidation.valid || idRuleErrors.length > 0
                                              ? VALIDATION_MESSAGE_ERROR_CLASS
                                              : VALIDATION_MESSAGE_SUCCESS_CLASS
                                          }`}>
                                            {!idValidation.valid ? idValidation.message : idRuleErrors.length > 0 ? idRuleErrors.join('；') : '证件号码格式正确'}
                                          </p>
                                        )}
                                        {ageMessage && (
                                          <p className={`text-xs mt-1 font-medium ${
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
                                    // 检查是否是出生日期字段并有年龄要求
                                    const isBirthdateField = field.id === 'birthdate' || field.id === 'birthday'
                                    const birthdateAgeRequirement = isBirthdateField && playerRequirements?.ageRequirementEnabled

                                    let birthdateAgeStatus = ''
                                    let calculatedAge: number | undefined
                                    let birthdateAgeMessage = ''

                                    if (birthdateAgeRequirement && player[field.id]) {
                                      calculatedAge = calculateAgeFromDateString(player[field.id])
                                      const birthDateStr = String(player[field.id]).slice(0, 10)
                                      const minAgeDate = playerRequirements.minAgeDate
                                      const maxAgeDate = playerRequirements.maxAgeDate

                                      // 优先使用出生日期范围验证
                                      if ((minAgeDate || maxAgeDate) && calculatedAge !== undefined) {
                                        if (minAgeDate && birthDateStr < minAgeDate) {
                                          birthdateAgeStatus = 'too_old'
                                          birthdateAgeMessage = `出生日期不能早于 ${minAgeDate}，当前为 ${calculatedAge} 岁${ageRuleBounds.maxAge !== undefined ? `，超过 ${ageRuleBounds.maxAge} 岁限制` : ''}`
                                        } else if (maxAgeDate && birthDateStr > maxAgeDate) {
                                          birthdateAgeStatus = 'too_young'
                                          birthdateAgeMessage = `出生日期不能晚于 ${maxAgeDate}，当前为 ${calculatedAge} 岁${ageRuleBounds.minAge !== undefined ? `，小于 ${ageRuleBounds.minAge} 岁限制` : ''}`
                                        } else {
                                          birthdateAgeStatus = 'valid'
                                          birthdateAgeMessage = `年龄 ${calculatedAge} 岁，出生日期符合要求`
                                        }
                                      }
                                      // 兼容旧的年龄范围设置
                                      else if (calculatedAge !== undefined) {
                                        if (ageRuleBounds.minAge !== undefined && calculatedAge < ageRuleBounds.minAge) {
                                          birthdateAgeStatus = 'too_young'
                                          birthdateAgeMessage = `根据出生日期计算，年龄为 ${calculatedAge} 岁，不能小于 ${ageRuleBounds.minAge} 岁`
                                        } else if (ageRuleBounds.maxAge !== undefined && calculatedAge > ageRuleBounds.maxAge) {
                                          birthdateAgeStatus = 'too_old'
                                          birthdateAgeMessage = `根据出生日期计算，年龄为 ${calculatedAge} 岁，不能大于 ${ageRuleBounds.maxAge} 岁`
                                        } else if (
                                          (ageRuleBounds.minAge === undefined || calculatedAge >= ageRuleBounds.minAge) &&
                                          (ageRuleBounds.maxAge === undefined || calculatedAge <= ageRuleBounds.maxAge)
                                        ) {
                                          birthdateAgeStatus = 'valid'
                                          birthdateAgeMessage = `年龄 ${calculatedAge} 岁，符合要求`
                                        }
                                      }
                                    }

                                    return (
                                      <div key={`${field.id}-${index}`} className={PLAYER_FIELD_WRAPPER_CLASS}>
                                        <Label className={PLAYER_FIELD_LABEL_CLASS}>
                                          {fieldLabel}{isFieldRequired && ' *'}
                                          {birthdateAgeRequirement && (
                                            <span className={INFO_BADGE_CLASS}>
                                              {(() => {
                                                const minAgeDate = playerRequirements.minAgeDate
                                                const maxAgeDate = playerRequirements.maxAgeDate
                                                const fallbackLabel = ageRequirementLabel

                                                // 优先显示出生日期范围
                                                if (minAgeDate || maxAgeDate) {
                                                  const dateLabel = `${minAgeDate || '不限'} 至 ${maxAgeDate || '不限'}`
                                                  return fallbackLabel ? `${dateLabel}（${fallbackLabel}）` : dateLabel
                                                }
                                                // 兼容旧的年龄范围
                                                return fallbackLabel ? `需${fallbackLabel}` : '有年龄限制'
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
                                          className={`h-11 w-full ${
                                            birthdateAgeStatus === 'too_young' || birthdateAgeStatus === 'too_old'
                                              ? VALIDATION_INPUT_ERROR_CLASS
                                              : birthdateAgeStatus === 'valid'
                                              ? VALIDATION_INPUT_SUCCESS_CLASS
                                              : ''
                                          }`}
                                        />
                                        {birthdateAgeMessage && (
                                          <p className={`text-xs mt-1 font-medium ${
                                            birthdateAgeStatus === 'too_young' || birthdateAgeStatus === 'too_old'
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
                                    // 检查是否是性别字段并有要求
                                    const isGenderField = field.id === 'gender' || field.id === 'sex'
                                    const genderRequirement = isGenderField && playerRequirements?.genderRequirement && playerRequirements.genderRequirement !== 'none'
                                    const requiredGender = genderRequirement ? playerRequirements.genderRequirement : undefined
                                    const currentGender = normalizeGenderValue(player[field.id])
                                    const idCardGenderValidation = isGenderField
                                      ? getIdCardGenderValidation(player, field.id as 'gender' | 'sex')
                                      : { status: 'idle' as const, message: '' }
                                    const hasGenderRequirementError = Boolean(
                                      requiredGender &&
                                      currentGender &&
                                      currentGender !== requiredGender
                                    )
                                    const showGenderIdSuccess = idCardGenderValidation.status === 'valid' && !hasGenderRequirementError
                                    const shouldShowGenderIdMessage = idCardGenderValidation.status === 'invalid' || showGenderIdSuccess

                                    return (
                                      <div key={`${field.id}-${index}`} className={PLAYER_FIELD_WRAPPER_CLASS}>
                                        <Label className={PLAYER_FIELD_LABEL_CLASS}>
                                          {fieldLabel}{isFieldRequired && ' *'}
                                          {genderRequirement && (
                                            <span className={INFO_BADGE_CLASS}>
                                              仅限{playerRequirements.genderRequirement === 'male' ? '男性' : '女性'}
                                            </span>
                                          )}
                                        </Label>
                                        <Select
                                          value={player[field.id] || ''}
                                          onValueChange={(value) => updatePlayer(player.id, field.id, value)}
                                          disabled={isEventEndedView}
                                        >
                                          <SelectTrigger className={`h-11 w-full ${
                                            hasGenderRequirementError || idCardGenderValidation.status === 'invalid'
                                              ? VALIDATION_INPUT_ERROR_CLASS
                                              : showGenderIdSuccess
                                              ? VALIDATION_INPUT_SUCCESS_CLASS
                                              : ''
                                          }`}>
                                            <SelectValue placeholder={`请选择${fieldLabel}`} />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {field.options?.map((option) => {
                                              const optionValue = typeof option === 'string' ? option : option?.value
                                              const optionLabel = typeof option === 'string' ? option : (option?.label || option?.value)
                                              if (!optionValue) return null
                                              return (
                                                <SelectItem key={optionValue} value={optionValue}>
                                                  {optionLabel}
                                                </SelectItem>
                                              )
                                            })}
                                          </SelectContent>
                                        </Select>
                                        {shouldShowGenderIdMessage && (
                                          <p className={`text-xs mt-1 font-medium ${
                                            idCardGenderValidation.status === 'invalid'
                                              ? VALIDATION_MESSAGE_ERROR_CLASS
                                              : VALIDATION_MESSAGE_SUCCESS_CLASS
                                          }`}>
                                            {idCardGenderValidation.message}
                                          </p>
                                        )}
                                        {hasGenderRequirementError && (
                                          <p className={`text-xs mt-1 font-medium ${VALIDATION_MESSAGE_ERROR_CLASS}`}>
                                            此赛事要求所有队员必须为{playerRequirements.genderRequirement === 'male' ? '男性' : '女性'}
                                          </p>
                                        )}
                                      </div>
                                    )
                                  case 'multiselect':
                                    // TODO: 实现多选逻辑
                                    return null
                                  case 'image':
                                    const playerImagePreviewUrl = resolvePreviewImageUrl(player[field.id], 'player-photos')
                                    return (
                                      <div key={`${field.id}-${index}`} className={PLAYER_FIELD_WRAPPER_CLASS}>
                                        <Label className={PLAYER_FIELD_LABEL_CLASS}>{fieldLabel}{isFieldRequired && ' *'}</Label>
                                        <div>
                                          {playerImagePreviewUrl ? (
                                            <div className="relative w-32 h-32 border rounded-lg overflow-hidden">
                                              <Image
                                                src={playerImagePreviewUrl}
                                                alt={field.label || '队员图片'}
                                                fill
                                                className="object-cover"
                                                unoptimized
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

                                                      if (result.success) {
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
                                  case 'attachment':
                                    const playerAttachment = player[field.id] as AttachmentValue | undefined
                                    return (
                                      <div key={`${field.id}-${index}`} className={PLAYER_FIELD_WRAPPER_CLASS}>
                                        <Label className={PLAYER_FIELD_LABEL_CLASS}>{fieldLabel}{isFieldRequired && ' *'}</Label>
                                        <div className="space-y-2">
                                          {playerAttachment?.url ? (
                                            <div className="border rounded-lg p-3 flex items-center justify-between">
                                              <div className="text-sm">
                                                <p className="font-medium">{playerAttachment.name}</p>
                                                <p className="text-gray-500">{formatFileSize(playerAttachment.size)}</p>
                                              </div>
                                              <div className="flex gap-2">
                                                <Button type="button" size="sm" variant="outline" asChild>
                                                  <a href={getPreviewUrl(playerAttachment.url, playerAttachment.name)} target="_blank" rel="noopener noreferrer">预览</a>
                                                </Button>
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="destructive"
                                                  onClick={() => updatePlayer(player.id, field.id, null)}
                                                  disabled={isEventEndedView}
                                                >
                                                  删除
                                                </Button>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                                              <Upload className="h-6 w-6 mx-auto text-gray-400 mb-1" />
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
                                                    const data = await uploadPortalFile(file, 'team-documents')
                                                    updatePlayer(player.id, field.id, toAttachmentValue(data))
                                                    alert('上传成功！')
                                                  } catch (error: any) {
                                                    alert(error.message || '上传失败')
                                                  } finally {
                                                    setIsSubmitting(false)
                                                    e.target.value = ''
                                                  }
                                                }}
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                disabled={isEventEndedView}
                                              />
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  case 'attachments':
                                    const playerAttachments = (player[field.id] as AttachmentValue[] | undefined) || []
                                    return (
                                      <div key={`${field.id}-${index}`} className="space-y-2 md:col-span-2">
                                        <Label className={PLAYER_FIELD_LABEL_CLASS}>{fieldLabel}{isFieldRequired && ' *'}</Label>
                                        <div className="space-y-2">
                                          {playerAttachments.map((item, itemIndex) => (
                                            <div key={`${item.path}-${itemIndex}`} className="border rounded-lg p-3 flex items-center justify-between">
                                              <div className="text-sm">
                                                <p className="font-medium">{item.name}</p>
                                                <p className="text-gray-500">{formatFileSize(item.size)}</p>
                                              </div>
                                              <div className="flex gap-2">
                                                <Button type="button" size="sm" variant="outline" asChild>
                                                  <a href={getPreviewUrl(item.url, item.name)} target="_blank" rel="noopener noreferrer">预览</a>
                                                </Button>
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="destructive"
                                                  onClick={() => updatePlayer(player.id, field.id, playerAttachments.filter((_, i) => i !== itemIndex))}
                                                  disabled={isEventEndedView}
                                                >
                                                  删除
                                                </Button>
                                              </div>
                                            </div>
                                          ))}
                                          <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                                            <Upload className="h-6 w-6 mx-auto text-gray-400 mb-1" />
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
                                                  const data = await uploadPortalFile(file, 'team-documents')
                                                  updatePlayer(player.id, field.id, [...playerAttachments, toAttachmentValue(data)])
                                                  alert('上传成功！')
                                                } catch (error: any) {
                                                  alert(error.message || '上传失败')
                                                } finally {
                                                  setIsSubmitting(false)
                                                  e.target.value = ''
                                                }
                                              }}
                                              className="absolute inset-0 opacity-0 cursor-pointer"
                                              disabled={isEventEndedView}
                                            />
                                          </div>
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

      <AlertDialog
        open={Boolean(shareDialogTarget)}
        onOpenChange={(open) => {
          if (!open && !isGeneratingShareLink) {
            setShareDialogTarget(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认生成分享链接</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  即将为 <span className="font-medium text-foreground">{shareDialogTarget?.playerLabel}</span> 生成专属填写链接。
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>如果该人员之前已有分享链接，旧链接会立即失效。</li>
                  <li>对方通过本链接提交信息后，该链接会自动失效。</li>
                  <li>后续如需修改信息，需要你重新生成一条新的分享链接并再次填写。</li>
                </ul>
                <p>确认后再将链接发送给对应人员。</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isGeneratingShareLink}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleConfirmGenerateShareLink()
              }}
              disabled={isGeneratingShareLink}
            >
              {isGeneratingShareLink ? '生成中...' : '确认生成'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
