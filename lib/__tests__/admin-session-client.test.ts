import { describe, expect, it } from 'vitest'

import {
  normalizeAdminShellProfile,
  parseStoredAdminProfile,
  serializeStoredAdminProfile,
} from '@/lib/admin-session-client'

describe('admin session client helpers', () => {
  it('normalizes admin profiles before persisting', () => {
    expect(normalizeAdminShellProfile({
      name: '  超级管理员  ',
      phone: ' 13800000001 ',
      isSuper: true,
    })).toEqual({
      name: '超级管理员',
      phone: '13800000001',
      isSuper: true,
    })
  })

  it('binds the cached admin profile to the current tab session token', () => {
    const raw = serializeStoredAdminProfile('token-a', {
      name: '管理员甲',
      phone: '13800000001',
      isSuper: false,
    })

    expect(parseStoredAdminProfile(raw, 'token-a')).toEqual({
      name: '管理员甲',
      phone: '13800000001',
      isSuper: false,
    })
    expect(parseStoredAdminProfile(raw, 'token-b')).toBeNull()
  })

  it('treats legacy or malformed cache payloads as invalid', () => {
    expect(parseStoredAdminProfile(JSON.stringify({
      name: '旧管理员',
      phone: '13800000001',
      isSuper: true,
    }), 'token-a')).toBeNull()
    expect(parseStoredAdminProfile('{bad json', 'token-a')).toBeNull()
  })
})
