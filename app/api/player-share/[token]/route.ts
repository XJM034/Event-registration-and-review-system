import { NextRequest, NextResponse } from 'next/server'
import {
  buildPublicShareEventSummary,
  buildPublicShareRegistrationSummary,
  buildPublicShareTokenInfo,
  canMutateSharedRegistration,
  getShareTokenAccessError,
  isShareWriteClosed,
  pickRegistrationSettings,
  resolveSharedPlayerData,
  summarizeShareTokenForAudit,
} from '@/lib/player-share-token'
import { applyRateLimitHeaders, buildRateLimitKey, type RateLimitDecision, takeRateLimit } from '@/lib/rate-limit'
import { writeSecurityAuditLog } from '@/lib/security-audit-log'
import { applySensitiveResponseHeaders } from '@/lib/sensitive-response-headers'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

interface RouteParams {
  params: Promise<{ token: string }>
}

const PUBLIC_SHARE_SETTINGS_COLUMNS = 'division_id, team_requirements, player_requirements'

function jsonNoStore(
  body: unknown,
  init?: ResponseInit,
  rateLimit?: RateLimitDecision,
) {
  const headers = new Headers(init?.headers)
  applySensitiveResponseHeaders(headers)

  const response = NextResponse.json(body, {
    ...init,
    headers,
  })

  if (rateLimit) {
    applyRateLimitHeaders(response.headers, rateLimit)
  }

  return response
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params
    const resourceId = summarizeShareTokenForAudit(token)

    if (!token) {
      return jsonNoStore(
        { error: '缺少分享令牌', success: false },
        { status: 400 }
      )
    }

    const rateLimit = takeRateLimit({
      key: buildRateLimitKey({
        request,
        scope: 'player-share:get',
        subject: token,
      }),
      limit: 60,
      windowMs: 60_000,
    })

    if (!rateLimit.allowed) {
      await writeSecurityAuditLog({
        request,
        action: 'view_public_share',
        actorType: 'public_share',
        actorRole: 'public_share',
        resourceType: 'share_token',
        resourceId,
        result: 'denied',
        reason: 'rate_limited',
      })
      return jsonNoStore(
        { error: '请求过于频繁，请稍后重试', success: false },
        { status: 429 },
        rateLimit,
      )
    }

    const supabase = createServiceRoleClient()

    const { data: shareTokenData, error: shareTokenError } = await supabase
      .from('player_share_tokens')
      .select('registration_id, event_id, player_index, player_id, is_active, expires_at, used_at')
      .eq('token', token)
      .maybeSingle()

    if (shareTokenError) {
      console.error('查询分享令牌失败:', shareTokenError)
      return jsonNoStore(
        { error: '查询分享链接失败', success: false },
        { status: 500 }
      )
    }

    const tokenAccessError = getShareTokenAccessError(shareTokenData)
    if (tokenAccessError) {
      await writeSecurityAuditLog({
        request,
        action: 'view_public_share',
        actorType: 'public_share',
        actorRole: 'public_share',
        resourceType: 'share_token',
        resourceId,
        registrationId: shareTokenData?.registration_id ?? null,
        eventId: shareTokenData?.event_id ?? null,
        result: 'failed',
        reason: `share_token_status_${tokenAccessError.status}`,
      })
      return jsonNoStore(
        { error: tokenAccessError.error, success: false },
        { status: tokenAccessError.status },
        rateLimit,
      )
    }
    if (!shareTokenData) {
      await writeSecurityAuditLog({
        request,
        action: 'view_public_share',
        actorType: 'public_share',
        actorRole: 'public_share',
        resourceType: 'share_token',
        resourceId,
        result: 'failed',
        reason: 'share_token_not_found',
      })
      return jsonNoStore(
        { error: '分享链接不存在', success: false },
        { status: 404 },
        rateLimit,
      )
    }

    const { data: registrationData, error: regError } = await supabase
      .from('registrations')
      .select('id, status, team_data, players_data')
      .eq('id', shareTokenData.registration_id)
      .single()

    if (regError || !registrationData) {
      console.error('获取报名信息失败:', regError)
      return jsonNoStore(
        { error: '获取报名信息失败', success: false },
        { status: 500 },
        rateLimit,
      )
    }

    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('id, name, short_name')
      .eq('id', shareTokenData.event_id)
      .single()

    if (eventError || !eventData) {
      console.error('获取赛事信息失败:', eventError)
      return jsonNoStore(
        { error: '获取赛事信息失败', success: false },
        { status: 500 },
        rateLimit,
      )
    }

    const { data: settingsRows } = await supabase
      .from('registration_settings')
      .select(PUBLIC_SHARE_SETTINGS_COLUMNS)
      .eq('event_id', shareTokenData.event_id)
      .order('created_at', { ascending: true })

    const selectedSettings = pickRegistrationSettings(
      settingsRows,
      registrationData?.team_data?.division_id
    )

    const sharedPlayerData = resolveSharedPlayerData(registrationData?.players_data, shareTokenData)

    if (!sharedPlayerData) {
      return jsonNoStore(
        { error: '分享对象不存在或已被移除，请联系教练重新生成新的分享链接', success: false },
        { status: 410 },
        rateLimit,
      )
    }

    await writeSecurityAuditLog({
      request,
      action: 'view_public_share',
      actorType: 'public_share',
      actorRole: 'public_share',
      resourceType: 'share_token',
      resourceId,
      registrationId: shareTokenData.registration_id,
      eventId: shareTokenData.event_id,
      result: 'success',
      metadata: {
        player_id_present: Boolean(shareTokenData.player_id),
        player_index: shareTokenData.player_index ?? null,
      },
    })

    return jsonNoStore(
      {
        success: true,
        data: {
          token_info: buildPublicShareTokenInfo(shareTokenData),
          registration: buildPublicShareRegistrationSummary(registrationData),
          event: buildPublicShareEventSummary(eventData, selectedSettings, settingsRows),
          player_index: shareTokenData.player_index,
          player_id: shareTokenData.player_id,
          shared_player: sharedPlayerData
        }
      },
      undefined,
      rateLimit,
    )

  } catch (error) {
    console.error('处理分享链接请求失败:', error)
    return jsonNoStore(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 更新队员信息
export async function PUT(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params
    const resourceId = summarizeShareTokenForAudit(token)
    const body: { player_data?: Record<string, unknown> } | null = await request.json().catch(() => null)

    if (!token) {
      return jsonNoStore(
        { error: '缺少分享令牌', success: false },
        { status: 400 }
      )
    }

    if (!body?.player_data || typeof body.player_data !== 'object') {
      await writeSecurityAuditLog({
        request,
        action: 'submit_public_share',
        actorType: 'public_share',
        actorRole: 'public_share',
        resourceType: 'share_token',
        resourceId,
        result: 'failed',
        reason: 'invalid_player_payload',
      })
      return jsonNoStore(
        { error: '提交数据无效', success: false },
        { status: 400 }
      )
    }

    const rateLimit = takeRateLimit({
      key: buildRateLimitKey({
        request,
        scope: 'player-share:put',
        subject: token,
      }),
      limit: 15,
      windowMs: 10 * 60_000,
    })

    if (!rateLimit.allowed) {
      await writeSecurityAuditLog({
        request,
        action: 'submit_public_share',
        actorType: 'public_share',
        actorRole: 'public_share',
        resourceType: 'share_token',
        resourceId,
        result: 'denied',
        reason: 'rate_limited',
      })
      return jsonNoStore(
        { error: '提交过于频繁，请稍后再试', success: false },
        { status: 429 },
        rateLimit,
      )
    }

    const supabase = createServiceRoleClient()

    const { data: tokenData, error: tokenError } = await supabase
      .from('player_share_tokens')
      .select('registration_id, event_id, player_index, player_id, is_active, expires_at, used_at')
      .eq('token', token)
      .maybeSingle()

    if (tokenError) {
      console.error('查询分享链接失败:', tokenError)
      return jsonNoStore(
        { error: '查询分享链接失败', success: false },
        { status: 500 }
      )
    }

    const tokenAccessError = getShareTokenAccessError(tokenData)
    if (tokenAccessError) {
      await writeSecurityAuditLog({
        request,
        action: 'submit_public_share',
        actorType: 'public_share',
        actorRole: 'public_share',
        resourceType: 'share_token',
        resourceId,
        registrationId: tokenData?.registration_id ?? null,
        eventId: tokenData?.event_id ?? null,
        result: 'failed',
        reason: `share_token_status_${tokenAccessError.status}`,
      })
      return jsonNoStore(
        { error: tokenAccessError.error, success: false },
        { status: tokenAccessError.status },
        rateLimit,
      )
    }
    if (!tokenData) {
      await writeSecurityAuditLog({
        request,
        action: 'submit_public_share',
        actorType: 'public_share',
        actorRole: 'public_share',
        resourceType: 'share_token',
        resourceId,
        result: 'failed',
        reason: 'share_token_not_found',
      })
      return jsonNoStore(
        { error: '分享链接不存在', success: false },
        { status: 404 },
        rateLimit,
      )
    }

    const { data: registration, error: regError } = await supabase
      .from('registrations')
      .select('id, players_data, status, team_data')
      .eq('id', tokenData.registration_id)
      .single()

    if (regError || !registration) {
      console.error('获取报名数据失败:', regError)
      return jsonNoStore(
        { error: '获取报名数据失败', success: false },
        { status: 500 },
        rateLimit,
      )
    }

    const { data: settingsRows } = await supabase
      .from('registration_settings')
      .select('division_id, team_requirements')
      .eq('event_id', tokenData.event_id)
      .order('created_at', { ascending: true })

    const selectedSettings = pickRegistrationSettings(
      settingsRows,
      registration?.team_data?.division_id
    )

    if (isShareWriteClosed(selectedSettings?.team_requirements)) {
      return jsonNoStore(
        { error: '报名已截止，不可修改报名信息', success: false },
        { status: 403 },
        rateLimit,
      )
    }

    if (!canMutateSharedRegistration(registration.status)) {
      return jsonNoStore(
        { error: '报名已提交待审核，不可修改报名信息', success: false },
        { status: 403 },
        rateLimit,
      )
    }

    const playersData = registration.players_data || []
    const playerIndex = tokenData.player_index
    const playerId = tokenData.player_id
    const existingSharedPlayer = resolveSharedPlayerData(playersData, tokenData)

    if (!existingSharedPlayer) {
      return jsonNoStore(
        { error: '分享对象不存在或已被移除，请联系教练重新生成新的分享链接', success: false },
        { status: 410 },
        rateLimit,
      )
    }

    const lockedRole = String(existingSharedPlayer.role || body.player_data?.role || 'player')
    const typedPlayersData = playersData as Array<Record<string, unknown> & { id?: string | null }>
    const sanitizedPlayerData = {
      ...body.player_data,
      role: lockedRole,
    }

    if (playerId) {
      const existingPlayerIndex = typedPlayersData.findIndex((player) => player.id === playerId)

      if (existingPlayerIndex >= 0) {
        playersData[existingPlayerIndex] = {
          ...playersData[existingPlayerIndex],
          ...sanitizedPlayerData,
          id: playerId,
          role: lockedRole,
        }
      } else if (playerIndex !== null && playerIndex !== undefined) {
        if (playerIndex >= 0 && playerIndex < playersData.length) {
          playersData[playerIndex] = {
            ...playersData[playerIndex],
            ...sanitizedPlayerData,
            id: playerId,
            role: lockedRole,
          }
        } else {
          while (playersData.length <= playerIndex) {
            playersData.push({ id: `placeholder-${playersData.length}` })
          }
          playersData[playerIndex] = {
            ...sanitizedPlayerData,
            id: playerId,
            role: lockedRole,
          }
        }
      } else {
        playersData.push({
          ...sanitizedPlayerData,
          id: playerId,
          role: lockedRole,
        })
      }
    } else if (playerIndex !== null && playerIndex !== undefined) {
      if (playerIndex >= 0) {
        while (playersData.length <= playerIndex) {
          playersData.push({ id: `placeholder-${playersData.length}` })
        }
        playersData[playerIndex] = {
          ...playersData[playerIndex],
          ...sanitizedPlayerData,
          role: lockedRole,
        }
      } else {
        return jsonNoStore(
          { error: '队员位置无效', success: false },
          { status: 400 },
          rateLimit,
        )
      }
    } else {
      return jsonNoStore(
        { error: '无法确定队员位置', success: false },
        { status: 400 },
        rateLimit,
      )
    }

    const { error: updateError } = await supabase
      .from('registrations')
      .update({ players_data: playersData })
      .eq('id', tokenData.registration_id)

    if (updateError) {
      console.error('更新队员信息失败:', updateError)
      return jsonNoStore(
        { error: '更新队员信息失败', success: false },
        { status: 500 },
        rateLimit,
      )
    }

    const submittedAt = new Date().toISOString()
    await supabase
      .from('player_share_tokens')
      .update({
        player_data: sanitizedPlayerData,
        is_filled: true,
        filled_at: submittedAt,
        used_at: submittedAt,
        is_active: false,
      })
      .eq('token', token)

    await writeSecurityAuditLog({
      request,
      action: 'submit_public_share',
      actorType: 'public_share',
      actorRole: 'public_share',
      resourceType: 'share_token',
      resourceId,
      registrationId: tokenData.registration_id,
      eventId: tokenData.event_id,
      result: 'success',
      metadata: {
        player_id_present: Boolean(tokenData.player_id),
        player_index: tokenData.player_index ?? null,
      },
    })

    return jsonNoStore(
      {
        success: true,
        message: '队员信息更新成功'
      },
      undefined,
      rateLimit,
    )

  } catch (error) {
    console.error('更新队员信息失败:', error)
    return jsonNoStore(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}
