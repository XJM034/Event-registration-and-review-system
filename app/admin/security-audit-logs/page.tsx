import { redirect } from 'next/navigation'
import AdminShell from '@/components/admin/admin-shell'
import { Card, CardContent } from '@/components/ui/card'
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
    <AdminShell title="日志查询" forceSuperNavigation>
      <div className="mx-auto max-w-7xl">
        <Card>
          <CardContent>
            <SecurityAuditLogsViewer />
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}
