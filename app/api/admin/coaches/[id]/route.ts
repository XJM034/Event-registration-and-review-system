import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentAdminSession } from '@/lib/auth'

// 创建 Admin Client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function ensureCoachRowDeleted(
  coachId: string,
  options?: {
    client?: typeof supabaseAdmin
    maxAttempts?: number
    retryDelayMs?: number
  }
): Promise<boolean> {
  const client = options?.client ?? supabaseAdmin
  const maxAttempts = options?.maxAttempts ?? 4
  const retryDelayMs = options?.retryDelayMs ?? 120

  // 删除 auth.users 后，coaches 级联删除可能存在短暂延迟；这里主动兜底清理并确认已删除。
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data: coachRow, error: fetchError } = await client
      .from('coaches')
      .select('id')
      .eq('id', coachId)
      .maybeSingle()

    if (fetchError) {
      console.error('检查教练记录是否已删除失败:', fetchError)
      break
    }

    if (!coachRow) {
      return true
    }

    const { error: deleteError } = await client
      .from('coaches')
      .delete()
      .eq('id', coachId)

    if (deleteError) {
      console.error('兜底删除教练记录失败:', deleteError)
      break
    }

    if (retryDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelayMs))
    }
  }

  const { data: remainingRow, error: verifyError } = await client
    .from('coaches')
    .select('id')
    .eq('id', coachId)
    .maybeSingle()

  if (verifyError) {
    console.error('最终校验教练记录是否删除失败:', verifyError)
    return false
  }

  return !remainingRow
}

// PUT - 更新教练信息
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const { name, school, organization, notes } = body

    // 更新 coaches 表
    const { data: coach, error: updateError } = await supabaseAdmin
      .from('coaches')
      .update({
        name,
        school,
        organization,
        notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating coach:', updateError)
      return NextResponse.json(
        { error: '更新教练信息失败', success: false },
        { status: 500 }
      )
    }

    // 同步更新 auth.users 的 user_metadata
    if (coach.auth_id) {
      await supabaseAdmin.auth.admin.updateUserById(coach.auth_id, {
        user_metadata: {
          role: 'coach',
          phone: coach.phone,
          name: name || '',
          school: school || '',
          organization: organization || ''
        }
      })
    }

    return NextResponse.json({
      success: true,
      data: coach
    })
  } catch (error) {
    console.error('PUT /api/admin/coaches/[id] error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// PATCH - 启用/禁用账号
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const { is_active } = body

    // 获取教练的 auth_id
    const { data: coach, error: fetchError } = await supabaseAdmin
      .from('coaches')
      .select('auth_id')
      .eq('id', id)
      .single()

    if (fetchError || !coach) {
      return NextResponse.json(
        { error: '教练不存在', success: false },
        { status: 404 }
      )
    }

    // 更新 coaches 表的 is_active 状态
    const { error: updateError } = await supabaseAdmin
      .from('coaches')
      .update({ is_active })
      .eq('id', id)

    if (updateError) {
      console.error('Error updating coach status:', updateError)
      return NextResponse.json(
        { error: '更新状态失败', success: false },
        { status: 500 }
      )
    }

    // 使用 ban_duration 来启用/禁用账号
    if (coach.auth_id) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        coach.auth_id,
        {
          ban_duration: is_active ? 'none' : '876000h' // 禁用时设置为100年
        }
      )

      if (authError) {
        console.error('Error updating auth user ban status:', authError)
        // 不影响主流程，只记录错误
      }
    }

    return NextResponse.json({
      success: true,
      data: { is_active }
    })
  } catch (error) {
    console.error('PATCH /api/admin/coaches/[id] error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// DELETE - 删除教练账号
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const { id } = await params

    // 获取教练信息
    const { data: coach, error: fetchError } = await supabaseAdmin
      .from('coaches')
      .select('auth_id, phone')
      .eq('id', id)
      .single()

    if (fetchError || !coach) {
      return NextResponse.json(
        { error: '教练不存在', success: false },
        { status: 404 }
      )
    }

    // 检查是否有不可删除的报名记录
    // 不可删除的情况：
    // 1. 状态为 pending/submitted/approved（审核中或已通过）
    // 2. 状态为 rejected 但比赛尚未结束
    const { data: activeRegistrations, error: regError } = await supabaseAdmin
      .from('registrations')
      .select(`
        id,
        status,
        event:events!inner(
          id,
          name,
          end_date
        )
      `)
      .eq('coach_id', id)
      .or('status.in.(pending,submitted,approved)')

    if (regError) {
      console.error('Error checking active registrations:', regError)
    }

    // 检查是否有审核中或已通过的报名
    if (activeRegistrations && activeRegistrations.length > 0) {
      const eventNames = activeRegistrations
        .map((r: any) => r.event?.name)
        .filter(Boolean)
        .join('、')

      return NextResponse.json(
        {
          error: `该教练在以下赛事中有进行中的报名，无法删除：${eventNames}。请等待比赛结束或联系教练取消报名。`,
          success: false
        },
        { status: 400 }
      )
    }

    // 检查已驳回但比赛尚未结束的报名
    const { data: rejectedRegistrations, error: rejError } = await supabaseAdmin
      .from('registrations')
      .select(`
        id,
        status,
        event:events!inner(
          id,
          name,
          end_date
        )
      `)
      .eq('coach_id', id)
      .eq('status', 'rejected')

    if (rejError) {
      console.error('Error checking rejected registrations:', rejError)
    }

    if (rejectedRegistrations && rejectedRegistrations.length > 0) {
      const now = new Date()
      const ongoingRejected = rejectedRegistrations.filter((r: any) => {
        if (!r.event?.end_date) return false
        const endDate = new Date(r.event.end_date)
        return endDate > now
      })

      if (ongoingRejected.length > 0) {
        const eventNames = ongoingRejected
          .map((r: any) => r.event?.name)
          .filter(Boolean)
          .join('、')

        return NextResponse.json(
          {
            error: `该教练在以下赛事中有被驳回的报名且比赛尚未结束，无法删除：${eventNames}。请等待比赛结束。`,
            success: false
          },
          { status: 400 }
        )
      }
    }

    // 删除可以清理的报名记录（草稿、已取消、已驳回且比赛已结束）
    const { error: deleteRegsError } = await supabaseAdmin
      .from('registrations')
      .delete()
      .eq('coach_id', id)
      .in('status', ['draft', 'cancelled'])

    if (deleteRegsError) {
      console.error('Error deleting safe registrations:', deleteRegsError)
      // 不影响主流程，只记录错误
    }

    // 删除已驳回且比赛已结束的报名
    if (rejectedRegistrations && rejectedRegistrations.length > 0) {
      const now = new Date()
      const finishedRejectedIds = rejectedRegistrations
        .filter((r: any) => {
          if (!r.event?.end_date) return true // 没有结束日期的也可以删除
          const endDate = new Date(r.event.end_date)
          return endDate <= now
        })
        .map((r: any) => r.id)

      if (finishedRejectedIds.length > 0) {
        await supabaseAdmin
          .from('registrations')
          .delete()
          .in('id', finishedRejectedIds)
      }
    }

    // 删除 auth.users 记录（会级联删除 coaches 记录）
    if (!coach.auth_id) {
      // 如果没有 auth_id，直接删除 coaches 记录
      const { error: deleteCoachError } = await supabaseAdmin
        .from('coaches')
        .delete()
        .eq('id', id)

      if (deleteCoachError) {
        console.error('删除教练记录失败:', deleteCoachError)
        return NextResponse.json(
          { error: `删除教练记录失败: ${deleteCoachError.message}`, success: false },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: '教练账号已删除'
      })
    }

    // 检查该 auth_id 是否也关联了管理员账号
    const { data: adminUser } = await supabaseAdmin
      .from('admin_users')
      .select('id')
      .eq('auth_id', coach.auth_id)
      .maybeSingle()

    if (adminUser) {
      // 如果该账号也是管理员，检查是否审核过报名
      const { data: reviewedRegs } = await supabaseAdmin
        .from('registrations')
        .select('id')
        .eq('reviewer_id', adminUser.id)
        .limit(1)

      if (reviewedRegs && reviewedRegs.length > 0) {
        return NextResponse.json(
          {
            error: '该账号曾作为管理员审核过报名记录，无法删除。如需删除，请联系系统管理员处理历史数据。',
            success: false
          },
          { status: 400 }
        )
      }
    }

    // 删除 auth.users 记录
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(
      coach.auth_id
    )

    if (authError) {
      console.error('删除认证用户失败:', authError)

      // 如果 auth 用户不存在，直接删除 coaches 记录
      if (authError.message.includes('User not found')) {
        const { error: deleteCoachError } = await supabaseAdmin
          .from('coaches')
          .delete()
          .eq('id', id)

        if (deleteCoachError) {
          console.error('删除教练记录失败:', deleteCoachError)
          return NextResponse.json(
            { error: `删除教练记录失败: ${deleteCoachError.message}`, success: false },
            { status: 500 }
          )
        }

        return NextResponse.json({
          success: true,
          message: '教练账号已删除'
        })
      }

      return NextResponse.json(
        { error: `删除账号失败: ${authError.message}`, success: false },
        { status: 500 }
      )
    }

    const removed = await ensureCoachRowDeleted(id)
    if (!removed) {
      return NextResponse.json(
        { error: '账号删除处理中，请稍后刷新列表确认。', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '教练账号已删除'
    })
  } catch (error) {
    console.error('DELETE /api/admin/coaches/[id] error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
