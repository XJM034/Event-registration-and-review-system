import { redirect } from 'next/navigation'
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
    <div className="mx-auto max-w-7xl">
      <Card>
        <CardContent className="p-4 sm:p-6">
          <SecurityAuditLogsViewer />
        </CardContent>
      </Card>
    </div>
  )
}
