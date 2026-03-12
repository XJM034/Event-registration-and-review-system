const SENSITIVE_ID_FIELD_IDS = new Set([
  'id_number',
  'idcard',
  'id_card',
  'identity_number',
])

export function isSensitiveIdentityField(fieldId?: string | null, label?: string | null) {
  const normalizedFieldId = String(fieldId || '').trim().toLowerCase()
  const normalizedLabel = String(label || '').trim()

  if (SENSITIVE_ID_FIELD_IDS.has(normalizedFieldId)) {
    return true
  }

  return normalizedLabel.includes('身份证') || normalizedLabel.includes('证件号码')
}

export function maskIdentityNumber(value: string) {
  const normalized = value.trim()
  if (!normalized) return ''

  if (normalized.length <= 4) {
    return '*'.repeat(normalized.length)
  }

  if (normalized.length <= 8) {
    return `${normalized.slice(0, 2)}${'*'.repeat(normalized.length - 4)}${normalized.slice(-2)}`
  }

  return `${normalized.slice(0, 6)}${'*'.repeat(normalized.length - 10)}${normalized.slice(-4)}`
}
