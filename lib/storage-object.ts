import {
  ALLOWED_UPLOAD_BUCKETS,
  type UploadBucket,
} from '@/lib/upload-file-validation'

export type { UploadBucket } from '@/lib/upload-file-validation'

const PRIVATE_STORAGE_BUCKETS = new Set<UploadBucket>([
  'registration-files',
  'player-photos',
  'team-documents',
])

const COACH_OWNED_STORAGE_PREFIX = 'coach'
const PUBLIC_SHARE_OWNED_STORAGE_PREFIX = 'public-share'

export interface StorageObjectRef {
  bucket: UploadBucket
  path: string
}

export function isUploadBucket(value: string): value is UploadBucket {
  return ALLOWED_UPLOAD_BUCKETS.has(value as UploadBucket)
}

export function isPrivateStorageBucket(bucket: string): bucket is UploadBucket {
  return PRIVATE_STORAGE_BUCKETS.has(bucket as UploadBucket)
}

function normalizeStoragePath(path: string) {
  return path.replace(/^\/+/, '').trim()
}

function sanitizeStoragePathSegment(value: string) {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  return sanitized || 'unknown'
}

export function buildCoachOwnedStoragePath(coachId: string, path: string) {
  return `${COACH_OWNED_STORAGE_PREFIX}/${sanitizeStoragePathSegment(coachId)}/${normalizeStoragePath(path)}`
}

export function isCoachOwnedStoragePath(path: string, coachId: string) {
  const normalizedPath = normalizeStoragePath(path)
  const prefix = `${COACH_OWNED_STORAGE_PREFIX}/${sanitizeStoragePathSegment(coachId)}/`
  return normalizedPath.startsWith(prefix) && normalizedPath.length > prefix.length
}

export interface PublicShareStorageOwner {
  registrationId: string
  playerId?: string | null
  playerIndex?: number | null
}

function getPublicShareStorageOwnerSegment(owner: PublicShareStorageOwner) {
  if (typeof owner.playerId === 'string' && owner.playerId.trim()) {
    return `player-${sanitizeStoragePathSegment(owner.playerId)}`
  }

  if (
    typeof owner.playerIndex === 'number'
    && Number.isInteger(owner.playerIndex)
    && owner.playerIndex >= 0
  ) {
    return `index-${owner.playerIndex}`
  }

  return 'unknown'
}

export function buildPublicShareOwnedStoragePath(owner: PublicShareStorageOwner, path: string) {
  return `${PUBLIC_SHARE_OWNED_STORAGE_PREFIX}/${sanitizeStoragePathSegment(owner.registrationId)}/${getPublicShareStorageOwnerSegment(owner)}/${normalizeStoragePath(path)}`
}

export function isPublicShareOwnedStoragePath(path: string, owner: PublicShareStorageOwner) {
  const normalizedPath = normalizeStoragePath(path)
  const prefix = `${PUBLIC_SHARE_OWNED_STORAGE_PREFIX}/${sanitizeStoragePathSegment(owner.registrationId)}/${getPublicShareStorageOwnerSegment(owner)}/`
  return normalizedPath.startsWith(prefix) && normalizedPath.length > prefix.length
}

export function buildStorageObjectUrl(
  bucket: UploadBucket,
  path: string,
  options?: {
    download?: boolean
    fileName?: string | null
    shareToken?: string | null
  }
) {
  const normalizedPath = normalizeStoragePath(path)
  const searchParams = new URLSearchParams({
    bucket,
    path: normalizedPath,
  })

  if (options?.download) {
    searchParams.set('download', '1')
  }

  if (options?.fileName) {
    searchParams.set('filename', options.fileName)
  }

  if (options?.shareToken) {
    searchParams.set('share_token', options.shareToken)
  }

  return `/api/storage/object?${searchParams.toString()}`
}

function parseManagedStorageUrl(rawUrl: string): (StorageObjectRef & { shareToken?: string | null }) | null {
  try {
    const parsed = rawUrl.startsWith('/')
      ? new URL(rawUrl, 'http://local.test')
      : new URL(rawUrl)

    if (parsed.pathname !== '/api/storage/object') {
      return null
    }

    const bucket = parsed.searchParams.get('bucket')
    const path = parsed.searchParams.get('path')

    if (!bucket || !path || !isUploadBucket(bucket)) {
      return null
    }

    return {
      bucket,
      path: normalizeStoragePath(decodeURIComponent(path)),
      shareToken: parsed.searchParams.get('share_token'),
    }
  } catch {
    return null
  }
}

function parsePublicStorageUrl(rawUrl: string): StorageObjectRef | null {
  try {
    const parsed = rawUrl.startsWith('/')
      ? new URL(rawUrl, 'http://local.test')
      : new URL(rawUrl)

    const marker = '/storage/v1/object/public/'
    const markerIndex = parsed.pathname.indexOf(marker)
    if (markerIndex === -1) {
      return null
    }

    const rawRemainder = parsed.pathname.slice(markerIndex + marker.length)
    const [bucket, ...pathParts] = rawRemainder.split('/')
    if (!bucket || pathParts.length === 0 || !isUploadBucket(bucket)) {
      return null
    }

    return {
      bucket,
      path: normalizeStoragePath(decodeURIComponent(pathParts.join('/'))),
    }
  } catch {
    return null
  }
}

export function extractStorageObjectRef(
  value: unknown,
  fallbackBucket?: UploadBucket
): StorageObjectRef | null {
  if (!value) return null

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null

    const managedRef = parseManagedStorageUrl(trimmed)
    if (managedRef) {
      return {
        bucket: managedRef.bucket,
        path: managedRef.path,
      }
    }

    const publicRef = parsePublicStorageUrl(trimmed)
    if (publicRef) {
      return publicRef
    }

    if (fallbackBucket && !trimmed.startsWith('http') && !trimmed.startsWith('/')) {
      return {
        bucket: fallbackBucket,
        path: normalizeStoragePath(trimmed),
      }
    }

    return null
  }

  if (Array.isArray(value)) {
    return null
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const recordBucket =
      typeof record.bucket === 'string' && isUploadBucket(record.bucket)
        ? record.bucket
        : fallbackBucket
    const recordPath = typeof record.path === 'string' ? normalizeStoragePath(record.path) : ''

    if (recordBucket && recordPath) {
      return {
        bucket: recordBucket,
        path: recordPath,
      }
    }

    if (typeof record.url === 'string') {
      return extractStorageObjectRef(record.url, recordBucket)
    }
  }

  return null
}

export function collectStorageObjectRefs(
  value: unknown,
  fallbackBucket?: UploadBucket
): StorageObjectRef[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStorageObjectRefs(item, fallbackBucket))
  }

  const ref = extractStorageObjectRef(value, fallbackBucket)
  return ref ? [ref] : []
}

export function storedValueIncludesStorageRef(
  value: unknown,
  target: StorageObjectRef,
  fallbackBucket?: UploadBucket
): boolean {
  const directRef = extractStorageObjectRef(value, fallbackBucket)
  if (directRef) {
    return directRef.bucket === target.bucket && directRef.path === target.path
  }

  if (Array.isArray(value)) {
    return value.some((item) => storedValueIncludesStorageRef(item, target, fallbackBucket))
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .some((item) => storedValueIncludesStorageRef(item, target, fallbackBucket))
  }

  return false
}

export function resolveStorageObjectUrl(
  value: unknown,
  options?: {
    fallbackBucket?: UploadBucket
    download?: boolean
    fileName?: string | null
  },
): string | null {
  if (!value) return null

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null

    const managedRef = parseManagedStorageUrl(trimmed)
    if (managedRef) {
      return buildStorageObjectUrl(managedRef.bucket, managedRef.path, {
        download: options?.download,
        fileName: options?.fileName,
        shareToken: managedRef.shareToken,
      })
    }

    const ref = extractStorageObjectRef(trimmed, options?.fallbackBucket)
    if (!ref) {
      return trimmed
    }

    return buildStorageObjectUrl(ref.bucket, ref.path, {
      download: options?.download,
      fileName: options?.fileName,
    })
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const recordBucket =
      typeof record.bucket === 'string' && isUploadBucket(record.bucket)
        ? record.bucket
        : options?.fallbackBucket

    if (typeof record.url === 'string') {
      return resolveStorageObjectUrl(record.url, {
        ...options,
        fallbackBucket: recordBucket,
      })
    }

    if (recordBucket && typeof record.path === 'string' && record.path.trim()) {
      return buildStorageObjectUrl(recordBucket, record.path, {
        download: options?.download,
        fileName: options?.fileName,
      })
    }
  }

  return null
}
