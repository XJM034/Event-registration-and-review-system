export interface RegistrationSettingsRow {
  division_id?: string | null
  team_requirements?: unknown
}

export interface ShareTokenPlayerLocator {
  player_id?: string | null
  player_index?: number | null
}

export interface ShareTokenAccessState {
  is_active?: boolean | null
  expires_at?: string | null
  used_at?: string | null
}

export interface ShareTokenAccessError {
  error: string
  status: number
}

export interface PublicShareTokenInfo extends ShareTokenPlayerLocator, ShareTokenAccessState {}

export interface PublicShareRegistrationSummary {
  id?: string
  status?: string | null
  team_data?: Record<string, unknown> | null
}

export interface PublicShareEventSummary {
  id?: string
  name?: string
  short_name?: string | null
  registration_settings?: RegistrationSettingsRow | null
  registration_settings_by_division?: RegistrationSettingsRow[]
}

export interface CoachShareTokenSummary extends ShareTokenPlayerLocator {
  id?: string
  player_data?: Record<string, unknown> | null
  is_filled?: boolean | null
  filled_at?: string | null
}

export interface ShareWindowConfig {
  registrationEndDate?: string | null
  reviewEndDate?: string | null
}

export function pickRegistrationSettings(
  settingsRows: RegistrationSettingsRow[] | null | undefined,
  divisionId?: string | null
) {
  if (!Array.isArray(settingsRows) || settingsRows.length === 0) return null

  if (divisionId) {
    const matched = settingsRows.find((item) => item?.division_id === divisionId)
    if (matched) return matched
  }

  return settingsRows.find((item) => !item?.division_id) || settingsRows[0]
}

export function resolveSharedPlayerData<T extends Record<string, unknown>>(
  playersData: T[] | null | undefined,
  shareTokenData: ShareTokenPlayerLocator
) {
  const players = Array.isArray(playersData) ? playersData : []

  if (shareTokenData.player_id) {
    const matchedById = players.find((player) => player?.id === shareTokenData.player_id)
    if (matchedById) return matchedById
  }

  if (
    shareTokenData.player_index !== null &&
    shareTokenData.player_index !== undefined &&
    shareTokenData.player_index >= 0
  ) {
    return players[shareTokenData.player_index] || null
  }

  return null
}

export function getShareTokenAccessError(
  shareTokenData: ShareTokenAccessState | null,
  now: Date = new Date()
): ShareTokenAccessError | null {
  if (!shareTokenData) {
    return {
      error: '分享链接不存在',
      status: 404,
    }
  }

  if (shareTokenData.used_at) {
    return {
      error: '该分享链接已填写完成，如需修改请联系教练重新生成新的分享链接',
      status: 410,
    }
  }

  if (shareTokenData.is_active === false) {
    return {
      error: '该分享链接已失效，请联系教练重新生成新的分享链接',
      status: 410,
    }
  }

  if (shareTokenData.expires_at && new Date(shareTokenData.expires_at) < now) {
    return {
      error: '分享链接已过期，请联系教练重新生成新的分享链接',
      status: 410,
    }
  }

  return null
}

export function buildPublicShareTokenInfo(
  shareTokenData: ShareTokenAccessState & ShareTokenPlayerLocator
): PublicShareTokenInfo {
  return {
    player_id: shareTokenData.player_id ?? null,
    player_index: shareTokenData.player_index ?? null,
    is_active: shareTokenData.is_active ?? null,
    expires_at: shareTokenData.expires_at ?? null,
    used_at: shareTokenData.used_at ?? null,
  }
}

export function buildPublicShareRegistrationSummary(
  registrationData: {
    id?: string
    status?: string | null
    team_data?: Record<string, unknown> | null
  } | null | undefined
): PublicShareRegistrationSummary | null {
  if (!registrationData) return null

  return {
    id: registrationData.id,
    status: registrationData.status ?? null,
    team_data: registrationData.team_data ?? null,
  }
}

export function buildPublicShareEventSummary(
  eventData: {
    id?: string
    name?: string
    short_name?: string | null
  } | null | undefined,
  selectedSettings: RegistrationSettingsRow | null,
  settingsRows: RegistrationSettingsRow[] | null | undefined,
): PublicShareEventSummary | null {
  if (!eventData) return null

  return {
    id: eventData.id,
    name: eventData.name,
    short_name: eventData.short_name ?? null,
    registration_settings: selectedSettings,
    registration_settings_by_division: Array.isArray(settingsRows) ? settingsRows : [],
  }
}

export function parseShareWindowConfig(teamRequirements: unknown): ShareWindowConfig | null {
  let parsedRequirements = teamRequirements

  if (typeof parsedRequirements === 'string') {
    try {
      parsedRequirements = JSON.parse(parsedRequirements)
    } catch {
      return null
    }
  }

  if (!parsedRequirements || typeof parsedRequirements !== 'object' || Array.isArray(parsedRequirements)) {
    return null
  }

  const requirements = parsedRequirements as Record<string, unknown>

  return {
    registrationEndDate:
      typeof requirements.registrationEndDate === 'string' ? requirements.registrationEndDate : null,
    reviewEndDate: typeof requirements.reviewEndDate === 'string' ? requirements.reviewEndDate : null,
  }
}

export function isShareWriteClosed(teamRequirements: unknown, now: Date = new Date()) {
  const windowConfig = parseShareWindowConfig(teamRequirements)
  if (!windowConfig) return false

  const reviewEnd = windowConfig.reviewEndDate ? new Date(windowConfig.reviewEndDate) : null
  if (reviewEnd && !Number.isNaN(reviewEnd.getTime())) {
    return now > reviewEnd
  }

  const registrationEnd = windowConfig.registrationEndDate ? new Date(windowConfig.registrationEndDate) : null
  if (registrationEnd && !Number.isNaN(registrationEnd.getTime())) {
    return now > registrationEnd
  }

  return false
}

export function canMutateSharedRegistration(status?: string | null) {
  return status === 'draft' || status === 'rejected'
}

export function buildCoachShareTokenSummary(
  shareTokenData: {
    id?: string
    player_id?: string | null
    player_index?: number | null
    player_data?: Record<string, unknown> | null
    is_filled?: boolean | null
    filled_at?: string | null
  } | null | undefined
): CoachShareTokenSummary | null {
  if (!shareTokenData) return null

  return {
    id: shareTokenData.id,
    player_id: shareTokenData.player_id ?? null,
    player_index: shareTokenData.player_index ?? null,
    player_data: shareTokenData.player_data ?? null,
    is_filled: shareTokenData.is_filled ?? null,
    filled_at: shareTokenData.filled_at ?? null,
  }
}

export function summarizeShareTokenForAudit(token?: string | null) {
  if (!token) return null

  return `share:${token.slice(0, 8)}`
}

function recordsDiffer(
  left: Record<string, unknown>,
  right: Record<string, unknown>
) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])

  for (const key of keys) {
    if (!Object.is(left[key], right[key])) {
      return true
    }
  }

  return false
}

export function mergeSharedPlayerUpdates<T extends Record<string, unknown>>(
  playersData: T[] | null | undefined,
  shareTokens: Array<CoachShareTokenSummary | null | undefined>
) {
  const players = Array.isArray(playersData) ? playersData : []

  if (!Array.isArray(shareTokens) || shareTokens.length === 0 || players.length === 0) {
    return players
  }

  let hasChanges = false

  const mergedPlayers = players.map((player, index) => {
    const matchedShareToken = shareTokens.find((shareToken) => {
      if (!shareToken?.player_data || typeof shareToken.player_data !== 'object') {
        return false
      }

      if (shareToken.player_id) {
        return player.id === shareToken.player_id
      }

      return shareToken.player_index === index
    })

    if (!matchedShareToken?.player_data || typeof matchedShareToken.player_data !== 'object') {
      return player
    }

    const mergedPlayer = {
      ...player,
      ...matchedShareToken.player_data,
    } as T

    const currentPlayerId = typeof player.id === 'string' ? player.id : null
    if (currentPlayerId) {
      ;(mergedPlayer as Record<string, unknown>).id = currentPlayerId
    }

    if (recordsDiffer(player, mergedPlayer)) {
      hasChanges = true
      return mergedPlayer
    }

    return player
  })

  return hasChanges ? mergedPlayers : players
}
