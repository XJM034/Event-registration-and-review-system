import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer, getCurrentAdminSession } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()

    if (!session?.user) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('event_id')

    const supabase = await createSupabaseServer()

    let query = supabase
      .from('registrations')
      .select('*')
      .eq('id', id)

    if (eventId) {
      query = query.eq('event_id', eventId)
    }

    const { data, error } = await query.single()

    if (error || !data) {
      return NextResponse.json(
        { error: '报名信息不存在', success: false },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Get registration error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

