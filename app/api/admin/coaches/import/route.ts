import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { getCurrentAdminSession } from '@/lib/auth'

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

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: '请上传 Excel 文件' },
        { status: 400 }
      )
    }

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      return NextResponse.json(
        { success: false, error: '仅支持 .xlsx 或 .xls 文件' },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const workbook = XLSX.read(Buffer.from(bytes), { type: 'buffer' })
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) {
      return NextResponse.json(
        { success: false, error: 'Excel 中没有可读取的工作表' },
        { status: 400 }
      )
    }

    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(
      workbook.Sheets[firstSheetName],
      { header: 1, raw: false, defval: '' }
    )

    if (rows.length <= 1) {
      return NextResponse.json(
        { success: false, error: 'Excel 内容为空，请至少包含一条数据' },
        { status: 400 }
      )
    }

    const dataRows = rows.slice(1)
    if (dataRows.length > MAX_IMPORT_ROWS) {
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

      const password = phone.slice(-6)
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
          details.push({ row: rowIndex, phone, status: 'failed', reason: authError.message || '创建失败' })
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
            reason: `账号已创建，但资料更新失败: ${updateError.message}`,
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        processedCount,
        createdCount,
        skippedCount,
        failedCount,
        defaultPasswordRule: '默认密码为手机号后 6 位',
        details: details.slice(0, 200),
      },
    })
  } catch (error) {
    console.error('POST /api/admin/coaches/import error:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
