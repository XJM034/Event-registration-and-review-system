import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession, createSupabaseServer } from '@/lib/auth'

// 获取所有组别（可按项目筛选）
export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')

    const supabase = await createSupabaseServer()

    let query = supabase
      .from('divisions')
      .select(`
        *,
        project:projects(id, name, project_type:project_types(id, name)),
        event_divisions:event_divisions(count)
      `)
      .order('display_order', { ascending: true })

    if (projectId) {
      query = query.eq('project_id', projectId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Fetch divisions error:', error)
      return NextResponse.json(
        { error: '获取组别失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    })
  } catch (error) {
    console.error('Divisions API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 创建组别
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
    const { name, project_id, description, display_order, rules } = body

    if (!name || !project_id) {
      return NextResponse.json(
        { error: '名称和项目不能为空', success: false },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServer()

    const { data, error } = await supabase
      .from('divisions')
      .insert({
        name,
        project_id,
        description,
        display_order: display_order || 0,
        is_enabled: true,
        rules: rules || {},
      })
      .select()
      .single()

    if (error) {
      console.error('Create division error:', error)
      return NextResponse.json(
        { error: '创建组别失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Create division API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
