import { describe, expect, it } from 'vitest'
import {
  buildCoachShareTokenSummary,
  buildPublicShareEventSummary,
  buildPublicShareRegistrationSummary,
  buildPublicShareTokenInfo,
  canMutateSharedRegistration,
  getShareTokenAccessError,
  isShareWriteClosed,
  mergeSharedPlayerUpdates,
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

describe('public share payload builders', () => {
  it('only exposes the minimal coach share token fields needed for sync polling', () => {
    expect(
      buildCoachShareTokenSummary({
        id: 'token-row-1',
        token: 'hidden',
        player_id: 'player-1',
        player_index: 2,
        player_data: { name: 'Alice' },
        is_filled: true,
        filled_at: '2026-03-10T10:00:00.000Z',
      } as any)
    ).toEqual({
      id: 'token-row-1',
      player_id: 'player-1',
      player_index: 2,
      player_data: { name: 'Alice' },
      is_filled: true,
      filled_at: '2026-03-10T10:00:00.000Z',
    })
  })

  it('only exposes the minimal token fields needed by the public page', () => {
    expect(
      buildPublicShareTokenInfo({
        token: 'hidden',
        player_id: 'player-1',
        player_index: 2,
        is_active: true,
        expires_at: '2026-03-10T10:00:00.000Z',
        used_at: null,
      } as any)
    ).toEqual({
      player_id: 'player-1',
      player_index: 2,
      is_active: true,
      expires_at: '2026-03-10T10:00:00.000Z',
      used_at: null,
    })
  })

  it('does not leak other players from registration payloads', () => {
    expect(
      buildPublicShareRegistrationSummary({
        id: 'reg-1',
        status: 'draft',
        team_data: { team_name: 'Alpha', division_id: 'u12' },
        players_data: [{ id: 'player-1' }],
      } as any)
    ).toEqual({
      id: 'reg-1',
      status: 'draft',
      team_data: { team_name: 'Alpha', division_id: 'u12' },
    })
  })

  it('limits event payloads to event identity and settings', () => {
    expect(
      buildPublicShareEventSummary(
        {
          id: 'event-1',
          name: '公开赛',
          short_name: '公开赛',
          details: 'should-not-leak',
        } as any,
        { division_id: null, team_requirements: { reviewEndDate: '2026-03-10' } },
        [{ division_id: null, team_requirements: { reviewEndDate: '2026-03-10' } }],
      )
    ).toEqual({
      id: 'event-1',
      name: '公开赛',
      short_name: '公开赛',
      registration_settings: { division_id: null, team_requirements: { reviewEndDate: '2026-03-10' } },
      registration_settings_by_division: [{ division_id: null, team_requirements: { reviewEndDate: '2026-03-10' } }],
    })
  })
})

describe('share write guards', () => {
  it('allows only draft and rejected registrations to be mutated from share flows', () => {
    expect(canMutateSharedRegistration('draft')).toBe(true)
    expect(canMutateSharedRegistration('rejected')).toBe(true)
    expect(canMutateSharedRegistration('pending')).toBe(false)
    expect(canMutateSharedRegistration('approved')).toBe(false)
  })

  it('uses reviewEndDate first and falls back to registrationEndDate', () => {
    const now = new Date('2026-03-10T12:00:00.000Z')

    expect(
      isShareWriteClosed(
        { registrationEndDate: '2026-03-09T12:00:00.000Z', reviewEndDate: '2026-03-11T12:00:00.000Z' },
        now
      )
    ).toBe(false)

    expect(
      isShareWriteClosed(
        JSON.stringify({ registrationEndDate: '2026-03-10T11:59:59.000Z' }),
        now
      )
    ).toBe(true)
  })
})

describe('mergeSharedPlayerUpdates', () => {
  it('merges filled share payloads into the matching player by id', () => {
    const players = [
      { id: 'player-1', name: 'Old Name', role: 'player' },
      { id: 'player-2', name: 'Bob', role: 'coach' },
    ]

    expect(
      mergeSharedPlayerUpdates(players, [
        {
          id: 'token-row-1',
          player_id: 'player-1',
          player_data: { name: 'New Name', jersey_number: '7' },
        },
      ])
    ).toEqual([
      { id: 'player-1', name: 'New Name', role: 'player', jersey_number: '7' },
      { id: 'player-2', name: 'Bob', role: 'coach' },
    ])
  })

  it('falls back to player_index for legacy tokens and returns the original array when nothing changes', () => {
    const players = [
      { id: 'player-1', name: 'Alice', role: 'player' },
      { id: 'player-2', name: 'Bob', role: 'player' },
    ]

    const unchanged = mergeSharedPlayerUpdates(players, [
      { id: 'token-row-1', player_index: 0, player_data: { name: 'Alice' } },
    ])
    expect(unchanged).toBe(players)

    expect(
      mergeSharedPlayerUpdates(players, [
        { id: 'token-row-2', player_index: 1, player_data: { name: 'Robert' } },
      ])
    ).toEqual([
      { id: 'player-1', name: 'Alice', role: 'player' },
      { id: 'player-2', name: 'Robert', role: 'player' },
    ])
  })
})
