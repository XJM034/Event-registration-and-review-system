export interface ExportConfig {
  exportScope: 'selected' | 'approved' | 'pending' | 'all'
  teamFields?: string[]
  playerFields?: string[]
  groupBy: 'none' | 'division' | 'unit' | 'division_unit'
  fileNamePrefix?: string
}

export interface ExportRequest {
  registrationIds?: string[]
  config: ExportConfig
}

export interface ExportField {
  id: string
  type?: string
  [key: string]: unknown
}

export interface ExportRole {
  id: string
  allFields?: ExportField[]
  commonFields?: ExportField[]
  customFields?: ExportField[]
  [key: string]: unknown
}

const EXPORT_SCOPES: ExportConfig['exportScope'][] = ['selected', 'approved', 'pending', 'all']
const GROUP_BY_OPTIONS: ExportConfig['groupBy'][] = ['none', 'division', 'unit', 'division_unit']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

export const parseExportRequest = (value: unknown): ExportRequest | null => {
  if (!isRecord(value) || !isRecord(value.config)) return null

  const rawConfig = value.config
  const exportScope = rawConfig.exportScope
  const groupBy = rawConfig.groupBy

  if (typeof exportScope !== 'string' || !EXPORT_SCOPES.includes(exportScope as ExportConfig['exportScope'])) {
    return null
  }
  if (typeof groupBy !== 'string' || !GROUP_BY_OPTIONS.includes(groupBy as ExportConfig['groupBy'])) {
    return null
  }

  const hasTeamFields = Object.prototype.hasOwnProperty.call(rawConfig, 'teamFields')
  const hasPlayerFields = Object.prototype.hasOwnProperty.call(rawConfig, 'playerFields')

  if (hasTeamFields && !isStringArray(rawConfig.teamFields)) return null
  if (hasPlayerFields && !isStringArray(rawConfig.playerFields)) return null

  const registrationIds = isStringArray(value.registrationIds) ? value.registrationIds : undefined
  const fileNamePrefix = typeof rawConfig.fileNamePrefix === 'string' ? rawConfig.fileNamePrefix : undefined

  return {
    registrationIds,
    config: {
      exportScope: exportScope as ExportConfig['exportScope'],
      groupBy: groupBy as ExportConfig['groupBy'],
      teamFields: hasTeamFields ? (rawConfig.teamFields as string[]) : undefined,
      playerFields: hasPlayerFields ? (rawConfig.playerFields as string[]) : undefined,
      fileNamePrefix,
    },
  }
}

const normalizeRoleFields = (role: ExportRole): ExportField[] =>
  role.allFields || [
    ...(role.commonFields || []),
    ...(role.customFields || []),
  ]

export const applyExportFieldFilters = (
  allTeamFields: ExportField[],
  allPlayerRoles: ExportRole[],
  config: ExportConfig
) => {
  const nextTeamFields =
    config.teamFields === undefined
      ? [...allTeamFields]
      : allTeamFields.filter((field) => config.teamFields!.includes(field.id))

  const nextPlayerRoles = allPlayerRoles.map((role) => {
    const roleFields = normalizeRoleFields(role)
    const nextFields =
      config.playerFields === undefined
        ? roleFields
        : roleFields.filter((field) => config.playerFields!.includes(field.id))

    return {
      ...role,
      allFields: nextFields,
    }
  })

  return {
    teamFields: nextTeamFields,
    playerRoles: nextPlayerRoles,
  }
}

export const resolveRoleForExport = (
  rawRoleId: string,
  rolesById: Map<string, ExportRole>,
  fallbackRole?: ExportRole
) => {
  const role = rolesById.get(rawRoleId) || fallbackRole
  if (!role) {
    return {
      role: undefined,
      effectiveRoleId: rawRoleId,
    }
  }

  return {
    role,
    effectiveRoleId: role.id || rawRoleId,
  }
}
