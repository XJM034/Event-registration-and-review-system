import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  try {
    const cookieStore = await cookies()
    
    // 清除会话 cookie
    cookieStore.delete('admin-session')

    return NextResponse.json({
      success: true,
      message: '已成功退出登录',
    })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: '退出登录失败', success: false },
      { status: 500 }
    )
  }
}