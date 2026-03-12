import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

function maskPhone(phone?: string | null) {
  const value = String(phone || '').trim()
  if (value.length < 7) return value
  return `${value.slice(0, 3)}****${value.slice(-4)}`
}

// 初始化管理员账户 - 已迁移到 Supabase Auth
// 请使用 docs/sql/create-auth-accounts.sql 创建账号
export async function GET() {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Not Found', success: false },
        { status: 404 }
      )
    }

    const supabase = createServiceRoleClient()

    // 检查是否已存在管理员
    const { data: admins } = await supabase
      .from('admin_users')
      .select('phone, is_super')
      .order('created_at')

    return NextResponse.json({
      success: true,
      message: '管理员账号已迁移到 Supabase Auth，请使用 SQL 脚本创建账号',
      data: {
        existing_admins: admins?.map(a => ({
          phone: maskPhone(a.phone),
          is_super: a.is_super
        })) || []
      }
    })
  } catch (error) {
    console.error('Init admin API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
