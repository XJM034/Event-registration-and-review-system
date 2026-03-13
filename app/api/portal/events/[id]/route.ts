import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/auth'
import { pickEffectiveRegistrationSetting } from '@/lib/registration-settings'

type TeamRequirementsShape = {
  allFields?: unknown[]
  commonFields?: unknown[]
  customFields?: unknown[]
}

type RegistrationSettingShape = {
  id?: string
  event_id?: string
  division_id?: string | null
  created_at?: string
  updated_at?: string
  player_requirements?: unknown
  team_requirements?: TeamRequirementsShape
  [key: string]: unknown
}

function stripRegistrationSettingTimestamps(
  setting: RegistrationSettingShape | null | undefined,
): RegistrationSettingShape | null {
  if (!setting) return null

  const { created_at, updated_at, ...publicSetting } = setting
  void created_at
  void updated_at
  return publicSetting
}

const PORTAL_EVENT_DETAIL_COLUMNS =
  'id, name, short_name, poster_url, start_date, end_date, address, details, requirements, reference_templates, phone, is_visible'

// pickEffectiveRegistrationSetting() uses timestamps to break ties within the same phase.
const PORTAL_REGISTRATION_SETTINGS_COLUMNS =
  'id, event_id, division_id, team_requirements, player_requirements, created_at, updated_at'

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
        .select(PORTAL_EVENT_DETAIL_COLUMNS)
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
        .select(PORTAL_REGISTRATION_SETTINGS_COLUMNS)
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

    const eventWithSettings = {
      ...event,
      registration_settings: settingsError
        ? null
        : stripRegistrationSettingTimestamps(effectiveSettings as RegistrationSettingShape | null),
      registration_settings_by_division: settingsError
        ? []
        : settingsList
            .map((setting) => stripRegistrationSettingTimestamps(setting))
            .filter((setting): setting is RegistrationSettingShape => setting !== null),
      divisions: divisions
    }
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
