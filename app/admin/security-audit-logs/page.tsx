import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Shield } from 'lucide-react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import SecurityAuditLogsViewer from '@/components/security/security-audit-logs-viewer'
import { getCurrentAdminSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SecurityAuditLogsPage() {
  const session = await getCurrentAdminSession()

  if (!session) {
    redirect('/auth/login')
  }

  if (session.user.is_super !== true) {
    redirect('/events')
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/events" className="text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-xl font-semibold text-foreground">安全审计</h1>
            </div>
          </div>
          <div className="self-end sm:self-auto">
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
        <Card>
          <CardHeader>
            <CardTitle>审计日志查询</CardTitle>
            <CardDescription>
              面向超级管理员的只读入口，用于排查登录、权限、导出、公开分享等关键安全操作。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SecurityAuditLogsViewer />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
