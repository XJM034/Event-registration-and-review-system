import { describe, expect, it } from 'vitest'
import { toSafeHttpUrl } from '../url-security'

describe('toSafeHttpUrl', () => {
  it('accepts http/https urls', () => {
    expect(toSafeHttpUrl('https://example.com/file.pdf')).toBe('https://example.com/file.pdf')
    expect(toSafeHttpUrl('  http://example.com/path  ')).toBe('http://example.com/path')
  })

  it('rejects non-http protocols and invalid values', () => {
    expect(toSafeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(toSafeHttpUrl('data:text/html;base64,SGVsbG8=')).toBeNull()
    expect(toSafeHttpUrl('not-a-url')).toBeNull()
    expect(toSafeHttpUrl('')).toBeNull()
    expect(toSafeHttpUrl(null)).toBeNull()
  })
})
