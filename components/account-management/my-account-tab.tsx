'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Shield, ShieldOff } from 'lucide-react'
import {
  PASSWORD_POLICY_HINT,
  PASSWORD_POLICY_MIN_LENGTH,
  PASSWORD_POLICY_PLACEHOLDER,
  validatePasswordStrength,
} from '@/lib/password-policy'

interface CurrentAdmin {
  id: string
  phone: string | null
  name: string | null
  email: string | null
  is_super: boolean
}

export default function MyAccountTab() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [admin, setAdmin] = useState<CurrentAdmin | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const loadMyAccount = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/me', {
        cache: 'no-store'
      })
      const data = await res.json()

      if (data.success) {
        setAdmin(data.data)
      } else {
        alert(data.error || '获取账号信息失败')
      }
    } catch (error) {
      console.error('Error loading my admin account:', error)
      alert('获取账号信息失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMyAccount()
  }, [])

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    const passwordValidation = validatePasswordStrength(password)
    if (!passwordValidation.valid) {
      alert(passwordValidation.message)
      return
    }

    if (password !== confirmPassword) {
      alert('两次输入的密码不一致')
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch('/api/admin/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      const data = await res.json()

      if (!data.success) {
        alert(data.error || '修改密码失败')
        return
      }

      setPassword('')
      setConfirmPassword('')
      alert('密码修改成功')
    } catch (error) {
      console.error('Error changing my password:', error)
      alert('修改密码失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-gray-500">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>我的账号</CardTitle>
          <CardDescription>查看当前登录管理员账号信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>手机号</Label>
            <Input value={admin?.phone || ''} readOnly />
          </div>
          <div className="grid gap-2">
            <Label>姓名</Label>
            <Input value={admin?.name || ''} readOnly />
          </div>
          <div className="grid gap-2">
            <Label>权限</Label>
            <div>
              {admin?.is_super ? (
                <Badge variant="default">
                  <Shield className="h-3 w-3 mr-1" />
                  超级管理员
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <ShieldOff className="h-3 w-3 mr-1" />
                  普通管理员
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
          <CardDescription>{PASSWORD_POLICY_HINT}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="my-new-password">新密码</Label>
              <Input
                id="my-new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={PASSWORD_POLICY_PLACEHOLDER}
                minLength={PASSWORD_POLICY_MIN_LENGTH}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="my-confirm-password">确认新密码</Label>
              <Input
                id="my-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入新密码"
                minLength={PASSWORD_POLICY_MIN_LENGTH}
                required
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? '提交中...' : '确认修改'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

    </div>
  )
}
