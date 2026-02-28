type RegistrationDateConfig = {
  registrationStartDate?: string
  registrationEndDate?: string
  reviewEndDate?: string
}

type RegistrationSettingRow = {
  team_requirements?: unknown
  updated_at?: string
  created_at?: string
  [key: string]: unknown
}

const INVALID_DATE_RANK = 99

function parseRegistrationDateConfig(value: unknown): RegistrationDateConfig | null {
  if (!value) return null

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as RegistrationDateConfig)
        : null
    } catch {
      return null
    }
  }

  if (typeof value === 'object') {
    return value as RegistrationDateConfig
  }

  return null
}

function parseDateTime(value?: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getPhaseRank(setting: RegistrationSettingRow, now: Date): number {
  const parsed = parseRegistrationDateConfig(setting.team_requirements)
  if (!parsed) return INVALID_DATE_RANK

  const regStart = parseDateTime(parsed.registrationStartDate)
  const regEnd = parseDateTime(parsed.registrationEndDate)
  const reviewEnd = parseDateTime(parsed.reviewEndDate)

  if (regStart && now < regStart) return 1
  if (regEnd && now <= regEnd) return 0
  if (reviewEnd && regEnd && now > regEnd && now <= reviewEnd) return 2
  if (reviewEnd && !regEnd && now <= reviewEnd) return 2
  if (regStart && !regEnd && now >= regStart) return 0
  if (!regStart && !regEnd && !reviewEnd) return INVALID_DATE_RANK
  return 3
}

function getUpdatedAt(setting: RegistrationSettingRow): number {
  const timestamp = Date.parse((setting.updated_at as string) || (setting.created_at as string) || '')
  return Number.isNaN(timestamp) ? 0 : timestamp
}

export function pickEffectiveRegistrationSetting(
  settings: RegistrationSettingRow[] | null | undefined,
  now: Date = new Date(),
): RegistrationSettingRow | null {
  if (!settings || settings.length === 0) return null
  if (settings.length === 1) return settings[0]

  return settings.reduce((best, current) => {
    if (!best) return current

    const bestRank = getPhaseRank(best, now)
    const currentRank = getPhaseRank(current, now)

    if (currentRank < bestRank) return current
    if (currentRank > bestRank) return best

    return getUpdatedAt(current) > getUpdatedAt(best) ? current : best
  }, null as RegistrationSettingRow | null)
}
