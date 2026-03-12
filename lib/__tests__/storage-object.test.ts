import { describe, expect, it } from 'vitest'
import {
  buildCoachOwnedStoragePath,
  buildPublicShareOwnedStoragePath,
  buildStorageObjectUrl,
  collectStorageObjectRefs,
  extractStorageObjectRef,
  isCoachOwnedStoragePath,
  isPublicShareOwnedStoragePath,
  resolveStorageObjectUrl,
  storedValueIncludesStorageRef,
} from '@/lib/storage-object'

describe('storage object helpers', () => {
  it('builds and parses managed storage urls', () => {
    const url = buildStorageObjectUrl('player-photos', 'folder/image.png', {
      shareToken: 'token-123',
    })

    expect(url).toContain('/api/storage/object?')
    expect(extractStorageObjectRef(url)).toEqual({
      bucket: 'player-photos',
      path: 'folder/image.png',
    })
  })

  it('parses legacy public storage urls', () => {
    const ref = extractStorageObjectRef(
      'https://example.com/storage/v1/object/public/team-documents/docs/file.pdf',
    )

    expect(ref).toEqual({
      bucket: 'team-documents',
      path: 'docs/file.pdf',
    })
  })

  it('collects refs from nested attachment payloads', () => {
    const refs = collectStorageObjectRefs([
      {
        bucket: 'team-documents',
        path: 'docs/a.pdf',
      },
      {
        url: buildStorageObjectUrl('team-documents', 'docs/b.pdf'),
      },
    ])

    expect(refs).toEqual([
      { bucket: 'team-documents', path: 'docs/a.pdf' },
      { bucket: 'team-documents', path: 'docs/b.pdf' },
    ])
  })

  it('matches nested values by bucket and path', () => {
    const target = { bucket: 'player-photos' as const, path: 'uploads/p1.png' }
    const value = {
      players: [
        {
          photo: buildStorageObjectUrl('player-photos', 'uploads/p1.png', {
            shareToken: 'share-token',
          }),
        },
      ],
    }

    expect(storedValueIncludesStorageRef(value, target, 'player-photos')).toBe(true)
    expect(
      storedValueIncludesStorageRef(value, { bucket: 'player-photos', path: 'uploads/missing.png' }, 'player-photos'),
    ).toBe(false)
  })

  it('resolves legacy private storage urls to managed access urls', () => {
    const url = resolveStorageObjectUrl(
      'https://example.com/storage/v1/object/public/registration-files/logos/team.png',
    )

    expect(url).toBe('/api/storage/object?bucket=registration-files&path=logos%2Fteam.png')
  })

  it('resolves relative paths with fallback bucket and preserves download options', () => {
    const url = resolveStorageObjectUrl('docs/file.pdf', {
      fallbackBucket: 'team-documents',
      download: true,
      fileName: '报名材料.pdf',
    })

    expect(url).toBe('/api/storage/object?bucket=team-documents&path=docs%2Ffile.pdf&download=1&filename=%E6%8A%A5%E5%90%8D%E6%9D%90%E6%96%99.pdf')
  })

  it('builds coach-owned storage paths for immediate private previews', () => {
    const path = buildCoachOwnedStoragePath('coach-1', 'upload.png')

    expect(path).toBe('coach/coach-1/upload.png')
    expect(isCoachOwnedStoragePath(path, 'coach-1')).toBe(true)
    expect(isCoachOwnedStoragePath(path, 'coach-2')).toBe(false)
  })

  it('binds public-share uploads to a single registration player scope', () => {
    const path = buildPublicShareOwnedStoragePath(
      {
        registrationId: 'reg-1',
        playerId: 'player-1',
      },
      'photo.png',
    )

    expect(path).toBe('public-share/reg-1/player-player-1/photo.png')
    expect(
      isPublicShareOwnedStoragePath(path, {
        registrationId: 'reg-1',
        playerId: 'player-1',
      }),
    ).toBe(true)
    expect(
      isPublicShareOwnedStoragePath(path, {
        registrationId: 'reg-1',
        playerId: 'player-2',
      }),
    ).toBe(false)
  })
})
