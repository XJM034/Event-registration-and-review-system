import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentAdminSession } from '@/lib/auth'
import { validatePasswordStrength } from '@/lib/password-policy'
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

// POST - 重置教练密码
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentAdminSession()
    const actorRole = session?.user?.is_super === true ? 'super_admin' : 'admin'
    if (!session) {
      const { id } = await params
      await writeSecurityAuditLog({
        request,
        action: 'reset_coach_password',
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

    const { id } = await params
    const body = await request.json()
    const { password } = body
    const passwordValidation = validatePasswordStrength(typeof password === 'string' ? password : '')

    // 验证密码
    if (!passwordValidation.valid) {
      await writeSecurityAuditLog({
        request,
        action: 'reset_coach_password',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'failed',
        reason: 'password_policy_violation',
      })
      return NextResponse.json(
        { error: passwordValidation.message, success: false },
        { status: 400 }
      )
    }

    // 获取教练的 auth_id
    const { data: coach, error: fetchError } = await supabaseAdmin
      .from('coaches')
      .select('auth_id, phone')
      .eq('id', id)
      .single()

    if (fetchError || !coach) {
      await writeSecurityAuditLog({
        request,
        action: 'reset_coach_password',
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

    if (!coach.auth_id) {
      await writeSecurityAuditLog({
        request,
        action: 'reset_coach_password',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'failed',
        reason: 'target_coach_missing_auth_binding',
      })
      return NextResponse.json(
        { error: '该教练没有关联的认证账号', success: false },
        { status: 400 }
      )
    }

    // 使用 Admin API 重置密码
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      coach.auth_id,
      { password }
    )

    if (authError) {
      console.error('Error resetting password:', authError)
      await writeSecurityAuditLog({
        request,
        action: 'reset_coach_password',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole,
        resourceType: 'coach',
        resourceId: id,
        targetUserId: id,
        result: 'failed',
        reason: 'auth_admin_update_failed',
      })
      return NextResponse.json(
        { error: '重置密码失败，请稍后重试', success: false },
        { status: 500 }
      )
    }

    await writeSecurityAuditLog({
      request,
      action: 'reset_coach_password',
      actorType: 'admin',
      actorId: session.user.id,
      actorRole,
      resourceType: 'coach',
      resourceId: id,
      targetUserId: id,
      result: 'success',
    })

    return NextResponse.json({
      success: true,
      message: '密码重置成功'
    })
  } catch (error) {
    console.error('POST /api/admin/coaches/[id]/reset-password error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
