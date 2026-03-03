import { describe, expect, it } from 'vitest'
import {
  applyExportFieldFilters,
  parseExportRequest,
  resolveRoleForExport,
  type ExportConfig,
} from '../export/export-route-utils'

describe('parseExportRequest', () => {
  it('parses valid payload', () => {
    const payload = {
      registrationIds: ['reg-1', 'reg-2'],
      config: {
        exportScope: 'selected',
        groupBy: 'division',
        teamFields: ['name', 'unit'],
        playerFields: ['name'],
        fileNamePrefix: '测试赛事',
      },
    }

    const parsed = parseExportRequest(payload)
    expect(parsed).not.toBeNull()
    expect(parsed?.registrationIds).toEqual(['reg-1', 'reg-2'])
    expect(parsed?.config.exportScope).toBe('selected')
    expect(parsed?.config.groupBy).toBe('division')
  })

  it('returns null when config is missing', () => {
    expect(parseExportRequest({ registrationIds: ['reg-1'] })).toBeNull()
  })

  it('keeps empty field arrays so backend can honor deselect-all', () => {
    const payload = {
      config: {
        exportScope: 'all',
        groupBy: 'none',
        teamFields: [],
        playerFields: [],
      },
    }

    const parsed = parseExportRequest(payload)
    expect(parsed).not.toBeNull()
    expect(parsed?.config.teamFields).toEqual([])
    expect(parsed?.config.playerFields).toEqual([])
  })
})

describe('applyExportFieldFilters', () => {
  it('supports deselect-all for team/player fields', () => {
    const config: ExportConfig = {
      exportScope: 'all',
      groupBy: 'none',
      teamFields: [],
      playerFields: [],
    }

    const filtered = applyExportFieldFilters(
      [{ id: 'name' }, { id: 'unit' }],
      [
        { id: 'player', allFields: [{ id: 'name' }, { id: 'gender' }] },
        { id: 'coach', commonFields: [{ id: 'name' }] },
      ],
      config
    )

    expect(filtered.teamFields).toHaveLength(0)
    expect(filtered.playerRoles[0].allFields).toEqual([])
    expect(filtered.playerRoles[1].allFields).toEqual([])
  })
})

describe('resolveRoleForExport', () => {
  it('falls back to default role id when role is missing', () => {
    const rolesById = new Map([
      ['player', { id: 'player', allFields: [{ id: 'name' }] }],
    ])

    const result = resolveRoleForExport('legacy-role-id', rolesById, { id: 'player', allFields: [{ id: 'name' }] })

    expect(result.role?.id).toBe('player')
    expect(result.effectiveRoleId).toBe('player')
  })
})
