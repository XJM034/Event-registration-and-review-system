import { describe, expect, it } from 'vitest'
import {
  applyExportFieldFilters,
  parseExportRequest,
  resolveRoleForExport,
  type ExportConfig,
  sortPlayerFieldsForExport,
  sortTeamFieldsForExport,
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

  it('keeps export field order stable regardless of settings order', () => {
    const config: ExportConfig = {
      exportScope: 'all',
      groupBy: 'none',
      teamFields: ['contact', 'unit', 'name'],
      playerFields: ['player_number', 'gender', 'name', 'age'],
    }

    const filtered = applyExportFieldFilters(
      [
        { id: 'contact', label: '联系人' },
        { id: 'name', label: '队伍名称' },
        { id: 'unit', label: '参赛单位' },
      ],
      [
        {
          id: 'player',
          allFields: [
            { id: 'age', label: '年龄' },
            { id: 'player_number', label: '比赛服号码' },
            { id: 'name', label: '姓名' },
            { id: 'gender', label: '性别' },
          ],
        },
      ],
      config
    )

    expect(filtered.teamFields.map((field) => field.id)).toEqual(['unit', 'name', 'contact'])
    expect(filtered.playerRoles[0].allFields?.map((field) => field.id)).toEqual([
      'name',
      'gender',
      'age',
      'player_number',
    ])
  })
})

describe('field export ordering helpers', () => {
  it('sorts team fields by fixed priority first', () => {
    const fields = sortTeamFieldsForExport([
      { id: 'custom_b', label: '乙字段' },
      { id: 'contact', label: '联系人' },
      { id: 'name', label: '队伍名称' },
      { id: 'unit', label: '参赛单位' },
      { id: 'custom_a', label: '甲字段' },
    ])

    expect(fields.map((field) => field.id)).toEqual([
      'unit',
      'name',
      'contact',
      'custom_a',
      'custom_b',
    ])
  })

  it('sorts player/staff fields by fixed priority first', () => {
    const fields = sortPlayerFieldsForExport([
      { id: 'id_photo', label: '证件照' },
      { id: 'contact', label: '联系方式' },
      { id: 'player_number', label: '比赛服号码' },
      { id: 'name', label: '姓名' },
    ])

    expect(fields.map((field) => field.id)).toEqual([
      'name',
      'player_number',
      'contact',
      'id_photo',
    ])
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
