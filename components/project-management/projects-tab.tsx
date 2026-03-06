'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
  display_order: number
  is_enabled: boolean
  project_type?: ProjectType
  divisions?: { count: number }[]
}

interface ProjectsTabProps {
  refreshKey: number
  onUpdate: () => void
}

export default function ProjectsTab({ refreshKey, onUpdate }: ProjectsTabProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [deletingProject, setDeletingProject] = useState<Project | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    project_type_id: '',
    display_order: 0,
  })
  const [submitting, setSubmitting] = useState(false)
  const [filterTypeId, setFilterTypeId] = useState<string>('all')

  useEffect(() => {
    fetchProjectTypes()
    fetchProjects()
  }, [refreshKey])

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

  const fetchProjects = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/project-management/projects')
      const data = await response.json()
      if (data.success) {
        setProjects(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingProject(null)
    setFormData({
      name: '',
      project_type_id: projectTypes[0]?.id || '',
      display_order: projects.length,
    })
    setShowDialog(true)
  }

  const handleEdit = (project: Project) => {
    setEditingProject(project)
    setFormData({
      name: project.name,
      project_type_id: project.project_type_id,
      display_order: project.display_order,
    })
    setShowDialog(true)
  }

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.project_type_id) {
      alert('请填写完整信息')
      return
    }

    try {
      setSubmitting(true)
      const url = editingProject
        ? `/api/project-management/projects/${editingProject.id}`
        : '/api/project-management/projects'
      const method = editingProject ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          project_type_id: formData.project_type_id,
          display_order: formData.display_order,
          is_enabled: editingProject?.is_enabled ?? true,
        }),
      })

      const data = await response.json()
      if (data.success) {
        setShowDialog(false)
        fetchProjects()
        onUpdate()
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
    if (!deletingProject) return

    try {
      setSubmitting(true)
      const response = await fetch(`/api/project-management/projects/${deletingProject.id}`, {
        method: 'DELETE',
      })

      const data = await response.json()
      if (data.success) {
        setShowDeleteDialog(false)
        setDeletingProject(null)
        fetchProjects()
        onUpdate()
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

  const handleToggleEnabled = async (project: Project) => {
    try {
      const response = await fetch(`/api/project-management/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !project.is_enabled }),
      })

      const data = await response.json()
      if (data.success) {
        fetchProjects()
      }
    } catch (error) {
      console.error('Toggle error:', error)
    }
  }

  const filteredProjects =
    filterTypeId === 'all'
      ? projects
      : projects.filter((p) => p.project_type_id === filterTypeId)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:space-x-4">
          <p className="text-sm text-muted-foreground">共 {filteredProjects.length} 个项目</p>
          <Select value={filterTypeId} onValueChange={setFilterTypeId}>
            <SelectTrigger className="w-full sm:w-[180px]">
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
        </div>
        <Button onClick={handleAdd} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          添加项目
        </Button>
      </div>

      <div className="space-y-2">
        {filteredProjects.map((project) => (
          <div
            key={project.id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center space-x-4 flex-1">
              <div className="flex-1">
                <h3 className="font-medium">{project.name}</h3>
                <p className="text-sm text-muted-foreground">
                  类型: {project.project_type?.name} | 排序: {project.display_order} | 组别数:{' '}
                  {project.divisions?.[0]?.count || 0}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:space-x-4">
              <div className="flex items-center justify-between sm:justify-start sm:space-x-2">
                <Label htmlFor={`enabled-${project.id}`} className="text-sm">
                  {project.is_enabled ? '已启用' : '已禁用'}
                </Label>
                <Switch
                  id={`enabled-${project.id}`}
                  checked={project.is_enabled}
                  onCheckedChange={() => handleToggleEnabled(project)}
                />
              </div>

              <Button variant="ghost" size="sm" onClick={() => handleEdit(project)} className="justify-start sm:justify-center">
                <Edit className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="justify-start sm:justify-center"
                onClick={() => {
                  setDeletingProject(project)
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProject ? '编辑项目' : '添加项目'}</DialogTitle>
            <DialogDescription>
              {editingProject ? '修改具体项目信息' : '创建新的具体项目'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project_type_id">所属类型 *</Label>
              <Select
                value={formData.project_type_id}
                onValueChange={(value) => setFormData({ ...formData, project_type_id: value })}
              >
                <SelectTrigger className="h-11 w-full">
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

            <div className="space-y-2">
              <Label htmlFor="name">项目名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如：棍网球、篮球、足球"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="display_order">排序</Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) =>
                  setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })
                }
                className="h-11"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingProject ? '保存' : '创建'}
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
              确定要删除项目 "{deletingProject?.name}" 吗？
              {deletingProject?.divisions?.[0]?.count ? (
                <span className="block mt-2 text-red-600">
                  该项目下还有 {deletingProject.divisions[0].count} 个组别，请先删除这些组别。
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
              disabled={submitting || (deletingProject?.divisions?.[0]?.count || 0) > 0}
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
