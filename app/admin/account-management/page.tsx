'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronLeft } from 'lucide-react'
import CoachesTab from '@/components/account-management/coaches-tab'
import { AdminsTab } from '@/components/account-management/admins-tab'
import MyAccountTab from '@/components/account-management/my-account-tab'

export default function AccountManagementPage() {
  const router = useRouter()
  const [isSuper, setIsSuper] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('my-account')

  useEffect(() => {
    checkAdminRole()
  }, [])

  const checkAdminRole = async () => {
    try {
      const tabToken = sessionStorage.getItem('tab_admin_session_token')
      if (tabToken) {
        await fetch('/api/auth/admin-session', {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'x-admin-session-token': tabToken,
          },
        })
      }

      const res = await fetch('/api/admin/current', {
        cache: 'no-store'
      })
      const data = await res.json()
      if (data.success) {
        const isSuperAdmin = data.data.is_super === true
        setIsSuper(isSuperAdmin)
        setActiveTab(isSuperAdmin ? 'coaches' : 'my-account')
      }
    } catch (error) {
      console.error('Error checking admin role:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center space-x-4">
              <Button
                size="sm"
                className="bg-black text-white hover:bg-black/90 hover:text-white"
                onClick={() => router.push('/events')}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                返回
              </Button>
              <CardTitle className="text-2xl">账号管理</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className={`grid w-full ${isSuper ? 'max-w-xl grid-cols-3' : 'max-w-xs grid-cols-1'}`}>
                {isSuper && <TabsTrigger value="coaches">教练账号</TabsTrigger>}
                {isSuper && <TabsTrigger value="admins">管理员账号</TabsTrigger>}
                <TabsTrigger value="my-account">我的账号</TabsTrigger>
              </TabsList>
              {isSuper && (
                <TabsContent value="coaches" className="mt-6">
                  <CoachesTab enabled={activeTab === 'coaches' && isSuper} />
                </TabsContent>
              )}
              {isSuper && (
                <TabsContent value="admins" className="mt-6">
                  <AdminsTab enabled={activeTab === 'admins' && isSuper} />
                </TabsContent>
              )}
              <TabsContent value="my-account" className="mt-6">
                <MyAccountTab />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
