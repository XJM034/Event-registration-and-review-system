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

interface FieldConfig {
  id: string
  label: string
  type: 'text' | 'image' | 'select' | 'multiselect' | 'date'
  required: boolean
  options?: string[]
  isCommon?: boolean  // 添加标记来区分常用项和自定义项
}

// 可排序的字段项组件
function SortableFieldItem({ field, onToggleRequired, onRemove, onEditOptions, canRemove = true }: {
  field: FieldConfig
  onToggleRequired: () => void
  onRemove?: () => void
  onEditOptions?: () => void
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-3 border rounded-lg bg-white"
    >
      <div className="flex items-center space-x-4">
        <button
          className="cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-gray-400" />
        </button>
        <span className="text-sm font-medium">{field.label}</span>
        <span className="text-xs text-gray-500">
          ({field.type})
          {field.options && ` - ${field.options.length}个选项`}
        </span>
      </div>
      <div className="flex items-center space-x-2">
        {(field.type === 'select' || field.type === 'multiselect') && onEditOptions && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onEditOptions}
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}
        <label className="flex items-center space-x-2">
          <Checkbox
            checked={field.required}
            onCheckedChange={onToggleRequired}
          />
          <span className="text-sm">必填</span>
        </label>
        {canRemove && onRemove && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
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
}

interface RoleConfig {
  id: string
  name: string
  commonFields?: FieldConfig[]  // 常用项，只有默认队员角色有
  customFields: FieldConfig[]
  allFields?: FieldConfig[]  // 统一的字段数组
  minPlayers?: number
  maxPlayers?: number
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

export default function RegistrationSettingsTab({ eventId, eventStartDate }: RegistrationSettingsTabProps) {
  const [initialDataLoaded, setInitialDataLoaded] = useState(false) // 添加初始数据加载状态
  const [teamRequirements, setTeamRequirements] = useState<TeamRequirements>({
    commonFields: [],
    customFields: [],
    registrationStartDate: '',
    registrationEndDate: '',
    reviewEndDate: ''
  })

  const [playerRequirements, setPlayerRequirements] = useState<PlayerRequirements>({
    roles: [
      {
        id: 'player',
        name: '队员',
        commonFields: [
          { id: 'name', label: '姓名', type: 'text', required: false },
          { id: 'id_number', label: '身份证号码', type: 'text', required: false },
          { id: 'gender', label: '性别', type: 'select', required: false, options: ['男', '女'] },
          { id: 'id_photo', label: '证件照', type: 'image', required: false },
          { id: 'emergency_contact', label: '紧急联系人', type: 'text', required: false }
        ],
        customFields: [],
        allFields: [
          { id: 'name', label: '姓名', type: 'text', required: false, isCommon: true },
          { id: 'id_number', label: '身份证号码', type: 'text', required: false, isCommon: true },
          { id: 'gender', label: '性别', type: 'select', required: false, options: ['男', '女'], isCommon: true },
          { id: 'id_photo', label: '证件照', type: 'image', required: false, isCommon: true },
          { id: 'emergency_contact', label: '紧急联系人', type: 'text', required: false, isCommon: true }
        ],
        minPlayers: 1,
        maxPlayers: 30
      }
    ],
    genderRequirement: 'none',
    ageRequirementEnabled: false,
    minAgeDate: '',
    maxAgeDate: '',
    countRequirementEnabled: false,
    minCount: 11,
    maxCount: 20
  })

  const [isLoading, setIsLoading] = useState(false)
  const [newFieldType, setNewFieldType] = useState<'text' | 'image' | 'select' | 'multiselect'>('text')
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [showOptionsDialog, setShowOptionsDialog] = useState(false)
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [selectedRole, setSelectedRole] = useState<string>('player')
  const [editingField, setEditingField] = useState<{ type: 'team' | 'player', roleId?: string, field: FieldConfig, isCommon: boolean } | null>(null)
  const [tempOptions, setTempOptions] = useState<string[]>(['选项1', '选项2'])

  // 时间验证错误状态
  const [regStartError, setRegStartError] = useState('')
  const [regEndError, setRegEndError] = useState('')
  const [reviewEndError, setReviewEndError] = useState('')

  useEffect(() => {
    fetchSettings()
  }, [eventId])

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

  const fetchSettings = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/registration-settings`)
      const result = await response.json()

      if (result.success && result.data) {
        const loadedTeamReq = result.data.team_requirements || {
          commonFields: [
            { id: 'logo', label: '队伍logo', type: 'image', required: false },
            { id: 'name', label: '队伍名称', type: 'text', required: true },
            { id: 'contact', label: '联系人', type: 'text', required: true },
            { id: 'phone', label: '联系方式', type: 'text', required: true },
            { id: 'campus', label: '报名校区', type: 'text', required: true }
          ],
          customFields: [],
          registrationStartDate: '',
          registrationEndDate: ''
        }

        // 如果没有allFields，从commonFields和customFields创建
        if (!loadedTeamReq.allFields) {
          loadedTeamReq.allFields = [
            ...(loadedTeamReq.commonFields || []).map(f => ({ ...f, isCommon: true })),
            ...(loadedTeamReq.customFields || []).map(f => ({ ...f, isCommon: false }))
          ]
        }

        setTeamRequirements(loadedTeamReq)

        // 确保player_requirements始终包含roles数组
        const loadedPlayerReq = result.data.player_requirements || {}

        // 为每个角色创建allFields如果不存在
        if (loadedPlayerReq.roles) {
          loadedPlayerReq.roles = loadedPlayerReq.roles.map(role => {
            if (!role.allFields) {
              return {
                ...role,
                allFields: [
                  ...(role.commonFields || []).map(f => ({ ...f, isCommon: true })),
                  ...role.customFields.map(f => ({ ...f, isCommon: false }))
                ]
              }
            }
            return role
          })
        }

        // 确保默认角色存在
        let rolesWithDefault = loadedPlayerReq.roles || [];

        // 检查是否已有队员角色，如果没有则添加默认队员角色
        const hasPlayerRole = rolesWithDefault.some((role: any) => role.id === 'player');
        if (!hasPlayerRole) {
          rolesWithDefault.unshift({
            id: 'player',
            name: '队员',
            commonFields: [
              { id: 'name', label: '姓名', type: 'text' as const, required: false },
              { id: 'id_number', label: '身份证号码', type: 'text' as const, required: false },
              { id: 'gender', label: '性别', type: 'select' as const, required: false, options: ['男', '女'] },
              { id: 'id_photo', label: '证件照', type: 'image' as const, required: false },
              { id: 'emergency_contact', label: '紧急联系人', type: 'text' as const, required: false }
            ],
            customFields: [],
            allFields: [
              { id: 'name', label: '姓名', type: 'text' as const, required: false, isCommon: true },
              { id: 'id_number', label: '身份证号码', type: 'text' as const, required: false, isCommon: true },
              { id: 'gender', label: '性别', type: 'select' as const, required: false, options: ['男', '女'], isCommon: true },
              { id: 'id_photo', label: '证件照', type: 'image' as const, required: false, isCommon: true },
              { id: 'emergency_contact', label: '紧急联系人', type: 'text' as const, required: false, isCommon: true }
            ],
            minPlayers: 1,
            maxPlayers: 30
          });
        }

        setPlayerRequirements({
          ...playerRequirements,
          ...loadedPlayerReq,
          roles: rolesWithDefault
        })
      } else {
        // 如果没有保存的数据，使用默认值并标记为已加载
        const defaultTeamReq = {
          commonFields: [
            { id: 'logo', label: '队伍logo', type: 'image', required: false },
            { id: 'name', label: '队伍名称', type: 'text', required: true },
            { id: 'contact', label: '联系人', type: 'text', required: true },
            { id: 'phone', label: '联系方式', type: 'text', required: true },
            { id: 'campus', label: '报名校区', type: 'text', required: true }
          ],
          customFields: [],
          allFields: [
            { id: 'logo', label: '队伍logo', type: 'image', required: false, isCommon: true },
            { id: 'name', label: '队伍名称', type: 'text', required: true, isCommon: true },
            { id: 'contact', label: '联系人', type: 'text', required: true, isCommon: true },
            { id: 'phone', label: '联系方式', type: 'text', required: true, isCommon: true },
            { id: 'campus', label: '报名校区', type: 'text', required: true, isCommon: true }
          ],
          registrationStartDate: '',
          registrationEndDate: ''
        }
        setTeamRequirements(defaultTeamReq)
      }

      setInitialDataLoaded(true)  // 标记初始数据已加载
    } catch (error) {
      console.error('Error fetching settings:', error)
      // 出错时也要设置默认值并标记为已加载
      const defaultTeamReq = {
        commonFields: [
          { id: 'logo', label: '队伍logo', type: 'image', required: false },
          { id: 'name', label: '队伍名称', type: 'text', required: true },
          { id: 'contact', label: '联系人', type: 'text', required: true },
          { id: 'phone', label: '联系方式', type: 'text', required: true },
          { id: 'campus', label: '报名校区', type: 'text', required: true }
        ],
        customFields: [],
        allFields: [
          { id: 'logo', label: '队伍logo', type: 'image', required: false, isCommon: true },
          { id: 'name', label: '队伍名称', type: 'text', required: true, isCommon: true },
          { id: 'contact', label: '联系人', type: 'text', required: true, isCommon: true },
          { id: 'phone', label: '联系方式', type: 'text', required: true, isCommon: true },
          { id: 'campus', label: '报名校区', type: 'text', required: true, isCommon: true }
        ],
        registrationStartDate: '',
        registrationEndDate: ''
      }
      setTeamRequirements(defaultTeamReq)
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

        // 计算年龄范围并提示
        const currentYear = new Date().getFullYear()
        const minAge = currentYear - new Date(maxAgeDate).getFullYear()
        const maxAge = currentYear - new Date(minAgeDate).getFullYear()
        console.log(`年龄要求设置：${minAge}-${maxAge}岁（出生日期：${minAgeDate} 至 ${maxAgeDate}）`)
      }
    }

    setIsLoading(true)
    try {
      // 确保allFields是最新的
      const teamReqToSave = {
        ...teamRequirements,
        allFields: teamRequirements.allFields || [
          ...teamRequirements.commonFields.map(f => ({ ...f, isCommon: true })),
          ...teamRequirements.customFields.map(f => ({ ...f, isCommon: false }))
        ]
      }

      // 确保每个角色的allFields是最新的
      const playerReqToSave = {
        ...playerRequirements,
        roles: playerRequirements.roles.map(role => ({
          ...role,
          allFields: role.allFields || [
            ...(role.commonFields || []).map(f => ({ ...f, isCommon: true })),
            ...role.customFields.map(f => ({ ...f, isCommon: false }))
          ]
        }))
      }
      
      const response = await fetch(`/api/events/${eventId}/registration-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          team_requirements: teamReqToSave,
          player_requirements: playerReqToSave
        }),
      })

      const result = await response.json()
      
      if (result.success) {
        alert('报名设置保存成功')
        // 重新加载数据以确保状态同步
        await fetchSettings()
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
    if (!newRoleName) {
      alert('请输入角色名称')
      return
    }

    const newRole: RoleConfig = {
      id: `role_${Date.now()}`,
      name: newRoleName,
      customFields: [],  // 新角色不包含commonFields
      minPlayers: 1,
      maxPlayers: 10
    }

    setPlayerRequirements(prev => ({
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
    
    setPlayerRequirements(prev => ({
      ...prev,
      roles: prev.roles.filter(r => r.id !== roleId)
    }))
    
    // 如果删除的是当前选中的角色，切换到默认队员角色
    if (selectedRole === roleId) {
      setSelectedRole('player')
    }
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

    console.log('Saving field with options:', {
      fieldId: editingField.field.id,
      oldOptions: editingField.field.options,
      newOptions: updatedField.options,
      tempOptions: tempOptions
    })

    // 检查是否是新建字段（字段ID以custom_开头且在现有字段中找不到）
    const isNewField = editingField.field.id.startsWith('custom_') && !editingField.isCommon &&
      (editingField.type === 'team'
        ? !teamRequirements.customFields.find(f => f.id === editingField.field.id)
        : true) // 对于player类型，暂时简化处理

    console.log('Field editing logic check:', {
      fieldId: editingField.field.id,
      isCommon: editingField.isCommon,
      startsWithCustom: editingField.field.id.startsWith('custom_'),
      existingCustomFields: teamRequirements.customFields.map(f => f.id),
      isNewField: isNewField
    })

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
    } else {
      // 编辑现有字段的选项
      updateFieldOptions(editingField.type, editingField.field.id, editingField.isCommon, tempOptions, editingField.roleId)
    }

    setShowOptionsDialog(false)
    setEditingField(null)
    setTempOptions(['选项1', '选项2'])
  }

  const updateFieldOptions = (type: 'team' | 'player', fieldId: string, isCommon: boolean, options: string[], roleId?: string) => {
    console.log('updateFieldOptions called:', {
      type,
      fieldId,
      isCommon,
      options,
      filteredOptions: options.filter(opt => opt && opt.trim() !== '')
    })

    if (type === 'team') {
      setTeamRequirements(prev => {
        const filteredOptions = options.filter(opt => opt && opt.trim() !== '')
        
        // 更新allFields
        const updatedAllFields = prev.allFields
          ? prev.allFields.map(f => 
              f.id === fieldId ? { ...f, options: filteredOptions } : f
            )
          : [
              ...prev.commonFields.map(f => ({ ...f, isCommon: true })),
              ...prev.customFields.map(f => ({ ...f, isCommon: false }))
            ].map(f => 
              f.id === fieldId ? { ...f, options: filteredOptions } : f
            )
        
        // 同时更新commonFields和customFields
        return {
          ...prev,
          commonFields: isCommon 
            ? prev.commonFields.map(f => f.id === fieldId ? { ...f, options: filteredOptions } : f)
            : prev.commonFields,
          customFields: !isCommon 
            ? prev.customFields.map(f => f.id === fieldId ? { ...f, options: filteredOptions } : f)
            : prev.customFields,
          allFields: updatedAllFields
        }
      })
    } else {
      // For player, update the specific role's fields
      if (roleId) {
        setPlayerRequirements(prev => ({
          ...prev,
          roles: prev.roles.map(role => 
            role.id === roleId 
              ? {
                  ...role,
                  // Update commonFields if it's a common field (only for default player role)
                  ...(isCommon && role.commonFields ? {
                    commonFields: role.commonFields.map(f => 
                      f.id === fieldId ? { ...f, options: options.filter(opt => opt.trim()) } : f
                    )
                  } : {}),
                  // Update customFields if it's a custom field
                  ...(!isCommon ? {
                    customFields: role.customFields.map(f => 
                      f.id === fieldId ? { ...f, options: options.filter(opt => opt.trim()) } : f
                    )
                  } : {})
                }
              : role
          )
        }))
      }
    }
  }

  const openOptionsEditor = (type: 'team' | 'player', field: FieldConfig, isCommon: boolean) => {
    console.log('Opening options editor for field:', {
      fieldId: field.id,
      fieldLabel: field.label,
      fieldOptions: field.options,
      type: type,
      isCommon: isCommon
    })
    setEditingField({ type, field, isCommon })
    setTempOptions(field.options || ['选项1', '选项2'])
    setShowOptionsDialog(true)
  }

  const removeField = (type: 'team' | 'player', fieldId: string, isCommon: boolean) => {
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
      // For player, we don't have common fields anymore, only role-based fields
      // This is handled directly in the UI now
    }
  }

  const toggleRequired = (type: 'team' | 'player', fieldId: string, isCommon: boolean) => {
    if (type === 'team') {
      setTeamRequirements(prev => {
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
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">加载设置中...</p>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
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
                  className="mt-1"
                  required
                />
              </div>
              <div>
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
                  className="mt-1"
                  required
                />
                {regEndError && (
                  <p className="text-amber-600 text-sm mt-1">{regEndError}</p>
                )}
              </div>
            </div>

            {/* 审核结束时间 */}
            <div>
              <Label htmlFor="review-end" className="text-sm font-semibold">
                审核结束时间 <span className="text-red-500">*</span>
              </Label>
              <p className="text-xs text-gray-500 mt-1 mb-2">
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
                className="max-w-md"
                required
              />
              {reviewEndError && (
                <p className="text-amber-600 text-sm mt-1">{reviewEndError}</p>
              )}
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
                        onEditOptions={
                          !field.isCommon && (field.type === 'select' || field.type === 'multiselect')
                            ? () => openOptionsEditor('team', field, false)
                            : undefined
                        }
                        canRemove={true}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <div className="mt-4 flex items-end space-x-2">
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
            {/* 使用grid布局，左侧为性别和年龄要求，右侧为人数要求 */}
            <div className="grid grid-cols-2 gap-6">
              {/* 左侧：性别和年龄要求 */}
              <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                {/* 性别要求 */}
                <div>
                  <Label>队员性别要求</Label>
                  <Select 
                    value={playerRequirements.genderRequirement} 
                    onValueChange={(value: 'none' | 'male' | 'female') => 
                      setPlayerRequirements(prev => ({ ...prev, genderRequirement: value }))
                    }
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">无</SelectItem>
                      <SelectItem value="male">男</SelectItem>
                      <SelectItem value="female">女</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 年龄要求 */}
                <div>
                  <div className="flex items-center space-x-4 mb-2">
                    <Label>队员年龄要求</Label>
                    <Select 
                      value={playerRequirements.ageRequirementEnabled ? 'enabled' : 'disabled'} 
                      onValueChange={(value) => 
                        setPlayerRequirements(prev => ({ ...prev, ageRequirementEnabled: value === 'enabled' }))
                      }
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="disabled">无</SelectItem>
                        <SelectItem value="enabled">有</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {playerRequirements.ageRequirementEnabled && (
                    <div className="space-y-2 pl-4">
                      <div>
                        <Label>最晚出生日期（年龄下限）</Label>
                        <Input
                          type="date"
                          value={playerRequirements.maxAgeDate || ''}
                          onChange={(e) => {
                            const newMaxAgeDate = e.target.value
                            const minAgeDate = playerRequirements.minAgeDate

                            // 验证日期范围合理性
                            if (newMaxAgeDate && minAgeDate && newMaxAgeDate <= minAgeDate) {
                              alert('⚠️ 日期设置不合理\n\n最晚出生日期应该晚于最早出生日期\n\n请调整日期范围')
                              return
                            }

                            setPlayerRequirements(prev => ({
                              ...prev,
                              maxAgeDate: newMaxAgeDate
                            }))
                          }}
                          className="mt-1"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          设置队员可接受的最晚出生日期，越晚表示年龄越小
                        </p>
                      </div>
                      <div>
                        <Label>最早出生日期（年龄上限）</Label>
                        <Input
                          type="date"
                          value={playerRequirements.minAgeDate || ''}
                          onChange={(e) => {
                            const newMinAgeDate = e.target.value
                            const maxAgeDate = playerRequirements.maxAgeDate

                            // 验证日期范围合理性
                            if (newMinAgeDate && maxAgeDate && newMinAgeDate >= maxAgeDate) {
                              alert('⚠️ 日期设置不合理\n\n最早出生日期应该早于最晚出生日期\n\n请调整日期范围')
                              return
                            }

                            setPlayerRequirements(prev => ({
                              ...prev,
                              minAgeDate: newMinAgeDate
                            }))
                          }}
                          className="mt-1"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          设置队员可接受的最早出生日期，越早表示年龄越大
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 右侧：人数要求 */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-4 mb-2">
                  <Label>队员人数要求</Label>
                  <Select 
                    value={playerRequirements.countRequirementEnabled ? 'enabled' : 'disabled'} 
                    onValueChange={(value) => 
                      setPlayerRequirements(prev => ({ ...prev, countRequirementEnabled: value === 'enabled' }))
                    }
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disabled">无</SelectItem>
                      <SelectItem value="enabled">有</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {playerRequirements.countRequirementEnabled && (
                  <div className="space-y-2 pl-4">
                    <div>
                      <Label>人数下限</Label>
                      <Input
                        type="number"
                        value={playerRequirements.minCount || ''}
                        onChange={(e) => setPlayerRequirements(prev => ({
                          ...prev,
                          minCount: parseInt(e.target.value) || undefined
                        }))}
                        placeholder="最少人数"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>人数上限</Label>
                      <Input
                        type="number"
                        value={playerRequirements.maxCount || ''}
                        onChange={(e) => setPlayerRequirements(prev => ({
                          ...prev,
                          maxCount: parseInt(e.target.value) || undefined
                        }))}
                        placeholder="最多人数"
                        className="mt-1"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 角色选择和管理 - 保持原位置 */}
            <div>
              <div className="flex items-center justify-between mb-3">
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
                    {/* 只有非默认角色（非队员）可以删除 */}
                    {role.id !== 'player' && (
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
                  <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                    <h4 className="font-medium">角色: {role.name}</h4>
                    
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
                                onRemove={() => {
                                  setPlayerRequirements(prev => ({
                                    ...prev,
                                    roles: prev.roles.map(r => {
                                      if (r.id === role.id) {
                                        // 更新allFields
                                        const updatedAllFields = r.allFields
                                          ? r.allFields.filter(f => f.id !== field.id)
                                          : [
                                              ...(r.commonFields || []).map(f => ({ ...f, isCommon: true })),
                                              ...r.customFields.map(f => ({ ...f, isCommon: false }))
                                            ].filter(f => f.id !== field.id)
                                        
                                        // 同时更新commonFields和customFields
                                        return {
                                          ...r,
                                          allFields: updatedAllFields,
                                          commonFields: field.isCommon
                                            ? r.commonFields?.filter(f => f.id !== field.id)
                                            : r.commonFields,
                                          customFields: !field.isCommon
                                            ? r.customFields.filter(f => f.id !== field.id)
                                            : r.customFields
                                        }
                                      }
                                      return r
                                    })
                                  }))
                                }}
                                onEditOptions={
                                  (field.type === 'select' || field.type === 'multiselect')
                                    ? () => {
                                        setEditingField({ type: 'player', roleId: role.id, field, isCommon: field.isCommon || false })
                                        setTempOptions(field.options || ['选项1', '选项2'])
                                        setShowOptionsDialog(true)
                                      }
                                    : undefined
                                }
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>

                      <div className="mt-4 flex items-end space-x-2">
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
            className="bg-blue-600 hover:bg-blue-700"
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
    </>
  )
}