export const MY_REGISTRATION_SCROLL_TARGET = 'my-registration' as const

const LEGACY_MY_REGISTRATION_TAB = 'status'

type SearchParamsLike = {
  get: (name: string) => string | null
}

export function resolveEventDetailScrollTarget(
  searchParams: SearchParamsLike
): typeof MY_REGISTRATION_SCROLL_TARGET | null {
  const scrollTo = searchParams.get('scrollTo')
  if (scrollTo === MY_REGISTRATION_SCROLL_TARGET) {
    return MY_REGISTRATION_SCROLL_TARGET
  }

  const tab = searchParams.get('tab')
  if (tab === LEGACY_MY_REGISTRATION_TAB) {
    return MY_REGISTRATION_SCROLL_TARGET
  }

  return null
}
