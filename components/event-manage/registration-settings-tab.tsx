'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Trash2, Save, Users, User, Settings, X, UserPlus, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { PDFDocument } from 'pdf-lib'
import type {
  EventDocumentTemplateSnapshot,
  EventDocumentTemplateState,
  EventReferenceTemplate,
  ReferenceTemplateType,
} from '@/lib/types'
import { normalizeReferenceTemplate } from '@/lib/reference-templates'

interface FieldConfig {
  id: string
  label: string
  type: 'text' | 'image' | 'select' | 'multiselect' | 'date' | 'attachment' | 'attachments'
  required: boolean
  requiredLocked?: boolean
  options?: string[]
  isCommon?: boolean  // 添加标记来区分常用项和自定义项
  conditionalRequired?: {  // 新增：条件必填配置
    dependsOn: string      // 依赖字段的 id
    values: string[]       // 当依赖字段值在此数组中时必填
  }
  canRemove?: boolean  // 是否可删除
}

// 可排序的字段项组件
function SortableFieldItem({ field, onToggleRequired, onRemove, onEditField, canRemove = true }: {
  field: FieldConfig
  onToggleRequired: () => void
  onRemove?: () => void
  onEditField?: () => void
  canRemove?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // 字段类型显示名称映射
  const typeLabels: Record<string, string> = {
    'text': '文本',
    'image': '图片',
    'select': '单选',
    'multiselect': '多选',
    'date': '日期',
    'attachment': '单附件',
    'attachments': '多附件'
  }

  const handleRemoveClick = () => {
    if (!canRemove) {
      alert('该字段不可删除')
      return
    }
    if (onRemove) {
      onRemove()
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center space-x-4">
        <button
          className="cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium">{field.label}</span>
        {!canRemove && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">不可删除</span>
        )}
        <span className="text-xs text-muted-foreground">
          ({typeLabels[field.type] || field.type})
          {field.options && ` - ${field.options.length}个选项`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* 所有字段都显示设置按钮 */}
        {onEditField && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onEditField}
            title="编辑字段"
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}
        <label className="flex items-center space-x-2">
          <Checkbox
            checked={field.required}
            disabled={field.requiredLocked}
            onCheckedChange={onToggleRequired}
          />
          <span className="text-sm">必填</span>
        </label>
        {/* 所有字段都显示删除按钮，保持UI一致 */}
        <Button
          size="sm"
          variant="ghost"
          onClick={handleRemoveClick}
          title={canRemove ? "删除字段" : "该字段不能删除"}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

interface TeamRequirements {
  commonFields: FieldConfig[]
  customFields: FieldConfig[]
  allFields?: FieldConfig[]  // 新增统一的字段数组
  registrationStartDate?: string
  registrationEndDate?: string
  reviewEndDate?: string  // 审核结束时间
  registrationFormTemplate?: EventReferenceTemplate | null
  athleteInfoTemplate?: EventReferenceTemplate | null
  registrationFormTemplateState?: EventDocumentTemplateState | null
  athleteInfoTemplateState?: EventDocumentTemplateState | null
}

interface RoleConfig {
  id: string
  name: string
  commonFields?: FieldConfig[]  // 常用项，只有默认队员角色有
  customFields: FieldConfig[]
  allFields?: FieldConfig[]  // 统一的字段数组
  minPlayers?: number
  maxPlayers?: number
  isDeletable?: boolean  // 新增：标记角色是否可删除
}

interface PlayerRequirements {
  roles: RoleConfig[]
  genderRequirement: 'none' | 'male' | 'female'  // 性别要求
  ageRequirementEnabled: boolean  // 是否启用年龄要求
  minAgeDate?: string  // 使用日期字符串存储最小出生日期
  maxAgeDate?: string  // 使用日期字符串存储最大出生日期
  countRequirementEnabled: boolean  // 是否启用人数要求
  minCount?: number
  maxCount?: number
}

interface RegistrationSettingsTabProps {
  eventId: string
  eventStartDate?: string // 添加赛事开始日期
}

interface EventDivision {
  id: string
  name: string
  description?: string
  rules?: {
    gender?: 'male' | 'female' | 'mixed' | 'none'
    minAge?: number
    maxAge?: number
    minBirthDate?: string
    maxBirthDate?: string
    minPlayers?: number
    maxPlayers?: number
  }
}

function normalizeRoleConfig(role: RoleConfig): RoleConfig {
  return {
    ...role,
    commonFields: normalizeRoleFieldList(role.id, role.commonFields),
    customFields: normalizeRoleFieldList(role.id, role.customFields),
    allFields: role.allFields ? normalizeRoleFieldList(role.id, role.allFields) : role.allFields,
  }
}

function normalizeTeamRequirementsConfig(requirements: TeamRequirements): TeamRequirements {
  return {
    ...requirements,
    commonFields: normalizeTeamFieldList(requirements.commonFields),
    customFields: normalizeTeamFieldList(requirements.customFields),
    allFields: requirements.allFields ? normalizeTeamFieldList(requirements.allFields) : requirements.allFields,
  }
}

function normalizePlayerRequirementsConfig(requirements: PlayerRequirements): PlayerRequirements {
  return {
    ...requirements,
    roles: requirements.roles.map(normalizeRoleConfig),
  }
}

type TemplateFieldKey = 'registrationFormTemplate' | 'athleteInfoTemplate'
type TemplateStateFieldKey = 'registrationFormTemplateState' | 'athleteInfoTemplateState'

const PDF_TEMPLATE_ACCEPT = '.pdf,application/pdf'
const TEMPLATE_PAGE_RULES: Record<ReferenceTemplateType, { pageCount: number }> = {
  generic: { pageCount: 1 },
  registration_form: { pageCount: 1 },
  athlete_info_form: { pageCount: 2 },
}
const TEMPLATE_PAGE_SIZE = { width: 595.28, height: 841.89 }
const TEMPLATE_PAGE_TOLERANCE = 8
const TEAM_LOCKED_REQUIRED_FIELDS = new Set(['unit', 'name', 'contact'])
const PLAYER_LOCKED_REQUIRED_FIELDS = new Set(['name', 'gender', 'age', 'player_number'])
const STAFF_LOCKED_REQUIRED_FIELDS = new Set(['name', 'contact'])
const TEAM_NON_REMOVABLE_FIELDS = new Set(['unit', 'name', 'contact'])
const PLAYER_NON_REMOVABLE_FIELDS = new Set(['name', 'gender', 'age', 'player_number', 'id_photo'])
const STAFF_NON_REMOVABLE_FIELDS = new Set(['name', 'contact', 'id_photo'])
const TEMPLATE_FIELD_CONFIG: Record<
  TemplateFieldKey,
  {
    label: string
    templateType: ReferenceTemplateType
    helperText: string
    stateKey: TemplateStateFieldKey
  }
> = {
  registrationFormTemplate: {
    label: '报名表模板',
    templateType: 'registration_form',
    helperText: '上传空白框架 PDF，导出时会把队员、教练、领队信息注入该模板。',
    stateKey: 'registrationFormTemplateState',
  },
  athleteInfoTemplate: {
    label: '运动员信息表模板',
    templateType: 'athlete_info_form',
    helperText: '上传空白框架 PDF，导出时会把证件照、姓名和比赛服号码注入该模板。',
    stateKey: 'athleteInfoTemplateState',
  },
}

function formatFileSize(size: number) {
  if (size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function isPdfTemplateFile(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

function resolveTemplateStoragePath(template?: EventReferenceTemplate | null): string | null {
  const path = String(template?.path || '').trim()
  return path || null
}

function normalizeDocumentTemplate(
  value: unknown,
  templateType: ReferenceTemplateType,
): EventReferenceTemplate | null {
  const template = normalizeReferenceTemplate(
    value && typeof value === 'object'
      ? { ...(value as Partial<EventReferenceTemplate>), templateType }
      : null,
  )
  return template ? { ...template, templateType } : null
}

function normalizeFieldLabel(field: FieldConfig): FieldConfig {
  if (field.id === 'player_number' && field.label !== '比赛服号码') {
    return { ...field, label: '比赛服号码' }
  }
  return field
}

function normalizeFieldList(fields?: FieldConfig[]): FieldConfig[] {
  return (fields || []).map(normalizeFieldLabel)
}

function applyFieldRequirementPolicy(field: FieldConfig, roleId?: string): FieldConfig {
  const normalized = normalizeFieldLabel(field)
  const requiredLocked =
    roleId === 'team'
      ? TEAM_LOCKED_REQUIRED_FIELDS.has(normalized.id)
      : roleId === 'player'
      ? PLAYER_LOCKED_REQUIRED_FIELDS.has(normalized.id)
      : roleId === 'coach' || roleId === 'leader'
      ? STAFF_LOCKED_REQUIRED_FIELDS.has(normalized.id)
      : false
  const nonRemovable =
    roleId === 'team'
      ? TEAM_NON_REMOVABLE_FIELDS.has(normalized.id)
      : roleId === 'player'
      ? PLAYER_NON_REMOVABLE_FIELDS.has(normalized.id)
      : roleId === 'coach' || roleId === 'leader'
      ? STAFF_NON_REMOVABLE_FIELDS.has(normalized.id)
      : false

  return {
    ...normalized,
    required: requiredLocked ? true : Boolean(normalized.required),
    requiredLocked,
    canRemove: nonRemovable ? false : normalized.canRemove,
  }
}

function normalizeTeamFieldList(fields?: FieldConfig[]): FieldConfig[] {
  return normalizeFieldList(fields).map((field) => applyFieldRequirementPolicy(field, 'team'))
}

function normalizeRoleFieldList(roleId: string, fields?: FieldConfig[]): FieldConfig[] {
  return normalizeFieldList(fields).map((field) => applyFieldRequirementPolicy(field, roleId))
}

function normalizeTemplateSnapshot(
  value: unknown,
  templateType: ReferenceTemplateType,
): EventDocumentTemplateSnapshot | null {
  if (!value || typeof value !== 'object') return null

  const snapshot = value as Partial<EventDocumentTemplateSnapshot>
  const template = normalizeDocumentTemplate(snapshot.template, templateType)

  return {
    template,
    title: typeof snapshot.title === 'string' ? snapshot.title : '',
    attachmentLabel: typeof snapshot.attachmentLabel === 'string' ? snapshot.attachmentLabel : '',
    updatedAt: typeof snapshot.updatedAt === 'string' ? snapshot.updatedAt : undefined,
    publishedAt: typeof snapshot.publishedAt === 'string' ? snapshot.publishedAt : undefined,
  }
}

function normalizeTemplateState(
  value: unknown,
  templateType: ReferenceTemplateType,
  legacyTemplate?: unknown,
): EventDocumentTemplateState | null {
  const published = normalizeTemplateSnapshot(
    value && typeof value === 'object' ? (value as Partial<EventDocumentTemplateState>).published : null,
    templateType,
  )
  const draft = normalizeTemplateSnapshot(
    value && typeof value === 'object' ? (value as Partial<EventDocumentTemplateState>).draft : null,
    templateType,
  )
  const backup = normalizeTemplateSnapshot(
    value && typeof value === 'object' ? (value as Partial<EventDocumentTemplateState>).backup : null,
    templateType,
  )

  const legacyNormalized = normalizeDocumentTemplate(legacyTemplate, templateType)
  const publishedSnapshot = published
    ? {
        ...published,
        template: published.template || legacyNormalized || null,
      }
    : (
      legacyNormalized
        ? {
            template: legacyNormalized,
            title: '',
            attachmentLabel: '',
          }
        : null
    )

  if (!publishedSnapshot && !draft && !backup) {
    return null
  }

  return {
    published: publishedSnapshot,
    draft,
    backup,
  }
}

function getPublishedTemplate(state?: EventDocumentTemplateState | null): EventReferenceTemplate | null {
  return state?.published?.template || null
}

function syncPublishedTemplateFields(requirements: TeamRequirements): TeamRequirements {
  return {
    ...requirements,
    registrationFormTemplate: getPublishedTemplate(requirements.registrationFormTemplateState) || null,
    athleteInfoTemplate: getPublishedTemplate(requirements.athleteInfoTemplateState) || null,
  }
}

export default function RegistrationSettingsTab({ eventId, eventStartDate }: RegistrationSettingsTabProps) {
  const [initialDataLoaded, setInitialDataLoaded] = useState(false) // 添加初始数据加载状态
  const [eventDivisions, setEventDivisions] = useState<EventDivision[]>([])
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(null)
  const [teamRequirements, setTeamRequirements] = useState<TeamRequirements>(() => normalizeTeamRequirementsConfig({
    commonFields: [
      { id: 'unit', label: '参赛单位', type: 'text', required: true, canRemove: false },
      { id: 'name', label: '队伍名称', type: 'text', required: true, canRemove: false },
      { id: 'contact', label: '联系人', type: 'text', required: true, canRemove: false },
      { id: 'phone', label: '联系电话', type: 'text', required: true },
      { id: 'logo', label: '队伍logo', type: 'image', required: false }
    ],
    customFields: [],
    registrationStartDate: '',
    registrationEndDate: '',
    reviewEndDate: '',
    registrationFormTemplate: null,
    athleteInfoTemplate: null,
    registrationFormTemplateState: null,
    athleteInfoTemplateState: null,
  }))

  const [playerRequirements, setPlayerRequirements] = useState<PlayerRequirements>(() => normalizePlayerRequirementsConfig({
    roles: [
      {
        id: 'player',
        name: '队员',
        commonFields: [
          { id: 'name', label: '姓名', type: 'text', required: true, canRemove: false },
          { id: 'gender', label: '性别', type: 'select', required: true, options: ['男', '女'], canRemove: false },
          { id: 'age', label: '年龄', type: 'text', required: true, canRemove: false },
          { id: 'id_type', label: '证件类型', type: 'select', required: true, options: ['身份证', '其他'] },
          { id: 'id_number', label: '证件号码', type: 'text', required: true, conditionalRequired: { dependsOn: 'id_type', values: ['身份证'] } },
          { id: 'player_number', label: '比赛服号码', type: 'text', required: true },
          { id: 'emergency_contact', label: '紧急联系人', type: 'text', required: true },
          { id: 'contact_phone', label: '联系电话', type: 'text', required: true },
          { id: 'id_photo', label: '证件照', type: 'image', required: false }
        ],
        customFields: [],
        allFields: [
          { id: 'name', label: '姓名', type: 'text', required: true, isCommon: true, canRemove: false },
          { id: 'gender', label: '性别', type: 'select', required: true, options: ['男', '女'], isCommon: true, canRemove: false },
          { id: 'age', label: '年龄', type: 'text', required: true, isCommon: true, canRemove: false },
          { id: 'id_type', label: '证件类型', type: 'select', required: true, options: ['身份证', '其他'], isCommon: true },
          { id: 'id_number', label: '证件号码', type: 'text', required: true, isCommon: true, conditionalRequired: { dependsOn: 'id_type', values: ['身份证'] } },
          { id: 'player_number', label: '比赛服号码', type: 'text', required: true, isCommon: true },
          { id: 'emergency_contact', label: '紧急联系人', type: 'text', required: true, isCommon: true },
          { id: 'contact_phone', label: '联系电话', type: 'text', required: true, isCommon: true },
          { id: 'id_photo', label: '证件照', type: 'image', required: false, isCommon: true }
        ],
        minPlayers: 1,
        maxPlayers: 30,
        isDeletable: false
      },
      {
        id: 'coach',
        name: '教练员',
        commonFields: [
          { id: 'name', label: '姓名', type: 'text', required: true },
          { id: 'contact', label: '联系方式', type: 'text', required: true },
          { id: 'id_photo', label: '证件照', type: 'image', required: false }
        ],
        customFields: [],
        allFields: [
          { id: 'name', label: '姓名', type: 'text', required: true, isCommon: true },
          { id: 'contact', label: '联系方式', type: 'text', required: true, isCommon: true },
          { id: 'id_photo', label: '证件照', type: 'image', required: false, isCommon: true }
        ],
        isDeletable: true
      },
      {
        id: 'leader',
        name: '领队',
        commonFields: [
          { id: 'name', label: '姓名', type: 'text', required: true },
          { id: 'contact', label: '联系方式', type: 'text', required: true },
          { id: 'id_photo', label: '证件照', type: 'image', required: false }
        ],
        customFields: [],
        allFields: [
          { id: 'name', label: '姓名', type: 'text', required: true, isCommon: true },
          { id: 'contact', label: '联系方式', type: 'text', required: true, isCommon: true },
          { id: 'id_photo', label: '证件照', type: 'image', required: false, isCommon: true }
        ],
        isDeletable: true
      }
    ],
    genderRequirement: 'none',
    ageRequirementEnabled: false,
    minAgeDate: '',
    maxAgeDate: '',
    countRequirementEnabled: false,
    minCount: 11,
    maxCount: 20
  }))

  const [isLoading, setIsLoading] = useState(false)
  const [newFieldType, setNewFieldType] = useState<'text' | 'image' | 'select' | 'multiselect' | 'date' | 'attachment' | 'attachments'>('text')
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [showOptionsDialog, setShowOptionsDialog] = useState(false)
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [selectedRole, setSelectedRole] = useState<string>('player')
  const [editingField, setEditingField] = useState<{ type: 'team' | 'player', roleId?: string, field: FieldConfig, isCommon: boolean } | null>(null)
  const [tempOptions, setTempOptions] = useState<string[]>(['选项1', '选项2'])

  // 删除角色确认对话框状态
  const [showDeleteRoleDialog, setShowDeleteRoleDialog] = useState(false)
  const [roleToDelete, setRoleToDelete] = useState<{ id: string, name: string } | null>(null)

  // 删除字段确认对话框状态
  const [showDeleteFieldDialog, setShowDeleteFieldDialog] = useState(false)
  const [fieldToDelete, setFieldToDelete] = useState<{ type: 'team' | 'player', fieldId: string, fieldLabel: string, isCommon: boolean, roleId?: string } | null>(null)

  // 字段编辑对话框状态
  const [showFieldEditDialog, setShowFieldEditDialog] = useState(false)
  const [editingFieldData, setEditingFieldData] = useState<{
    type: 'team' | 'player'
    roleId?: string
    field: FieldConfig
    isCommon: boolean
  } | null>(null)
  const [tempFieldLabel, setTempFieldLabel] = useState('')
  const [tempFieldType, setTempFieldType] = useState<'text' | 'image' | 'select' | 'multiselect' | 'date' | 'attachment' | 'attachments'>('text')
  const [tempFieldOptions, setTempFieldOptions] = useState<string[]>([])

  // 时间验证错误状态
  const [regStartError, setRegStartError] = useState('')
  const [regEndError, setRegEndError] = useState('')
  const [reviewEndError, setReviewEndError] = useState('')
  const [uploadingTemplateKey, setUploadingTemplateKey] = useState<TemplateFieldKey | null>(null)
  const [previewingTemplateKey, setPreviewingTemplateKey] = useState<TemplateFieldKey | null>(null)
  const [pendingDeleteTemplatePaths, setPendingDeleteTemplatePaths] = useState<string[]>([])

  useEffect(() => {
    // 先加载赛事关联的组别
    const loadDivisions = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/divisions`)
        const data = await res.json()
        if (data.success && data.data && data.data.length > 0) {
          setEventDivisions(data.data)
          setSelectedDivisionId(data.data[0].id)
        } else {
          // 无组别，按旧逻辑加载
          fetchSettings()
        }
      } catch {
        fetchSettings()
      }
    }
    loadDivisions()
  }, [eventId])

  // 当选中的组别变化时，加载对应的报名设置
  useEffect(() => {
    if (selectedDivisionId !== null) {
      fetchSettings(selectedDivisionId)
    }
  }, [selectedDivisionId])

  // 格式化日期时间显示
  const formatDateTime = (dateTimeStr: string) => {
    const date = new Date(dateTimeStr)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}`
  }

  // 格式化日期显示（用于赛事时间）
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const getTemplateState = (requirements: TeamRequirements, key: TemplateFieldKey) => {
    const { stateKey } = TEMPLATE_FIELD_CONFIG[key]
    return requirements[stateKey] || null
  }

  const applyTemplateState = (
    requirements: TeamRequirements,
    key: TemplateFieldKey,
    nextState: EventDocumentTemplateState | null,
  ): TeamRequirements => {
    const { stateKey } = TEMPLATE_FIELD_CONFIG[key]
    return syncPublishedTemplateFields({
      ...requirements,
      [stateKey]: nextState,
    } as TeamRequirements)
  }

  const validateTemplatePdf = async (
    file: File,
    templateType: ReferenceTemplateType,
  ) => {
    const rule = TEMPLATE_PAGE_RULES[templateType]
    const bytes = await file.arrayBuffer()
    const pdf = await PDFDocument.load(bytes)

    if (rule && pdf.getPageCount() !== rule.pageCount) {
      throw new Error(`页数不符合要求：当前 ${pdf.getPageCount()} 页，${templateType === 'athlete_info_form' ? '运动员信息表模板必须为 2 页' : '报名表模板必须为 1 页'}`)
    }

    pdf.getPages().forEach((page, index) => {
      const width = page.getWidth()
      const height = page.getHeight()
      const widthDiff = Math.abs(width - TEMPLATE_PAGE_SIZE.width)
      const heightDiff = Math.abs(height - TEMPLATE_PAGE_SIZE.height)
      if (widthDiff > TEMPLATE_PAGE_TOLERANCE || heightDiff > TEMPLATE_PAGE_TOLERANCE) {
        throw new Error(`第 ${index + 1} 页尺寸不符合 A4 规范，请基于官方模板修改后重新上传`)
      }
    })
  }

  const uploadDocumentTemplate = async (
    file: File,
    templateType: ReferenceTemplateType,
  ): Promise<EventReferenceTemplate | null> => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('bucket', 'team-documents')

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || '模板上传失败')
      }

      return {
        name: result.data.originalName || file.name,
        path: result.data.path,
        url: result.data.url,
        size: Number(result.data.size || file.size || 0),
        mimeType: result.data.mimeType || file.type || '',
        uploadedAt: new Date().toISOString(),
        templateType,
      }
    } catch (error) {
      console.error('Upload document template error:', error)
      return null
    }
  }

  const handleTemplateUpload = async (
    key: TemplateFieldKey,
    fileList: FileList | null,
    input: HTMLInputElement,
  ) => {
    const file = fileList?.[0]
    if (!file) return

    if (!isPdfTemplateFile(file)) {
      alert('模板仅支持 PDF 文件')
      input.value = ''
      return
    }

    const templateConfig = TEMPLATE_FIELD_CONFIG[key]
    setUploadingTemplateKey(key)
    try {
      await validateTemplatePdf(file, templateConfig.templateType)

      const uploadedTemplate = await uploadDocumentTemplate(file, templateConfig.templateType)
      if (!uploadedTemplate) {
        alert(`${templateConfig.label}上传失败，请重试`)
        return
      }

      setTeamRequirements((prev) => {
        const previousTemplate = getTemplateState(prev, key)?.draft?.template || null
        const previousPath = resolveTemplateStoragePath(previousTemplate)
        if (previousPath) {
          setPendingDeleteTemplatePaths((paths) => (paths.includes(previousPath) ? paths : [...paths, previousPath]))
        }

        const currentState = getTemplateState(prev, key)
        return applyTemplateState(prev, key, {
          published: currentState?.published || null,
          backup: currentState?.backup || null,
          draft: {
            template: uploadedTemplate,
            title: '',
            attachmentLabel: '',
            updatedAt: new Date().toISOString(),
          },
        })
      })
    } catch (error) {
      console.error('Validate or upload template error:', error)
      alert(error instanceof Error ? error.message : `${templateConfig.label}上传失败，请重试`)
    } finally {
      setUploadingTemplateKey(null)
      input.value = ''
    }
  }

  const previewTemplate = async (
    key: TemplateFieldKey,
    snapshot?: EventDocumentTemplateSnapshot | null,
  ) => {
    if (!snapshot?.template) return

    const previewWindow = window.open('', '_blank')
    if (!previewWindow) {
      alert('浏览器阻止了预览窗口，请允许弹窗后重试')
      return
    }

    previewWindow.document.title = '模板预览'
    previewWindow.document.body.innerHTML = '<p style="padding: 16px; font-family: sans-serif;">正在生成预览，请稍候...</p>'

    setPreviewingTemplateKey(key)

    try {
      const templateType = TEMPLATE_FIELD_CONFIG[key].templateType
      if (templateType !== 'registration_form' && templateType !== 'athlete_info_form') {
        throw new Error('模板类型无效')
      }

      const referenceTemplates = (Object.keys(TEMPLATE_FIELD_CONFIG) as TemplateFieldKey[])
        .map((templateKey) => {
          if (templateKey === key) return snapshot.template
          const otherState = getTemplateState(teamRequirements, templateKey)
          return otherState?.draft?.template || otherState?.published?.template || null
        })
        .filter((template): template is EventReferenceTemplate => Boolean(template))

      const response = await fetch(`/api/events/${eventId}/registration-settings/template-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentType: templateType,
          template: snapshot.template,
          referenceTemplates,
          divisionId: selectedDivisionId,
        }),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(result?.error || '模板预览失败')
      }

      const blob = await response.blob()
      const previewUrl = window.URL.createObjectURL(blob)
      previewWindow.location.href = previewUrl
      window.setTimeout(() => {
        window.URL.revokeObjectURL(previewUrl)
      }, 60_000)
    } catch (error) {
      previewWindow.close()
      console.error('Preview template error:', error)
      alert(error instanceof Error ? error.message : '模板预览失败，请稍后重试')
    } finally {
      setPreviewingTemplateKey(null)
    }
  }

  const removeDraftTemplate = (key: TemplateFieldKey) => {
    setTeamRequirements((prev) => {
      const existingTemplate = getTemplateState(prev, key)?.draft?.template || null
      const storagePath = resolveTemplateStoragePath(existingTemplate)
      if (storagePath) {
        setPendingDeleteTemplatePaths((paths) => (paths.includes(storagePath) ? paths : [...paths, storagePath]))
      }

      const currentState = getTemplateState(prev, key)
      return applyTemplateState(prev, key, {
        published: currentState?.published || null,
        backup: currentState?.backup || null,
        draft: null,
      })
    })
  }

  const publishDraftTemplate = (key: TemplateFieldKey) => {
    setTeamRequirements((prev) => {
      const currentState = getTemplateState(prev, key)
      const draft = currentState?.draft
      if (!draft) return prev

      const nextPublished: EventDocumentTemplateSnapshot = {
        template: draft.template || currentState?.published?.template || null,
        title: '',
        attachmentLabel: '',
        updatedAt: draft.updatedAt || new Date().toISOString(),
        publishedAt: new Date().toISOString(),
      }

      const nextBackup = currentState?.published
        ? {
            ...currentState.published,
            updatedAt: currentState.published.updatedAt || new Date().toISOString(),
          }
        : null

      return applyTemplateState(prev, key, {
        published: nextPublished,
        backup: nextBackup,
        draft: null,
      })
    })
    alert('草稿已发布到当前页面，请继续点击页面底部“保存设置”后，教练端导出才会切换到新模板')
  }

  const rollbackPublishedTemplate = (key: TemplateFieldKey) => {
    setTeamRequirements((prev) => {
      const currentState = getTemplateState(prev, key)
      if (!currentState?.backup) return prev

      return applyTemplateState(prev, key, {
        published: currentState.backup,
        backup: currentState.published || null,
        draft: currentState.draft || null,
      })
    })
    alert('已回退当前页面中的模板版本，请继续点击页面底部“保存设置”后，教练端导出才会生效')
  }

  const deleteTemplatePaths = async (paths: string[]) => {
    if (paths.length === 0) return

    try {
      const response = await fetch('/api/upload', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bucket: 'team-documents',
          paths,
        }),
      })

      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || '模板文件删除失败')
      }
    } catch (error) {
      console.error('Delete document template error:', error)
    }
  }

  // 实时验证报名时间
  useEffect(() => {
    // 清空所有错误
    setRegStartError('')
    setRegEndError('')
    setReviewEndError('')

    const regStart = teamRequirements.registrationStartDate
    const regEnd = teamRequirements.registrationEndDate
    const reviewEnd = teamRequirements.reviewEndDate

    if (!regStart || !regEnd || !reviewEnd) {
      return // 如果有任何字段为空，不进行验证
    }

    const regStartDate = new Date(regStart)
    const regEndDate = new Date(regEnd)
    const reviewEndDate = new Date(reviewEnd)
    const eventStart = eventStartDate ? new Date(eventStartDate) : null

    // 验证1: 报名开始时间 < 报名结束时间
    if (regStartDate >= regEndDate) {
      setRegEndError(`⚠️ 报名开始时间必须早于报名结束时间（当前报名开始时间为：${formatDateTime(regStart)}）`)
      return
    }

    // 验证2: 报名结束时间 < 审核结束时间
    if (regEndDate >= reviewEndDate) {
      setReviewEndError(`⚠️ 审核结束时间必须在报名结束时间之后（当前报名结束时间为：${formatDateTime(regEnd)}）`)
      return
    }

    // 验证3: 报名结束时间 < 赛事开始时间
    if (eventStart && regEndDate >= eventStart) {
      setRegEndError(`⚠️ 报名结束时间必须早于比赛开始时间（当前比赛开始时间为：${formatDate(eventStartDate!)}）`)
      return
    }

    // 验证4: 审核结束时间 < 赛事开始时间
    if (eventStart && reviewEndDate >= eventStart) {
      setReviewEndError(`⚠️ 审核结束时间必须在比赛开始时间之前（当前比赛开始时间为：${formatDate(eventStartDate!)}）`)
      return
    }
  }, [teamRequirements.registrationStartDate, teamRequirements.registrationEndDate, teamRequirements.reviewEndDate, eventStartDate])

  // 拖动传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // 拖动排序处理函数 - 使用统一的allFields数组
  const handleDragEndTeam = (event: DragEndEvent) => {
    const { active, over } = event
    
    if (active.id !== over?.id) {
      setTeamRequirements(prev => {
        // 使用allFields或者从commonFields和customFields创建
        const currentAllFields = prev.allFields || [
          ...prev.commonFields.map(f => ({ ...f, isCommon: true })),
          ...prev.customFields.map(f => ({ ...f, isCommon: false }))
        ]
        
        const oldIndex = currentAllFields.findIndex(field => field.id === active.id)
        const newIndex = currentAllFields.findIndex(field => field.id === over?.id)
        
        if (oldIndex !== -1 && newIndex !== -1) {
          const reorderedFields = arrayMove(currentAllFields, oldIndex, newIndex)
          
          // 保存重新排序后的allFields，但也要更新commonFields和customFields以保持兼容性
          const newCommonFields = reorderedFields
            .filter(f => f.isCommon)
            .map(({ isCommon, ...field }) => field)
          const newCustomFields = reorderedFields
            .filter(f => !f.isCommon)
            .map(({ isCommon, ...field }) => field)
          
          return {
            ...prev,
            allFields: reorderedFields,  // 保存统一的字段顺序
            commonFields: newCommonFields,
            customFields: newCustomFields
          }
        }
        
        return prev
      })
    }
  }

  const handleDragEndPlayer = (roleId: string, event: DragEndEvent) => {
    const { active, over } = event
    
    if (active.id !== over?.id) {
      setPlayerRequirements(prev => ({
        ...prev,
        roles: prev.roles.map(role => {
          if (role.id === roleId) {
            // 使用allFields或从commonFields和customFields创建
            const currentAllFields = role.allFields || [
              ...(role.commonFields || []).map(f => ({ ...f, isCommon: true })),
              ...role.customFields.map(f => ({ ...f, isCommon: false }))
            ]
            
            const oldIndex = currentAllFields.findIndex(field => field.id === active.id)
            const newIndex = currentAllFields.findIndex(field => field.id === over?.id)
            
            if (oldIndex !== -1 && newIndex !== -1) {
              const reorderedFields = arrayMove(currentAllFields, oldIndex, newIndex)
              
              // 重新分离常用项和自定义项以保持兼容性
              const newCommonFields = reorderedFields
                .filter(f => f.isCommon)
                .map(({ isCommon, ...field }) => field)
              const newCustomFields = reorderedFields
                .filter(f => !f.isCommon)
                .map(({ isCommon, ...field }) => field)
              
              return {
                ...role,
                allFields: reorderedFields,  // 保存统一的字段顺序
                commonFields: role.id === 'player' ? newCommonFields : role.commonFields,
                customFields: newCustomFields
              }
            }
          }
          return role
        })
      }))
    }
  }

  const fetchSettings = async (divisionId?: string | null) => {
    try {
      setPendingDeleteTemplatePaths([])
      let url = `/api/events/${eventId}/registration-settings`
      if (divisionId) {
        url += `?division_id=${divisionId}`
      }
      const response = await fetch(url)
      const result = await response.json()

      if (result.success && result.data) {
        const loadedTeamReq: TeamRequirements = result.data.team_requirements || {
          commonFields: [
            { id: 'unit', label: '参赛单位', type: 'text', required: true, canRemove: false },
            { id: 'name', label: '队伍名称', type: 'text', required: true, canRemove: false },
            { id: 'contact', label: '联系人', type: 'text', required: true, canRemove: false },
            { id: 'phone', label: '联系电话', type: 'text', required: true },
            { id: 'logo', label: '队伍logo', type: 'image', required: false }
          ],
          customFields: [],
          registrationStartDate: '',
          registrationEndDate: '',
          reviewEndDate: '',
          registrationFormTemplate: null,
          athleteInfoTemplate: null,
          registrationFormTemplateState: null,
          athleteInfoTemplateState: null,
        }

        loadedTeamReq.registrationFormTemplate = normalizeDocumentTemplate(
          loadedTeamReq.registrationFormTemplate,
          'registration_form',
        )
        loadedTeamReq.athleteInfoTemplate = normalizeDocumentTemplate(
          loadedTeamReq.athleteInfoTemplate,
          'athlete_info_form',
        )
        loadedTeamReq.registrationFormTemplateState = normalizeTemplateState(
          loadedTeamReq.registrationFormTemplateState,
          'registration_form',
          loadedTeamReq.registrationFormTemplate,
        )
        loadedTeamReq.athleteInfoTemplateState = normalizeTemplateState(
          loadedTeamReq.athleteInfoTemplateState,
          'athlete_info_form',
          loadedTeamReq.athleteInfoTemplate,
        )
        loadedTeamReq.commonFields = normalizeTeamFieldList(loadedTeamReq.commonFields)
        loadedTeamReq.customFields = normalizeTeamFieldList(loadedTeamReq.customFields)
        loadedTeamReq.allFields = normalizeTeamFieldList(loadedTeamReq.allFields)

        // 如果没有allFields，从commonFields和customFields创建
        if (!loadedTeamReq.allFields || loadedTeamReq.allFields.length === 0) {
          loadedTeamReq.allFields = [
            ...(loadedTeamReq.commonFields || []).map(f => ({ ...f, isCommon: true })),
            ...(loadedTeamReq.customFields || []).map(f => ({ ...f, isCommon: false }))
          ]
        }

        setTeamRequirements(normalizeTeamRequirementsConfig(loadedTeamReq))

        // 确保player_requirements始终包含roles数组
        const loadedPlayerReq = (result.data.player_requirements || {}) as Partial<PlayerRequirements>

        // 为每个角色创建allFields如果不存在
        if (loadedPlayerReq.roles) {
          loadedPlayerReq.roles = loadedPlayerReq.roles.map((role) => {
            const commonFields = normalizeRoleFieldList(role.id, role.commonFields)
            const customFields = normalizeRoleFieldList(role.id, role.customFields)
            const allFields = normalizeRoleFieldList(role.id, role.allFields)
            if (!role.allFields) {
              return {
                ...role,
                commonFields,
                customFields,
                allFields: [
                  ...commonFields.map(f => ({ ...f, isCommon: true })),
                  ...customFields.map(f => ({ ...f, isCommon: false }))
                ]
              }
            }
            return {
              ...role,
              commonFields,
              customFields,
              allFields
            }
          })
        }

        // 确保默认角色存在
        const rolesWithDefault = [...(loadedPlayerReq.roles || [])]

        // 检查是否已有队员角色，如果没有则添加默认队员角色（9个字段）
        const hasPlayerRole = rolesWithDefault.some((role) => role.id === 'player');
        if (!hasPlayerRole) {
          rolesWithDefault.unshift({
            id: 'player',
            name: '队员',
            commonFields: [
              { id: 'name', label: '姓名', type: 'text' as const, required: true, canRemove: false },
              { id: 'gender', label: '性别', type: 'select' as const, required: true, options: ['男', '女'], canRemove: false },
              { id: 'age', label: '年龄', type: 'text' as const, required: true, canRemove: false },
              { id: 'id_type', label: '证件类型', type: 'select' as const, required: true, options: ['身份证', '其他'] },
              { id: 'id_number', label: '证件号码', type: 'text' as const, required: true, conditionalRequired: { dependsOn: 'id_type', values: ['身份证'] } },
              { id: 'player_number', label: '比赛服号码', type: 'text' as const, required: true },
              { id: 'emergency_contact', label: '紧急联系人', type: 'text' as const, required: true },
              { id: 'contact_phone', label: '联系电话', type: 'text' as const, required: true },
              { id: 'id_photo', label: '证件照', type: 'image' as const, required: false }
            ],
            customFields: [],
            allFields: [
              { id: 'name', label: '姓名', type: 'text' as const, required: true, isCommon: true, canRemove: false },
              { id: 'gender', label: '性别', type: 'select' as const, required: true, options: ['男', '女'], isCommon: true, canRemove: false },
              { id: 'age', label: '年龄', type: 'text' as const, required: true, isCommon: true, canRemove: false },
              { id: 'id_type', label: '证件类型', type: 'select' as const, required: true, options: ['身份证', '其他'], isCommon: true },
              { id: 'id_number', label: '证件号码', type: 'text' as const, required: true, isCommon: true, conditionalRequired: { dependsOn: 'id_type', values: ['身份证'] } },
              { id: 'player_number', label: '比赛服号码', type: 'text' as const, required: true, isCommon: true },
              { id: 'emergency_contact', label: '紧急联系人', type: 'text' as const, required: true, isCommon: true },
              { id: 'contact_phone', label: '联系电话', type: 'text' as const, required: true, isCommon: true },
              { id: 'id_photo', label: '证件照', type: 'image' as const, required: false, isCommon: true }
            ],
            minPlayers: 1,
            maxPlayers: 30,
            isDeletable: false
          });
        }

        // 检查是否已有教练员角色，如果没有则添加
        const hasCoachRole = rolesWithDefault.some((role) => role.id === 'coach');
        if (!hasCoachRole) {
          rolesWithDefault.push({
            id: 'coach',
            name: '教练员',
            commonFields: [
              { id: 'name', label: '姓名', type: 'text' as const, required: true },
              { id: 'contact', label: '联系方式', type: 'text' as const, required: true },
              { id: 'id_photo', label: '证件照', type: 'image' as const, required: false }
            ],
            customFields: [],
            allFields: [
              { id: 'name', label: '姓名', type: 'text' as const, required: true, isCommon: true },
              { id: 'contact', label: '联系方式', type: 'text' as const, required: true, isCommon: true },
              { id: 'id_photo', label: '证件照', type: 'image' as const, required: false, isCommon: true }
            ],
            isDeletable: true
          });
        }

        // 检查是否已有领队角色，如果没有则添加
        const hasLeaderRole = rolesWithDefault.some((role) => role.id === 'leader');
        if (!hasLeaderRole) {
          rolesWithDefault.push({
            id: 'leader',
            name: '领队',
            commonFields: [
              { id: 'name', label: '姓名', type: 'text' as const, required: true },
              { id: 'contact', label: '联系方式', type: 'text' as const, required: true },
              { id: 'id_photo', label: '证件照', type: 'image' as const, required: false }
            ],
            customFields: [],
            allFields: [
              { id: 'name', label: '姓名', type: 'text' as const, required: true, isCommon: true },
              { id: 'contact', label: '联系方式', type: 'text' as const, required: true, isCommon: true },
              { id: 'id_photo', label: '证件照', type: 'image' as const, required: false, isCommon: true }
            ],
            isDeletable: true
          });
        }

        setPlayerRequirements(normalizePlayerRequirementsConfig({
          ...playerRequirements,
          ...loadedPlayerReq,
          roles: rolesWithDefault
        }))
      } else {
        // 如果没有保存的数据，使用默认值并标记为已加载
        const defaultTeamReq: TeamRequirements = {
          commonFields: [
            { id: 'unit', label: '参赛单位', type: 'text', required: true, canRemove: false },
            { id: 'name', label: '队伍名称', type: 'text', required: true, canRemove: false },
            { id: 'contact', label: '联系人', type: 'text', required: true, canRemove: false },
            { id: 'phone', label: '联系电话', type: 'text', required: true },
            { id: 'logo', label: '队伍logo', type: 'image', required: false }
          ],
          customFields: [],
          allFields: [
            { id: 'unit', label: '参赛单位', type: 'text', required: true, isCommon: true, canRemove: false },
            { id: 'name', label: '队伍名称', type: 'text', required: true, isCommon: true, canRemove: false },
            { id: 'contact', label: '联系人', type: 'text', required: true, isCommon: true, canRemove: false },
            { id: 'phone', label: '联系电话', type: 'text', required: true, isCommon: true },
            { id: 'logo', label: '队伍logo', type: 'image', required: false, isCommon: true }
          ],
          registrationStartDate: '',
          registrationEndDate: '',
          reviewEndDate: '',
          registrationFormTemplate: null,
          athleteInfoTemplate: null,
          registrationFormTemplateState: null,
          athleteInfoTemplateState: null,
        }
        setTeamRequirements(normalizeTeamRequirementsConfig(defaultTeamReq))
      }

      setInitialDataLoaded(true)  // 标记初始数据已加载
    } catch (error) {
      console.error('Error fetching settings:', error)
      // 出错时也要设置默认值并标记为已加载
        const defaultTeamReq: TeamRequirements = {
          commonFields: [
            { id: 'unit', label: '参赛单位', type: 'text', required: true, canRemove: false },
            { id: 'name', label: '队伍名称', type: 'text', required: true, canRemove: false },
            { id: 'contact', label: '联系人', type: 'text', required: true, canRemove: false },
            { id: 'phone', label: '联系电话', type: 'text', required: true },
            { id: 'logo', label: '队伍logo', type: 'image', required: false }
          ],
          customFields: [],
          allFields: [
            { id: 'unit', label: '参赛单位', type: 'text', required: true, isCommon: true, canRemove: false },
            { id: 'name', label: '队伍名称', type: 'text', required: true, isCommon: true, canRemove: false },
            { id: 'contact', label: '联系人', type: 'text', required: true, isCommon: true, canRemove: false },
            { id: 'phone', label: '联系电话', type: 'text', required: true, isCommon: true },
            { id: 'logo', label: '队伍logo', type: 'image', required: false, isCommon: true }
        ],
        registrationStartDate: '',
        registrationEndDate: '',
        reviewEndDate: '',
        registrationFormTemplate: null,
        athleteInfoTemplate: null,
        registrationFormTemplateState: null,
        athleteInfoTemplateState: null,
      }
      setTeamRequirements(normalizeTeamRequirementsConfig(defaultTeamReq))
      setInitialDataLoaded(true)
    }
  }

  const saveSettings = async () => {
    // 验证必填的报名时间设置
    if (!teamRequirements.registrationStartDate || !teamRequirements.registrationEndDate || !teamRequirements.reviewEndDate) {
      alert('⚠️ 保存失败 - 时间设置不完整\n\n请填写以下必填项：\n• 报名开始时间\n• 报名结束时间\n• 审核结束时间\n\n这些时间设置是必需的，请完整填写后再保存')
      return
    }

    // 验证报名时间设置
    if (teamRequirements.registrationStartDate && teamRequirements.registrationEndDate) {
      const regStart = new Date(teamRequirements.registrationStartDate)
      const regEnd = new Date(teamRequirements.registrationEndDate)

      // 验证1：报名开始时间必须早于报名结束时间
      if (regStart >= regEnd) {
        alert('⚠️ 保存失败 - 报名时间设置不合理\n\n报名开始时间必须早于报名结束时间\n\n当前设置：\n报名开始时间：' + teamRequirements.registrationStartDate + '\n报名结束时间：' + teamRequirements.registrationEndDate + '\n\n请调整时间范围后再保存')
        return
      }

      // 验证2：报名结束时间必须早于比赛开始时间
      if (eventStartDate) {
        const eventStart = new Date(eventStartDate)
        if (regEnd >= eventStart) {
          alert('⚠️ 保存失败 - 报名时间设置不合理\n\n报名结束时间必须早于比赛开始时间\n\n当前设置：\n报名结束时间：' + teamRequirements.registrationEndDate + '\n比赛开始时间：' + eventStartDate + '\n\n请调整报名结束时间后再保存')
          return
        }
      }

      // 验证3：审核结束时间的合理性
      if (teamRequirements.reviewEndDate) {
        const reviewEnd = new Date(teamRequirements.reviewEndDate)

        // 审核结束时间必须在报名结束时间之后
        if (reviewEnd <= regEnd) {
          alert('⚠️ 保存失败 - 审核时间设置不合理\n\n审核结束时间必须在报名结束时间之后\n\n当前设置：\n报名结束时间：' + teamRequirements.registrationEndDate + '\n审核结束时间：' + teamRequirements.reviewEndDate + '\n\n请调整审核结束时间后再保存')
          return
        }

        // 审核结束时间必须在比赛开始时间之前
        if (eventStartDate) {
          const eventStart = new Date(eventStartDate)
          if (reviewEnd >= eventStart) {
            alert('⚠️ 保存失败 - 审核时间设置不合理\n\n审核结束时间必须在比赛开始时间之前\n\n当前设置：\n审核结束时间：' + teamRequirements.reviewEndDate + '\n比赛开始时间：' + eventStartDate + '\n\n请调整审核结束时间后再保存')
            return
          }
        }
      }
    }

    // 验证出生日期范围
    if (playerRequirements.ageRequirementEnabled) {
      const minAgeDate = playerRequirements.minAgeDate
      const maxAgeDate = playerRequirements.maxAgeDate

      if (minAgeDate && maxAgeDate) {
        if (minAgeDate >= maxAgeDate) {
          alert('⚠️ 保存失败 - 日期设置不合理\n\n最早出生日期应该早于最晚出生日期\n\n当前设置：\n最早出生日期：' + minAgeDate + '\n最晚出生日期：' + maxAgeDate + '\n\n请调整日期范围后再保存')
          return
        }

      }
    }

    setIsLoading(true)
    try {
      // 确保allFields是最新的
      const teamReqToSave = syncPublishedTemplateFields(normalizeTeamRequirementsConfig({
        ...teamRequirements,
        allFields: teamRequirements.allFields || [
          ...teamRequirements.commonFields.map(f => ({ ...f, isCommon: true })),
          ...teamRequirements.customFields.map(f => ({ ...f, isCommon: false }))
        ]
      }))

      // 确保每个角色的allFields是最新的
      const playerReqToSave = normalizePlayerRequirementsConfig({
        ...playerRequirements,
        roles: playerRequirements.roles.map(role => ({
          ...role,
          allFields: role.allFields || [
            ...(role.commonFields || []).map(f => ({ ...f, isCommon: true })),
            ...role.customFields.map(f => ({ ...f, isCommon: false }))
          ]
        }))
      })
      
      const response = await fetch(`/api/events/${eventId}/registration-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          team_requirements: teamReqToSave,
          player_requirements: playerReqToSave,
          division_id: selectedDivisionId,
        }),
      })

      const result = await response.json()
      
      if (result.success) {
        if (pendingDeleteTemplatePaths.length > 0) {
          await deleteTemplatePaths(pendingDeleteTemplatePaths)
          setPendingDeleteTemplatePaths([])
        }
        alert('报名设置保存成功')
        // 重新加载数据以确保状态同步
        await fetchSettings(selectedDivisionId)
      } else {
        alert('保存失败: ' + result.error)
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('保存失败')
    } finally {
      setIsLoading(false)
    }
  }

  const addRole = () => {
    const normalizedRoleName = newRoleName.trim()
    if (!normalizedRoleName) {
      alert('请输入角色名称')
      return
    }

    // 根据角色名称确定默认字段
    let defaultCommonFields: FieldConfig[] = []
    if (normalizedRoleName === '教练员' || normalizedRoleName === '领队') {
      // 教练员和领队使用简化的3个字段
      defaultCommonFields = [
        { id: 'name', label: '姓名', type: 'text' as const, required: true },
        { id: 'contact', label: '联系方式', type: 'text' as const, required: true },
        { id: 'id_photo', label: '证件照', type: 'image' as const, required: false }
      ]
    } else {
      // 其他自定义角色使用完整的队员字段
      defaultCommonFields = [
        { id: 'name', label: '姓名', type: 'text' as const, required: true, canRemove: false },
        { id: 'gender', label: '性别', type: 'select' as const, required: true, options: ['男', '女'], canRemove: false },
        { id: 'age', label: '年龄', type: 'text' as const, required: true, canRemove: false },
        { id: 'id_type', label: '证件类型', type: 'select' as const, required: true, options: ['身份证', '其他'] },
        { id: 'id_number', label: '证件号码', type: 'text' as const, required: true, conditionalRequired: { dependsOn: 'id_type', values: ['身份证'] } },
        { id: 'player_number', label: '比赛服号码', type: 'text' as const, required: true },
        { id: 'emergency_contact', label: '紧急联系人', type: 'text' as const, required: true },
        { id: 'contact_phone', label: '联系电话', type: 'text' as const, required: true },
        { id: 'id_photo', label: '证件照', type: 'image' as const, required: false }
      ]
    }

    const newRoleId =
      normalizedRoleName === '教练员'
        ? 'coach'
        : normalizedRoleName === '领队'
          ? 'leader'
          : `role_${Date.now()}`

    const hasDuplicateRole = playerRequirements.roles.some(
      (role) => role.id === newRoleId || role.name.trim() === normalizedRoleName
    )
    if (hasDuplicateRole) {
      alert('角色已存在，请勿重复添加')
      return
    }

    const newRole: RoleConfig = normalizeRoleConfig({
      id: newRoleId,
      name: normalizedRoleName,
      commonFields: defaultCommonFields,
      customFields: [],
      allFields: defaultCommonFields.map(f => ({ ...f, isCommon: true })),
      minPlayers: 1,
      maxPlayers: 10,
      isDeletable: true
    })

    setPlayerRequirements(prev => normalizePlayerRequirementsConfig({
      ...prev,
      roles: [...prev.roles, newRole]
    }))
    setNewRoleName('')
    setShowRoleDialog(false)
    setSelectedRole(newRole.id)
  }

  const removeRole = (roleId: string) => {
    // 不允许删除默认队员角色
    if (roleId === 'player') {
      alert('默认队员角色不能删除')
      return
    }

    if (playerRequirements.roles.length <= 1) {
      alert('至少需要保留一个角色')
      return
    }

    // 找到要删除的角色
    const role = playerRequirements.roles.find(r => r.id === roleId)
    if (!role) return

    // 如果是教练员或领队，显示确认对话框
    if (roleId === 'coach' || roleId === 'leader') {
      setRoleToDelete({ id: roleId, name: role.name })
      setShowDeleteRoleDialog(true)
      return
    }

    // 其他角色直接删除
    confirmRemoveRole(roleId)
  }

  const confirmRemoveRole = (roleId: string) => {
    setPlayerRequirements(prev => ({
      ...prev,
      roles: prev.roles.filter(r => r.id !== roleId)
    }))

    // 如果删除的是当前选中的角色，切换到默认队员角色
    if (selectedRole === roleId) {
      setSelectedRole('player')
    }

    // 关闭确认对话框
    setShowDeleteRoleDialog(false)
    setRoleToDelete(null)
  }

  const addCustomField = (type: 'team' | 'player') => {
    if (!newFieldLabel) {
      alert('请输入字段名称')
      return
    }

    const newField: FieldConfig = {
      id: `custom_${Date.now()}`,
      label: newFieldLabel,
      type: newFieldType,
      required: false,
      options: newFieldType === 'select' || newFieldType === 'multiselect' ? ['选项1', '选项2'] : undefined
    }

    if (newFieldType === 'select' || newFieldType === 'multiselect') {
      // 如果是选择类型，先打开选项设置对话框
      setEditingField({ type, roleId: type === 'player' ? selectedRole : undefined, field: newField, isCommon: false })
      setTempOptions(['选项1', '选项2'])
      setShowOptionsDialog(true)
    } else {
      // 直接添加非选择类型的字段
      if (type === 'team') {
        setTeamRequirements(prev => {
          // 确保allFields存在
          const currentAllFields = prev.allFields || [
            ...prev.commonFields.map(f => ({ ...f, isCommon: true })),
            ...prev.customFields.map(f => ({ ...f, isCommon: false }))
          ]
          
          const newCustomField = { ...newField, isCommon: false }
          const updatedAllFields = [...currentAllFields, newCustomField]
          
          // 同时更新customFields以保持兼容
          return {
            ...prev,
            customFields: [...prev.customFields, newField],
            allFields: updatedAllFields
          }
        })
      } else {
        // 添加到选中的角色
        setPlayerRequirements(prev => ({
          ...prev,
          roles: prev.roles.map(role => {
            if (role.id === selectedRole) {
              // 确保allFields存在
              const currentAllFields = role.allFields || [
                ...(role.commonFields || []).map(f => ({ ...f, isCommon: true })),
                ...role.customFields.map(f => ({ ...f, isCommon: false }))
              ]
              
              const newCustomField = { ...newField, isCommon: false }
              const updatedAllFields = [...currentAllFields, newCustomField]
              
              return {
                ...role,
                customFields: [...role.customFields, newField],
                allFields: updatedAllFields
              }
            }
            return role
          })
        }))
      }
      setNewFieldLabel('')
    }
  }

  const saveFieldWithOptions = () => {
    if (!editingField) return

    const updatedField = {
      ...editingField.field,
      options: tempOptions.filter(opt => opt && opt.trim() !== '')
    }

    // 检查是否是新建字段（字段ID以custom_开头且在现有字段中找不到）
    const isNewField = editingField.field.id.startsWith('custom_') && !editingField.isCommon &&
      (editingField.type === 'team'
        ? !teamRequirements.customFields.find(f => f.id === editingField.field.id)
        : true) // 对于player类型，暂时简化处理

    if (isNewField) {
      // 新增的自定义字段
      if (editingField.type === 'team') {
        setTeamRequirements(prev => {
          // 确保allFields存在
          const currentAllFields = prev.allFields || [
            ...prev.commonFields.map(f => ({ ...f, isCommon: true })),
            ...prev.customFields.map(f => ({ ...f, isCommon: false }))
          ]

          const newCustomField = { ...updatedField, isCommon: false }
          const updatedAllFields = [...currentAllFields, newCustomField]

          return {
            ...prev,
            customFields: [...prev.customFields, updatedField],
            allFields: updatedAllFields
          }
        })
      } else {
        // 添加到选中的角色
        const roleId = editingField.roleId || selectedRole
        setPlayerRequirements(prev => ({
          ...prev,
          roles: prev.roles.map(role => {
            if (role.id === roleId) {
              // 确保allFields存在
              const currentAllFields = role.allFields || [
                ...(role.commonFields || []).map(f => ({ ...f, isCommon: true })),
                ...role.customFields.map(f => ({ ...f, isCommon: false }))
              ]

              const newCustomField = { ...updatedField, isCommon: false }
              const updatedAllFields = [...currentAllFields, newCustomField]

              return {
                ...role,
                customFields: [...role.customFields, updatedField],
                allFields: updatedAllFields
              }
            }
            return role
          })
        }))
      }
      setNewFieldLabel('')
    }

    setShowOptionsDialog(false)
    setEditingField(null)
    setTempOptions(['选项1', '选项2'])
  }


  const removeField = (type: 'team' | 'player', fieldId: string, isCommon: boolean, roleId?: string) => {
    // 找到要删除的字段
    let fieldLabel = ''
    if (type === 'team') {
      const field = teamRequirements.allFields?.find(f => f.id === fieldId) ||
                    teamRequirements.commonFields.find(f => f.id === fieldId) ||
                    teamRequirements.customFields.find(f => f.id === fieldId)
      fieldLabel = field?.label || '未知字段'
    } else {
      const role = playerRequirements.roles.find(r => r.id === roleId)
      const field = role?.allFields?.find(f => f.id === fieldId) ||
                    role?.commonFields?.find(f => f.id === fieldId) ||
                    role?.customFields.find(f => f.id === fieldId)
      fieldLabel = field?.label || '未知字段'
    }

    // 显示确认对话框
    setFieldToDelete({ type, fieldId, fieldLabel, isCommon, roleId })
    setShowDeleteFieldDialog(true)
  }

  const confirmRemoveField = () => {
    if (!fieldToDelete) return

    const { type, fieldId, isCommon, roleId } = fieldToDelete

    if (type === 'team') {
      setTeamRequirements(prev => {
        // 更新allFields
        const updatedAllFields = prev.allFields
          ? prev.allFields.filter(f => f.id !== fieldId)
          : [
              ...prev.commonFields.map(f => ({ ...f, isCommon: true })),
              ...prev.customFields.map(f => ({ ...f, isCommon: false }))
            ].filter(f => f.id !== fieldId)

        // 同时更新commonFields和customFields
        return {
          ...prev,
          commonFields: isCommon ? prev.commonFields.filter(f => f.id !== fieldId) : prev.commonFields,
          customFields: !isCommon ? prev.customFields.filter(f => f.id !== fieldId) : prev.customFields,
          allFields: updatedAllFields
        }
      })
    } else {
      // 处理人员字段删除
      setPlayerRequirements(prev => ({
        ...prev,
        roles: prev.roles.map(r => {
          if (r.id === roleId) {
            // 更新allFields
            const updatedAllFields = r.allFields
              ? r.allFields.filter(f => f.id !== fieldId)
              : [
                  ...(r.commonFields || []).map(f => ({ ...f, isCommon: true })),
                  ...r.customFields.map(f => ({ ...f, isCommon: false }))
                ].filter(f => f.id !== fieldId)

            // 同时更新commonFields和customFields
            return {
              ...r,
              allFields: updatedAllFields,
              commonFields: isCommon
                ? r.commonFields?.filter(f => f.id !== fieldId)
                : r.commonFields,
              customFields: !isCommon
                ? r.customFields.filter(f => f.id !== fieldId)
                : r.customFields
            }
          }
          return r
        })
      }))
    }

    // 关闭确认对话框
    setShowDeleteFieldDialog(false)
    setFieldToDelete(null)
  }

  const toggleRequired = (type: 'team' | 'player', fieldId: string, isCommon: boolean) => {
    if (type === 'team') {
      setTeamRequirements(prev => {
        const targetField = prev.allFields?.find(f => f.id === fieldId)
          || prev.commonFields.find(f => f.id === fieldId)
          || prev.customFields.find(f => f.id === fieldId)
        if (targetField?.requiredLocked) {
          return prev
        }

        // 更新allFields
        const updatedAllFields = prev.allFields
          ? prev.allFields.map(f => 
              f.id === fieldId ? { ...f, required: !f.required } : f
            )
          : [
              ...prev.commonFields.map(f => ({ ...f, isCommon: true })),
              ...prev.customFields.map(f => ({ ...f, isCommon: false }))
            ].map(f => 
              f.id === fieldId ? { ...f, required: !f.required } : f
            )
        
        // 同时更新commonFields和customFields
        return {
          ...prev,
          commonFields: isCommon 
            ? prev.commonFields.map(f => f.id === fieldId ? { ...f, required: !f.required } : f)
            : prev.commonFields,
          customFields: !isCommon 
            ? prev.customFields.map(f => f.id === fieldId ? { ...f, required: !f.required } : f)
            : prev.customFields,
          allFields: updatedAllFields
        }
      })
    } else {
      // For player, this is handled directly in the UI now
    }
  }

  // 打开字段编辑对话框
  const openFieldEditor = (type: 'team' | 'player', field: FieldConfig, isCommon: boolean, roleId?: string) => {
    setEditingFieldData({ type, field, isCommon, roleId })
    setTempFieldLabel(field.label)
    setTempFieldType(field.type)
    setTempFieldOptions(field.options || ['选项1', '选项2'])
    setShowFieldEditDialog(true)
  }

  // 保存字段编辑
  const saveFieldEdit = () => {
    if (!editingFieldData) return
    if (!tempFieldLabel.trim()) {
      alert('请输入字段名称')
      return
    }

    const { type, field, isCommon, roleId } = editingFieldData
    const needsOptions = tempFieldType === 'select' || tempFieldType === 'multiselect'
    const filteredOptions = needsOptions ? tempFieldOptions.filter(opt => opt && opt.trim() !== '') : undefined

    if (needsOptions && (!filteredOptions || filteredOptions.length < 2)) {
      alert('单选/多选字段至少需要2个选项')
      return
    }

    const updatedField: FieldConfig = {
      ...field,
      label: tempFieldLabel.trim(),
      type: tempFieldType,
      options: filteredOptions
    }

    if (type === 'team') {
      setTeamRequirements(prev => {
        // 更新allFields
        const updatedAllFields = prev.allFields
          ? prev.allFields.map(f => f.id === field.id ? { ...updatedField, isCommon: f.isCommon } : f)
          : [
              ...prev.commonFields.map(f => ({ ...f, isCommon: true })),
              ...prev.customFields.map(f => ({ ...f, isCommon: false }))
            ].map(f => f.id === field.id ? { ...updatedField, isCommon: f.isCommon } : f)

        // 同时更新commonFields和customFields
        return {
          ...prev,
          commonFields: isCommon
            ? prev.commonFields.map(f => f.id === field.id ? updatedField : f)
            : prev.commonFields,
          customFields: !isCommon
            ? prev.customFields.map(f => f.id === field.id ? updatedField : f)
            : prev.customFields,
          allFields: updatedAllFields
        }
      })
    } else if (roleId) {
      setPlayerRequirements(prev => ({
        ...prev,
        roles: prev.roles.map(role => {
          if (role.id === roleId) {
            // 更新allFields
            const updatedAllFields = role.allFields
              ? role.allFields.map(f => f.id === field.id ? { ...updatedField, isCommon: f.isCommon } : f)
              : [
                  ...(role.commonFields || []).map(f => ({ ...f, isCommon: true })),
                  ...role.customFields.map(f => ({ ...f, isCommon: false }))
                ].map(f => f.id === field.id ? { ...updatedField, isCommon: f.isCommon } : f)

            return {
              ...role,
              allFields: updatedAllFields,
              commonFields: isCommon
                ? role.commonFields?.map(f => f.id === field.id ? updatedField : f)
                : role.commonFields,
              customFields: !isCommon
                ? role.customFields.map(f => f.id === field.id ? updatedField : f)
                : role.customFields
            }
          }
          return role
        })
      }))
    }

    setShowFieldEditDialog(false)
    setEditingFieldData(null)
  }

  // 如果初始数据还未加载，显示加载中状态
  if (!initialDataLoaded) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>报名设置</CardTitle>
          <CardDescription>
            设置队伍报名及人员报名要求
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
              <p className="mt-4 text-muted-foreground">加载设置中...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>报名设置</CardTitle>
        <CardDescription>
          设置队伍报名及人员报名要求
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* 组别选择器 */}
        {eventDivisions.length > 0 && (
          <div className="mb-6 rounded-lg border border-border/60 bg-muted/20 p-4">
            <Label className="text-sm font-semibold mb-2 block">选择组别</Label>
            <p className="mb-3 text-xs text-muted-foreground">每个组别可独立配置报名设置</p>
            <div className="flex flex-wrap gap-2">
              {eventDivisions.map((div) => (
                <Button
                  key={div.id}
                  type="button"
                  variant={selectedDivisionId === div.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedDivisionId(div.id)}
                >
                  {div.name}
                </Button>
              ))}
            </div>

            {/* 显示当前选中组别的规则 */}
            {selectedDivisionId && (() => {
              const selectedDiv = eventDivisions.find(d => d.id === selectedDivisionId)
              if (selectedDiv?.rules && (
                selectedDiv.rules.gender !== 'none' ||
                selectedDiv.rules.minBirthDate !== undefined ||
                selectedDiv.rules.maxBirthDate !== undefined ||
                selectedDiv.rules.minAge !== undefined ||
                selectedDiv.rules.maxAge !== undefined ||
                selectedDiv.rules.minPlayers !== undefined ||
                selectedDiv.rules.maxPlayers !== undefined
              )) {
                return (
                  <div className="mt-4 rounded border border-primary/20 bg-primary/5 p-3">
                    <p className="mb-2 text-sm font-medium text-primary">该组别报名限制：</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedDiv.rules.gender && selectedDiv.rules.gender !== 'none' && (
                        <span className="inline-block rounded bg-primary/10 px-2 py-1 text-xs text-primary">
                          {selectedDiv.rules.gender === 'male' ? '仅限男子' : selectedDiv.rules.gender === 'female' ? '仅限女子' : '混合（男女均可）'}
                        </span>
                      )}
                      {(selectedDiv.rules.minBirthDate || selectedDiv.rules.maxBirthDate) && (
                        <span className="inline-block rounded bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
                          出生日期限制: {selectedDiv.rules.minBirthDate || '不限'} ~ {selectedDiv.rules.maxBirthDate || '不限'}
                        </span>
                      )}
                      {(!selectedDiv.rules.minBirthDate && !selectedDiv.rules.maxBirthDate) && (selectedDiv.rules.minAge !== undefined || selectedDiv.rules.maxAge !== undefined) && (
                        <span className="inline-block rounded bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
                          年龄限制: {selectedDiv.rules.minAge || '不限'} - {selectedDiv.rules.maxAge || '不限'}岁
                        </span>
                      )}
                      {(selectedDiv.rules.minPlayers !== undefined || selectedDiv.rules.maxPlayers !== undefined) && (
                        <span className="inline-block rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
                          队员人数: {selectedDiv.rules.minPlayers || '不限'} - {selectedDiv.rules.maxPlayers || '不限'}人
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      提示：以上队员限制统一在“项目管理-组别设置”中维护，教练报名时会自动校验
                    </p>
                  </div>
                )
              }
              return null
            })()}
          </div>
        )}

        <Tabs defaultValue="team" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="team">
              <Users className="h-4 w-4 mr-2" />
              队伍报名要求
            </TabsTrigger>
            <TabsTrigger value="player">
              <User className="h-4 w-4 mr-2" />
              人员报名要求
            </TabsTrigger>
          </TabsList>

          <TabsContent value="team" className="space-y-4">
            {/* 报名时间设置 - 移除标题，直接显示 */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="reg-start" className="text-sm font-semibold">
                  报名开始时间 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="reg-start"
                  type="datetime-local"
                  value={teamRequirements.registrationStartDate || ''}
                  onChange={(e) => setTeamRequirements(prev => ({
                    ...prev,
                    registrationStartDate: e.target.value
                  }))}
                  className="h-11 w-full"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-end" className="text-sm font-semibold">
                  报名结束时间 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="reg-end"
                  type="datetime-local"
                  value={teamRequirements.registrationEndDate || ''}
                  onChange={(e) => setTeamRequirements(prev => ({
                    ...prev,
                    registrationEndDate: e.target.value
                  }))}
                  className="h-11 w-full"
                  required
                />
                {regEndError && (
                  <p className="text-amber-600 text-sm">{regEndError}</p>
                )}
              </div>
            </div>

            {/* 审核结束时间 */}
            <div className="space-y-2">
              <Label htmlFor="review-end" className="text-sm font-semibold">
                审核结束时间 <span className="text-red-500">*</span>
              </Label>
              <p className="text-xs text-muted-foreground">
                报名截止后的审核缓冲期，期间用户仅能重新提交被驳回的报名，不能新建报名
              </p>
              <Input
                id="review-end"
                type="datetime-local"
                value={teamRequirements.reviewEndDate || ''}
                onChange={(e) => setTeamRequirements(prev => ({
                  ...prev,
                  reviewEndDate: e.target.value
                }))}
                className="h-11 w-full max-w-md"
                required
              />
              {reviewEndError && (
                <p className="text-amber-600 text-sm">{reviewEndError}</p>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">导出模板</h3>
                <p className="text-xs text-muted-foreground">
                  在此上传报名表模板和运动员信息表模板。请先下载标准模板，在原 PDF 基础上修改后再上传；教练保存草稿或提交报名后，系统会把已填写的人员信息注入模板导出。
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {(Object.keys(TEMPLATE_FIELD_CONFIG) as TemplateFieldKey[]).map((key) => {
                  const config = TEMPLATE_FIELD_CONFIG[key]
                  const templateState = getTemplateState(teamRequirements, key)
                  const publishedSnapshot = templateState?.published || null
                  const draftSnapshot = templateState?.draft || null
                  const backupSnapshot = templateState?.backup || null
                  const previewSnapshot = draftSnapshot || publishedSnapshot || null
                  const inputId = `document-template-${key}`

                  return (
                    <div key={key} className="rounded-lg border border-border/60 bg-card p-4">
                      <input
                        id={inputId}
                        type="file"
                        accept={PDF_TEMPLATE_ACCEPT}
                        className="hidden"
                        onChange={(e) => handleTemplateUpload(key, e.target.files, e.currentTarget)}
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{config.label}</p>
                        <p className="text-xs text-muted-foreground">{config.helperText}</p>
                      </div>

                      <div className="mt-3 grid gap-3">
                        <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">当前已发布</p>
                            {publishedSnapshot?.publishedAt && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(publishedSnapshot.publishedAt).toLocaleString('zh-CN')}
                              </span>
                            )}
                          </div>
                          {publishedSnapshot?.template ? (
                            <div className="space-y-1">
                              <p className="text-sm font-medium break-all">{publishedSnapshot.template.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(publishedSnapshot.template.size)} · {publishedSnapshot.template.mimeType || 'application/pdf'}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">尚未发布</p>
                          )}
                        </div>

                        <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-3">
                          <p className="mb-2 text-sm font-medium">草稿</p>
                          {draftSnapshot?.template ? (
                            <div className="space-y-1">
                              <p className="text-sm font-medium break-all">{draftSnapshot.template.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(draftSnapshot.template.size)} · {draftSnapshot.template.mimeType || 'application/pdf'}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">未创建草稿，请上传新的标准化 PDF 模板生成草稿</p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 rounded-md border border-dashed border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
                        <p>修改规范：</p>
                        <p>1. 请先下载标准模板，在原 PDF 基础上修改后再上传。</p>
                        <p>2. 仅建议修改标题、附件编号等文案，不要移动表格线、照片框和字段位置。</p>
                        <p>3. 请保持 A4 尺寸和原始页数，不要通过 Word/WPS 重排版后再导出。</p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => window.open(`/api/document-templates/base?documentType=${TEMPLATE_FIELD_CONFIG[key].templateType}`, '_blank', 'noopener,noreferrer')}
                        >
                          下载标准模板
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => document.getElementById(inputId)?.click()}
                          disabled={uploadingTemplateKey !== null}
                        >
                          {uploadingTemplateKey === key ? '上传中...' : draftSnapshot?.template ? '替换草稿 PDF' : '上传草稿 PDF'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => previewTemplate(key, previewSnapshot)}
                          disabled={!previewSnapshot?.template || previewingTemplateKey !== null}
                        >
                          {previewingTemplateKey === key ? '预览生成中...' : '预览当前版本'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => removeDraftTemplate(key)}
                          disabled={!draftSnapshot}
                        >
                          清空草稿
                        </Button>
                        <Button
                          type="button"
                          variant="default"
                          onClick={() => publishDraftTemplate(key)}
                          disabled={!draftSnapshot || (!draftSnapshot.template && !publishedSnapshot?.template)}
                        >
                          发布草稿
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => rollbackPublishedTemplate(key)}
                          disabled={!backupSnapshot}
                        >
                          回退上一版
                        </Button>
                      </div>

                      {backupSnapshot?.template && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          上一版备份：{backupSnapshot.template.name}
                        </p>
                      )}
                      <p className="mt-2 text-xs font-medium text-amber-700">
                        说明：仅上传或预览不会影响教练端。必须先点“发布草稿”，再点页面底部“保存设置”后，新模板才会正式生效。
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">报名字段</h3>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndTeam}
              >
                <SortableContext
                  items={
                    teamRequirements.allFields 
                      ? teamRequirements.allFields.map(f => f.id)
                      : [...teamRequirements.commonFields.map(f => f.id), ...teamRequirements.customFields.map(f => f.id)]
                  }
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {/* 使用allFields如果存在，否则合并commonFields和customFields */}
                    {(teamRequirements.allFields || [
                      ...teamRequirements.commonFields.map(field => ({ ...field, isCommon: true })),
                      ...teamRequirements.customFields.map(field => ({ ...field, isCommon: false }))
                    ]).filter((field, index, array) =>
                      array.findIndex(f => f.id === field.id) === index
                    ).map(field => (
                      <SortableFieldItem
                        key={field.id}
                        field={field}
                        onToggleRequired={() => toggleRequired('team', field.id, field.isCommon || false)}
                        onRemove={() => removeField('team', field.id, field.isCommon || false)}
                        onEditField={() => openFieldEditor('team', field, field.isCommon || false)}
                        canRemove={field.canRemove !== false}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1">
                  <Label>字段名称</Label>
                  <Input
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    placeholder="输入字段名称"
                  />
                </div>
                <div>
                  <Label>字段类型</Label>
                  <Select value={newFieldType} onValueChange={(value: any) => setNewFieldType(value)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">文本</SelectItem>
                      <SelectItem value="date">日期</SelectItem>
                      <SelectItem value="image">图片</SelectItem>
                      <SelectItem value="attachment">单附件</SelectItem>
                      <SelectItem value="attachments">多附件</SelectItem>
                      <SelectItem value="select">单选</SelectItem>
                      <SelectItem value="multiselect">多选</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => addCustomField('team')}>
                  <Plus className="h-4 w-4 mr-2" />
                  添加
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="player" className="space-y-4">
            {/* 角色选择和管理 */}
            <div>
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-semibold">角色管理</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowRoleDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  添加角色
                </Button>
              </div>
              
              <div className="flex flex-wrap gap-2 mb-4">
                {playerRequirements.roles.map(role => (
                  <div key={role.id} className="relative">
                    <Button
                      variant={selectedRole === role.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedRole(role.id)}
                      className="pr-8"
                    >
                      {role.name}
                    </Button>
                    {/* 只有可删除的角色才显示删除按钮 */}
                    {role.isDeletable !== false && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="absolute -top-1 -right-1 h-5 w-5 p-0 rounded-full bg-red-500 hover:bg-red-600 text-white"
                        onClick={() => removeRole(role.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 选中角色的设置 */}
            {playerRequirements.roles.map(role => (
              role.id === selectedRole && (
                <div key={role.id}>
                  <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
                    <h4 className="font-medium">角色: {role.name}</h4>

                    {role.id === 'player' && (
                      <div className="rounded border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                        队员性别、年龄、人数限制已迁移至项目管理的组别规则统一配置。
                      </div>
                    )}

                    {/* 合并的字段列表 */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3">角色字段</h3>
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => handleDragEndPlayer(role.id, event)}
                      >
                        <SortableContext
                          items={
                            role.allFields 
                              ? role.allFields.map(f => f.id)
                              : [...(role.commonFields || []).map(f => f.id), ...role.customFields.map(f => f.id)]
                          }
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-2">
                            {/* 使用allFields如果存在，否则合并commonFields和customFields */}
                            {(role.allFields || [
                              ...(role.commonFields || []).map(field => ({ ...field, isCommon: true })),
                              ...role.customFields.map(field => ({ ...field, isCommon: false }))
                            ]).map(field => (
                              <SortableFieldItem
                                key={field.id}
                                field={field}
                                onToggleRequired={() => {
                                  if (field.requiredLocked) {
                                    return
                                  }
                                  setPlayerRequirements(prev => ({
                                    ...prev,
                                    roles: prev.roles.map(r => {
                                      if (r.id === role.id) {
                                        // 更新allFields
                                        const updatedAllFields = r.allFields
                                          ? r.allFields.map(f =>
                                              f.id === field.id ? { ...f, required: !f.required } : f
                                            )
                                          : [
                                              ...(r.commonFields || []).map(f => ({ ...f, isCommon: true })),
                                              ...r.customFields.map(f => ({ ...f, isCommon: false }))
                                            ].map(f =>
                                              f.id === field.id ? { ...f, required: !f.required } : f
                                            )

                                        // 同时更新commonFields和customFields
                                        return {
                                          ...r,
                                          allFields: updatedAllFields,
                                          commonFields: field.isCommon
                                            ? r.commonFields?.map(f =>
                                                f.id === field.id ? { ...f, required: !f.required } : f
                                              )
                                            : r.commonFields,
                                          customFields: !field.isCommon
                                            ? r.customFields.map(f =>
                                                f.id === field.id ? { ...f, required: !f.required } : f
                                              )
                                            : r.customFields
                                        }
                                      }
                                      return r
                                    })
                                  }))
                                }}
                                onRemove={() => removeField('player', field.id, field.isCommon || false, role.id)}
                                onEditField={() => openFieldEditor('player', field, field.isCommon || false, role.id)}
                                canRemove={field.canRemove !== false}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>

                      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
                        <div className="flex-1">
                          <Label>字段名称</Label>
                          <Input
                            value={newFieldLabel}
                            onChange={(e) => setNewFieldLabel(e.target.value)}
                            placeholder="输入字段名称"
                          />
                        </div>
                        <div>
                          <Label>字段类型</Label>
                          <Select value={newFieldType} onValueChange={(value: any) => setNewFieldType(value)}>
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">文本</SelectItem>
                              <SelectItem value="date">日期</SelectItem>
                              <SelectItem value="image">图片</SelectItem>
                              <SelectItem value="attachment">单附件</SelectItem>
                              <SelectItem value="attachments">多附件</SelectItem>
                              <SelectItem value="select">单选</SelectItem>
                              <SelectItem value="multiselect">多选</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button onClick={() => addCustomField('player')}>
                          <Plus className="h-4 w-4 mr-2" />
                          添加
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            ))}
          </TabsContent>
        </Tabs>

        <div className="mt-6 flex justify-end">
          <Button
            onClick={saveSettings}
            disabled={isLoading}
          >
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? '保存中...' : '保存设置'}
          </Button>
        </div>
      </CardContent>
    </Card>

    {/* 选项设置对话框 */}
    <Dialog open={showOptionsDialog} onOpenChange={setShowOptionsDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>设置选项</DialogTitle>
          <DialogDescription>
            为{editingField?.field.type === 'select' ? '单选' : '多选'}字段设置选项内容
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label>字段名称: {editingField?.field.label}</Label>
          </div>
          
          <div className="space-y-2">
            <Label>选项列表</Label>
            {tempOptions.map((option, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Input
                  value={option}
                  onChange={(e) => {
                    const newOptions = [...tempOptions]
                    newOptions[index] = e.target.value
                    setTempOptions(newOptions)
                  }}
                  placeholder={`选项 ${index + 1}`}
                />
                {tempOptions.length > 2 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTempOptions(tempOptions.filter((_, i) => i !== index))
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setTempOptions([...tempOptions, `选项${tempOptions.length + 1}`])}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              添加选项
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowOptionsDialog(false)
              setEditingField(null)
              setTempOptions(['选项1', '选项2'])
            }}
          >
            取消
          </Button>
          <Button onClick={saveFieldWithOptions}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* 添加角色对话框 */}
    <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加角色</DialogTitle>
          <DialogDescription>
            为人员报名添加新的角色类型
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>快速选择</Label>
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewRoleName('教练员')}
              >
                教练员
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewRoleName('领队')}
              >
                领队
              </Button>
            </div>
          </div>
          <div>
            <Label htmlFor="roleName">角色名称</Label>
            <Input
              id="roleName"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="例如：教练、替补、领队等"
              className="mt-2"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowRoleDialog(false)
              setNewRoleName('')
            }}
          >
            取消
          </Button>
          <Button onClick={addRole}>
            <UserPlus className="h-4 w-4 mr-2" />
            添加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* 删除角色确认对话框 */}
    <Dialog open={showDeleteRoleDialog} onOpenChange={setShowDeleteRoleDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除角色</DialogTitle>
          <DialogDescription>
            你确定要删除"{roleToDelete?.name}"角色吗？
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            删除后，该角色的所有字段配置将被移除。此操作不可恢复。
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowDeleteRoleDialog(false)
              setRoleToDelete(null)
            }}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={() => roleToDelete && confirmRemoveRole(roleToDelete.id)}
          >
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* 删除字段确认对话框 */}
    <Dialog open={showDeleteFieldDialog} onOpenChange={setShowDeleteFieldDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除字段</DialogTitle>
          <DialogDescription>
            你确定要删除"{fieldToDelete?.fieldLabel}"字段吗？
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            删除后，该字段将从报名表单中移除。此操作不可恢复。
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowDeleteFieldDialog(false)
              setFieldToDelete(null)
            }}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={confirmRemoveField}
          >
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* 字段编辑对话框 */}
    <Dialog open={showFieldEditDialog} onOpenChange={setShowFieldEditDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑字段</DialogTitle>
          <DialogDescription>
            修改字段的名称、类型和选项
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="fieldLabel">字段名称</Label>
            <Input
              id="fieldLabel"
              value={tempFieldLabel}
              onChange={(e) => setTempFieldLabel(e.target.value)}
              placeholder="输入字段名称"
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="fieldType">字段类型</Label>
            <Select value={tempFieldType} onValueChange={(value: any) => setTempFieldType(value)}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">文本</SelectItem>
                <SelectItem value="date">日期</SelectItem>
                <SelectItem value="image">图片</SelectItem>
                <SelectItem value="attachment">单附件</SelectItem>
                <SelectItem value="attachments">多附件</SelectItem>
                <SelectItem value="select">单选</SelectItem>
                <SelectItem value="multiselect">多选</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(tempFieldType === 'select' || tempFieldType === 'multiselect') && (
            <div className="space-y-2">
              <Label>选项列表</Label>
              {tempFieldOptions.map((option, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <Input
                    value={option}
                    onChange={(e) => {
                      const newOptions = [...tempFieldOptions]
                      newOptions[index] = e.target.value
                      setTempFieldOptions(newOptions)
                    }}
                    placeholder={`选项 ${index + 1}`}
                  />
                  {tempFieldOptions.length > 2 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setTempFieldOptions(tempFieldOptions.filter((_, i) => i !== index))
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setTempFieldOptions([...tempFieldOptions, `选项${tempFieldOptions.length + 1}`])}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                添加选项
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowFieldEditDialog(false)
              setEditingFieldData(null)
            }}
          >
            取消
          </Button>
          <Button onClick={saveFieldEdit}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
