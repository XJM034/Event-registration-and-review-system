import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentAdminSession } from '@/lib/auth'
import { validatePasswordStrength } from '@/lib/password-policy'
import { writeSecurityAuditLog } from '@/lib/security-audit-log'

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

// POST - 重置管理员密码
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { password } = body
    const passwordValidation = validatePasswordStrength(typeof password === 'string' ? password : '')

    // 获取当前管理员信息
    const currentAdmin = await getCurrentAdminSession()
    const actorRole = currentAdmin?.user?.is_super === true ? 'super_admin' : 'admin'
    if (!currentAdmin) {
      await writeSecurityAuditLog({
        request,
        action: 'reset_admin_password',
        actorType: 'admin',
        actorRole: 'admin',
        resourceType: 'admin_user',
        resourceId: id,
        targetUserId: id,
        result: 'denied',
        reason: 'unauthorized',
      })
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    // 验证密码
    if (!passwordValidation.valid) {
      await writeSecurityAuditLog({
        request,
        action: 'reset_admin_password',
        actorType: 'admin',
        actorId: currentAdmin.user.id,
        actorRole,
        resourceType: 'admin_user',
        resourceId: id,
        targetUserId: id,
        result: 'failed',
        reason: 'password_policy_violation',
      })
      return NextResponse.json(
        { success: false, error: passwordValidation.message },
        { status: 400 }
      )
    }

    // 获取管理员的 auth_id
    const { data: admin, error: fetchError } = await supabaseAdmin
      .from('admin_users')
      .select('auth_id')
      .eq('id', id)
      .single()

    if (fetchError || !admin) {
      await writeSecurityAuditLog({
        request,
        action: 'reset_admin_password',
        actorType: 'admin',
        actorId: currentAdmin.user.id,
        actorRole,
        resourceType: 'admin_user',
        resourceId: id,
        targetUserId: id,
        result: 'failed',
        reason: 'target_admin_not_found',
      })
      return NextResponse.json(
        { success: false, error: '管理员不存在' },
        { status: 404 }
      )
    }

    if (!admin.auth_id) {
      await writeSecurityAuditLog({
        request,
        action: 'reset_admin_password',
        actorType: 'admin',
        actorId: currentAdmin.user.id,
        actorRole,
        resourceType: 'admin_user',
        resourceId: id,
        targetUserId: id,
        result: 'failed',
        reason: 'target_admin_missing_auth_binding',
      })
      return NextResponse.json(
        { success: false, error: '该管理员没有关联的认证账号' },
        { status: 400 }
      )
    }

    // 使用 Admin API 重置密码
    const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(
      admin.auth_id,
      { password }
    )

    if (resetError) {
      console.error('Error resetting password:', resetError)
      await writeSecurityAuditLog({
        request,
        action: 'reset_admin_password',
        actorType: 'admin',
        actorId: currentAdmin.user.id,
        actorRole,
        resourceType: 'admin_user',
        resourceId: id,
        targetUserId: id,
        result: 'failed',
        reason: 'auth_admin_update_failed',
      })
      return NextResponse.json(
        { success: false, error: '重置密码失败，请稍后重试' },
        { status: 500 }
      )
    }

    await writeSecurityAuditLog({
      request,
      action: 'reset_admin_password',
      actorType: 'admin',
      actorId: currentAdmin.user.id,
      actorRole,
      resourceType: 'admin_user',
      resourceId: id,
      targetUserId: id,
      result: 'success',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in POST /api/admin/admins/[id]/reset-password:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
