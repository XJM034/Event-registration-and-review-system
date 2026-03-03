import { describe, expect, it } from 'vitest'
import { getFileExtension, validateUploadFile } from '../upload-file-validation'

const bytes = (...values: number[]) => new Uint8Array(values)

describe('getFileExtension', () => {
  it('extracts lowercase extension', () => {
    expect(getFileExtension('Template.DOCX')).toBe('docx')
    expect(getFileExtension('a.b.c.pdf')).toBe('pdf')
  })

  it('returns empty extension for invalid file names', () => {
    expect(getFileExtension('file')).toBe('')
    expect(getFileExtension('.hidden')).toBe('')
    expect(getFileExtension('name.')).toBe('')
  })
})

describe('validateUploadFile', () => {
  it('accepts valid image for event posters', () => {
    const result = validateUploadFile({
      fileName: 'poster.jpg',
      mimeType: 'image/jpeg',
      bucket: 'event-posters',
      fileBytes: bytes(0xff, 0xd8, 0xff, 0xe0),
    })
    expect(result.valid).toBe(true)
    expect(result.extension).toBe('jpg')
  })

  it('rejects non-image extension for event posters', () => {
    const result = validateUploadFile({
      fileName: 'guide.pdf',
      mimeType: 'application/pdf',
      bucket: 'event-posters',
    })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('赛事海报仅支持图片文件')
  })

  it('rejects mime mismatch for extension', () => {
    const result = validateUploadFile({
      fileName: 'file.png',
      mimeType: 'application/pdf',
      bucket: 'team-documents',
    })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('文件类型与扩展名不匹配')
  })

  it('rejects signature mismatch', () => {
    const result = validateUploadFile({
      fileName: 'file.png',
      mimeType: 'image/png',
      bucket: 'team-documents',
      fileBytes: bytes(0xff, 0xd8, 0xff, 0xe0),
    })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('文件内容与扩展名不匹配')
  })

  it('accepts docx/octet-stream when zip signature is valid', () => {
    const result = validateUploadFile({
      fileName: 'rules.docx',
      mimeType: 'application/octet-stream',
      bucket: 'team-documents',
      fileBytes: bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00),
    })
    expect(result.valid).toBe(true)
    expect(result.extension).toBe('docx')
  })
})
