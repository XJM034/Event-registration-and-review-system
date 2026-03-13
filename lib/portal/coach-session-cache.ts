const PORTAL_COACH_AUTH_ID_KEY = 'portal_coach_auth_id'
const PORTAL_COACH_ID_KEY = 'portal_coach_id'

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

export function readCachedPortalCoachId(authUserId: string): string | null {
  if (!authUserId || !canUseSessionStorage()) {
    return null
  }

  const cachedAuthUserId = window.sessionStorage.getItem(PORTAL_COACH_AUTH_ID_KEY)
  const cachedCoachId = window.sessionStorage.getItem(PORTAL_COACH_ID_KEY)

  if (cachedAuthUserId !== authUserId || !cachedCoachId) {
    return null
  }

  return cachedCoachId
}

export function writeCachedPortalCoachId(authUserId: string, coachId: string) {
  if (!authUserId || !coachId || !canUseSessionStorage()) {
    return
  }

  window.sessionStorage.setItem(PORTAL_COACH_AUTH_ID_KEY, authUserId)
  window.sessionStorage.setItem(PORTAL_COACH_ID_KEY, coachId)
}

export function clearCachedPortalCoachId() {
  if (!canUseSessionStorage()) {
    return
  }

  window.sessionStorage.removeItem(PORTAL_COACH_AUTH_ID_KEY)
  window.sessionStorage.removeItem(PORTAL_COACH_ID_KEY)
}
