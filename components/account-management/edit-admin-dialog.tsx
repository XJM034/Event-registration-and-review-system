'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Loader2, Shield } from 'lucide-react'

interface Admin {
  id: string
  phone: string
  name: string | null
  email: string | null
  is_super: boolean
  created_at: string
  auth_id: string | null
}

interface EditAdminDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  admin: Admin
  onSuccess: () => void
}

export default function EditAdminDialog({
  open,
  onOpenChange,
  admin,
  onSuccess
}: EditAdminDialogProps) {
  const [loading, setLoading] = useState(false)
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    is_super: false
  })

  useEffect(() => {
    if (admin) {
      setFormData({
        name: admin.name || '',
        is_super: admin.is_super
      })
    }
  }, [admin])

  useEffect(() => {
    // 获取当前登录的管理员 ID
    const fetchCurrentAdmin = async () => {
      try {
        const res = await fetch('/api/admin/current')
        const data = await res.json()
        if (data.success) {
          setCurrentAdminId(data.data.id)
        }
      } catch (error) {
        console.error('Error fetching current admin:', error)
      }
    }
    if (open) {
      fetchCurrentAdmin()
    }
  }, [open])

  const isCurrentAdmin = currentAdminId === admin.id

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setLoading(true)
      const res = await fetch(`/api/admin/admins/${admin.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await res.json()

      if (data.success) {
        alert('管理员信息更新成功')
        onOpenChange(false)
        onSuccess()
      } else {
        alert(`更新失败: ${data.error}`)
      }
    } catch (error) {
      console.error('Error updating admin:', error)
      alert('更新失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>编辑管理员信息</DialogTitle>
          <DialogDescription>
            手机号：{admin.phone}（不可修改）
          </DialogDescription>
          {isCurrentAdmin && (
            <div className="mt-2 space-y-2">
              <Badge variant="default">
                <Shield className="h-3 w-3 mr-1" />
                当前账号
              </Badge>
              <p className="text-sm text-amber-600">
                当前账号已登录，为避免误操作，当前账号的权限不可在此修改；你仍可修改姓名。
              </p>
            </div>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">姓名</Label>
              <Input
                id="edit-name"
                placeholder="管理员姓名"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-is-super"
                  checked={formData.is_super}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_super: checked as boolean })
                  }
                  disabled={isCurrentAdmin}
                />
                <Label
                  htmlFor="edit-is-super"
                  className={isCurrentAdmin ? 'text-gray-400 cursor-not-allowed' : 'cursor-pointer'}
                >
                  超级管理员
                </Label>
              </div>
              {isCurrentAdmin && (
                <p className="text-sm text-yellow-600">
                  ⚠️ 当前账号已登录，权限项已锁定（可编辑姓名）
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
