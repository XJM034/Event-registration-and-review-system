import { describe, expect, it } from 'vitest'
import { isSensitiveIdentityField, maskIdentityNumber } from '../privacy-mask'

describe('privacy mask helpers', () => {
  it('detects sensitive identity fields by id or label', () => {
    expect(isSensitiveIdentityField('id_number', '证件号码')).toBe(true)
    expect(isSensitiveIdentityField('idcard', '身份证号')).toBe(true)
    expect(isSensitiveIdentityField('phone', '联系方式')).toBe(false)
  })

  it('masks long identity numbers while preserving prefix and suffix', () => {
    expect(maskIdentityNumber('440101199901011234')).toBe('440101********1234')
    expect(maskIdentityNumber('AB123456')).toBe('AB****56')
    expect(maskIdentityNumber('1234')).toBe('****')
  })
})
