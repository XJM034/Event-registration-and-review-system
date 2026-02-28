'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Plus, Edit, Trash2, Loader2 } from 'lucide-react'

interface ProjectType {
  id: string
  name: string
}

interface Project {
  id: string
  name: string
  project_type_id: string
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

interface Division {
  id: string
  name: string
  description?: string
  project_id: string
  display_order: number
  is_enabled: boolean
  rules?: DivisionRules
  project?: {
    id: string
    name: string
    project_type?: ProjectType
  }
  event_divisions?: { count: number }[]
}

interface DivisionsTabProps {
  refreshKey: number
}

export default function DivisionsTab({ refreshKey }: DivisionsTabProps) {
  const [divisions, setDivisions] = useState<Division[]>([])
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingDivision, setEditingDivision] = useState<Division | null>(null)
  const [deletingDivision, setDeletingDivision] = useState<Division | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    project_type_id: '',
    project_id: '',
    display_order: 0,
    rules: {
      gender: 'none' as 'male' | 'female' | 'mixed' | 'none',
      minAge: undefined as number | undefined,
      maxAge: undefined as number | undefined,
      minBirthDate: undefined as string | undefined,
      maxBirthDate: undefined as string | undefined,
      minPlayers: undefined as number | undefined,
      maxPlayers: undefined as number | undefined,
    },
  })
  const [submitting, setSubmitting] = useState(false)
  const [filterTypeId, setFilterTypeId] = useState<string>('all')
  const [filterProjectId, setFilterProjectId] = useState<string>('all')
  const dialogProjects = projects.filter((p) => !formData.project_type_id || p.project_type_id === formData.project_type_id)

  useEffect(() => {
    fetchProjectTypes()
    fetchProjects()
    fetchDivisions()
  }, [refreshKey])

  useEffect(() => {
    if (filterTypeId !== 'all') {
      fetchProjects(filterTypeId)
    }
  }, [filterTypeId])

  const fetchProjectTypes = async () => {
    try {
      const response = await fetch('/api/project-management/types')
      const data = await response.json()
      if (data.success) {
        setProjectTypes(data.data.filter((t: any) => t.is_enabled))
      }
    } catch (error) {
      console.error('Failed to fetch types:', error)
    }
  }

  const fetchProjects = async (typeId?: string) => {
    try {
      const url = typeId
        ? `/api/project-management/projects?type_id=${typeId}`
        : '/api/project-management/projects'
      const response = await fetch(url)
      const data = await response.json()
      if (data.success) {
        setProjects(data.data.filter((p: any) => p.is_enabled))
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    }
  }

  const fetchDivisions = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/project-management/divisions')
      const data = await response.json()
      if (data.success) {
        setDivisions(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch divisions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    const defaultTypeId = filterTypeId !== 'all'
      ? filterTypeId
      : (projectTypes[0]?.id || '')
    const defaultProjectId = projects.find((p) => p.project_type_id === defaultTypeId)?.id || ''

    setEditingDivision(null)
    setFormData({
      name: '',
      description: '',
      project_type_id: defaultTypeId,
      project_id: defaultProjectId,
      display_order: divisions.length,
      rules: {
        gender: 'none',
        minAge: undefined,
        maxAge: undefined,
        minBirthDate: undefined,
        maxBirthDate: undefined,
        minPlayers: undefined,
        maxPlayers: undefined,
      },
    })
    setShowDialog(true)
  }

  const handleEdit = (division: Division) => {
    const projectTypeId =
      division.project?.project_type?.id ||
      projects.find((p) => p.id === division.project_id)?.project_type_id ||
      ''

    setEditingDivision(division)
    setFormData({
      name: division.name,
      description: division.description || '',
      project_type_id: projectTypeId,
      project_id: division.project_id,
      display_order: division.display_order,
      rules: {
        gender: division.rules?.gender || 'none',
        minAge: division.rules?.minAge,
        maxAge: division.rules?.maxAge,
        minBirthDate: division.rules?.minBirthDate,
        maxBirthDate: division.rules?.maxBirthDate,
        minPlayers: division.rules?.minPlayers,
        maxPlayers: division.rules?.maxPlayers,
      },
    })
    setShowDialog(true)
  }

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.project_id) {
      alert('请填写完整信息')
      return
    }

    if (formData.rules.minBirthDate && formData.rules.maxBirthDate) {
      if (formData.rules.minBirthDate > formData.rules.maxBirthDate) {
        alert('最早出生日期不能晚于最晚出生日期')
        return
      }
    }

    if (formData.rules.minPlayers !== undefined && formData.rules.maxPlayers !== undefined) {
      if (formData.rules.minPlayers > formData.rules.maxPlayers) {
        alert('最少队员人数不能大于最多队员人数')
        return
      }
    }

    const normalizedRules = { ...formData.rules }
    // 配置了按出生日期限制时，自动清理旧的年龄数字规则，避免双重校验
    if (normalizedRules.minBirthDate || normalizedRules.maxBirthDate) {
      normalizedRules.minAge = undefined
      normalizedRules.maxAge = undefined
    }

    try {
      setSubmitting(true)
      const url = editingDivision
        ? `/api/project-management/divisions/${editingDivision.id}`
        : '/api/project-management/divisions'
      const method = editingDivision ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          project_id: formData.project_id,
          display_order: formData.display_order,
          is_enabled: editingDivision?.is_enabled ?? true,
          rules: normalizedRules,
        }),
      })

      const data = await response.json()
      if (data.success) {
        setShowDialog(false)
        fetchDivisions()
      } else {
        alert(data.error || '操作失败')
      }
    } catch (error) {
      console.error('Submit error:', error)
      alert('操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingDivision) return

    try {
      setSubmitting(true)
      const response = await fetch(`/api/project-management/divisions/${deletingDivision.id}`, {
        method: 'DELETE',
      })

      const data = await response.json()
      if (data.success) {
        setShowDeleteDialog(false)
        setDeletingDivision(null)
        fetchDivisions()
      } else {
        alert(data.error || '删除失败')
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('删除失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleEnabled = async (division: Division) => {
    try {
      const response = await fetch(`/api/project-management/divisions/${division.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !division.is_enabled }),
      })

      const data = await response.json()
      if (data.success) {
        fetchDivisions()
      }
    } catch (error) {
      console.error('Toggle error:', error)
    }
  }

  const filteredDivisions = divisions.filter((d) => {
    if (filterProjectId !== 'all' && d.project_id !== filterProjectId) return false
    if (filterTypeId !== 'all' && d.project?.project_type?.id !== filterTypeId) return false
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <p className="text-sm text-gray-600">共 {filteredDivisions.length} 个组别</p>
          <Select value={filterTypeId} onValueChange={setFilterTypeId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="筛选类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              {projectTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterProjectId} onValueChange={setFilterProjectId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="筛选项目" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部项目</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          添加组别
        </Button>
      </div>

      <div className="space-y-2">
        {filteredDivisions.map((division) => (
          <div
            key={division.id}
            className="flex items-center justify-between p-4 bg-white border rounded-lg hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center space-x-4 flex-1">
              <div className="flex-1">
                <h3 className="font-medium">{division.name}</h3>
                <p className="text-sm text-gray-500">
                  类型: {division.project?.project_type?.name} | 项目: {division.project?.name} |
                  排序: {division.display_order}
                </p>
                {division.description && (
                  <p className="text-sm text-gray-400 mt-1">{division.description}</p>
                )}
                {division.rules && (
                  <div className="text-sm text-gray-500 mt-1 space-x-2">
                    {division.rules.gender && division.rules.gender !== 'none' && (
                      <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                        {division.rules.gender === 'male' ? '男子' : division.rules.gender === 'female' ? '女子' : '混合'}
                      </span>
                    )}
                    {(division.rules.minBirthDate || division.rules.maxBirthDate) && (
                      <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded">
                        出生日期: {division.rules.minBirthDate || '不限'} ~ {division.rules.maxBirthDate || '不限'}
                      </span>
                    )}
                    {(!division.rules.minBirthDate && !division.rules.maxBirthDate) && (division.rules.minAge !== undefined || division.rules.maxAge !== undefined) && (
                      <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded">
                        年龄: {division.rules.minAge || '不限'} - {division.rules.maxAge || '不限'}岁
                      </span>
                    )}
                    {(division.rules.minPlayers !== undefined || division.rules.maxPlayers !== undefined) && (
                      <span className="inline-block px-2 py-0.5 bg-orange-100 text-orange-700 rounded">
                        队员人数: {division.rules.minPlayers || '不限'} - {division.rules.maxPlayers || '不限'}人
                      </span>
                    )}
                  </div>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  使用赛事数: {division.event_divisions?.[0]?.count || 0}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Label htmlFor={`enabled-${division.id}`} className="text-sm">
                  {division.is_enabled ? '已启用' : '已禁用'}
                </Label>
                <Switch
                  id={`enabled-${division.id}`}
                  checked={division.is_enabled}
                  onCheckedChange={() => handleToggleEnabled(division)}
                />
              </div>

              <Button variant="ghost" size="sm" onClick={() => handleEdit(division)}>
                <Edit className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDeletingDivision(division)
                  setShowDeleteDialog(true)
                }}
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{editingDivision ? '编辑组别' : '添加组别'}</DialogTitle>
            <DialogDescription>
              {editingDivision ? '修改组别信息' : '创建新的组别'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="project_type_id">所属类型 *</Label>
              <Select
                value={formData.project_type_id}
                onValueChange={(value) => {
                  const nextProjectId = projects.find((p) => p.project_type_id === value)?.id || ''
                  setFormData({
                    ...formData,
                    project_type_id: value,
                    project_id: nextProjectId,
                  })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  {projectTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="project_id">所属项目 *</Label>
              <Select
                value={formData.project_id}
                onValueChange={(value) => setFormData({ ...formData, project_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={formData.project_type_id ? '选择项目' : '请先选择类型'} />
                </SelectTrigger>
                <SelectContent>
                  {dialogProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="name">组别名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如：U12组、U15组、成人组"
              />
            </div>

            <div>
              <Label htmlFor="description">描述</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="组别说明（可选）"
                rows={3}
              />
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">报名限制规则</h4>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="gender">性别限制</Label>
                  <Select
                    value={formData.rules.gender}
                    onValueChange={(value: 'male' | 'female' | 'mixed' | 'none') =>
                      setFormData({ ...formData, rules: { ...formData.rules, gender: value } })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不限</SelectItem>
                      <SelectItem value="male">仅限男子</SelectItem>
                      <SelectItem value="female">仅限女子</SelectItem>
                      <SelectItem value="mixed">混合（男女均可）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="minBirthDate">最早出生日期（含）</Label>
                    <Input
                      id="minBirthDate"
                      type="date"
                      value={formData.rules.minBirthDate ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          rules: {
                            ...formData.rules,
                            minBirthDate: e.target.value || undefined,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxBirthDate">最晚出生日期（含）</Label>
                    <Input
                      id="maxBirthDate"
                      type="date"
                      value={formData.rules.maxBirthDate ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          rules: {
                            ...formData.rules,
                            maxBirthDate: e.target.value || undefined,
                          },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="minPlayers">最少队员人数</Label>
                    <Input
                      id="minPlayers"
                      type="number"
                      min="0"
                      max="100"
                      value={formData.rules.minPlayers ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          rules: {
                            ...formData.rules,
                            minPlayers: e.target.value ? parseInt(e.target.value) : undefined,
                          },
                        })
                      }
                      placeholder="不限"
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxPlayers">最多队员人数</Label>
                    <Input
                      id="maxPlayers"
                      type="number"
                      min="0"
                      max="100"
                      value={formData.rules.maxPlayers ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          rules: {
                            ...formData.rules,
                            maxPlayers: e.target.value ? parseInt(e.target.value) : undefined,
                          },
                        })
                      }
                      placeholder="不限"
                    />
                  </div>
                </div>

                <p className="text-xs text-gray-500">
                  提示：出生日期将根据队员身份证号精确到天校验（含边界），队员人数将在提交报名前校验
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="display_order">排序</Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) =>
                  setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingDivision ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除组别 "{deletingDivision?.name}" 吗？
              {deletingDivision?.event_divisions?.[0]?.count ? (
                <span className="block mt-2 text-red-600">
                  该组别已被 {deletingDivision.event_divisions[0].count} 个赛事使用，无法删除。
                </span>
              ) : (
                <span className="block mt-2">此操作无法撤销。</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={submitting || (deletingDivision?.event_divisions?.[0]?.count || 0) > 0}
              className="bg-red-600 hover:bg-red-700"
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
