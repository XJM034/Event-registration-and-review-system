'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { isSensitiveIdentityField } from '@/lib/privacy-mask'
import { resolveStorageObjectUrl, type UploadBucket } from '@/lib/storage-object'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, Check, CheckCircle, X, XCircle, AlertCircle, FileText, Download } from 'lucide-react'
import { ImageViewer } from '@/components/ui/image-viewer'

type ReviewDecision = 'unchecked' | 'approved' | 'needsModification'

type FieldType = 'text' | 'image' | 'attachment' | 'attachments' | 'multiselect' | string

interface RegistrationField {
  id: string
  label: string
  type?: FieldType
}

interface FieldRequirement {
  allFields?: RegistrationField[]
  commonFields?: RegistrationField[]
  customFields?: RegistrationField[]
}

interface PlayerRoleConfig extends FieldRequirement {
  id: string
  name: string
}

interface PlayerRequirements {
  roles?: PlayerRoleConfig[]
}

interface RegistrationSettingsData {
  team_requirements?: FieldRequirement
  player_requirements?: PlayerRequirements
}

interface RegistrationSettingsRecord extends RegistrationSettingsData {
  division_id?: string | null
}

interface AttachmentFile {
  url: string
  name?: string
  size?: number
}

interface PlayerData extends Record<string, unknown> {
  role?: string
}

interface Registration {
  id: string
  event_id: string
  team_data: Record<string, unknown>
  players_data: PlayerData[]
  status: 'pending' | 'approved' | 'rejected'
  submitted_at: string
}

type ReviewStatus = Record<string, { status: ReviewDecision; comment?: string }>
type RenderScope = 'team' | 'player'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

interface RenderableEntry {
  key: string
  label: string
  value: unknown
  type?: FieldType
}

const IMAGE_URL_REGEX = /^(https?:\/\/|\/).+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DIVISION_FIELD_IDS = ['division_id', 'division', 'division_name', 'participationGroup'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toFieldList(requirement?: FieldRequirement): RegistrationField[] {
  if (!requirement) return []
  return requirement.allFields || [
    ...(requirement.commonFields || []),
    ...(requirement.customFields || []),
  ]
}

function normalizeValue(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  const text = raw.trim()
  if (!(text.startsWith('{') || text.startsWith('['))) return raw

  try {
    return JSON.parse(text) as unknown
  } catch {
    return raw
  }
}

function isAttachmentObject(value: unknown): value is AttachmentFile {
  return isRecord(value) && typeof value.url === 'string'
}

function isAttachmentArray(value: unknown): value is AttachmentFile[] {
  return Array.isArray(value) && value.some((item) => isAttachmentObject(item))
}

function inferValueType(value: unknown): FieldType | null {
  const normalizedValue = normalizeValue(value)
  if (isAttachmentObject(normalizedValue)) return 'attachment'
  if (isAttachmentArray(normalizedValue)) return 'attachments'
  if (typeof normalizedValue === 'string' && IMAGE_URL_REGEX.test(normalizedValue)) return 'image'
  if (Array.isArray(normalizedValue)) return 'multiselect'
  if (typeof normalizedValue === 'string') return 'text'
  return null
}

function getPreviewUrl(url: string, fileName?: string): string {
  const ext = (fileName || url).split('.').pop()?.toLowerCase()?.split('?')[0] || ''
  if (ext === 'pdf') return url
  if (['doc', 'docx', 'xls', 'xlsx'].includes(ext)) {
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`
  }
  return url
}

function getImageFallbackBucket(fieldId: string, scope: RenderScope): UploadBucket {
  if (scope === 'team') {
    return fieldId === 'logo' || fieldId === 'team_logo'
      ? 'registration-files'
      : 'team-documents'
  }

  return 'player-photos'
}

function getAttachmentFallbackBucket(): UploadBucket {
  return 'team-documents'
}

function formatFileSize(size?: number): string {
  if (!size || size <= 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function getPlayerDisplayName(player: PlayerData, fallback: string): string {
  const chineseName = typeof player['姓名'] === 'string' ? player['姓名'] : ''
  const englishName = typeof player['name'] === 'string' ? player['name'] : ''
  return chineseName || englishName || fallback
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text : null
}

function isDivisionField(fieldId: string): boolean {
  return DIVISION_FIELD_IDS.includes(fieldId as (typeof DIVISION_FIELD_IDS)[number])
}

function getReadableDivisionValue(source: Record<string, unknown>): string | null {
  const candidates = [
    toNonEmptyString(source.participationGroup),
    toNonEmptyString(source.division_name),
    toNonEmptyString(source.division),
  ].filter((value): value is string => Boolean(value))

  const meaningfulValue = candidates.find((value) => !UUID_REGEX.test(value))
  if (meaningfulValue) return meaningfulValue
  if (candidates[0]) return candidates[0]

  const rawDivisionId = toNonEmptyString(source.division_id)
  if (!rawDivisionId) return null

  return UUID_REGEX.test(rawDivisionId) ? '未匹配组别' : rawDivisionId
}

function getDivisionIdFromRegistration(registrationData?: Registration): string | undefined {
  if (!registrationData) return undefined
  const divisionId = registrationData.team_data?.division_id
  return typeof divisionId === 'string' && divisionId.trim() ? divisionId : undefined
}

function pickSettingsRecord(
  payload: RegistrationSettingsRecord | RegistrationSettingsRecord[] | undefined,
  divisionId?: string
): RegistrationSettingsRecord | null {
  if (!payload) return null
  if (!Array.isArray(payload)) return payload
  if (payload.length === 0) return null
  if (divisionId) {
    const matched = payload.find((item) => item?.division_id === divisionId)
    if (matched) return matched
  }
  return payload[0] || null
}

export default function ReviewRegistrationPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = useMemo(() => (Array.isArray(params.id) ? params.id[0] : params.id), [params.id])
  const registrationId = useMemo(
    () => (Array.isArray(params.registrationId) ? params.registrationId[0] : params.registrationId),
    [params.registrationId]
  )
  const reviewListPath = eventId ? `/events/${eventId}?tab=review-list` : '/events'

  const [registration, setRegistration] = useState<Registration | null>(null)
  const [teamFields, setTeamFields] = useState<RegistrationField[]>([])
  const [playerRoles, setPlayerRoles] = useState<PlayerRoleConfig[]>([])
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>({})
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [viewingImage, setViewingImage] = useState<{ src: string; alt: string } | null>(null)

  const loadData = useCallback(async (eid: string, rid: string) => {
    try {
      setLoading(true)

      const registrationRes = await fetch(`/api/registrations/${rid}?event_id=${eid}`, {
        cache: 'no-store',
      })
      const registrationResult = (await registrationRes.json()) as ApiResponse<Registration>

      if (!registrationResult.success || !registrationResult.data) {
        if (registrationRes.status === 401) {
          router.push('/auth/login')
          return
        }
        setRegistration(null)
        return
      }

      const registrationData = registrationResult.data
      setRegistration(registrationData)

      const divisionId = getDivisionIdFromRegistration(registrationData)
      const settingsUrl = divisionId
        ? `/api/events/${eid}/registration-settings?division_id=${encodeURIComponent(divisionId)}`
        : `/api/events/${eid}/registration-settings`
      const settingsRes = await fetch(settingsUrl, {
        cache: 'no-store',
      })
      const settingsResult = (
        await settingsRes.json()
      ) as ApiResponse<RegistrationSettingsRecord | RegistrationSettingsRecord[]>

      if (!settingsResult.success) {
        if (settingsRes.status === 401) {
          router.push('/auth/login')
          return
        }
        setTeamFields([])
        setPlayerRoles([])
        return
      }

      const settingsRecord = pickSettingsRecord(settingsResult.data, divisionId)
      if (settingsRecord) {
        setTeamFields(toFieldList(settingsRecord.team_requirements))
        setPlayerRoles(settingsRecord.player_requirements?.roles || [])
      } else {
        setTeamFields([])
        setPlayerRoles([])
      }
    } catch (error) {
      console.error('Load review page data error:', error)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (!eventId || !registrationId) return
    loadData(eventId, registrationId)
  }, [eventId, registrationId, loadData])

  const allConfiguredFields = useMemo(
    () => [
      ...teamFields,
      ...playerRoles.flatMap((role) => toFieldList(role)),
    ],
    [teamFields, playerRoles]
  )

  const updateReviewStatus = (key: string, status: ReviewDecision, comment?: string) => {
    setReviewStatus((prev) => ({
      ...prev,
      [key]: {
        status,
        comment: comment !== undefined ? comment : (prev[key]?.comment || ''),
      },
    }))
  }

  const getRoleName = (roleId: string): string => {
    const role = playerRoles.find((item) => item.id === roleId)
    if (role?.name) return role.name

    // 如果找不到角色配置，显示友好的文本而不是 UUID
    if (UUID_REGEX.test(roleId)) {
      return '未知角色（配置缺失）'
    }

    // 如果是 role_ 开头的时间戳格式
    if (roleId.startsWith('role_')) {
      return '未知角色'
    }

    // 默认返回 roleId（可能是有意义的字符串）
    return roleId
  }

  const getRoleFields = (roleId: string): RegistrationField[] => {
    const role = playerRoles.find((item) => item.id === roleId)
    return toFieldList(role)
  }

  const groupPlayersByRole = (playersData: PlayerData[]) => {
    const grouped: Record<string, { roleName: string; players: PlayerData[] }> = {}

    playersData.forEach((player) => {
      const roleId = typeof player.role === 'string' ? player.role : 'player'
      if (!grouped[roleId]) {
        grouped[roleId] = {
          roleName: getRoleName(roleId),
          players: [],
        }
      }
      grouped[roleId].players.push(player)
    })

    return grouped
  }

  const resolveFieldLabel = (fieldId: string, value?: unknown, scopedFields?: RegistrationField[]) => {
    if (!fieldId) return fieldId

    const builtInLabelMap: Record<string, string> = {
      name: '姓名',
      id_number: '证件号码',
      gender: '性别',
      id_photo: '证件照',
      emergency_contact: '紧急联系人',
      logo: '队伍logo',
      team_logo: '队伍logo',
      team_name: '队伍名称',
      contact: '联系人',
      phone: '联系方式',
      campus: '报名校区',
      participationGroup: '组别',
    }

    const scoped = scopedFields && scopedFields.length > 0 ? scopedFields : allConfiguredFields
    const scopedMatch = scoped.find((field) => field.id === fieldId)
    if (scopedMatch?.label) return scopedMatch.label

    const teamMatch = teamFields.find((field) => field.id === fieldId)
    if (teamMatch?.label) return teamMatch.label

    for (const role of playerRoles) {
      const roleMatch = toFieldList(role).find((field) => field.id === fieldId)
      if (roleMatch?.label) return roleMatch.label
    }

    if (fieldId === 'division_id' || fieldId === 'division') return '组别'
    if (fieldId === 'division_name') return '组别名称'
    if (builtInLabelMap[fieldId]) return builtInLabelMap[fieldId]

    if (fieldId.startsWith('custom_')) {
      const inferredType = inferValueType(value)
      if (inferredType) {
        const scopedLabel = scoped.find((field) => field.type === inferredType)?.label
        if (scopedLabel) return scopedLabel

        const globalLabel = allConfiguredFields.find((field) => field.type === inferredType)?.label
        if (globalLabel) return globalLabel

        if (inferredType === 'attachment') return '报名表'
        if (inferredType === 'attachments') return '多个报名表'
      }
      return '报名信息'
    }

    return fieldId
  }

  const getRenderableEntries = (
    source: Record<string, unknown>,
    configuredFields: RegistrationField[]
  ): RenderableEntry[] => {
    const entries: RenderableEntry[] = []
    const usedKeys = new Set<string>()
    const divisionValue = getReadableDivisionValue(source)
    let hasDivisionEntry = false

    // First, add division field if it exists (to make it appear first)
    if (divisionValue) {
      const divisionField = configuredFields.find((field) => isDivisionField(field.id))
      if (divisionField) {
        entries.push({
          key: divisionField.id,
          label: resolveFieldLabel(divisionField.id, divisionValue, configuredFields),
          value: divisionValue,
          type: divisionField.type,
        })
        usedKeys.add(divisionField.id)
        hasDivisionEntry = true
        DIVISION_FIELD_IDS.forEach((divisionFieldId) => usedKeys.add(divisionFieldId))
      } else {
        // If division field is not in configured fields, add it as participationGroup
        entries.push({
          key: 'participationGroup',
          label: resolveFieldLabel('participationGroup', divisionValue, configuredFields),
          value: divisionValue,
        })
        hasDivisionEntry = true
        DIVISION_FIELD_IDS.forEach((divisionFieldId) => usedKeys.add(divisionFieldId))
      }
    }

    // Then add other configured fields
    configuredFields.forEach((field) => {
      if (usedKeys.has(field.id) || field.id === 'role') {
        return
      }
      const value = source[field.id]
      if (value !== undefined && value !== null && value !== '') {
        entries.push({
          key: field.id,
          label: resolveFieldLabel(field.id, value, configuredFields),
          value,
          type: field.type,
        })
        usedKeys.add(field.id)
      }
    })

    const unusedFields = configuredFields.filter((field) => !usedKeys.has(field.id))

    Object.entries(source).forEach(([key, value]) => {
      if (usedKeys.has(key) || key === 'id' || key === 'role' || value === undefined || value === null || value === '') {
        return
      }
      if (hasDivisionEntry && isDivisionField(key)) {
        return
      }

      const inferredType = inferValueType(value)
      let mappedIndex = -1

      if (inferredType) {
        mappedIndex = unusedFields.findIndex((field) => field.type === inferredType)
      }
      if (mappedIndex < 0) {
        mappedIndex = unusedFields.findIndex((field) => field.id.startsWith('custom_'))
      }

      const mappedField = mappedIndex >= 0 ? unusedFields.splice(mappedIndex, 1)[0] : undefined

      // Only add this entry if we found a matching unused field
      // This prevents duplicate rendering when data has extra keys that don't match any configured field
      if (mappedField) {
        entries.push({
          key,
          label: mappedField.label || resolveFieldLabel(key, value, configuredFields),
          value,
          type: mappedField.type,
        })
        usedKeys.add(key)
      }
    })

    return entries
  }

  const renderFieldValue = (
    value: unknown,
    fieldId: string,
    fields: RegistrationField[],
    scope: RenderScope,
  ): ReactNode => {
    const normalizedValue = normalizeValue(value)
    const field = fields.find((item) => item.id === fieldId)
    const sensitiveIdentityField = isSensitiveIdentityField(fieldId, field?.label)

    if ((field?.type === 'image' || inferValueType(normalizedValue) === 'image') && typeof normalizedValue === 'string') {
      const imageSrc = resolveStorageObjectUrl(normalizedValue, {
        fallbackBucket: getImageFallbackBucket(fieldId, scope),
      })

      if (!imageSrc) {
        return '-'
      }

      return (
        <div
          className="cursor-pointer inline-block"
          onClick={() => setViewingImage({ src: imageSrc, alt: field?.label || fieldId })}
        >
          <Image
            src={imageSrc}
            alt={field?.label || fieldId}
            width={128}
            height={128}
            unoptimized
            className="w-32 h-32 object-cover rounded border hover:opacity-80 transition-opacity"
          />
        </div>
      )
    }

    if ((field?.type === 'attachment' || (!field && isAttachmentObject(normalizedValue))) && isAttachmentObject(normalizedValue)) {
      const previewUrl = resolveStorageObjectUrl(normalizedValue, {
        fallbackBucket: getAttachmentFallbackBucket(),
      }) || normalizedValue.url
      const downloadUrl = resolveStorageObjectUrl(normalizedValue, {
        fallbackBucket: getAttachmentFallbackBucket(),
        download: true,
        fileName: normalizedValue.name || '附件',
      }) || previewUrl

      return (
        <div className="flex flex-col gap-3 rounded border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="break-all text-sm font-medium">{normalizedValue.name || '附件'}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(normalizedValue.size)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href={getPreviewUrl(previewUrl, normalizedValue.name)} target="_blank" rel="noopener noreferrer">预览</a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={downloadUrl} download={normalizedValue.name || '附件'}>
                <Download className="h-3 w-3 mr-1" />
                下载
              </a>
            </Button>
          </div>
        </div>
      )
    }

    if ((field?.type === 'attachments' || (!field && isAttachmentArray(normalizedValue))) && Array.isArray(normalizedValue)) {
      const files = normalizedValue.filter((item): item is AttachmentFile => isAttachmentObject(item))

      return (
        <div className="space-y-2">
          {files.map((file, idx) => (
            (() => {
              const previewUrl = resolveStorageObjectUrl(file, {
                fallbackBucket: getAttachmentFallbackBucket(),
              }) || file.url
              const downloadUrl = resolveStorageObjectUrl(file, {
                fallbackBucket: getAttachmentFallbackBucket(),
                download: true,
                fileName: file.name || `附件${idx + 1}`,
              }) || previewUrl

              return (
            <div
              key={`${file.url}-${idx}`}
              className="flex flex-col gap-3 rounded border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="break-all text-sm font-medium">{file.name || `附件${idx + 1}`}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <a href={getPreviewUrl(previewUrl, file.name)} target="_blank" rel="noopener noreferrer">预览</a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={downloadUrl} download={file.name || `附件${idx + 1}`}>
                    <Download className="h-3 w-3 mr-1" />
                    下载
                  </a>
                </Button>
              </div>
            </div>
              )
            })()
          ))}
        </div>
      )
    }

    if (Array.isArray(normalizedValue)) {
      return normalizedValue.map((item) => String(item)).join(', ')
    }

    if (normalizedValue === undefined || normalizedValue === null || normalizedValue === '') {
      return '-'
    }

    if (sensitiveIdentityField && typeof normalizedValue === 'string') {
      return <p className="break-all font-mono text-sm text-foreground">{normalizedValue}</p>
    }

    return String(normalizedValue)
  }

  const generateRejectionReason = (): string => {
    const reasons: string[] = []

    if (reviewStatus.team?.status === 'needsModification' && reviewStatus.team.comment) {
      reasons.push(`队伍信息需修改：${reviewStatus.team.comment}`)
    }

    registration?.players_data.forEach((player, index) => {
      const key = `player_${index}`
      if (reviewStatus[key]?.status === 'needsModification' && reviewStatus[key].comment) {
        const playerName = getPlayerDisplayName(player, `队员${index + 1}`)
        reasons.push(`${playerName}信息需修改：${reviewStatus[key].comment}`)
      }
    })

    return reasons.join('\n')
  }

  const handleApprove = async () => {
    if (!registration) return

    setProcessing(true)
    try {
      const response = await fetch(`/api/registrations/${registration.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      })
      const result = (await response.json()) as ApiResponse<unknown>
      if (!result.success) {
        alert(result.error || '审核失败')
        return
      }
      router.push(reviewListPath)
    } catch (error) {
      console.error('Approve error:', error)
      alert('审核失败')
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!registration) return

    const autoReason = generateRejectionReason()
    const reason = rejectionReason.trim() || autoReason.trim()
    if (!reason) {
      alert('请填写驳回理由')
      return
    }

    setProcessing(true)
    try {
      const response = await fetch(`/api/registrations/${registration.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', rejection_reason: reason }),
      })
      const result = (await response.json()) as ApiResponse<unknown>
      if (!result.success) {
        alert(result.error || '驳回失败')
        return
      }
      router.push(reviewListPath)
    } catch (error) {
      console.error('Reject error:', error)
      alert('驳回失败')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">加载中...</div>
  }

  if (!registration) {
    return <div className="p-8 text-center text-muted-foreground">报名信息不存在</div>
  }

  const groupedPlayers = groupPlayersByRole(registration.players_data || [])
  const sortedEntries = Object.entries(groupedPlayers).sort(([roleIdA], [roleIdB]) => {
    if (roleIdA === 'player') return 1
    if (roleIdB === 'player') return -1
    return 0
  })

  return (
    <div className="min-h-screen bg-background px-3 py-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="sticky top-0 z-10 -mx-3 -mt-4 flex flex-col gap-3 border-b bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:-mt-6 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-4">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => router.push(reviewListPath)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回审核列表
            </Button>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button className="w-full sm:w-auto" variant="outline" onClick={handleReject} disabled={processing}>
              <X className="h-4 w-4 mr-1" />
              驳回
            </Button>
            <Button
              className="w-full bg-green-600 hover:bg-green-700 sm:w-auto"
              onClick={handleApprove}
              disabled={processing}
            >
              <Check className="h-4 w-4 mr-1" />
              通过
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>审核报名信息（页面模式）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="border rounded-lg p-4">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <h3 className="font-semibold text-lg">队伍信息</h3>
                <RadioGroup
                  value={reviewStatus.team?.status || 'unchecked'}
                  onValueChange={(value) => updateReviewStatus('team', value as ReviewDecision)}
                  className="grid gap-3 sm:grid-flow-col sm:auto-cols-max sm:gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="approved" id="team-approved" />
                    <Label htmlFor="team-approved" className="flex items-center cursor-pointer">
                      <CheckCircle className="h-4 w-4 mr-1 text-green-600" />
                      无误
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="needsModification" id="team-needs" />
                    <Label htmlFor="team-needs" className="flex items-center cursor-pointer">
                      <XCircle className="h-4 w-4 mr-1 text-red-600" />
                      需修改
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {reviewStatus.team?.status === 'needsModification' && (
                <Alert className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <Textarea
                      placeholder="请说明队伍信息需要修改的内容..."
                      value={reviewStatus.team?.comment || ''}
                      onChange={(e) => updateReviewStatus('team', 'needsModification', e.target.value)}
                      className="mt-2"
                    />
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {getRenderableEntries(registration.team_data || {}, teamFields).map((entry) => (
                  <div
                    key={entry.key}
                    className={
                      entry.type === 'image' || entry.type === 'attachment' || entry.type === 'attachments'
                        ? 'sm:col-span-2'
                        : ''
                    }
                  >
                    <Label>{entry.label}</Label>
                    <div className="mt-1">{renderFieldValue(entry.value, entry.key, teamFields, 'team')}</div>
                  </div>
                ))}
              </div>
            </div>

            {sortedEntries.map(([roleId, { roleName, players }]) => {
              const roleFields = getRoleFields(roleId)

              return (
                <div key={roleId} className="space-y-4">
                  <h3 className="font-semibold">{roleName} ({players.length}人)</h3>
                  {players.map((player, idx) => {
                    const globalIndex = registration.players_data.findIndex((item) => item === player)
                    const safeIndex = globalIndex >= 0 ? globalIndex : idx
                    const playerKey = `player_${safeIndex}`
                    const playerName = getPlayerDisplayName(player, `${roleName}${idx + 1}`)

                    return (
                      <div key={`${roleId}-${safeIndex}`} className="border rounded-lg p-4">
                        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <h4 className="font-medium">{playerName}</h4>
                          <RadioGroup
                            value={reviewStatus[playerKey]?.status || 'unchecked'}
                            onValueChange={(value) => updateReviewStatus(playerKey, value as ReviewDecision)}
                            className="grid gap-3 sm:grid-flow-col sm:auto-cols-max sm:gap-4"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="approved" id={`${playerKey}-approved`} />
                              <Label htmlFor={`${playerKey}-approved`} className="flex items-center cursor-pointer">
                                <CheckCircle className="h-4 w-4 mr-1 text-green-600" />
                                无误
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="needsModification" id={`${playerKey}-needs`} />
                              <Label htmlFor={`${playerKey}-needs`} className="flex items-center cursor-pointer">
                                <XCircle className="h-4 w-4 mr-1 text-red-600" />
                                需修改
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>

                        {reviewStatus[playerKey]?.status === 'needsModification' && (
                          <Alert className="mb-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                              <Textarea
                                placeholder="请说明该人员信息需要修改的内容..."
                                value={reviewStatus[playerKey]?.comment || ''}
                                onChange={(e) => updateReviewStatus(playerKey, 'needsModification', e.target.value)}
                                className="mt-2"
                              />
                            </AlertDescription>
                          </Alert>
                        )}

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          {getRenderableEntries(player, roleFields).map((entry) => (
                            <div
                              key={entry.key}
                              className={
                                entry.type === 'image' || entry.type === 'attachment' || entry.type === 'attachments'
                                  ? 'sm:col-span-2 xl:col-span-3'
                                  : ''
                              }
                            >
                              <Label>{entry.label}</Label>
                              <div className="mt-1">{renderFieldValue(entry.value, entry.key, roleFields, 'player')}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}

            <div>
              <Label htmlFor="rejectReason">驳回理由（可选，驳回时会使用）</Label>
              <Textarea
                id="rejectReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="mt-2 min-h-[120px]"
                placeholder="可留空，系统将根据“需修改”项自动生成"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {viewingImage && (
        <ImageViewer
          src={viewingImage.src}
          alt={viewingImage.alt}
          isOpen={!!viewingImage}
          onClose={() => setViewingImage(null)}
        />
      )}
    </div>
  )
}
