import { NextResponse } from 'next/server'

// 登录已迁移到客户端 Supabase Auth，此 API 不再使用
export async function POST() {
  return NextResponse.json(
    { error: '请使用客户端登录页面', success: false },
    { status: 410 }
  )
}
