import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession, createSupabaseServer } from '@/lib/auth'

// 获取所有项目（可按类型筛选）
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
    const typeId = searchParams.get('type_id')

    const supabase = await createSupabaseServer()

    let query = supabase
      .from('projects')
      .select(`
        *,
        project_type:project_types(id, name),
        divisions:divisions(count)
      `)
      .order('display_order', { ascending: true })

    if (typeId) {
      query = query.eq('project_type_id', typeId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Fetch projects error:', error)
      return NextResponse.json(
        { error: '获取项目失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    })
  } catch (error) {
    console.error('Projects API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 创建项目
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, project_type_id, display_order } = body

    if (!name || !project_type_id) {
      return NextResponse.json(
        { error: '名称和项目类型不能为空', success: false },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServer()

    const { data, error } = await supabase
      .from('projects')
      .insert({
        name,
        project_type_id,
        display_order: display_order || 0,
        is_enabled: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Create project error:', error)
      return NextResponse.json(
        { error: '创建项目失败', success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Create project API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
