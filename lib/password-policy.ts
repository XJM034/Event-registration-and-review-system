export const PASSWORD_POLICY_MIN_LENGTH = 10
export const PASSWORD_POLICY_TEMP_SUFFIX = 'Aa1!'
export const PASSWORD_POLICY_HINT = `密码至少${PASSWORD_POLICY_MIN_LENGTH}位，且需同时包含大写字母、小写字母和数字`
export const PASSWORD_POLICY_PLACEHOLDER = `至少${PASSWORD_POLICY_MIN_LENGTH}位，包含大小写字母和数字`
export const IMPORTED_COACH_PASSWORD_RULE = `默认密码为手机号后 6 位 + ${PASSWORD_POLICY_TEMP_SUFFIX}`

export function validatePasswordStrength(password: string) {
  const normalized = String(password || '')

  if (normalized.length < PASSWORD_POLICY_MIN_LENGTH) {
    return {
      valid: false,
      message: PASSWORD_POLICY_HINT,
    }
  }

  if (!/[a-z]/.test(normalized) || !/[A-Z]/.test(normalized) || !/\d/.test(normalized)) {
    return {
      valid: false,
      message: PASSWORD_POLICY_HINT,
    }
  }

  return {
    valid: true,
    message: null,
  }
}

export function buildImportedCoachPassword(phone: string) {
  return `${phone.slice(-6)}${PASSWORD_POLICY_TEMP_SUFFIX}`
}
