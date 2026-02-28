import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/auth'

// 初始化管理员账户 - 已迁移到 Supabase Auth
// 请使用 docs/sql/create-auth-accounts.sql 创建账号
export async function GET() {
  try {
    const supabase = await createSupabaseServer()

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
          phone: a.phone,
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
