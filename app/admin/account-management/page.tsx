'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ThemeSwitcher } from '@/components/theme-switcher'
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push('/events')}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  返回
                </Button>
                <CardTitle className="text-xl sm:text-2xl">账号管理</CardTitle>
              </div>
              <div className="self-end sm:self-auto">
                <ThemeSwitcher />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList
                className={`grid w-full gap-1 ${isSuper ? 'grid-cols-1 sm:max-w-xl sm:grid-cols-3' : 'max-w-xs grid-cols-1'}`}
              >
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
