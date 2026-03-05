import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentAdminSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 创建 Admin Client（使用 Service Role Key）
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

// 验证手机号格式
function validatePhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone)
}

function buildPostgrestInFilterValue(values: string[]) {
  const escaped = values.map((value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
  return `(${escaped.join(',')})`
}

// 检查手机号是否已存在
async function checkPhoneExists(phone: string): Promise<boolean> {
  const email = `${phone}@system.local`
  const { data, error } = await supabaseAdmin.auth.admin.listUsers()

  if (error) {
    console.error('Error checking phone existence:', error)
    return false
  }

  return data.users.some(u => u.email === email)
}

// GET - 获取教练列表
export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const session = await getCurrentAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        {
          status: 401,
          headers: { 'Cache-Control': 'no-store, max-age=0' }
        }
      )
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const school = searchParams.get('school') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    // 排除与管理员账号共用 auth_id 的异常教练数据（历史脏数据保护）
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

    // 构建查询
    let query = supabaseAdmin
      .from('coaches')
      .select('*, created_by_admin:admin_users!created_by(phone)', { count: 'exact' })

    if (adminAuthFilter) {
      query = query.not('auth_id', 'in', adminAuthFilter)
    }

    // 搜索过滤
    if (search) {
      query = query.or(`phone.ilike.%${search}%,name.ilike.%${search}%,school.ilike.%${search}%`)
    }
    if (school) {
      query = query.eq('school', school)
    }

    // 分页
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to).order('created_at', { ascending: false })

    const { data: coaches, error, count } = await query
    let schoolOptions: string[] = []

    let schoolOptionsQuery = supabaseAdmin
      .from('coaches')
      .select('school')
      .not('school', 'is', null)
      .neq('school', '')

    if (adminAuthFilter) {
      schoolOptionsQuery = schoolOptionsQuery.not('auth_id', 'in', adminAuthFilter)
    }
    const { data: schoolRows, error: schoolOptionsError } = await schoolOptionsQuery
    if (schoolOptionsError) {
      console.error('Error fetching school options:', schoolOptionsError)
    } else {
      schoolOptions = Array.from(
        new Set(
          (schoolRows || [])
            .map(row => row.school?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ).sort((a, b) => a.localeCompare(b, 'zh-CN'))
    }

    if (schoolOptions.length === 0) {
      schoolOptions = Array.from(
        new Set(
          (coaches || [])
            .map(row => row.school?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ).sort((a, b) => a.localeCompare(b, 'zh-CN'))
    }

    if (error) {
      console.error('Error fetching coaches:', error)
      return NextResponse.json(
        { error: '获取教练列表失败', success: false },
        {
          status: 500,
          headers: { 'Cache-Control': 'no-store, max-age=0' }
        }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          coaches: coaches || [],
          schoolOptions,
          total: count || 0,
          page,
          pageSize
        }
      },
      {
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      }
    )
  } catch (error) {
    console.error('GET /api/admin/coaches error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      }
    )
  }
}

// POST - 创建教练账号
export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const session = await getCurrentAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { phone, password, name, school, organization, notes } = body
    const normalizedOrganization = typeof organization === 'string' ? organization.trim() : ''
    const normalizedNotes = typeof notes === 'string' ? notes.trim() : ''

    // 验证必填字段
    if (!phone || !password) {
      return NextResponse.json(
        { error: '手机号和密码为必填项', success: false },
        { status: 400 }
      )
    }

    // 验证手机号格式
    if (!validatePhone(phone)) {
      return NextResponse.json(
        { error: '手机号格式不正确，请输入11位手机号', success: false },
        { status: 400 }
      )
    }

    // 验证密码长度
    if (password.length < 6) {
      return NextResponse.json(
        { error: '密码长度至少为6位', success: false },
        { status: 400 }
      )
    }

    // 检查手机号是否已存在
    const exists = await checkPhoneExists(phone)
    if (exists) {
      return NextResponse.json(
        { error: '该手机号已被注册', success: false },
        { status: 400 }
      )
    }

    // 使用 Admin API 创建用户
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: `${phone}@system.local`,
      password: password,
      email_confirm: true, // 跳过邮箱验证
      user_metadata: {
        role: 'coach',
        phone: phone,
        name: name || '',
        school: school || '',
        organization: normalizedOrganization
      }
    })

    if (authError) {
      console.error('Error creating auth user:', authError)
      return NextResponse.json(
        { error: `创建账号失败: ${authError.message}`, success: false },
        { status: 500 }
      )
    }

    // 等待触发器创建 coaches 记录，然后更新 created_by
    await new Promise(resolve => setTimeout(resolve, 500))

    // 更新 coaches 表的 created_by 字段
    const { error: updateError } = await supabaseAdmin
      .from('coaches')
      .update({
        created_by: session.user.id,
        organization: normalizedOrganization,
        notes: normalizedNotes || null,
      })
      .eq('auth_id', authUser.user.id)

    if (updateError) {
      console.error('Error updating created_by:', updateError)
      // 不影响主流程，只记录错误
    }

    // 获取完整的 coach 信息
    const { data: coach } = await supabaseAdmin
      .from('coaches')
      .select('*')
      .eq('auth_id', authUser.user.id)
      .single()

    return NextResponse.json({
      success: true,
      data: {
        user: authUser.user,
        coach: coach
      }
    })
  } catch (error) {
    console.error('POST /api/admin/coaches error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
