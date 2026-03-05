import { NextResponse } from 'next/server'
import { getCurrentAdminSession } from '@/lib/auth'

// GET - 获取当前登录的管理员信息
export async function GET() {
  try {
    const currentAdmin = await getCurrentAdminSession()

    if (!currentAdmin) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        id: currentAdmin.user.id,
        auth_id: currentAdmin.user.auth_id || null,
        is_super: currentAdmin.user.is_super
      }
    })
  } catch (error) {
    console.error('Error in GET /api/admin/current:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
