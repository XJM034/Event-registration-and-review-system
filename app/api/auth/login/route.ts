import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdminLogin, createAdminSession } from '@/lib/auth'
import type { LoginFormData } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body: LoginFormData = await request.json()
    const { phone, password } = body

    console.log('Login attempt:', { phone, hasPassword: !!password })

    // 验证输入
    if (!phone || !password) {
      return NextResponse.json(
        { error: '手机号和密码不能为空', success: false },
        { status: 400 }
      )
    }

    // 验证管理员登录
    const admin = await verifyAdminLogin(phone, password)
    console.log('Admin verification result:', admin ? 'Success' : 'Failed')
    
    if (!admin) {
      return NextResponse.json(
        { error: '手机号或密码错误', success: false },
        { status: 401 }
      )
    }

    // 创建会话
    const sessionToken = createAdminSession(admin)
    
    // 设置 cookie
    const cookieStore = await cookies()
    cookieStore.set('admin-session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/',
    })

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: admin.id,
          phone: admin.phone,
        },
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: '登录失败，请稍后重试', success: false },
      { status: 500 }
    )
  }
}