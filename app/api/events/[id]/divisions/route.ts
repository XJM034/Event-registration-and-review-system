import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdminSession, createSupabaseServer } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

type DivisionItem = Record<string, unknown>

const toDivisionItem = (value: unknown): DivisionItem | null => {
  if (!value) return null
  if (Array.isArray(value)) {
    const first = value[0]
    return first && typeof first === 'object' ? (first as DivisionItem) : null
  }
  return typeof value === 'object' ? (value as DivisionItem) : null
}

// 获取赛事关联的组别
export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()

    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const supabase = await createSupabaseServer()

    const { data, error } = await supabase
      .from('event_divisions')
      .select(`
        id,
        division_id,
        divisions (
          id,
          name,
          description,
          display_order,
          is_enabled,
          rules,
          project_id,
          projects (
            id,
            name,
            project_type_id,
            project_types (
              id,
              name
            )
          )
        )
      `)
      .eq('event_id', id)

    if (error) {
      console.error('Fetch event divisions error:', error)
      return NextResponse.json(
        { error: '获取组别失败', success: false },
        { status: 500 }
      )
    }

    // 扁平化返回结构
    const divisions = (data || [])
      .map((ed) => {
        const division = toDivisionItem(ed.divisions)
        if (!division) return null
        return {
          ...division,
          event_division_id: ed.id,
        }
      })
      .filter((item): item is DivisionItem & { event_division_id: string } => item !== null)

    return NextResponse.json({
      success: true,
      data: divisions,
    })
  } catch (error) {
    console.error('Event divisions API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 更新赛事关联的组别
export async function PUT(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params
    const session = await getCurrentAdminSession()

    if (!session) {
      return NextResponse.json(
        { error: '未授权访问', success: false },
        { status: 401 }
      )
    }

    const { division_ids } = await request.json()

    if (!Array.isArray(division_ids)) {
      return NextResponse.json(
        { error: '参数错误', success: false },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServer()

    const normalizedDivisionIds = Array.from(
      new Set(
        division_ids
          .filter((divisionId): divisionId is string => typeof divisionId === 'string')
          .map((divisionId) => divisionId.trim())
          .filter((divisionId) => divisionId.length > 0)
      )
    )

    const { data: existingLinks, error: existingError } = await supabase
      .from('event_divisions')
      .select('id, division_id')
      .eq('event_id', id)

    if (existingError) {
      console.error('Fetch existing event divisions error:', existingError)
      return NextResponse.json(
        { error: '读取现有组别关联失败', success: false },
        { status: 500 }
      )
    }

    const existingList = existingLinks || []
    const existingDivisionIdSet = new Set(existingList.map((link) => link.division_id))

    const toInsertDivisionIds = normalizedDivisionIds.filter(
      (divisionId) => !existingDivisionIdSet.has(divisionId)
    )

    const desiredDivisionIdSet = new Set(normalizedDivisionIds)
    const toDeleteLinkIds = existingList
      .filter((link) => !desiredDivisionIdSet.has(link.division_id))
      .map((link) => link.id)

    // 先插入再删除，避免“先删后增失败”导致赛事组别被清空
    if (toInsertDivisionIds.length > 0) {
      const eventDivisions = toInsertDivisionIds.map((divisionId) => ({
        event_id: id,
        division_id: divisionId,
      }))

      const { error: insertError } = await supabase
        .from('event_divisions')
        .insert(eventDivisions)

      if (insertError) {
        console.error('Insert event divisions error:', insertError)
        return NextResponse.json(
          { error: '新增组别关联失败', success: false },
          { status: 500 }
        )
      }
    }

    if (toDeleteLinkIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('event_divisions')
        .delete()
        .in('id', toDeleteLinkIds)

      if (deleteError) {
        console.error('Delete event divisions error:', deleteError)
        return NextResponse.json(
          { error: '删除旧组别关联失败', success: false },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        inserted_count: toInsertDivisionIds.length,
        deleted_count: toDeleteLinkIds.length,
      },
    })
  } catch (error) {
    console.error('Update event divisions API error:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
