'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
  display_order: number
  is_enabled: boolean
  projects?: { count: number }[]
}

interface ProjectTypesTabProps {
  onUpdate: () => void
}

export default function ProjectTypesTab({ onUpdate }: ProjectTypesTabProps) {
  const [types, setTypes] = useState<ProjectType[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingType, setEditingType] = useState<ProjectType | null>(null)
  const [deletingType, setDeletingType] = useState<ProjectType | null>(null)
  const [formData, setFormData] = useState({ name: '', display_order: 0 })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchTypes()
  }, [])

  const fetchTypes = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/project-management/types')
      const data = await response.json()
      if (data.success) {
        setTypes(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch types:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingType(null)
    setFormData({ name: '', display_order: types.length })
    setShowDialog(true)
  }

  const handleEdit = (type: ProjectType) => {
    setEditingType(type)
    setFormData({ name: type.name, display_order: type.display_order })
    setShowDialog(true)
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      alert('请输入类型名称')
      return
    }

    try {
      setSubmitting(true)
      const url = editingType
        ? `/api/project-management/types/${editingType.id}`
        : '/api/project-management/types'
      const method = editingType ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          display_order: formData.display_order,
          is_enabled: editingType?.is_enabled ?? true,
        }),
      })

      const data = await response.json()
      if (data.success) {
        setShowDialog(false)
        fetchTypes()
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
    if (!deletingType) return

    try {
      setSubmitting(true)
      const response = await fetch(`/api/project-management/types/${deletingType.id}`, {
        method: 'DELETE',
      })

      const data = await response.json()
      if (data.success) {
        setShowDeleteDialog(false)
        setDeletingType(null)
        fetchTypes()
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

  const handleToggleEnabled = async (type: ProjectType) => {
    try {
      const response = await fetch(`/api/project-management/types/${type.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !type.is_enabled }),
      })

      const data = await response.json()
      if (data.success) {
        fetchTypes()
      }
    } catch (error) {
      console.error('Toggle error:', error)
    }
  }

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
        <p className="text-sm text-muted-foreground">共 {types.length} 个赛事类型</p>
        <Button onClick={handleAdd} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          添加类型
        </Button>
      </div>

      <div className="space-y-2">
        {types.map((type) => (
          <div
            key={type.id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center space-x-4 flex-1">
              <div className="flex-1">
                <h3 className="font-medium">{type.name}</h3>
                <p className="text-sm text-muted-foreground">
                  排序: {type.display_order} | 项目数: {type.projects?.[0]?.count || 0}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:space-x-4">
              <div className="flex items-center justify-between sm:justify-start sm:space-x-2">
                <Label htmlFor={`enabled-${type.id}`} className="text-sm">
                  {type.is_enabled ? '已启用' : '已禁用'}
                </Label>
                <Switch
                  id={`enabled-${type.id}`}
                  checked={type.is_enabled}
                  onCheckedChange={() => handleToggleEnabled(type)}
                />
              </div>

              <Button variant="ghost" size="sm" onClick={() => handleEdit(type)} className="justify-start sm:justify-center">
                <Edit className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="justify-start sm:justify-center"
                onClick={() => {
                  setDeletingType(type)
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
            <DialogTitle>{editingType ? '编辑类型' : '添加类型'}</DialogTitle>
            <DialogDescription>
              {editingType ? '修改赛事类型信息' : '创建新的赛事类型'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">类型名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如：体育、科创、艺术"
              />
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
              {editingType ? '保存' : '创建'}
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
              确定要删除类型 "{deletingType?.name}" 吗？
              {deletingType?.projects?.[0]?.count ? (
                <span className="block mt-2 text-red-600">
                  该类型下还有 {deletingType.projects[0].count} 个项目，请先删除这些项目。
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
              disabled={submitting || (deletingType?.projects?.[0]?.count || 0) > 0}
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
