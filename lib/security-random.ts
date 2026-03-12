const FALLBACK_RANDOM_LENGTH = 16

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

function getCryptoApi() {
  return globalThis.crypto ?? null
}

function createRandomHex() {
  const cryptoApi = getCryptoApi()
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(FALLBACK_RANDOM_LENGTH)
    cryptoApi.getRandomValues(bytes)
    return bytesToHex(bytes)
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function generateSecureId(prefix?: string) {
  const cryptoApi = getCryptoApi()
  const rawId = cryptoApi?.randomUUID?.() ?? createRandomHex()
  return prefix ? `${prefix}-${rawId}` : rawId
}
