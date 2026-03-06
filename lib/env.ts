export function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!value) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  }
  return value
}

export function getSupabaseAnonKey() {
  const value = getOptionalSupabaseAnonKey()

  if (!value) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    )
  }

  return value
}

export function getServiceRoleKey() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!value) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  }
  return value
}

export function getJwtSecret() {
  const value = process.env.JWT_SECRET?.trim()
  if (!value) {
    throw new Error('Missing JWT_SECRET')
  }
  return value
}

export function getAdminSessionSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET?.trim()
    || process.env.JWT_SECRET?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY?.trim()
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    || null
  )
}

export function hasSupabaseBrowserEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && getOptionalSupabaseAnonKey())
}

export function getOptionalSupabaseAnonKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY?.trim()
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    || null
  )
}
