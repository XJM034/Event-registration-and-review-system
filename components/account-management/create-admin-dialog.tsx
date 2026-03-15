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
import { Checkbox } from '@/components/ui/checkbox'
import {
  PASSWORD_POLICY_HINT,
  PASSWORD_POLICY_MIN_LENGTH,
  PASSWORD_POLICY_PLACEHOLDER,
  validatePasswordStrength,
} from '@/lib/password-policy'

interface CreateAdminDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function CreateAdminDialog({ open, onOpenChange, onSuccess }: CreateAdminDialogProps) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [isSuper, setIsSuper] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 验证手机号
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      alert('请输入正确的手机号')
      return
    }

    // 验证密码
    const passwordValidation = validatePasswordStrength(password)
    if (!passwordValidation.valid) {
      alert(passwordValidation.message)
      return
    }

    try {
      setLoading(true)
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, name, password, is_super: isSuper })
      })

      const data = await res.json()

      if (data.success) {
        alert('管理员账号创建成功')
        setPhone('')
        setName('')
        setPassword('')
        setIsSuper(false)
        onOpenChange(false)
        onSuccess()
      } else {
        alert(data.error || '创建失败')
      }
    } catch (error) {
      console.error('Error creating admin:', error)
      alert('创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建管理员账号</DialogTitle>
          <DialogDescription>
            创建新的管理员账号，可以选择是否授予超级管理员权限
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="phone">手机号 *</Label>
              <Input
                id="phone"
                placeholder="请输入11位手机号"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={11}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">姓名</Label>
              <Input
                id="name"
                placeholder="管理员姓名"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">默认密码 *</Label>
              <Input
                id="password"
                type="password"
                placeholder={PASSWORD_POLICY_PLACEHOLDER}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={PASSWORD_POLICY_MIN_LENGTH}
                required
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_HINT}</p>
            </div>
            <div className="flex items-start space-x-2">
              <Checkbox
                id="is_super"
                checked={isSuper}
                onCheckedChange={(checked) => setIsSuper(checked as boolean)}
              />
              <Label
                htmlFor="is_super"
                className="cursor-pointer text-sm font-normal leading-5"
              >
                授予超级管理员权限
              </Label>
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
              {loading ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
