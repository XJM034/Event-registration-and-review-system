import { describe, expect, it } from 'vitest'
import { getDefaultExportScope } from '../export/export-scope-utils'

describe('getDefaultExportScope', () => {
  it('defaults to selected when rows are selected', () => {
    expect(getDefaultExportScope(2)).toBe('selected')
  })

  it('defaults to pending when no rows are selected', () => {
    expect(getDefaultExportScope(0)).toBe('pending')
    expect(getDefaultExportScope(-1)).toBe('pending')
  })

  it('uses the caller-provided fallback when no rows are selected', () => {
    expect(getDefaultExportScope(0, 'approved')).toBe('approved')
    expect(getDefaultExportScope(-1, 'all')).toBe('all')
  })
})
