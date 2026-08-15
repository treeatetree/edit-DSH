/**
 * Public request and snapshot vocabulary for the plugin marketplace Remote.
 * This module contains types only so generated Remote clients can consume it
 * without importing Host runtime code.
 * @module @deepseek-ai/dsh-host-plugin-marketplace/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable catalog identity of one marketplace row. */
export type MarketplacePluginId = Branded<'MarketplacePluginId'>

/** Where one catalog row was assembled from. */
export type MarketplaceOrigin = 'official' | 'community' | 'installed'

/** One plugin the marketplace can show, install, or remove. */
export interface MarketplacePlugin {
  readonly id: MarketplacePluginId
  /** Display title (package directory, repository name, or npm name). */
  readonly title: string
  /** Longer description when the source provided one; empty string otherwise. */
  readonly description: string
  readonly origin: MarketplaceOrigin
  /** Repository or package page the user can open. */
  readonly htmlUrl: string
  /** `dsh plugin add` spec when this row can be installed; null when it cannot. */
  readonly installSpec: string | null
  /** Installed npm package name when this row is in the profile; null otherwise. */
  readonly packageName: string | null
  /** GitHub star count when a repository source supplied one. */
  readonly stars: number | null
  /** Official package group directory when origin is official. */
  readonly group: string | null
  /** Owner avatar URL when GitHub supplied one; null otherwise. */
  readonly imageUrl: string | null
  /** GitHub Open Graph image URL when a repository is known; null otherwise. */
  readonly coverUrl: string | null
  /** GitHub owner login when a repository is known; null otherwise. */
  readonly owner: string | null
  /** Primary language when GitHub supplied one. */
  readonly language: string | null
  /** Repository `updated_at` when GitHub supplied one. */
  readonly updatedAt: string | null
  /** Fork count when GitHub supplied one. */
  readonly forks: number | null
  /** GitHub repository topics when the search payload included them. */
  readonly topics: readonly string[]
}

/** One catalog source's fetch outcome for this snapshot. */
export interface MarketplaceSourceStatus {
  readonly id: 'official' | 'community' | 'installed'
  readonly ok: boolean
  /** Failure text when ok is false; empty when the source succeeded. */
  readonly message: string
}

/** Point-in-time marketplace catalog returned by the Remote. */
export interface MarketplaceSnapshot {
  readonly entries: readonly MarketplacePlugin[]
  readonly sources: readonly MarketplaceSourceStatus[]
  /** Profile `dsh plugin` mutates. */
  readonly profile: string
}

/** Install one package into the configured profile. */
export interface MarketplaceInstallRequest {
  /** pnpm/dsh plugin spec: `name`, `@scope/name`, or `github:owner/repo[#ref]`. */
  readonly spec: string
}

/** Remove one installed profile dependency. */
export interface MarketplaceRemoveRequest {
  /** Exact npm package name recorded in the profile manifest. */
  readonly packageName: string
}

/** Successful `dsh plugin` mutation. */
export interface MarketplaceMutationSuccess {
  readonly ok: true
  readonly stdout: string
  readonly stderr: string
  /** Profile layer changes take effect on the next Host process start. */
  readonly restartRequired: true
}

/** Failed `dsh plugin` mutation or a rejected spec. */
export interface MarketplaceMutationFailure {
  readonly ok: false
  readonly code: 'invalid-spec' | 'not-installed' | 'command-failed' | 'missing-pnpm' | 'timeout'
  readonly message: string
  readonly stdout: string
  readonly stderr: string
}

/** Result of install or remove. */
export type MarketplaceMutationResult = MarketplaceMutationSuccess | MarketplaceMutationFailure
