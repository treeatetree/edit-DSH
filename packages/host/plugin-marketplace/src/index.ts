/**
 * Host Remote for browsing the official GitHub plugin tree and community
 * `dsh-plugin` topic, then installing or removing profile bundles through
 * `dsh plugin`.
 */

import type { Context } from '@deepseek-ai/cordis'
import { resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { runNativeCommand, type NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import {
  defaultCatalogFetcher,
  loadCatalog,
  type CatalogFetcher,
} from './catalog.ts'
import { installPlugin, removePlugin } from './install.ts'
import type {
  MarketplaceInstallRequest,
  MarketplaceMutationResult,
  MarketplaceRemoveRequest,
  MarketplaceSnapshot,
} from './types.ts'

export type * from './types.ts'

/** Marketplace Host config; every field is settable from cordis.yml. */
export interface Config {
  /** GitHub `owner/repo` that supplies the official package tree. */
  officialRepository: string
  /** GitHub topic whose public repositories are installable community plugins. */
  githubTopic: string
  /** GitHub API origin, without a trailing slash. */
  githubApiBaseUrl: string
  /** Git ref used for the official tree and blob URLs. */
  githubRef: string
  /** User-Agent GitHub requires on API requests. */
  githubUserAgent: string
  /** Optional token; empty string sends unauthenticated requests. */
  githubToken: string
  /** Package groups omitted from the official tree catalog. */
  officialSkipGroups: string[]
  /** Profile `dsh plugin --profile` mutates. */
  profile: string
  /** Milliseconds a catalog snapshot is reused. */
  catalogCacheMs: number
  /** Milliseconds `dsh plugin add|remove` may run. */
  installTimeoutMs: number
  /** Executable path or PATH name of the `dsh` CLI. */
  cliPath: string
}

/** Remote-only service: catalog reads plus profile plugin mutations. */
export class PluginMarketplaceGateway extends TypertRemoteService {
  static Config: z<Config> = z.object({
    officialRepository: z.string().default('deepseek-ai/deepseek-harness'),
    githubTopic: z.string().default('dsh-plugin'),
    githubApiBaseUrl: z.string().default('https://api.github.com'),
    githubRef: z.string().default('master'),
    githubUserAgent: z.string().default('deepseek-harness-plugin-marketplace'),
    githubToken: z.string().default(''),
    officialSkipGroups: z.array(z.string()).default(['boot', 'examples', 'test-support', 'typert', 'util']),
    profile: z.string().default('web'),
    catalogCacheMs: z.natural().min(0).default(600_000),
    installTimeoutMs: z.natural().min(1).default(300_000),
    cliPath: z.string().default('dsh'),
  })

  private cache: { readonly expiresAt: number; readonly snapshot: MarketplaceSnapshot } | undefined
  private readonly fetcher: CatalogFetcher
  private readonly run: NativeCommandRunner

  constructor(
    ctx: Context,
    private config: Config,
    options: { fetcher?: CatalogFetcher; run?: NativeCommandRunner } = {},
  ) {
    super(ctx, 'pluginMarketplace')
    this.fetcher = options.fetcher ?? defaultCatalogFetcher
    this.run = options.run ?? runNativeCommand
  }

  /**
   * Read official + community catalogs and the profile's installed dependencies.
   * @returns merged snapshot; GitHub failures appear in `sources` rather than throwing.
   */
  @Remote('catalog')
  async catalog(): Promise<MarketplaceSnapshot> {
    const now = Date.now()
    if (this.cache !== undefined && this.cache.expiresAt > now) return this.cache.snapshot
    const snapshot = await loadCatalog({
      officialRepository: this.config.officialRepository,
      githubTopic: this.config.githubTopic,
      githubApiBaseUrl: this.config.githubApiBaseUrl,
      githubRef: this.config.githubRef,
      githubUserAgent: this.config.githubUserAgent,
      officialSkipGroups: this.config.officialSkipGroups,
      profile: this.config.profile,
      profileDir: resolveProfileDir(this.config.profile, resolveDshHome()),
    }, this.fetcher, this.config.githubToken === '' ? undefined : this.config.githubToken)
    this.cache = { expiresAt: now + this.config.catalogCacheMs, snapshot }
    return snapshot
  }

  /**
   * Install one marketplace spec into the configured profile.
   * @param request - validated `dsh plugin add` spec.
   * @returns command outcome; a rejected spec does not spawn.
   */
  @Remote('add')
  async add(request: MarketplaceInstallRequest): Promise<MarketplaceMutationResult> {
    const result = await installPlugin({
      cliPath: this.config.cliPath,
      profile: this.config.profile,
      timeoutMs: this.config.installTimeoutMs,
    }, request.spec, this.run)
    if (result.ok) this.cache = undefined
    return result
  }

  /**
   * Remove one installed profile dependency.
   * @param request - exact npm package name.
   * @returns command outcome; unknown names do not spawn.
   */
  @Remote('uninstall')
  async uninstall(request: MarketplaceRemoveRequest): Promise<MarketplaceMutationResult> {
    const result = await removePlugin({
      cliPath: this.config.cliPath,
      profile: this.config.profile,
      timeoutMs: this.config.installTimeoutMs,
    }, request.packageName, this.run)
    if (result.ok) this.cache = undefined
    return result
  }
}

export default PluginMarketplaceGateway
