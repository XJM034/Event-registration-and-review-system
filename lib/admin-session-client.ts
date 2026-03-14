export type AdminShellProfile = {
  name: string
  phone: string | null
  isSuper: boolean
}

type StoredAdminProfileRecord = {
  sessionToken: string
  profile: AdminShellProfile
}

const TAB_ADMIN_SESSION_STORAGE_KEY = 'tab_admin_session_token'
const ADMIN_TAB_SESSION_COOKIE_NAME = 'admin-session-tab'
const ADMIN_SHELL_PROFILE_STORAGE_KEY = 'admin_shell_profile'

export function normalizeAdminShellProfile(profile: Partial<AdminShellProfile> | null | undefined): AdminShellProfile {
  return {
    name: typeof profile?.name === 'string' && profile.name.trim() ? profile.name.trim() : '管理员',
    phone: typeof profile?.phone === 'string' && profile.phone.trim() ? profile.phone.trim() : null,
    isSuper: profile?.isSuper === true,
  }
}

export function parseStoredAdminProfile(
  raw: string | null | undefined,
  sessionToken: string | null | undefined,
) {
  if (!raw || !sessionToken) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAdminProfileRecord>
    if (parsed.sessionToken !== sessionToken) {
      return null
    }

    return normalizeAdminShellProfile(parsed.profile)
  } catch {
    return null
  }
}

export function serializeStoredAdminProfile(
  sessionToken: string | null | undefined,
  profile: AdminShellProfile | null | undefined,
) {
  if (!sessionToken || !profile) {
    return null
  }

  return JSON.stringify({
    sessionToken,
    profile: normalizeAdminShellProfile(profile),
  } satisfies StoredAdminProfileRecord)
}

export function getCurrentTabAdminSessionToken() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.sessionStorage.getItem(TAB_ADMIN_SESSION_STORAGE_KEY)
}

export function setCurrentTabAdminSessionToken(token: string | null) {
  if (typeof window === 'undefined') {
    return
  }

  if (token) {
    window.sessionStorage.setItem(TAB_ADMIN_SESSION_STORAGE_KEY, token)
    return
  }

  window.sessionStorage.removeItem(TAB_ADMIN_SESSION_STORAGE_KEY)
}

export function clearCurrentTabAdminSessionToken() {
  setCurrentTabAdminSessionToken(null)
}

export function writeAdminTabSessionCookie(token: string | null) {
  if (typeof document === 'undefined') {
    return
  }

  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  if (token) {
    document.cookie = `${ADMIN_TAB_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secure}`
    return
  }

  document.cookie = `${ADMIN_TAB_SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
}

export function readStoredAdminProfile() {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.sessionStorage.getItem(ADMIN_SHELL_PROFILE_STORAGE_KEY)
  const profile = parseStoredAdminProfile(raw, getCurrentTabAdminSessionToken())
  if (!profile && raw) {
    window.sessionStorage.removeItem(ADMIN_SHELL_PROFILE_STORAGE_KEY)
  }

  return profile
}

export function writeStoredAdminProfile(profile: AdminShellProfile | null) {
  if (typeof window === 'undefined') {
    return
  }

  const raw = serializeStoredAdminProfile(getCurrentTabAdminSessionToken(), profile)
  if (!raw) {
    window.sessionStorage.removeItem(ADMIN_SHELL_PROFILE_STORAGE_KEY)
    return
  }

  window.sessionStorage.setItem(ADMIN_SHELL_PROFILE_STORAGE_KEY, raw)
}

export function clearStoredAdminProfile() {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.removeItem(ADMIN_SHELL_PROFILE_STORAGE_KEY)
}

export function clearCurrentTabAdminClientState() {
  clearCurrentTabAdminSessionToken()
  clearStoredAdminProfile()
  writeAdminTabSessionCookie(null)
}
