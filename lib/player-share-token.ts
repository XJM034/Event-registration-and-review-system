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
