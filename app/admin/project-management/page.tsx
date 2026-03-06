'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { ArrowLeft, Settings2 } from 'lucide-react'
import Link from 'next/link'
import ProjectTypesTab from '@/components/project-management/project-types-tab'
import ProjectsTab from '@/components/project-management/projects-tab'
import DivisionsTab from '@/components/project-management/divisions-tab'

export default function ProjectManagementPage() {
  const [activeTab, setActiveTab] = useState('types')
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/events" className="text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-xl font-semibold text-foreground">项目管理</h1>
            </div>
          </div>
          <div className="self-end sm:self-auto">
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
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
    </div>
  )
}
