import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CATALOG_CACHE_VERSION,
  fileCatalogCacheStore,
  parseCachedCatalog,
} from '../src/cache.ts'

const snapshot = { entries: [], sources: [], profile: 'web' }

describe('plugin marketplace catalog cache', () => {
  it('rejects invalid envelopes and accepts a current-version snapshot', () => {
    expect(parseCachedCatalog('null')).toBeUndefined()
    expect(parseCachedCatalog('1')).toBeUndefined()
    expect(parseCachedCatalog(JSON.stringify({
      version: CATALOG_CACHE_VERSION,
      expiresAt: 10,
      snapshot: null,
    }))).toBeUndefined()
    expect(parseCachedCatalog(JSON.stringify({
      version: CATALOG_CACHE_VERSION,
      expiresAt: 10,
      snapshot: { entries: [], sources: 'nope', profile: 'web' },
    }))).toBeUndefined()
    expect(parseCachedCatalog('[]')).toBeUndefined()
    expect(parseCachedCatalog(JSON.stringify({ version: 0, expiresAt: 1, snapshot }))).toBeUndefined()
    expect(parseCachedCatalog(JSON.stringify({ version: 1, expiresAt: 1, snapshot }))).toBeUndefined()
    expect(parseCachedCatalog(JSON.stringify({ version: 2, expiresAt: 1, snapshot }))).toBeUndefined()
    expect(parseCachedCatalog(JSON.stringify({
      version: CATALOG_CACHE_VERSION,
      expiresAt: Number.NaN,
      snapshot,
    }))).toBeUndefined()
    expect(parseCachedCatalog(JSON.stringify({
      version: CATALOG_CACHE_VERSION,
      expiresAt: 10,
      snapshot: { entries: [], sources: [] },
    }))).toBeUndefined()
    expect(parseCachedCatalog(JSON.stringify({
      version: CATALOG_CACHE_VERSION,
      expiresAt: 10,
      snapshot,
    }))).toEqual({ expiresAt: 10, snapshot })
  })

  it('round-trips a file store and treats a missing file as a miss', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-market-cache-'))
    const path = join(dir, 'plugin-marketplace-catalog.json')
    const store = fileCatalogCacheStore(path)
    expect(await store.load()).toBeUndefined()
    await store.save({ expiresAt: 99, snapshot })
    expect(await store.load()).toEqual({ expiresAt: 99, snapshot })
    writeFileSync(path, '{')
    expect(await store.load()).toBeUndefined()
    await store.clear()
    expect(await store.load()).toBeUndefined()
    await store.clear()
  })
})
