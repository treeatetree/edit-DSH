/**
 * Durable marketplace catalog cache under `$DSH_HOME`.
 * @module @deepseek-ai/dsh-host-plugin-marketplace/cache
 */

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { MarketplaceSnapshot } from './types.ts'

/** Envelope version; a mismatch discards the file rather than serving it. */
export const CATALOG_CACHE_VERSION = 1

/** One catalog snapshot plus the wall-clock instant it becomes stale. */
export interface CachedCatalog {
  readonly expiresAt: number
  readonly snapshot: MarketplaceSnapshot
}

/** Load, save, and clear a catalog cache entry. */
export interface CatalogCacheStore {
  load(): Promise<CachedCatalog | undefined>
  save(entry: CachedCatalog): Promise<void>
  clear(): Promise<void>
}

/**
 * JSON file store for one cached catalog.
 * @param filePath - absolute path of the cache file.
 * @returns a store that treats missing or invalid files as a cache miss.
 */
export function fileCatalogCacheStore(filePath: string): CatalogCacheStore {
  return {
    async load() {
      let raw: string
      try {
        raw = await readFile(filePath, 'utf8')
      } catch {
        // Missing or unreadable cache file: treat as a miss and refetch.
        return undefined
      }
      return parseCachedCatalog(raw)
    },
    async save(entry) {
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, JSON.stringify({
        version: CATALOG_CACHE_VERSION,
        expiresAt: entry.expiresAt,
        snapshot: entry.snapshot,
      }), 'utf8')
    },
    async clear() {
      try {
        await unlink(filePath)
      } catch {
        // Missing cache file: memory invalidation already dropped the snapshot.
      }
    },
  }
}

/**
 * Accept a cache file only when the envelope version and snapshot entries match.
 * @param raw - file contents.
 * @returns the cached entry, or `undefined` when the file is not reusable.
 */
export function parseCachedCatalog(raw: string): CachedCatalog | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  if (record.version !== CATALOG_CACHE_VERSION) return undefined
  if (typeof record.expiresAt !== 'number' || !Number.isFinite(record.expiresAt)) return undefined
  if (typeof record.snapshot !== 'object' || record.snapshot === null) return undefined
  const snapshot = record.snapshot as Partial<MarketplaceSnapshot>
  if (!Array.isArray(snapshot.entries) || !Array.isArray(snapshot.sources)) return undefined
  if (typeof snapshot.profile !== 'string') return undefined
  return { expiresAt: record.expiresAt, snapshot: snapshot as MarketplaceSnapshot }
}
