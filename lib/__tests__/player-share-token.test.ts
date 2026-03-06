import { describe, expect, it } from 'vitest'
import {
  getShareTokenAccessError,
  pickRegistrationSettings,
  resolveSharedPlayerData,
} from '../player-share-token'

describe('pickRegistrationSettings', () => {
  it('prefers the matching division-specific settings', () => {
    const settings = [
      { division_id: null, team_requirements: { registrationEndDate: '2026-03-01' } },
      { division_id: 'u12', team_requirements: { registrationEndDate: '2026-03-10' } },
    ]

    expect(pickRegistrationSettings(settings, 'u12')).toEqual(settings[1])
  })

  it('falls back to global settings when division-specific settings are missing', () => {
    const settings = [
      { division_id: null, team_requirements: { registrationEndDate: '2026-03-01' } },
      { division_id: 'u12', team_requirements: { registrationEndDate: '2026-03-10' } },
    ]

    expect(pickRegistrationSettings(settings, 'u14')).toEqual(settings[0])
  })
})

describe('resolveSharedPlayerData', () => {
  const players = [
    { id: 'player-1', name: 'Alice' },
    { id: 'player-2', name: 'Bob' },
  ]

  it('prefers player_id over player_index', () => {
    expect(
      resolveSharedPlayerData(players, { player_id: 'player-2', player_index: 0 })
    ).toEqual(players[1])
  })

  it('falls back to player_index for legacy tokens', () => {
    expect(resolveSharedPlayerData(players, { player_index: 0 })).toEqual(players[0])
  })

  it('returns null when the referenced player no longer exists', () => {
    expect(resolveSharedPlayerData(players, { player_id: 'missing', player_index: 8 })).toBeNull()
  })
})

describe('getShareTokenAccessError', () => {
  const now = new Date('2026-03-06T12:00:00.000Z')

  it('returns 404 for missing tokens', () => {
    expect(getShareTokenAccessError(null, now)).toEqual({
      error: '分享链接不存在',
      status: 404,
    })
  })

  it('rejects used, inactive, and expired tokens', () => {
    expect(getShareTokenAccessError({ used_at: '2026-03-06T11:00:00.000Z' }, now)?.status).toBe(410)
    expect(getShareTokenAccessError({ is_active: false }, now)?.status).toBe(410)
    expect(
      getShareTokenAccessError({ expires_at: '2026-03-06T11:59:59.000Z' }, now)
    ).toEqual({
      error: '分享链接已过期，请联系教练重新生成新的分享链接',
      status: 410,
    })
  })

  it('allows active tokens before expiration', () => {
    expect(
      getShareTokenAccessError(
        {
          is_active: true,
          expires_at: '2026-03-06T12:00:01.000Z',
          used_at: null,
        },
        now
      )
    ).toBeNull()
  })
})
