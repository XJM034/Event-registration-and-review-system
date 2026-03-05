export const ADMIN_SESSION_COOKIE_NAME = 'admin-session'
export const ADMIN_TAB_SESSION_COOKIE_NAME = 'admin-session-tab'

const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

type AdminSessionPayload = {
  v: 1
  authId: string
  adminId: string
  isSuper: boolean
  iat: number
  exp: number
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

let signingKeyPromise: Promise<CryptoKey> | null = null

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET
    || process.env.JWT_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY

  if (!secret) {
    throw new Error('Missing admin session secret')
  }

  return secret
}

function getCryptoApi() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is not available')
  }
  return globalThis.crypto
}

async function getSigningKey() {
  if (!signingKeyPromise) {
    signingKeyPromise = getCryptoApi().subtle.importKey(
      'raw',
      encoder.encode(getSecret()),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    )
  }
  return signingKeyPromise
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const value of bytes) {
    binary += String.fromCharCode(value)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(input: string) {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) {
    base64 += '='
  }

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function signPayload(payload: string) {
  const key = await getSigningKey()
  const signature = await getCryptoApi().subtle.sign('HMAC', key, encoder.encode(payload))
  return bytesToBase64Url(new Uint8Array(signature))
}

async function verifySignature(payload: string, signature: string) {
  const key = await getSigningKey()
  return getCryptoApi().subtle.verify(
    'HMAC',
    key,
    base64UrlToBytes(signature),
    encoder.encode(payload),
  )
}

function isValidPayload(payload: unknown): payload is AdminSessionPayload {
  if (!payload || typeof payload !== 'object') return false
  const value = payload as Record<string, unknown>
  return (
    value.v === 1
    && typeof value.authId === 'string'
    && typeof value.adminId === 'string'
    && typeof value.isSuper === 'boolean'
    && typeof value.iat === 'number'
    && typeof value.exp === 'number'
  )
}

export function getAdminSessionMaxAge() {
  return ADMIN_SESSION_MAX_AGE_SECONDS
}

export async function createAdminSessionToken(
  authId: string,
  adminId: string,
  isSuper: boolean,
) {
  const now = Math.floor(Date.now() / 1000)
  const payload: AdminSessionPayload = {
    v: 1,
    authId,
    adminId,
    isSuper,
    iat: now,
    exp: now + getAdminSessionMaxAge(),
  }

  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)))
  const signature = await signPayload(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export async function verifyAdminSessionToken(token?: string | null) {
  if (!token) return null

  const [encodedPayload, signature, ...rest] = token.split('.')
  if (!encodedPayload || !signature || rest.length > 0) return null

  try {
    const validSignature = await verifySignature(encodedPayload, signature)
    if (!validSignature) return null

    const payloadJson = decoder.decode(base64UrlToBytes(encodedPayload))
    const parsedPayload: unknown = JSON.parse(payloadJson)

    if (!isValidPayload(parsedPayload)) {
      return null
    }

    if (parsedPayload.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }

    return parsedPayload
  } catch {
    return null
  }
}
