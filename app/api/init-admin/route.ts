import { NextResponse } from 'next/server'
import { createSupabaseServer, hashPassword } from '@/lib/auth'

// 初始化管理员账户 - 用于开发环境
export async function GET() {
  try {
    const supabase = await createSupabaseServer()
    
    // 检查是否已存在管理员
    const { data: existingAdmin } = await supabase
      .from('admin_users')
      .select('id')
      .eq('phone', '13800138000')
      .single()

    if (existingAdmin) {
      return NextResponse.json({
        success: true,
        message: '管理员账户已存在',
        data: {
          phone: '13800138000',
          password: 'admin123'
        }
      })
    }

    // 创建密码哈希
    console.log('Creating password hash for: admin123')
    const passwordHash = await hashPassword('admin123')
    console.log('Generated hash:', passwordHash)
    
    // 插入管理员账户
    const { data: admin, error } = await supabase
      .from('admin_users')
      .insert({
        phone: '13800138000',
        password_hash: passwordHash,
      })
      .select()
      .single()

    if (error) {
      console.error('Create admin error:', error)
      return NextResponse.json(
        { error: '创建管理员账户失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '管理员账户创建成功',
      data: {
        phone: '13800138000',
        password: 'admin123',
        admin_id: admin.id
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