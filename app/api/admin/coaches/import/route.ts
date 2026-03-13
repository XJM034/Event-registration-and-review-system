import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentAdminSession } from '@/lib/auth'
import { readFirstWorksheetRows } from '@/lib/excel-workbook'
import { buildImportedCoachPassword, IMPORTED_COACH_PASSWORD_RULE } from '@/lib/password-policy'
import { writeSecurityAuditLog } from '@/lib/security-audit-log'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

const MAX_IMPORT_ROWS = 1000

function validatePhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone)
}

function asText(value: unknown): string {
  return String(value ?? '').trim()
}

function isDuplicateUserError(message: string): boolean {
  const text = message.toLowerCase()
  return (
    text.includes('already') ||
    text.includes('duplicate') ||
    text.includes('registered') ||
    text.includes('exists') ||
    text.includes('unique')
  )
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession()
    if (!session) {
      await writeSecurityAuditLog({
        request,
        action: 'import_coach_accounts',
        actorType: 'admin',
        actorRole: 'admin',
        resourceType: 'coach_import',
        result: 'denied',
        reason: 'unauthorized',
      })
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 }
      )
    }

    if (session.user.is_super !== true) {
      await writeSecurityAuditLog({
        request,
        action: 'import_coach_accounts',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole: 'admin',
        resourceType: 'coach_import',
        result: 'denied',
        reason: 'forbidden',
      })
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      await writeSecurityAuditLog({
        request,
        action: 'import_coach_accounts',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole: 'super_admin',
        resourceType: 'coach_import',
        result: 'failed',
        reason: 'missing_import_file',
      })
      return NextResponse.json(
        { success: false, error: '请上传 Excel 文件' },
        { status: 400 }
      )
    }

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.xlsx')) {
      await writeSecurityAuditLog({
        request,
        action: 'import_coach_accounts',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole: 'super_admin',
        resourceType: 'coach_import',
        result: 'failed',
        reason: 'invalid_import_file_type',
        metadata: {
          file_name: file.name,
        },
      })
      return NextResponse.json(
        { success: false, error: '仅支持 .xlsx 文件' },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const { sheetName: firstSheetName, rows } = await readFirstWorksheetRows(bytes, 4)
    if (!firstSheetName) {
      await writeSecurityAuditLog({
        request,
        action: 'import_coach_accounts',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole: 'super_admin',
        resourceType: 'coach_import',
        result: 'failed',
        reason: 'import_sheet_missing',
        metadata: {
          file_name: file.name,
        },
      })
      return NextResponse.json(
        { success: false, error: 'Excel 中没有可读取的工作表' },
        { status: 400 }
      )
    }

    if (rows.length <= 1) {
      await writeSecurityAuditLog({
        request,
        action: 'import_coach_accounts',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole: 'super_admin',
        resourceType: 'coach_import',
        result: 'failed',
        reason: 'import_rows_empty',
        metadata: {
          file_name: file.name,
        },
      })
      return NextResponse.json(
        { success: false, error: 'Excel 内容为空，请至少包含一条数据' },
        { status: 400 }
      )
    }

    const dataRows = rows.slice(1)
    if (dataRows.length > MAX_IMPORT_ROWS) {
      await writeSecurityAuditLog({
        request,
        action: 'import_coach_accounts',
        actorType: 'admin',
        actorId: session.user.id,
        actorRole: 'super_admin',
        resourceType: 'coach_import',
        result: 'failed',
        reason: 'import_row_limit_exceeded',
        metadata: {
          row_count: dataRows.length,
        },
      })
      return NextResponse.json(
        { success: false, error: `单次最多导入 ${MAX_IMPORT_ROWS} 条数据` },
        { status: 400 }
      )
    }

    let createdCount = 0
    let skippedCount = 0
    let failedCount = 0
    let processedCount = 0
    const details: Array<{ row: number; phone: string; status: 'created' | 'skipped' | 'failed'; reason?: string }> = []
    const createdProfiles: Array<{ authId: string; phone: string; row: number; name: string; school: string; notes: string }> = []

    for (let i = 0; i < dataRows.length; i += 1) {
      const rowIndex = i + 2
      const row = dataRows[i] || []
      const phone = asText(row[0])
      const name = asText(row[1])
      const school = asText(row[2])
      const notes = asText(row[3])

      if (!phone && !name && !school && !notes) {
        continue
      }

      processedCount += 1

      if (!phone) {
        failedCount += 1
        details.push({ row: rowIndex, phone: '', status: 'failed', reason: '手机号不能为空' })
        continue
      }

      if (!validatePhone(phone)) {
        failedCount += 1
        details.push({ row: rowIndex, phone, status: 'failed', reason: '手机号格式错误' })
        continue
      }

      const password = buildImportedCoachPassword(phone)
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: `${phone}@system.local`,
        password,
        email_confirm: true,
        user_metadata: {
          role: 'coach',
          phone,
          name: name || '',
          school: school || '',
          organization: '',
        },
      })

      if (authError) {
        if (isDuplicateUserError(authError.message || '')) {
          skippedCount += 1
          details.push({ row: rowIndex, phone, status: 'skipped', reason: '该手机号已存在，已跳过' })
        } else {
          failedCount += 1
          details.push({ row: rowIndex, phone, status: 'failed', reason: '创建账号失败，请稍后重试' })
        }
        continue
      }

      if (!authUser.user?.id) {
        failedCount += 1
        details.push({ row: rowIndex, phone, status: 'failed', reason: '创建账号返回异常' })
        continue
      }

      createdCount += 1
      details.push({ row: rowIndex, phone, status: 'created' })
      createdProfiles.push({
        authId: authUser.user.id,
        phone,
        row: rowIndex,
        name,
        school,
        notes,
      })
    }

    if (createdProfiles.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 600))
      for (const profile of createdProfiles) {
        const { error: updateError } = await supabaseAdmin
          .from('coaches')
          .update({
            created_by: session.user.id,
            name: profile.name || null,
            school: profile.school || null,
            notes: profile.notes || null,
          })
          .eq('auth_id', profile.authId)

        if (updateError) {
          details.push({
            row: profile.row,
            phone: profile.phone,
            status: 'created',
            reason: '账号已创建，但资料更新失败，请稍后核对教练资料',
          })
        }
      }
    }

    await writeSecurityAuditLog({
      request,
      action: 'import_coach_accounts',
      actorType: 'admin',
      actorId: session.user.id,
      actorRole: 'super_admin',
      resourceType: 'coach_import',
      result: 'success',
      metadata: {
        processed_count: processedCount,
        created_count: createdCount,
        skipped_count: skippedCount,
        failed_count: failedCount,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        processedCount,
        createdCount,
        skippedCount,
        failedCount,
        defaultPasswordRule: IMPORTED_COACH_PASSWORD_RULE,
        details: details.slice(0, 200),
      },
    })
  } catch (error) {
    console.error('POST /api/admin/coaches/import error:', error)
    const session = await getCurrentAdminSession().catch(() => null)
    await writeSecurityAuditLog({
      request,
      action: 'import_coach_accounts',
      actorType: 'admin',
      actorId: session?.user?.id ?? null,
      actorRole: session?.user?.is_super === true ? 'super_admin' : 'admin',
      resourceType: 'coach_import',
      result: 'failed',
      reason: 'unhandled_exception',
    })
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
