'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Phone, Lock, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function UnifiedLoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  
  // 管理员登录状态
  const [adminPhone, setAdminPhone] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  
  // 教练登录状态
  const [coachEmail, setCoachEmail] = useState('')
  const [coachPassword, setCoachPassword] = useState('')

  // 管理员登录处理
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    if (!adminPhone || !adminPassword) {
      setError('请输入手机号和密码')
      setIsLoading(false)
      return
    }

    if (!/^1[3-9]\d{9}$/.test(adminPhone)) {
      setError('请输入正确的手机号')
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          phone: adminPhone, 
          password: adminPassword,
          type: 'admin'
        }),
      })

      const result = await response.json()

      if (result.success) {
        // 管理员跳转到管理端首页
        window.location.href = '/'
      } else {
        setError(result.error || '登录失败')
      }
    } catch (error) {
      console.error('Admin login error:', error)
      setError('网络错误，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  // 教练登录处理
  const handleCoachLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    if (!coachEmail || !coachPassword) {
      setError('请输入邮箱和密码')
      setIsLoading(false)
      return
    }

    try {
      const supabase = createClient()
      
      // 使用 Supabase Auth 登录
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: coachEmail,
        password: coachPassword,
      })

      if (authError) {
        setError(authError.message === 'Invalid login credentials' ? '邮箱或密码错误' : authError.message)
        setIsLoading(false)
        return
      }

      // 检查或创建教练记录
      if (data.user) {
        const { data: coach } = await supabase
          .from('coaches')
          .select('*')
          .eq('auth_id', data.user.id)
          .single()

        if (!coach) {
          // 如果没有教练记录，创建一个
          await supabase
            .from('coaches')
            .insert({
              auth_id: data.user.id,
              email: data.user.email,
              name: data.user.user_metadata?.name || '',
              phone: data.user.user_metadata?.phone || '',
              school: data.user.user_metadata?.school || '',
              role: 'coach'
            })
        }
      }

      // 教练跳转到报名端首页
      window.location.href = '/portal'
      
    } catch (error) {
      console.error('Coach login error:', error)
      setError('登录失败，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">体育比赛报名系统</CardTitle>
          <CardDescription>
            请选择您的身份登录
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <Tabs defaultValue="coach" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="coach">教练登录</TabsTrigger>
              <TabsTrigger value="admin">管理员登录</TabsTrigger>
            </TabsList>

            {/* 教练登录 */}
            <TabsContent value="coach">
              <form onSubmit={handleCoachLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="coach-email">邮箱</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="coach-email"
                      type="email"
                      placeholder="请输入邮箱"
                      value={coachEmail}
                      onChange={(e) => setCoachEmail(e.target.value)}
                      className="pl-10"
                      disabled={isLoading}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="coach-password">密码</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="coach-password"
                      type="password"
                      placeholder="请输入密码"
                      value={coachPassword}
                      onChange={(e) => setCoachPassword(e.target.value)}
                      className="pl-10"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      登录中...
                    </>
                  ) : (
                    '登录'
                  )}
                </Button>

                <p className="text-center text-sm text-gray-600">
                  还没有账号？
                  <Link 
                    href="/auth/register" 
                    className="text-blue-600 hover:text-blue-700 font-medium ml-1"
                  >
                    立即注册
                  </Link>
                </p>
              </form>
            </TabsContent>

            {/* 管理员登录 */}
            <TabsContent value="admin">
              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-phone">手机号</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="admin-phone"
                      type="tel"
                      placeholder="请输入手机号"
                      value={adminPhone}
                      onChange={(e) => setAdminPhone(e.target.value)}
                      className="pl-10"
                      maxLength={11}
                      disabled={isLoading}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="admin-password">密码</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="admin-password"
                      type="password"
                      placeholder="请输入密码"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="pl-10"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      登录中...
                    </>
                  ) : (
                    '登录'
                  )}
                </Button>

                <div className="mt-4 text-center text-sm text-gray-500">
                  <p>测试账号：13800138000</p>
                  <p>测试密码：password</p>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}