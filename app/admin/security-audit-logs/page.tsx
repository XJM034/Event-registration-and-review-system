import { redirect } from 'next/navigation'
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
      <SecurityAuditLogsViewer />
    </div>
  )
}
