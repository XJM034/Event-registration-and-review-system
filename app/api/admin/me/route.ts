import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentAdminSession } from '@/lib/auth'
import { validatePasswordStrength } from '@/lib/password-policy'
import { writeSecurityAuditLog } from '@/lib/security-audit-log'

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

// GET - 获取当前管理员信息
export async function GET() {
  try {
    const currentAdmin = await getCurrentAdminSession()
    if (!currentAdmin) {
      return jsonNoStore(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    const { data: admin, error } = await supabaseAdmin
      .from('admin_users')
      .select('id, phone, name, email, is_super, auth_id')
      .eq('id', currentAdmin.user.id)
      .single()

    if (error || !admin) {
      return jsonNoStore(
        { success: false, error: '管理员不存在' },
        { status: 404 }
      )
    }

    return jsonNoStore({ success: true, data: admin })
  } catch (error) {
    console.error('Error in GET /api/admin/me:', error)
    return jsonNoStore(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// PUT - 修改当前管理员密码
export async function PUT(request: NextRequest) {
  try {
    const currentAdmin = await getCurrentAdminSession()
    if (!currentAdmin) {
      await writeSecurityAuditLog({
        request,
        action: 'change_own_admin_password',
        actorType: 'admin',
        actorRole: 'admin',
        resourceType: 'admin_user',
        result: 'denied',
        reason: 'unauthorized',
      })
      return jsonNoStore(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const password = typeof body?.password === 'string' ? body.password.trim() : ''
    const passwordValidation = validatePasswordStrength(password)

    if (!passwordValidation.valid) {
      await writeSecurityAuditLog({
        request,
        action: 'change_own_admin_password',
        actorType: 'admin',
        actorId: currentAdmin.user.id,
        actorRole: currentAdmin.user.is_super === true ? 'super_admin' : 'admin',
        resourceType: 'admin_user',
        resourceId: currentAdmin.user.id,
        targetUserId: currentAdmin.user.id,
        result: 'failed',
        reason: 'password_policy_violation',
      })
      return jsonNoStore(
        { success: false, error: passwordValidation.message },
        { status: 400 }
      )
    }

    const { data: admin, error: adminError } = await supabaseAdmin
      .from('admin_users')
      .select('auth_id')
      .eq('id', currentAdmin.user.id)
      .single()

    if (adminError || !admin) {
      await writeSecurityAuditLog({
        request,
        action: 'change_own_admin_password',
        actorType: 'admin',
        actorId: currentAdmin.user.id,
        actorRole: currentAdmin.user.is_super === true ? 'super_admin' : 'admin',
        resourceType: 'admin_user',
        resourceId: currentAdmin.user.id,
        targetUserId: currentAdmin.user.id,
        result: 'failed',
        reason: 'admin_profile_not_found',
      })
      return jsonNoStore(
        { success: false, error: '管理员不存在' },
        { status: 404 }
      )
    }

    if (!admin.auth_id) {
      await writeSecurityAuditLog({
        request,
        action: 'change_own_admin_password',
        actorType: 'admin',
        actorId: currentAdmin.user.id,
        actorRole: currentAdmin.user.is_super === true ? 'super_admin' : 'admin',
        resourceType: 'admin_user',
        resourceId: currentAdmin.user.id,
        targetUserId: currentAdmin.user.id,
        result: 'failed',
        reason: 'admin_auth_binding_missing',
      })
      return jsonNoStore(
        { success: false, error: '当前管理员未关联认证账号' },
        { status: 400 }
      )
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      admin.auth_id,
      { password }
    )

    if (updateError) {
      console.error('Error in PUT /api/admin/me (update password):', updateError)
      await writeSecurityAuditLog({
        request,
        action: 'change_own_admin_password',
        actorType: 'admin',
        actorId: currentAdmin.user.id,
        actorRole: currentAdmin.user.is_super === true ? 'super_admin' : 'admin',
        resourceType: 'admin_user',
        resourceId: currentAdmin.user.id,
        targetUserId: currentAdmin.user.id,
        result: 'failed',
        reason: 'auth_password_update_failed',
      })
      return jsonNoStore(
        { success: false, error: '修改密码失败，请稍后重试' },
        { status: 500 }
      )
    }

    await writeSecurityAuditLog({
      request,
      action: 'change_own_admin_password',
      actorType: 'admin',
      actorId: currentAdmin.user.id,
      actorRole: currentAdmin.user.is_super === true ? 'super_admin' : 'admin',
      resourceType: 'admin_user',
      resourceId: currentAdmin.user.id,
      targetUserId: currentAdmin.user.id,
      result: 'success',
    })

    return jsonNoStore({ success: true })
  } catch (error) {
    console.error('Error in PUT /api/admin/me:', error)
    return jsonNoStore(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
