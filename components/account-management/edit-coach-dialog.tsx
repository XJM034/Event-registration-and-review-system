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
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'

interface Coach {
  id: string
  phone: string
  name: string | null
  school: string | null
  organization: string | null
  notes: string | null
}

interface EditCoachDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  coach: Coach
  onSuccess: () => void
}

export default function EditCoachDialog({
  open,
  onOpenChange,
  coach,
  onSuccess
}: EditCoachDialogProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    school: '',
    notes: ''
  })

  useEffect(() => {
    if (coach) {
      setFormData({
        name: coach.name || '',
        school: coach.school || '',
        notes: coach.notes || ''
      })
    }
  }, [coach])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setLoading(true)
      const res = await fetch(`/api/admin/coaches/${coach.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await res.json()

      if (data.success) {
        alert('教练信息更新成功')
        onOpenChange(false)
        onSuccess()
      } else {
        alert(`更新失败: ${data.error}`)
      }
    } catch (error) {
      console.error('Error updating coach:', error)
      alert('更新失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>编辑教练信息</DialogTitle>
          <DialogDescription>
            手机号：{coach.phone}（不可修改）
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">姓名</Label>
              <Input
                id="edit-name"
                placeholder="教练姓名"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-school">参赛单位</Label>
              <Input
                id="edit-school"
                placeholder="参赛单位"
                value={formData.school}
                onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes">备注</Label>
              <Textarea
                id="edit-notes"
                placeholder="备注信息（可选）"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="min-h-24"
              />
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
