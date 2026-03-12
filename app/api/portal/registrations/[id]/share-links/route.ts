import { NextRequest, NextResponse } from 'next/server'
import { getCurrentCoachSession } from '@/lib/auth'
import {
  buildCoachShareTokenSummary,
  canMutateSharedRegistration,
  isShareWriteClosed,
  pickRegistrationSettings,
} from '@/lib/player-share-token'
import { generateSecureId } from '@/lib/security-random'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

interface RouteParams {
  params: Promise<{ id: string }>
}

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  Object.entries(NO_STORE_HEADERS).forEach(([key, value]) => {
    headers.set(key, value)
  })

  return NextResponse.json(body, {
    ...init,
    headers,
  })
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export async function GET(_request: NextRequest, context: RouteParams) {
  try {
    const coachSession = await getCurrentCoachSession()
    if (!coachSession?.user?.id) {
      return jsonNoStore(
        { success: false, error: '未授权访问' },
        { status: 401 }
      )
    }

    const { id: registrationId } = await context.params
    if (!registrationId) {
      return jsonNoStore(
        { success: false, error: '缺少报名ID' },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()

    const { data: registration, error: registrationError } = await supabase
      .from('registrations')
      .select('id, coach_id')
      .eq('id', registrationId)
      .maybeSingle()

    if (registrationError) {
      console.error('查询报名失败:', registrationError)
      return jsonNoStore(
        { success: false, error: '查询报名失败' },
        { status: 500 }
      )
    }

    if (!registration || registration.coach_id !== coachSession.user.id) {
      return jsonNoStore(
        { success: false, error: '报名信息不存在' },
        { status: 404 }
      )
    }

    const { data: shareTokens, error: shareTokensError } = await supabase
      .from('player_share_tokens')
      .select('id, player_id, player_index, player_data, is_filled, filled_at')
      .eq('registration_id', registrationId)
      .eq('is_filled', true)
      .order('filled_at', { ascending: false })

    if (shareTokensError) {
      console.error('查询已填写分享链接失败:', shareTokensError)
      return jsonNoStore(
        { success: false, error: '查询分享链接失败' },
        { status: 500 }
      )
    }

    return jsonNoStore({
      success: true,
      data: (shareTokens || [])
        .map((shareToken) => buildCoachShareTokenSummary(shareToken))
        .filter(Boolean),
    })
  } catch (error) {
    console.error('获取分享链接状态失败:', error)
    return jsonNoStore(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const coachSession = await getCurrentCoachSession()
    if (!coachSession?.user?.id) {
      return jsonNoStore(
        { success: false, error: '未授权访问' },
        { status: 401 }
      )
    }

    const { id: registrationId } = await context.params
    if (!registrationId) {
      return jsonNoStore(
        { success: false, error: '缺少报名ID' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => null) as {
      playerId?: string
      playersData?: unknown
    } | null

    const playerId = typeof body?.playerId === 'string' ? body.playerId.trim() : ''
    if (!playerId) {
      return jsonNoStore(
        { success: false, error: '缺少队员ID' },
        { status: 400 }
      )
    }

    if (body?.playersData !== undefined && !Array.isArray(body.playersData)) {
      return jsonNoStore(
        { success: false, error: '队员数据格式无效' },
        { status: 400 }
      )
    }

    const incomingPlayersData = Array.isArray(body?.playersData)
      ? body.playersData.filter(isObjectRecord)
      : null

    if (Array.isArray(body?.playersData) && incomingPlayersData && incomingPlayersData.length !== body.playersData.length) {
      return jsonNoStore(
        { success: false, error: '队员数据格式无效' },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()

    const { data: registration, error: registrationError } = await supabase
      .from('registrations')
      .select('id, event_id, coach_id, status, players_data, team_data')
      .eq('id', registrationId)
      .maybeSingle()

    if (registrationError) {
      console.error('查询报名失败:', registrationError)
      return jsonNoStore(
        { success: false, error: '查询报名失败' },
        { status: 500 }
      )
    }

    if (!registration || registration.coach_id !== coachSession.user.id) {
      return jsonNoStore(
        { success: false, error: '报名信息不存在' },
        { status: 404 }
      )
    }

    if (!canMutateSharedRegistration(registration.status)) {
      return jsonNoStore(
        { success: false, error: '报名已提交待审核，不可修改报名信息' },
        { status: 403 }
      )
    }

    const { data: settingsRows, error: settingsError } = await supabase
      .from('registration_settings')
      .select('division_id, team_requirements')
      .eq('event_id', registration.event_id)
      .order('created_at', { ascending: true })

    if (settingsError) {
      console.error('查询报名设置失败:', settingsError)
      return jsonNoStore(
        { success: false, error: '查询报名设置失败' },
        { status: 500 }
      )
    }

    const selectedSettings = pickRegistrationSettings(
      settingsRows,
      registration.team_data?.division_id
    )

    if (isShareWriteClosed(selectedSettings?.team_requirements)) {
      return jsonNoStore(
        { success: false, error: '报名已截止，不可修改报名信息' },
        { status: 403 }
      )
    }

    const playersData = incomingPlayersData
      ? [...incomingPlayersData]
      : Array.isArray(registration.players_data)
        ? registration.players_data.filter(isObjectRecord)
        : []

    const actualPlayerIndex = playersData.findIndex((player) => player.id === playerId)
    if (actualPlayerIndex < 0) {
      return jsonNoStore(
        { success: false, error: '未找到对应人员，无法生成分享链接' },
        { status: 400 }
      )
    }

    if (incomingPlayersData) {
      const { error: updatePlayersError } = await supabase
        .from('registrations')
        .update({ players_data: playersData })
        .eq('id', registrationId)

      if (updatePlayersError) {
        console.error('更新队员数据失败:', updatePlayersError)
        return jsonNoStore(
          { success: false, error: '更新队员数据失败，请重试' },
          { status: 500 }
        )
      }
    }

    const { error: deactivatePlayerIdTokensError } = await supabase
      .from('player_share_tokens')
      .update({ is_active: false })
      .eq('registration_id', registrationId)
      .eq('player_id', playerId)
      .eq('is_active', true)

    if (deactivatePlayerIdTokensError) {
      console.error('失效旧分享链接失败:', deactivatePlayerIdTokensError)
      return jsonNoStore(
        { success: false, error: '更新旧分享链接状态失败，请重试' },
        { status: 500 }
      )
    }

    const { error: deactivateLegacyIndexTokensError } = await supabase
      .from('player_share_tokens')
      .update({ is_active: false })
      .eq('registration_id', registrationId)
      .eq('player_index', actualPlayerIndex)
      .is('player_id', null)
      .eq('is_active', true)

    if (deactivateLegacyIndexTokensError) {
      console.error('失效旧索引分享链接失败:', deactivateLegacyIndexTokensError)
      return jsonNoStore(
        { success: false, error: '更新旧分享链接状态失败，请重试' },
        { status: 500 }
      )
    }

    const token = generateSecureId('share')
    const { data: shareTokenData, error: createTokenError } = await supabase
      .from('player_share_tokens')
      .insert({
        registration_id: registrationId,
        event_id: registration.event_id,
        token,
        player_id: playerId,
        player_index: actualPlayerIndex,
      })
      .select('player_id, player_index, expires_at')
      .single()

    if (createTokenError || !shareTokenData) {
      console.error('生成分享链接失败:', createTokenError)
      return jsonNoStore(
        { success: false, error: '生成分享链接失败，请稍后重试' },
        { status: 500 }
      )
    }

    const shareUrl = new URL(`/player-share/${token}`, request.nextUrl.origin).toString()

    return jsonNoStore({
      success: true,
      data: {
        share_url: shareUrl,
        token_info: {
          player_id: shareTokenData.player_id,
          player_index: shareTokenData.player_index,
          expires_at: shareTokenData.expires_at,
        },
      },
    })
  } catch (error) {
    console.error('创建分享链接失败:', error)
    return jsonNoStore(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
