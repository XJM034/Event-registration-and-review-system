import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer, getCurrentCoachSession } from '@/lib/auth'
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

export async function PUT(request: NextRequest) {
  try {
    const currentCoach = await getCurrentCoachSession()

    if (!currentCoach) {
      await writeSecurityAuditLog({
        request,
        action: 'change_own_coach_password',
        actorType: 'coach',
        actorRole: 'coach',
        resourceType: 'coach_account',
        result: 'denied',
        reason: 'unauthorized',
      })

      return jsonNoStore(
        { success: false, error: '未授权' },
        { status: 401 },
      )
    }

    const body = await request.json()
    const password = typeof body?.password === 'string' ? body.password.trim() : ''
    const passwordValidation = validatePasswordStrength(password)

    if (!passwordValidation.valid) {
      await writeSecurityAuditLog({
        request,
        action: 'change_own_coach_password',
        actorType: 'coach',
        actorId: currentCoach.user.id,
        actorRole: 'coach',
        resourceType: 'coach_account',
        resourceId: currentCoach.user.id,
        targetUserId: currentCoach.session.user.id,
        result: 'failed',
        reason: 'password_policy_violation',
      })

      return jsonNoStore(
        { success: false, error: passwordValidation.message },
        { status: 400 },
      )
    }

    const supabase = await createSupabaseServer()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      console.error('PUT /api/portal/me/password error:', updateError)
      await writeSecurityAuditLog({
        request,
        action: 'change_own_coach_password',
        actorType: 'coach',
        actorId: currentCoach.user.id,
        actorRole: 'coach',
        resourceType: 'coach_account',
        resourceId: currentCoach.user.id,
        targetUserId: currentCoach.session.user.id,
        result: 'failed',
        reason: 'auth_password_update_failed',
      })

      return jsonNoStore(
        { success: false, error: '修改密码失败，请稍后重试' },
        { status: 500 },
      )
    }

    await writeSecurityAuditLog({
      request,
      action: 'change_own_coach_password',
      actorType: 'coach',
      actorId: currentCoach.user.id,
      actorRole: 'coach',
      resourceType: 'coach_account',
      resourceId: currentCoach.user.id,
      targetUserId: currentCoach.session.user.id,
      result: 'success',
    })

    return jsonNoStore({ success: true })
  } catch (error) {
    console.error('PUT /api/portal/me/password exception:', error)
    return jsonNoStore(
      { success: false, error: '服务器错误' },
      { status: 500 },
    )
  }
}
