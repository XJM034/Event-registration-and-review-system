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

    const { data: settings, error } = await supabase
      .from('registration_settings')
      .select('*')
      .eq('event_id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const teamReq = settings.team_requirements
    const allFields = teamReq?.allFields || [
      ...(teamReq?.commonFields || []),
      ...(teamReq?.customFields || [])
    ]

    return NextResponse.json({
      success: true,
      team_requirements: teamReq,
      all_fields: allFields,
      field_ids: allFields.map((f: any) => ({ id: f.id, label: f.label, type: f.type }))
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
