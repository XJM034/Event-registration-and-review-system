'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function TestLoginPage() {
  const [phone, setPhone] = useState('13800138000')
  const [password, setPassword] = useState('admin123')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setResult('正在登录...')
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          phone, 
          password,
          type: 'admin'
        }),
      })

      const data = await response.json()
      
      if (data.success) {
        setResult('登录成功！即将跳转...')
        setTimeout(() => {
          window.location.href = '/'
        }, 1000)
      } else {
        setResult(`登录失败: ${data.error}`)
      }
    } catch (error) {
      setResult(`错误: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>管理员登录测试</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="phone">手机号</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="输入手机号"
            />
          </div>
          
          <div>
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码"
            />
          </div>
          
          <Button 
            onClick={handleLogin}
            disabled={loading}
            className="w-full"
          >
            {loading ? '登录中...' : '登录'}
          </Button>
          
          {result && (
            <div className="p-3 bg-gray-100 rounded text-sm">
              {result}
            </div>
          )}
          
          <div className="text-sm text-gray-500">
            <p>测试账号：13800138000</p>
            <p>测试密码：password</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}