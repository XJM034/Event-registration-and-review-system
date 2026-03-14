'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import AdminShell from '@/components/admin/admin-shell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function TabPanelLoading() {
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border bg-card/40">
      <div className="text-sm text-muted-foreground">正在加载模块...</div>
    </div>
  )
}

const CoachesTab = dynamic(() => import('@/components/account-management/coaches-tab'), {
  loading: () => <TabPanelLoading />,
})

const AdminsTab = dynamic(
  () => import('@/components/account-management/admins-tab').then((mod) => mod.AdminsTab),
  {
    loading: () => <TabPanelLoading />,
  }
)

const MyAccountTab = dynamic(() => import('@/components/account-management/my-account-tab'), {
  loading: () => <TabPanelLoading />,
})

export default function AccountManagementPage() {
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
      <AdminShell title="账号管理">
        <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border bg-card/40">
          <div className="text-muted-foreground">加载中...</div>
        </div>
      </AdminShell>
    )
  }

  return (
    <AdminShell title="账号管理">
      <div className="mx-auto max-w-7xl">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-xl sm:text-2xl">账号管理</CardTitle>
            <CardDescription>
              超级管理员可管理教练和管理员账号；普通管理员可维护自己的账号信息和密码。
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList
                className={`grid h-auto w-full auto-rows-fr gap-1 p-1 ${isSuper ? 'grid-cols-1 sm:max-w-xl sm:grid-cols-3' : 'grid-cols-1 sm:max-w-xs'}`}
              >
                {isSuper && <TabsTrigger className="min-h-10 whitespace-normal px-3 text-sm leading-5" value="coaches">教练账号</TabsTrigger>}
                {isSuper && <TabsTrigger className="min-h-10 whitespace-normal px-3 text-sm leading-5" value="admins">管理员账号</TabsTrigger>}
                <TabsTrigger className="min-h-10 whitespace-normal px-3 text-sm leading-5" value="my-account">我的账号</TabsTrigger>
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
    </AdminShell>
  )
}
