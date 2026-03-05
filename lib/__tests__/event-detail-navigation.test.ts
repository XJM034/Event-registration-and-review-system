import { describe, expect, it } from 'vitest'
import {
  MY_REGISTRATION_SCROLL_TARGET,
  resolveEventDetailScrollTarget,
} from '../portal/event-detail-navigation'

describe('resolveEventDetailScrollTarget', () => {
  it('supports the current scrollTo parameter', () => {
    const params = new URLSearchParams('scrollTo=my-registration')

    expect(resolveEventDetailScrollTarget(params)).toBe(MY_REGISTRATION_SCROLL_TARGET)
  })

  it('supports legacy tab=status parameter', () => {
    const params = new URLSearchParams('tab=status')

    expect(resolveEventDetailScrollTarget(params)).toBe(MY_REGISTRATION_SCROLL_TARGET)
  })

  it('returns null for unrelated parameters', () => {
    const params = new URLSearchParams('tab=overview&scrollTo=top')

    expect(resolveEventDetailScrollTarget(params)).toBeNull()
  })
})
