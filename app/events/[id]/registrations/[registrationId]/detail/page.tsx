'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { isSensitiveIdentityField } from '@/lib/privacy-mask'
import { resolveStorageObjectUrl, type UploadBucket } from '@/lib/storage-object'
import { ArrowLeft, Download, FileText } from 'lucide-react'
import { ImageViewer } from '@/components/ui/image-viewer'

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
  reviewed_at?: string
}

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

type RenderScope = 'team' | 'player'

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

function formatDateTime(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function RegistrationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = useMemo(() => (Array.isArray(params.id) ? params.id[0] : params.id), [params.id])
  const registrationId = useMemo(
    () => (Array.isArray(params.registrationId) ? params.registrationId[0] : params.registrationId),
    [params.registrationId]
  )
  const registrationListPath = eventId ? `/events/${eventId}?tab=registration-list` : '/events'

  const [registration, setRegistration] = useState<Registration | null>(null)
  const [teamFields, setTeamFields] = useState<RegistrationField[]>([])
  const [playerRoles, setPlayerRoles] = useState<PlayerRoleConfig[]>([])
  const [loading, setLoading] = useState(true)
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
      console.error('Load registration detail data error:', error)
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

  const getRoleName = (roleId: string): string => {
    const role = playerRoles.find((item) => item.id === roleId)
    if (role?.name) return role.name

    if (UUID_REGEX.test(roleId)) {
      return '未知角色（配置缺失）'
    }

    if (roleId.startsWith('role_')) {
      return '未知角色'
    }

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
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur px-3 py-2 sm:px-6 sm:py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Button className="h-10" variant="outline" onClick={() => router.push(registrationListPath)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回报名列表
          </Button>
        </div>
      </div>

      <div className="px-3 py-4 sm:p-6">
        <div className="max-w-6xl mx-auto space-y-6">

        <Card>
          <CardHeader>
            <CardTitle>报名详情（页面模式）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2">
              <div>
                <Label>提交时间</Label>
                <p className="mt-1 text-sm text-foreground">{formatDateTime(registration.submitted_at)}</p>
              </div>
              <div>
                <Label>审核时间</Label>
                <p className="mt-1 text-sm text-foreground">{formatDateTime(registration.reviewed_at)}</p>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-4">队伍信息</h3>
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
                    const playerName = getPlayerDisplayName(player, `${roleName}${idx + 1}`)

                    return (
                      <div key={`${roleId}-${safeIndex}`} className="border rounded-lg p-4">
                        <h4 className="font-medium mb-4">{playerName}</h4>
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
          </CardContent>
        </Card>
        </div>
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
