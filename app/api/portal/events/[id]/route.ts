import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/auth'
import { pickEffectiveRegistrationSetting } from '@/lib/registration-settings'

type TeamRequirementsShape = {
  allFields?: unknown[]
  commonFields?: unknown[]
  customFields?: unknown[]
}

type RegistrationSettingShape = {
  team_requirements?: TeamRequirementsShape
  [key: string]: unknown
}

const toDivisionRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null
  if (Array.isArray(value)) {
    const first = value[0]
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null
  }
  return typeof value === 'object' ? (value as Record<string, unknown>) : null
}

// 获取单个赛事详情（报名端）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params

    if (!eventId) {
      return NextResponse.json(
        { success: false, error: '缺少赛事ID' },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServer()

    // 获取赛事详情
    let event, eventError
    try {
      const result = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .eq('is_visible', true)
        .single()

      event = result.data
      eventError = result.error
    } catch (fetchError) {
      console.error('Supabase连接失败 - 获取赛事详情:', fetchError)
      return NextResponse.json(
        { success: false, error: '数据库连接失败，请稍后重试' },
        { status: 503 }
      )
    }

    if (eventError) {
      console.error('获取赛事详情失败:', eventError)
      return NextResponse.json(
        { success: false, error: '赛事未找到或已下线' },
        { status: 404 }
      )
    }

    // 获取报名设置（多组别时会有多条）
    let settingsRows: RegistrationSettingShape[] | null = null
    let settingsError: { code?: string } | null = null
    try {
      const result = await supabase
        .from('registration_settings')
        .select('*')
        .eq('event_id', eventId)
      settingsRows = result.data
      settingsError = result.error

    } catch (fetchError) {
      console.warn(`Supabase连接失败 - 获取报名设置:`, fetchError)
      settingsRows = null
      settingsError = null
    }

    if (settingsError && settingsError.code !== 'PGRST116') {
      // PGRST116 是 "not found" 错误，可以忽略
      console.warn(`获取报名设置失败:`, settingsError)
    }

    const effectiveSettings = Array.isArray(settingsRows)
      ? pickEffectiveRegistrationSetting(settingsRows)
      : settingsRows

    // 获取赛事关联的组别信息（包含规则）
    let divisions: Record<string, unknown>[] = []
    try {
      const { data: divisionsData } = await supabase
        .from('event_divisions')
        .select(`
          division_id,
          divisions (
            id,
            name,
            description,
            rules
          )
        `)
        .eq('event_id', eventId)

	      if (divisionsData) {
	        divisions = divisionsData
	          .map((ed) => toDivisionRecord(ed.divisions))
	          .filter((d): d is Record<string, unknown> => d !== null)
	      }
    } catch (error) {
      console.warn('获取组别信息失败:', error)
    }

    const settingsList: RegistrationSettingShape[] = Array.isArray(settingsRows)
      ? settingsRows
      : settingsRows
        ? [settingsRows]
        : []

    const typedEffectiveSettings = effectiveSettings as RegistrationSettingShape | null

    const eventWithSettings = {
      ...event,
      registration_settings: settingsError ? null : effectiveSettings,
      registration_settings_by_division: settingsError ? [] : settingsList,
      divisions: divisions
    }

    // 调试信息
    console.log('Portal API debug - Event with settings:', {
      eventId,
      settingsCount: Array.isArray(settingsRows) ? settingsRows.length : settingsRows ? 1 : 0,
      hasSettings: !!effectiveSettings,
      hasDivisionSettings: settingsList.length > 0,
      settingsType: typeof effectiveSettings,
      teamRequirements: typedEffectiveSettings?.team_requirements,
      teamReqType: typeof typedEffectiveSettings?.team_requirements,
      allFields: typedEffectiveSettings?.team_requirements?.allFields,
      commonFields: typedEffectiveSettings?.team_requirements?.commonFields,
      customFields: typedEffectiveSettings?.team_requirements?.customFields,
      rawSettings: effectiveSettings
    })

    return NextResponse.json({
      success: true,
      data: eventWithSettings
    })
  } catch (error) {
    console.error('Portal Event Details API error:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
