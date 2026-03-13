import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession } from '@/lib/auth'
import { writeSecurityAuditLog } from '@/lib/security-audit-log'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

interface RouteParams {
  params: Promise<{ id: string }>
}

const REGISTRATION_DETAIL_COLUMNS =
  'id, event_id, coach_id, team_data, players_data, status, submitted_at, reviewed_at'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...(init?.headers ?? {}),
    },
  })
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()
    const actorRole = session?.user?.is_super === true ? 'super_admin' : 'admin'

    if (!session?.user) {
      await writeSecurityAuditLog({
        request,
        action: 'view_registration_detail',
        actorType: 'admin',
        actorRole: 'admin',
        resourceType: 'registration',
        resourceId: id,
        registrationId: id,
        result: 'denied',
        reason: 'unauthorized',
      })
      return jsonNoStore(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('event_id')

    const supabase = createServiceRoleClient()

    let query = supabase
      .from('registrations')
      .select(REGISTRATION_DETAIL_COLUMNS)
      .eq('id', id)

    if (eventId) {
      query = query.eq('event_id', eventId)
    }

    const { data, error } = await query.single()

    if (error || !data) {
      await writeSecurityAuditLog({
        request,
        action: 'view_registration_detail',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'registration',
        resourceId: id,
        registrationId: id,
        eventId,
        result: 'failed',
        reason: 'registration_not_found',
      })
      return jsonNoStore(
        { error: '报名信息不存在', success: false },
        { status: 404 }
      )
    }

    await writeSecurityAuditLog({
      request,
      action: 'view_registration_detail',
      actorType: 'admin',
      actorId: session.user.id,
      actorRole,
      resourceType: 'registration',
      resourceId: data.id,
      registrationId: data.id,
      eventId: data.event_id || eventId,
      targetUserId: data.coach_id || null,
      result: 'success',
    })

    return jsonNoStore({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Get registration error:', error)
    return jsonNoStore(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
