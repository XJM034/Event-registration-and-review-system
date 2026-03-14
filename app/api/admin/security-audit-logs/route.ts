import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession } from '@/lib/auth'
import { getAuditScopeActions } from '@/lib/security-audit-log-view'
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

type RawAuditLog = {
  id: string
  created_at: string
  actor_type: string | null
  actor_id: string | null
  actor_role: string | null
  action: string | null
  resource_type: string | null
  resource_id: string | null
  event_id: string | null
  registration_id: string | null
  target_user_id: string | null
  result: string | null
  reason: string | null
  metadata: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  request_id: string | null
}

type DirectoryRecord = {
  id: string
  auth_id?: string | null
  name?: string | null
  phone?: string | null
}

type EventRecord = {
  id: string
  name?: string | null
  short_name?: string | null
}

type RegistrationRecord = {
  id: string
  event_id?: string | null
  team_data?: Record<string, unknown> | null
}

function collectUniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))))
}

function getRegistrationLookupId(log: RawAuditLog) {
  if (log.registration_id) {
    return log.registration_id
  }

  if (log.resource_type === 'registration' && log.resource_id) {
    return log.resource_id
  }

  return null
}

function extractTeamName(teamData: Record<string, unknown> | null | undefined) {
  if (!teamData || typeof teamData !== 'object') {
    return null
  }

  const candidates = [
    teamData.name,
    teamData.team_name,
    teamData['队伍名称'],
    teamData['团队名称'],
    teamData['队名'],
  ]

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

async function loadDirectoryIndex(client: ReturnType<typeof createServiceRoleClient>, ids: string[]) {
  const index = new Map<string, { name: string | null; phone: string | null }>()

  if (ids.length === 0) {
    return index
  }

  const loadRecords = async (table: 'admin_users' | 'coaches', column: 'id' | 'auth_id') => {
    const { data, error } = await client
      .from(table)
      .select('id, auth_id, name, phone')
      .in(column, ids)

    if (error) {
      console.warn(`Load ${table} by ${column} failed:`, error)
      return [] as DirectoryRecord[]
    }

    return Array.isArray(data) ? (data as DirectoryRecord[]) : []
  }

  const [adminsById, adminsByAuthId, coachesById, coachesByAuthId] = await Promise.all([
    loadRecords('admin_users', 'id'),
    loadRecords('admin_users', 'auth_id'),
    loadRecords('coaches', 'id'),
    loadRecords('coaches', 'auth_id'),
  ])

  const allRecords = [...adminsById, ...adminsByAuthId, ...coachesById, ...coachesByAuthId]

  for (const record of allRecords) {
    const entry = {
      name: typeof record.name === 'string' ? record.name : null,
      phone: typeof record.phone === 'string' ? record.phone : null,
    }

    if (record.id) {
      index.set(record.id, entry)
    }

    if (record.auth_id) {
      index.set(record.auth_id, entry)
    }
  }

  return index
}

async function loadEventIndex(client: ReturnType<typeof createServiceRoleClient>, eventIds: string[]) {
  const index = new Map<string, string>()

  if (eventIds.length === 0) {
    return index
  }

  const { data, error } = await client
    .from('events')
    .select('id, name, short_name')
    .in('id', eventIds)

  if (error) {
    console.warn('Load events for audit logs failed:', error)
    return index
  }

  for (const record of (Array.isArray(data) ? data : []) as EventRecord[]) {
    const label = (typeof record.short_name === 'string' && record.short_name.trim())
      ? record.short_name.trim()
      : typeof record.name === 'string'
        ? record.name.trim()
        : ''

    if (record.id && label) {
      index.set(record.id, label)
    }
  }

  return index
}

async function loadRegistrationIndex(client: ReturnType<typeof createServiceRoleClient>, registrationIds: string[]) {
  const index = new Map<string, { registrationName: string | null; eventId: string | null }>()

  if (registrationIds.length === 0) {
    return index
  }

  const { data, error } = await client
    .from('registrations')
    .select('id, event_id, team_data')
    .in('id', registrationIds)

  if (error) {
    console.warn('Load registrations for audit logs failed:', error)
    return index
  }

  for (const record of (Array.isArray(data) ? data : []) as RegistrationRecord[]) {
    index.set(record.id, {
      registrationName: extractTeamName(record.team_data),
      eventId: typeof record.event_id === 'string' ? record.event_id : null,
    })
  }

  return index
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
    const scope = searchParams.get('scope')?.trim() || ''
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

    if (action === 'account_login') {
      query = query.in('action', ['login', 'create_admin_session'])
    } else if (action) {
      query = query.eq('action', action)
    } else {
      const scopedActions = getAuditScopeActions(scope || 'critical')
      if (scopedActions && scopedActions.length > 0) {
        query = query.in('action', scopedActions)
      } else {
        query = query
          .neq('action', 'login')
          .neq('action', 'create_admin_session')
      }
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

    const logs = Array.isArray(data) ? (data as RawAuditLog[]) : []
    const directoryIds = collectUniqueValues(
      logs.flatMap((log) => [log.actor_id, log.target_user_id]),
    )
    const registrationIds = collectUniqueValues(
      logs.map((log) => getRegistrationLookupId(log)),
    )
    const directEventIds = collectUniqueValues(logs.map((log) => log.event_id))

    const [directoryIndex, registrationIndex] = await Promise.all([
      loadDirectoryIndex(client, directoryIds),
      loadRegistrationIndex(client, registrationIds),
    ])
    const eventIds = collectUniqueValues([
      ...directEventIds,
      ...Array.from(registrationIndex.values()).map((entry) => entry.eventId),
    ])
    const eventIndex = await loadEventIndex(client, eventIds)

    const enrichedLogs = logs.map((log) => {
      const actor = log.actor_id ? directoryIndex.get(log.actor_id) : null
      const target = log.target_user_id ? directoryIndex.get(log.target_user_id) : null
      const registrationInfo = getRegistrationLookupId(log)
        ? registrationIndex.get(getRegistrationLookupId(log)!)
        : null
      const eventName = (log.event_id && eventIndex.get(log.event_id))
        || (registrationInfo?.eventId ? eventIndex.get(registrationInfo.eventId) : null)
        || null

      return {
        ...log,
        actor_name: actor?.name || null,
        actor_phone: actor?.phone || null,
        target_user_name: target?.name || null,
        target_user_phone: target?.phone || null,
        registration_name: registrationInfo?.registrationName || null,
        event_name: eventName,
      }
    })

    return jsonNoStore({
      success: true,
      data: {
        logs: enrichedLogs,
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
