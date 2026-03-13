import { describe, expect, it } from 'vitest'

import {
  PASSWORD_POLICY_HINT,
  buildImportedCoachPassword,
  validatePasswordStrength,
} from '@/lib/password-policy'

describe('password policy', () => {
  it('rejects passwords below the shared minimum strength', () => {
    expect(validatePasswordStrength('abcdef123')).toEqual({
      valid: false,
      message: PASSWORD_POLICY_HINT,
    })
    expect(validatePasswordStrength('abcdefghij')).toEqual({
      valid: false,
      message: PASSWORD_POLICY_HINT,
    })
  })

  it('accepts passwords that satisfy the shared rule', () => {
    expect(validatePasswordStrength('Abcdef1234')).toEqual({
      valid: true,
      message: null,
    })
  })

  it('builds imported coach passwords that satisfy the shared rule', () => {
    const password = buildImportedCoachPassword('13800000001')

    expect(password).toBe('000001Aa1!')
    expect(validatePasswordStrength(password).valid).toBe(true)
  })
})
