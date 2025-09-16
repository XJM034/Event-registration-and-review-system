'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function InitPage() {
  const [result, setResult] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)

  const initAdmin = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/init-admin', {
        method: 'POST',
      })
      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({ error: '网络错误', success: false })
    } finally {
      setIsLoading(false)
    }
  }

  const testLogin = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: '13800138000',
          password: 'admin123',
        }),
      })
      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({ error: '网络错误', success: false })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>系统初始化</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={initAdmin} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? '处理中...' : '初始化管理员账户'}
          </Button>
          
          <Button 
            onClick={testLogin} 
            disabled={isLoading}
            variant="outline"
            className="w-full"
          >
            {isLoading ? '测试中...' : '测试登录'}
          </Button>

          {result && (
            <div className="p-4 border rounded-md bg-gray-50">
              <pre className="text-sm">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}