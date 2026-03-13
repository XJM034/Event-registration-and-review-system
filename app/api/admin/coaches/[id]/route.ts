import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentAdminSession } from '@/lib/auth'
import { ensureCoachRowDeleted } from '@/lib/coach-delete-fallback'
import { writeSecurityAuditLog } from '@/lib/security-audit-log'

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

type RegistrationEventSummary = {
  id: string
  event?: {
    name?: string | null
    end_date?: string | null
  } | null
}

// PUT - 更新教练信息
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentAdminSession()
    const { id } = await params
    const actorRole = session?.user?.is_super === true ? 'super_admin' : 'admin'
    if (!session) {
      await writeSecurityAuditLog({
        request,
        action: 'update_coach_account',
        actorType: 'admin',
        actorRole: 'admin',
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'denied',
        reason: 'unauthorized',
      })
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }
    if (session.user.is_super !== true) {
      await writeSecurityAuditLog({
        request,
        action: 'update_coach_account',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'denied',
        reason: 'forbidden',
      })
      return NextResponse.json(
        { error: 'Forbidden', success: false },
        { status: 403 }
      )
    }

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
      await writeSecurityAuditLog({
        request,
        action: 'update_coach_account',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'failed',
        reason: 'coach_update_failed',
        metadata: {
          changed_name: name !== undefined,
          changed_school: school !== undefined,
          changed_organization: organization !== undefined,
          changed_notes: notes !== undefined,
        },
      })
      return NextResponse.json(
        { error: '更新教练信息失败', success: false },
        { status: 500 }
      )
    }

    // 同步更新 auth.users 的 user_metadata
    let authMetadataSyncFailed = false
    if (coach.auth_id) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(coach.auth_id, {
        user_metadata: {
          role: 'coach',
          phone: coach.phone,
          name: name || '',
          school: school || '',
          organization: organization || ''
        }
      })

      if (authError) {
        authMetadataSyncFailed = true
        console.error('Error syncing coach auth metadata:', authError)
      }
    }

    await writeSecurityAuditLog({
      request,
      action: 'update_coach_account',
      actorType: 'admin',
      actorId: session.user.id,
      actorRole,
      resourceType: 'coach',
      resourceId: id,
      targetUserId: id,
      result: 'success',
      metadata: {
        changed_name: name !== undefined,
        changed_school: school !== undefined,
        changed_organization: organization !== undefined,
        changed_notes: notes !== undefined,
        auth_metadata_sync_failed: authMetadataSyncFailed,
      },
    })

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
    const { id } = await params
    const actorRole = session?.user?.is_super === true ? 'super_admin' : 'admin'
    if (!session) {
      await writeSecurityAuditLog({
        request,
        action: 'set_coach_active_status',
        actorType: 'admin',
        actorRole: 'admin',
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'denied',
        reason: 'unauthorized',
      })
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }
    if (session.user.is_super !== true) {
      await writeSecurityAuditLog({
        request,
        action: 'set_coach_active_status',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'denied',
        reason: 'forbidden',
      })
      return NextResponse.json(
        { error: 'Forbidden', success: false },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { is_active } = body

    if (typeof is_active !== 'boolean') {
      await writeSecurityAuditLog({
        request,
        action: 'set_coach_active_status',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'failed',
        reason: 'invalid_is_active',
      })
      return NextResponse.json(
        { error: '参数 is_active 必须是布尔值', success: false },
        { status: 400 }
      )
    }

    // 获取教练的 auth_id
    const { data: coach, error: fetchError } = await supabaseAdmin
      .from('coaches')
      .select('auth_id')
      .eq('id', id)
      .single()

    if (fetchError || !coach) {
      await writeSecurityAuditLog({
        request,
        action: 'set_coach_active_status',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'failed',
        reason: 'target_coach_not_found',
      })
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
      await writeSecurityAuditLog({
        request,
        action: 'set_coach_active_status',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'failed',
        reason: 'coach_status_update_failed',
        metadata: {
          is_active,
        },
      })
      return NextResponse.json(
        { error: '更新状态失败', success: false },
        { status: 500 }
      )
    }

    // 使用 ban_duration 来启用/禁用账号
    let authStatusSyncFailed = false
    if (coach.auth_id) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        coach.auth_id,
        {
          ban_duration: is_active ? 'none' : '876000h' // 禁用时设置为100年
        }
      )

      if (authError) {
        console.error('Error updating auth user ban status:', authError)
        authStatusSyncFailed = true
      }
    }

    await writeSecurityAuditLog({
      request,
      action: 'set_coach_active_status',
      actorType: 'admin',
      actorId: session.user.id,
      actorRole,
      resourceType: 'coach',
      resourceId: id,
      targetUserId: id,
      result: 'success',
      metadata: {
        is_active,
        auth_status_sync_failed: authStatusSyncFailed,
      },
    })

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
    const { id } = await params
    const actorRole = session?.user?.is_super === true ? 'super_admin' : 'admin'
    if (!session) {
      await writeSecurityAuditLog({
        request,
        action: 'delete_coach_account',
        actorType: 'admin',
        actorRole: 'admin',
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'denied',
        reason: 'unauthorized',
      })
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }
    if (session.user.is_super !== true) {
      await writeSecurityAuditLog({
        request,
        action: 'delete_coach_account',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'denied',
        reason: 'forbidden',
      })
      return NextResponse.json(
        { error: 'Forbidden', success: false },
        { status: 403 }
      )
    }

    // 获取教练信息
    const { data: coach, error: fetchError } = await supabaseAdmin
      .from('coaches')
      .select('auth_id, phone')
      .eq('id', id)
      .single()

    if (fetchError || !coach) {
      await writeSecurityAuditLog({
        request,
        action: 'delete_coach_account',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'failed',
        reason: 'target_coach_not_found',
      })
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
      const eventNames = (activeRegistrations as RegistrationEventSummary[])
        .map((r) => r.event?.name)
        .filter(Boolean)
        .join('、')

      await writeSecurityAuditLog({
        request,
        action: 'delete_coach_account',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'failed',
        reason: 'coach_has_active_registrations',
        metadata: {
          active_registration_count: activeRegistrations.length,
        },
      })
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
      const ongoingRejected = (rejectedRegistrations as RegistrationEventSummary[]).filter((r) => {
        if (!r.event?.end_date) return false
        const endDate = new Date(r.event.end_date)
        return endDate > now
      })

      if (ongoingRejected.length > 0) {
        const eventNames = ongoingRejected
          .map((r) => r.event?.name)
          .filter(Boolean)
          .join('、')

        await writeSecurityAuditLog({
          request,
          action: 'delete_coach_account',
          actorType: 'admin',
          actorId: session.user.id,
          actorRole,
          resourceType: 'coach',
          resourceId: id,
          targetUserId: id,
          result: 'failed',
          reason: 'coach_has_ongoing_rejected_registrations',
          metadata: {
            rejected_registration_count: ongoingRejected.length,
          },
        })
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
      const finishedRejectedIds = (rejectedRegistrations as RegistrationEventSummary[])
        .filter((r) => {
          if (!r.event?.end_date) return true // 没有结束日期的也可以删除
          const endDate = new Date(r.event.end_date)
          return endDate <= now
        })
        .map((r) => r.id)

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
        await writeSecurityAuditLog({
          request,
          action: 'delete_coach_account',
          actorType: 'admin',
          actorId: session.user.id,
          actorRole,
          resourceType: 'coach',
          resourceId: id,
          targetUserId: id,
          result: 'failed',
          reason: 'coach_delete_failed',
          metadata: {
            had_auth_binding: false,
          },
        })
        return NextResponse.json(
          { error: '删除账号失败，请稍后重试', success: false },
          { status: 500 }
        )
      }

      await writeSecurityAuditLog({
        request,
        action: 'delete_coach_account',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'success',
        metadata: {
          had_auth_binding: false,
        },
      })

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
        await writeSecurityAuditLog({
          request,
          action: 'delete_coach_account',
          actorType: 'admin',
          actorId: session.user.id,
          actorRole,
          resourceType: 'coach',
          resourceId: id,
          targetUserId: id,
          result: 'failed',
          reason: 'linked_admin_has_review_records',
        })
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
          await writeSecurityAuditLog({
            request,
            action: 'delete_coach_account',
            actorType: 'admin',
            actorId: session.user.id,
            actorRole,
            resourceType: 'coach',
            resourceId: id,
            targetUserId: id,
            result: 'failed',
            reason: 'coach_delete_failed_after_missing_auth_user',
          })
          return NextResponse.json(
            { error: '删除账号失败，请稍后重试', success: false },
            { status: 500 }
          )
        }

        await writeSecurityAuditLog({
          request,
          action: 'delete_coach_account',
          actorType: 'admin',
          actorId: session.user.id,
          actorRole,
          resourceType: 'coach',
          resourceId: id,
          targetUserId: id,
          result: 'success',
          metadata: {
            auth_user_missing: true,
          },
        })

        return NextResponse.json({
          success: true,
          message: '教练账号已删除'
        })
      }

      await writeSecurityAuditLog({
        request,
        action: 'delete_coach_account',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'failed',
        reason: 'auth_coach_delete_failed',
      })
      return NextResponse.json(
        { error: '删除账号失败，请稍后重试', success: false },
        { status: 500 }
      )
    }

    const removed = await ensureCoachRowDeleted(id)
    if (!removed) {
      await writeSecurityAuditLog({
        request,
        action: 'delete_coach_account',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'failed',
        reason: 'coach_delete_verification_failed',
      })
    }
    if (!removed) {
      return NextResponse.json(
        { error: '账号删除处理中，请稍后刷新列表确认。', success: false },
        { status: 500 }
      )
    }

    await writeSecurityAuditLog({
      request,
      action: 'delete_coach_account',
      actorType: 'admin',
      actorId: session.user.id,
      actorRole,
      resourceType: 'coach',
      resourceId: id,
      targetUserId: id,
      result: 'success',
      metadata: {
        had_auth_binding: true,
      },
    })

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
