import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentAdminSession } from '@/lib/auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

function buildPostgrestInFilterValue(values: string[]) {
  const escaped = values.map((value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
  return `(${escaped.join(',')})`
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession()
    if (!session) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 }
      )
    }
    if (session.user.is_super !== true) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { is_active, search = '', school = '' } = body || {}

    if (typeof is_active !== 'boolean') {
      return NextResponse.json(
        { success: false, error: '参数 is_active 必须是布尔值' },
        { status: 400 }
      )
    }

    const { data: adminAuthRows } = await supabaseAdmin
      .from('admin_users')
      .select('auth_id')
      .not('auth_id', 'is', null)
    const adminAuthIds = (adminAuthRows || [])
      .map(row => row.auth_id as string | null)
      .filter((id): id is string => Boolean(id))
    const adminAuthFilter = adminAuthIds.length > 0
      ? buildPostgrestInFilterValue(adminAuthIds)
      : null

    let query = supabaseAdmin
      .from('coaches')
      .select('id, auth_id, phone')

    if (adminAuthFilter) {
      query = query.not('auth_id', 'in', adminAuthFilter)
    }
    if (search) {
      query = query.or(`phone.ilike.%${search}%,name.ilike.%${search}%,school.ilike.%${search}%`)
    }
    if (school) {
      query = query.eq('school', school)
    }

    const { data: targetCoaches, error: fetchError } = await query
    if (fetchError) {
      console.error('Error loading target coaches for batch status update:', fetchError)
      return NextResponse.json(
        { success: false, error: '读取教练账号失败' },
        { status: 500 }
      )
    }

    const coachIds = (targetCoaches || []).map(coach => coach.id)
    if (coachIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          updatedCount: 0,
          authUpdateFailedCount: 0,
        },
      })
    }

    const { error: updateError } = await supabaseAdmin
      .from('coaches')
      .update({
        is_active,
        updated_at: new Date().toISOString(),
      })
      .in('id', coachIds)

    if (updateError) {
      console.error('Error updating coaches status in batch:', updateError)
      return NextResponse.json(
        { success: false, error: '批量更新状态失败' },
        { status: 500 }
      )
    }

    const authIds = (targetCoaches || [])
      .map(coach => coach.auth_id as string | null)
      .filter((id): id is string => Boolean(id))
    let authUpdateFailedCount = 0

    if (authIds.length > 0) {
      const results = await Promise.allSettled(
        authIds.map((authId) =>
          supabaseAdmin.auth.admin.updateUserById(authId, {
            ban_duration: is_active ? 'none' : '876000h',
          })
        )
      )
      authUpdateFailedCount = results.reduce((count, result) => {
        if (result.status === 'rejected') {
          return count + 1
        }
        return result.value.error ? count + 1 : count
      }, 0)
    }

    return NextResponse.json({
      success: true,
      data: {
        updatedCount: coachIds.length,
        authUpdateFailedCount,
      },
    })
  } catch (error) {
    console.error('PATCH /api/admin/coaches/batch-status error:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
