import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession, createSupabaseServer } from '@/lib/auth'

// 获取所有项目类型
export async function GET() {
  try {
    const session = await getCurrentAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const supabase = await createSupabaseServer()

    const { data, error } = await supabase
      .from('project_types')
      .select(`
        *,
        projects:projects(count)
      `)
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Fetch project types error:', error)
      return NextResponse.json(
        { error: '获取项目类型失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    })
  } catch (error) {
    console.error('Project types API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 创建项目类型
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession()
    if (!session || !session.user.is_super) {
      return NextResponse.json(
        { error: '需要超级管理员权限', success: false },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, display_order } = body

    if (!name) {
      return NextResponse.json(
        { error: '名称不能为空', success: false },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServer()

    const { data, error } = await supabase
      .from('project_types')
      .insert({
        name,
        display_order: display_order || 0,
        is_enabled: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Create project type error:', error)
      return NextResponse.json(
        { error: '创建项目类型失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Create project type API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
