'use client'

import { useState } from 'react'
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
import {
  PASSWORD_POLICY_HINT,
  PASSWORD_POLICY_MIN_LENGTH,
  PASSWORD_POLICY_PLACEHOLDER,
  validatePasswordStrength,
} from '@/lib/password-policy'

interface CreateCoachDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export default function CreateCoachDialog({
  open,
  onOpenChange,
  onSuccess
}: CreateCoachDialogProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    phone: '',
    password: '',
    name: '',
    school: '',
    notes: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 验证手机号
    if (!/^1[3-9]\d{9}$/.test(formData.phone)) {
      alert('请输入正确的11位手机号')
      return
    }

    // 验证密码
    const passwordValidation = validatePasswordStrength(formData.password)
    if (!passwordValidation.valid) {
      alert(passwordValidation.message)
      return
    }

    try {
      setLoading(true)
      const res = await fetch('/api/admin/coaches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await res.json()

      if (data.success) {
        alert('教练账号创建成功')
        setFormData({
          phone: '',
          password: '',
          name: '',
          school: '',
          notes: ''
        })
        onOpenChange(false)
        onSuccess()
      } else {
        alert(`创建失败: ${data.error}`)
      }
    } catch (error) {
      console.error('Error creating coach:', error)
      alert('创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>创建教练账号</DialogTitle>
          <DialogDescription>
            创建新的教练账号，教练可以使用手机号和密码登录门户端
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="phone">
                手机号 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="phone"
                placeholder="请输入11位手机号"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
                maxLength={11}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                默认密码 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={PASSWORD_POLICY_PLACEHOLDER}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={PASSWORD_POLICY_MIN_LENGTH}
              />
              <p className="text-xs text-gray-500">
                {PASSWORD_POLICY_HINT}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">姓名</Label>
              <Input
                id="name"
                placeholder="教练姓名"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="school">参赛单位</Label>
              <Input
                id="school"
                placeholder="参赛单位"
                value={formData.school}
                onChange={(e) => setFormData({ ...formData, school: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">备注</Label>
              <Textarea
                id="notes"
                placeholder="备注信息（可选）"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
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
              创建账号
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
