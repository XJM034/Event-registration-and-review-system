'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import ProjectTypesTab from '@/components/project-management/project-types-tab'
import ProjectsTab from '@/components/project-management/projects-tab'
import DivisionsTab from '@/components/project-management/divisions-tab'

export default function ProjectManagementPage() {
  const [activeTab, setActiveTab] = useState('types')
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="mx-auto max-w-7xl">
      <Card>
        <CardHeader>
          <CardTitle>赛事项目配置</CardTitle>
          <CardDescription>
            管理赛事类型、具体项目和组别设置。修改后会影响新创建的赛事，现有赛事不受影响。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid h-auto w-full auto-rows-fr grid-cols-1 gap-1 p-1 sm:grid-cols-3">
              <TabsTrigger className="min-h-10 whitespace-normal px-3 text-sm leading-5" value="types">赛事类型</TabsTrigger>
              <TabsTrigger className="min-h-10 whitespace-normal px-3 text-sm leading-5" value="projects">具体项目</TabsTrigger>
              <TabsTrigger className="min-h-10 whitespace-normal px-3 text-sm leading-5" value="divisions">组别设置</TabsTrigger>
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
  )
}
