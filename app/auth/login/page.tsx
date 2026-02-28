'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Phone, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function mapAdminSessionErrorMessage(rawError: string) {
  switch (rawError) {
    case 'Admin not found':
      return '管理员账号未配置，请联系管理员'
    case 'Admin phone not found':
      return '管理员手机号信息缺失，请联系管理员'
    case 'Admin role required':
      return '当前账号不是管理员账号'
    case 'Read admin failed':
      return '管理员信息读取失败，请稍后重试'
    case 'Unauthorized':
      return '管理员认证失败，请重试'
    default:
      return rawError || '管理员会话创建失败，请重试'
  }
}

export default function UnifiedLoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    if (!phone || !password) {
      setError('请输入手机号和密码')
      setIsLoading(false)
      return
    }

    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError('请输入正确的手机号格式')
      setIsLoading(false)
      return
    }

    try {
      const supabase = createClient()
      // 先清理本地会话，避免管理员旧会话残留导致角色串线
      await supabase.auth.signOut({ scope: 'local' })

      // 将手机号转换为邮箱格式用于登录
      // 例如：18140044662 -> 18140044662@system.local
      const email = `${phone}@system.local`

      // 使用邮箱密码登录
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      })

      if (authError) {
        console.error('Auth error:', authError)
        setError('手机号或密码错误')
        setIsLoading(false)
        return
      }

      if (!data.user) {
        setError('登录失败')
        setIsLoading(false)
        return
      }

      // 读取一次 session，确保会话已稳定写入再跳转
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const accessToken = currentSession?.access_token || data.session?.access_token || null

      // 检查用户角色
      const role = data.user.user_metadata?.role

      if (role === 'admin') {
        let created = false
        let createSessionError = ''
        for (let i = 0; i < 3; i += 1) {
          const adminSessionRes = await fetch('/api/auth/admin-session', {
            method: 'POST',
            credentials: 'include',
            headers: accessToken
              ? { Authorization: `Bearer ${accessToken}` }
              : undefined,
          })

          if (adminSessionRes.ok) {
            created = true
            break
          }

          try {
            const payload = await adminSessionRes.json()
            if (typeof payload?.error === 'string' && payload.error) {
              createSessionError = mapAdminSessionErrorMessage(payload.error)
            }
          } catch {}

          await new Promise(resolve => setTimeout(resolve, (i + 1) * 200))
        }

        if (!created) {
          setError(createSessionError || '管理员会话创建失败，请重试')
          setIsLoading(false)
          return
        }

        // 跳转到管理端主页
        window.location.href = '/events'
      } else {
        // 教练：检查或创建 coaches 记录
        const { data: coach } = await supabase
          .from('coaches')
          .select('*')
          .eq('auth_id', data.user.id)
          .single()

        if (!coach) {
          // 创建教练记录
          await supabase
            .from('coaches')
            .insert({
              auth_id: data.user.id,
              phone: phone,
              email: email,
              name: data.user.user_metadata?.name || '',
              school: data.user.user_metadata?.school || '',
              organization: data.user.user_metadata?.organization || '',
              role: 'coach'
            })
        }

        // 跳转到门户端
        window.location.href = '/portal'
      }
    } catch (error) {
      console.error('Login error:', error)
      setError('登录失败，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">棍网球报名系统</CardTitle>
          <CardDescription>
            请输入您的手机号和密码登录
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="phone">手机号</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="请输入手机号"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                  maxLength={11}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              登录
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            <p>账号请联系管理员开通</p>
            <p className="mt-2 text-xs text-gray-500">
              默认密码：admin123（管理员）/ user123（教练）
            </p>
            <p className="text-xs text-gray-500">
              登录后请及时修改密码
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
