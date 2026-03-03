const SAFE_PROTOCOLS = new Set(['http:', 'https:'])

export const toSafeHttpUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (!SAFE_PROTOCOLS.has(parsed.protocol)) return null
    return parsed.toString()
  } catch {
    return null
  }
}
