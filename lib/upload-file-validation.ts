export type UploadBucket =
  | 'event-posters'
  | 'registration-files'
  | 'player-photos'
  | 'team-documents'

export const ALLOWED_UPLOAD_BUCKETS = new Set<UploadBucket>([
  'event-posters',
  'registration-files',
  'player-photos',
  'team-documents',
])

export const ADMIN_ALLOWED_UPLOAD_BUCKETS = new Set<UploadBucket>([
  ...ALLOWED_UPLOAD_BUCKETS,
])

export const COACH_ALLOWED_UPLOAD_BUCKETS = new Set<UploadBucket>([
  'registration-files',
  'player-photos',
  'team-documents',
])

export const PUBLIC_SHARE_ALLOWED_UPLOAD_BUCKETS = new Set<UploadBucket>([
  'player-photos',
  'team-documents',
])

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
const DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx'])
const ALLOWED_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS])

const ALLOWED_MIME_TYPES_BY_EXTENSION: Record<string, Set<string>> = {
  jpg: new Set(['image/jpeg', 'image/jpg', 'image/pjpeg']),
  jpeg: new Set(['image/jpeg', 'image/jpg', 'image/pjpeg']),
  png: new Set(['image/png']),
  gif: new Set(['image/gif']),
  webp: new Set(['image/webp']),
  pdf: new Set(['application/pdf', 'application/x-pdf']),
  doc: new Set(['application/msword']),
  docx: new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/x-zip-compressed',
  ]),
  xls: new Set(['application/vnd.ms-excel']),
  xlsx: new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed',
  ]),
}

const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04], // regular zip
  [0x50, 0x4b, 0x05, 0x06], // empty zip
  [0x50, 0x4b, 0x07, 0x08], // spanned zip
]

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

const startsWithBytes = (bytes: Uint8Array, signature: number[]): boolean => {
  if (bytes.length < signature.length) return false
  return signature.every((value, index) => bytes[index] === value)
}

const hasFileSignature = (extension: string, bytes: Uint8Array): boolean => {
  if (!bytes.length) return false

  if (extension === 'jpg' || extension === 'jpeg') {
    return startsWithBytes(bytes, [0xff, 0xd8, 0xff])
  }

  if (extension === 'png') {
    return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  }

  if (extension === 'gif') {
    return startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  }

  if (extension === 'webp') {
    return bytes.length >= 12 &&
      startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
  }

  if (extension === 'pdf') {
    return startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]) // %PDF-
  }

  if (extension === 'doc' || extension === 'xls') {
    return startsWithBytes(bytes, OLE_SIGNATURE)
  }

  if (extension === 'docx' || extension === 'xlsx') {
    return ZIP_SIGNATURES.some((signature) => startsWithBytes(bytes, signature))
  }

  return false
}

export const getFileExtension = (fileName: string): string => {
  const normalized = fileName.trim()
  const lastDot = normalized.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === normalized.length - 1) return ''
  return normalized.slice(lastDot + 1).toLowerCase()
}

export interface UploadValidationInput {
  fileName: string
  mimeType?: string | null
  bucket: UploadBucket
  fileBytes?: Uint8Array
}

export interface UploadValidationResult {
  valid: boolean
  extension?: string
  error?: string
}

export const validateUploadFile = ({
  fileName,
  mimeType,
  bucket,
  fileBytes,
}: UploadValidationInput): UploadValidationResult => {
  const extension = getFileExtension(fileName)
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return {
      valid: false,
      error: '仅支持 JPG/PNG/GIF/WEBP/PDF/DOC/DOCX/XLS/XLSX 文件',
    }
  }

  if ((bucket === 'event-posters' || bucket === 'player-photos') && !IMAGE_EXTENSIONS.has(extension)) {
    return {
      valid: false,
      error: bucket === 'event-posters' ? '赛事海报仅支持图片文件' : '队员照片仅支持图片文件',
    }
  }

  const normalizedMimeType = (mimeType || '').trim().toLowerCase()
  if (normalizedMimeType && normalizedMimeType !== 'application/octet-stream') {
    const allowedMimeTypes = ALLOWED_MIME_TYPES_BY_EXTENSION[extension] || new Set<string>()
    if (!allowedMimeTypes.has(normalizedMimeType)) {
      return {
        valid: false,
        error: '文件类型与扩展名不匹配',
      }
    }
  }

  if (fileBytes && !hasFileSignature(extension, fileBytes)) {
    return {
      valid: false,
      error: '文件内容与扩展名不匹配',
    }
  }

  return {
    valid: true,
    extension,
  }
}
