import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer, getCurrentAdminSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }

    const session = await getCurrentAdminSession()
    if (!session) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 })
    }

    const supabase = await createSupabaseServer()
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('event_id')

    if (!eventId) {
      return NextResponse.json({ error: '请提供 event_id 参数' }, { status: 400 })
    }

    // 1. 获取角色配置
    const { data: settings, error: settingsError } = await supabase
      .from('registration_settings')
      .select('player_requirements')
      .eq('event_id', eventId)
      .single()

    if (settingsError) {
      return NextResponse.json({ error: '获取角色配置失败', details: settingsError }, { status: 500 })
    }

    const configuredRoles = settings?.player_requirements?.roles || []
    const configuredRoleIds = configuredRoles.map((r: any) => ({ id: r.id, name: r.name }))

    // 2. 获取报名数据中使用的角色 ID
    const { data: registrations, error: regError } = await supabase
      .from('registrations')
      .select('id, players_data')
      .eq('event_id', eventId)

    if (regError) {
      return NextResponse.json({ error: '获取报名数据失败', details: regError }, { status: 500 })
    }

    // 3. 提取所有使用的角色 ID
    const usedRoleIds = new Set<string>()
    const roleUsageDetails: any[] = []

    registrations?.forEach((reg: any) => {
      const players = reg.players_data || []
      players.forEach((player: any, index: number) => {
        const roleId = player.role
        if (roleId) {
          usedRoleIds.add(roleId)
          const roleConfig = configuredRoles.find((r: any) => r.id === roleId)
          roleUsageDetails.push({
            registration_id: reg.id,
            player_index: index,
            role_id: roleId,
            role_name: roleConfig?.name || '❌ 未找到配置',
            has_config: !!roleConfig
          })
        }
      })
    })

    // 4. 找出不匹配的角色
    const missingRoles = Array.from(usedRoleIds).filter(
      roleId => !configuredRoles.some((r: any) => r.id === roleId)
    )

    return NextResponse.json({
      success: true,
      event_id: eventId,
      summary: {
        configured_roles_count: configuredRoles.length,
        used_roles_count: usedRoleIds.size,
        missing_roles_count: missingRoles.length
      },
      configured_roles: configuredRoleIds,
      used_role_ids: Array.from(usedRoleIds),
      missing_roles: missingRoles,
      role_usage_details: roleUsageDetails.filter((d: any) => !d.has_config)
    })
  } catch (error: any) {
    return NextResponse.json({ error: '诊断失败', details: error.message }, { status: 500 })
  }
}
