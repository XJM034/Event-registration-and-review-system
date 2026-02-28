'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Settings2 } from 'lucide-react'
import Link from 'next/link'
import ProjectTypesTab from '@/components/project-management/project-types-tab'
import ProjectsTab from '@/components/project-management/projects-tab'
import DivisionsTab from '@/components/project-management/divisions-tab'

export default function ProjectManagementPage() {
  const [activeTab, setActiveTab] = useState('types')
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/events" className="text-blue-600 hover:text-blue-700">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center space-x-2">
              <Settings2 className="h-5 w-5 text-gray-600" />
              <h1 className="text-xl font-semibold text-gray-900">项目管理</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle>赛事项目配置</CardTitle>
            <CardDescription>
              管理赛事类型、具体项目和组别设置。修改后会影响新创建的赛事，现有赛事不受影响。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="types">赛事类型</TabsTrigger>
                <TabsTrigger value="projects">具体项目</TabsTrigger>
                <TabsTrigger value="divisions">组别设置</TabsTrigger>
              </TabsList>

              <TabsContent value="types">
                <ProjectTypesTab onUpdate={() => setRefreshKey(k => k + 1)} />
              </TabsContent>

              <TabsContent value="projects">
                <ProjectsTab refreshKey={refreshKey} onUpdate={() => setRefreshKey(k => k + 1)} />
              </TabsContent>

              <TabsContent value="divisions">
                <DivisionsTab refreshKey={refreshKey} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
