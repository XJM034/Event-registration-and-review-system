import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentAdminSession } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(
  request: NextRequest,
  context: RouteParams
) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }

    const session = await getCurrentAdminSession()
    if (!session) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 })
    }

    const { id } = await context.params
    const supabase = await createClient()

    const { data: registrations, error } = await supabase
      .from('registrations')
      .select('id, team_data, status, created_at')
      .eq('event_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      count: registrations.length,
      registrations: registrations.map(r => ({
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        team_data: r.team_data,
        team_data_keys: Object.keys(r.team_data || {})
      }))
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
