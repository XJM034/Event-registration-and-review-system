import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return Math.min(parsed, max)
}

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession()

    if (!session) {
      return jsonNoStore(
        { success: false, error: '未授权访问' },
        { status: 401 },
      )
    }

    if (session.user.is_super !== true) {
      return jsonNoStore(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      )
    }

    const { searchParams } = new URL(request.url)
    const page = parsePositiveInt(searchParams.get('page'), 1, 10000)
    const pageSize = parsePositiveInt(searchParams.get('pageSize'), 20, 100)
    const action = searchParams.get('action')?.trim() || ''
    const actorType = searchParams.get('actorType')?.trim() || ''
    const result = searchParams.get('result')?.trim() || ''
    const fromDate = searchParams.get('from')?.trim() || ''
    const toDate = searchParams.get('to')?.trim() || ''

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const client = createServiceRoleClient()
    let query = client
      .from('security_audit_logs')
      .select(
        'id, created_at, actor_type, actor_id, actor_role, action, resource_type, resource_id, event_id, registration_id, target_user_id, result, reason, metadata, ip_address, user_agent, request_id',
        { count: 'exact' },
      )

    if (action) {
      query = query.eq('action', action)
    }

    if (actorType) {
      query = query.eq('actor_type', actorType)
    }

    if (result) {
      query = query.eq('result', result)
    }

    if (fromDate) {
      query = query.gte('created_at', fromDate)
    }

    if (toDate) {
      query = query.lte('created_at', toDate)
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      console.error('GET /api/admin/security-audit-logs error:', error)
      return jsonNoStore(
        { success: false, error: '获取审计日志失败' },
        { status: 500 },
      )
    }

    return jsonNoStore({
      success: true,
      data: {
        logs: data || [],
        total: count || 0,
        page,
        pageSize,
      },
    })
  } catch (error) {
    console.error('GET /api/admin/security-audit-logs exception:', error)
    return jsonNoStore(
      { success: false, error: '服务器错误' },
      { status: 500 },
    )
  }
}
