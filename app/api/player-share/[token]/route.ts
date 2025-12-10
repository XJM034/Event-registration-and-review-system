import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'

interface RouteParams {
  params: Promise<{ token: string }>
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params

    if (!token) {
      return NextResponse.json(
        { error: '缺少分享令牌', success: false },
        { status: 400 }
      )
    }

    // 使用客户端 Supabase（这个版本之前是可以工作的）
    const supabase = createClient()

    // 首先查询分享令牌
    const { data: shareTokenData, error: shareTokenError } = await supabase
      .from('player_share_tokens')
      .select('*')
      .eq('token', token)
      .eq('is_active', true)
      .single()

    if (shareTokenError || !shareTokenData) {
      console.error('查询分享令牌失败:', shareTokenError)
      return NextResponse.json(
        { error: '分享链接不存在或已过期', success: false },
        { status: 404 }
      )
    }

    // 检查是否过期
    if (new Date(shareTokenData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: '分享链接已过期', success: false },
        { status: 410 }
      )
    }

    // 获取报名信息
    const { data: registrationData, error: regError } = await supabase
      .from('registrations')
      .select('*')
      .eq('id', shareTokenData.registration_id)
      .single()

    if (regError || !registrationData) {
      console.error('获取报名信息失败:', regError)
      return NextResponse.json(
        { error: '获取报名信息失败', success: false },
        { status: 500 }
      )
    }

    // 获取赛事信息
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', shareTokenData.event_id)
      .single()

    if (eventError || !eventData) {
      console.error('获取赛事信息失败:', eventError)
      return NextResponse.json(
        { error: '获取赛事信息失败', success: false },
        { status: 500 }
      )
    }

    // 获取报名设置
    const { data: settingsData } = await supabase
      .from('registration_settings')
      .select('*')
      .eq('event_id', shareTokenData.event_id)
      .single()

    // 合并 registration_settings 到 event 对象
    if (settingsData) {
      eventData.registration_settings = settingsData
    }

    // 添加调试日志
    console.log('GET player-share token data:', {
      token,
      player_index: shareTokenData.player_index,
      player_id: shareTokenData.player_id,
      players_data_length: registrationData?.players_data?.length || 0,
      registration_id: shareTokenData.registration_id
    })

    return NextResponse.json({
      success: true,
      data: {
        token_info: shareTokenData,
        registration: registrationData,
        event: eventData,
        player_index: shareTokenData.player_index,
        player_id: shareTokenData.player_id
      }
    })

  } catch (error) {
    console.error('处理分享链接请求失败:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}

// 更新队员信息
export async function PUT(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params
    const body = await request.json()

    if (!token) {
      return NextResponse.json(
        { error: '缺少分享令牌', success: false },
        { status: 400 }
      )
    }

    const supabase = createClient()

    // 验证 token
    const { data: tokenData, error: tokenError } = await supabase
      .from('player_share_tokens')
      .select('*')
      .eq('token', token)
      .eq('is_active', true)
      .single()

    if (tokenError || !tokenData) {
      return NextResponse.json(
        { error: '分享链接无效', success: false },
        { status: 400 }
      )
    }

    // 检查是否过期
    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: '分享链接已过期', success: false },
        { status: 410 }
      )
    }

    // 获取报名设置，检查报名是否已截止
    const { data: settingsData } = await supabase
      .from('registration_settings')
      .select('team_requirements')
      .eq('event_id', tokenData.event_id)
      .single()

    if (settingsData?.team_requirements) {
      const now = new Date()
      let teamReq = settingsData.team_requirements
      if (typeof teamReq === 'string') {
        try {
          teamReq = JSON.parse(teamReq)
        } catch (e) {
          // ignore parse error
        }
      }

      const regEndDate = teamReq?.registrationEndDate
      const reviewEndDate = teamReq?.reviewEndDate
      const regEnd = regEndDate ? new Date(regEndDate) : null
      const reviewEnd = reviewEndDate ? new Date(reviewEndDate) : null

      // 检查是否已截止
      const isClosed = reviewEnd ? now > reviewEnd : (regEnd ? now > regEnd : false)

      if (isClosed) {
        return NextResponse.json(
          { error: '报名已截止，不可修改报名信息', success: false },
          { status: 403 }
        )
      }
    }

    // 获取当前报名数据（包括状态）
    const { data: registration, error: regError } = await supabase
      .from('registrations')
      .select('players_data, status')
      .eq('id', tokenData.registration_id)
      .single()

    if (regError) {
      console.error('获取报名数据失败:', regError)
      return NextResponse.json(
        { error: '获取报名数据失败', success: false },
        { status: 500 }
      )
    }

    // 检查报名状态 - 只有草稿和已驳回状态允许通过分享链接修改
    // draft: 草稿，可以修改
    // rejected: 已驳回，可以修改后重新提交
    // pending/submitted: 待审核，不允许修改
    // approved: 已通过，不允许修改
    const allowedStatuses = ['draft', 'rejected']
    if (registration.status && !allowedStatuses.includes(registration.status)) {
      return NextResponse.json(
        { error: '报名已提交待审核，不可修改报名信息', success: false },
        { status: 403 }
      )
    }

    console.log('Current registration players_data:', {
      length: registration?.players_data?.length || 0,
      playerIds: registration?.players_data?.map((p: any) => p.id) || []
    })

    // 更新指定队员的信息
    const playersData = registration.players_data || []
    const playerIndex = tokenData.player_index
    const playerId = tokenData.player_id

    console.log('PUT /api/player-share - Updating player:', {
      playerIndex,
      playerId,
      playersDataLength: playersData.length,
      tokenData,
      playerData: body.player_data
    })

    // 优先使用 player_id 查找队员
    if (playerId) {
      // 通过 player_id 查找队员
      const existingPlayerIndex = playersData.findIndex((p: any) => p.id === playerId)

      if (existingPlayerIndex >= 0) {
        // 更新现有队员
        playersData[existingPlayerIndex] = {
          ...playersData[existingPlayerIndex],
          ...body.player_data,
          id: playerId // 保留原始 ID
        }
      } else if (playerIndex !== null && playerIndex !== undefined) {
        // 如果找不到对应ID的队员，但有索引，尝试使用索引
        if (playerIndex >= 0 && playerIndex < playersData.length) {
          playersData[playerIndex] = {
            ...playersData[playerIndex],
            ...body.player_data,
            id: playerId // 确保设置正确的 ID
          }
        } else {
          // 如果索引也无效，则添加为新队员
          while (playersData.length <= playerIndex) {
            playersData.push({ id: `placeholder-${playersData.length}` })
          }
          playersData[playerIndex] = {
            ...body.player_data,
            id: playerId
          }
        }
      } else {
        // 没有索引信息，添加为新队员
        playersData.push({
          ...body.player_data,
          id: playerId
        })
      }
    } else if (playerIndex !== null && playerIndex !== undefined) {
      // 只有索引，没有 player_id（兼容旧数据）
      if (playerIndex >= 0) {
        // 确保数组有足够的长度
        while (playersData.length <= playerIndex) {
          playersData.push({ id: `placeholder-${playersData.length}` })
        }
        playersData[playerIndex] = {
          ...playersData[playerIndex],
          ...body.player_data
        }
      } else {
        return NextResponse.json(
          { error: '队员位置无效', success: false },
          { status: 400 }
        )
      }
    } else {
      return NextResponse.json(
        { error: '无法确定队员位置', success: false },
        { status: 400 }
      )
    }

    // 保存更新后的数据
    const { error: updateError } = await supabase
      .from('registrations')
      .update({ players_data: playersData })
      .eq('id', tokenData.registration_id)

    if (updateError) {
      console.error('更新队员信息失败:', updateError)
      return NextResponse.json(
        { error: '更新队员信息失败', success: false },
        { status: 500 }
      )
    }

    // 标记 token 为已使用
    await supabase
      .from('player_share_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token)

    return NextResponse.json({
      success: true,
      message: '队员信息更新成功'
    })

  } catch (error) {
    console.error('更新队员信息失败:', error)
    return NextResponse.json(
      { error: '服务器错误', success: false },
      { status: 500 }
    )
  }
}