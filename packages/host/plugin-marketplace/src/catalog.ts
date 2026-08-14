/**
 * Assemble marketplace rows from the official GitHub tree, the public
 * `dsh-plugin` topic search, and the running profile's dependencies.
 * @module @deepseek-ai/dsh-host-plugin-marketplace/catalog
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  MarketplacePlugin,
  MarketplacePluginId,
  MarketplaceSnapshot,
  MarketplaceSourceStatus,
} from './types.ts'

/** Inputs the Host gateway supplies for one catalog read. */
export interface CatalogRequest {
  readonly officialRepository: string
  readonly githubTopic: string
  readonly githubApiBaseUrl: string
  readonly githubRef: string
  readonly githubUserAgent: string
  readonly officialSkipGroups: readonly string[]
  /** When non-empty, official rows are limited to these package groups. */
  readonly officialGroups: readonly string[]
  readonly profile: string
  readonly profileDir: string
}

/** Testable HTTP GET used by GitHub reads. */
export type CatalogFetcher = (url: string, headers: Readonly<Record<string, string>>) => Promise<{
  readonly ok: boolean
  readonly status: number
  readonly body: string
}>

/** GitHub git-tree payload (unused fields omitted). */
interface GitHubTreeResponse {
  readonly tree?: readonly { readonly path?: string; readonly type?: string }[]
}

/** GitHub repository search payload (unused fields omitted). */
interface GitHubSearchResponse {
  readonly items?: readonly {
    readonly full_name?: string
    readonly name?: string
    readonly description?: string | null
    readonly html_url?: string
    readonly stargazers_count?: number
    readonly forks_count?: number
    readonly language?: string | null
    readonly updated_at?: string
    readonly topics?: readonly string[]
    readonly owner?: { readonly login?: string; readonly avatar_url?: string }
  }[]
}

/** GitHub repository payload used for official-row avatars and counts. */
interface GitHubRepoResponse {
  readonly owner?: { readonly login?: string; readonly avatar_url?: string }
  readonly stargazers_count?: number
  readonly forks_count?: number
  readonly language?: string | null
  readonly updated_at?: string
}

/** Profile package.json slice the marketplace reads. */
interface ProfilePackageJson {
  readonly dependencies?: Readonly<Record<string, string>>
  readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
}

/** Repository facts copied onto every official tree row. */
export interface OfficialRepoMeta {
  readonly owner: string
  readonly imageUrl: string | null
  readonly stars: number | null
  readonly language: string | null
  readonly updatedAt: string | null
  readonly forks: number | null
}

const PACKAGE_JSON_PATH = /^packages\/([^/]+)\/([^/]+)\/package\.json$/
const GITHUB_SPEC = /^github:([^#/]+\/[^#/]+)/

/**
 * Brand a catalog row id at this package's boundary.
 * @param value - unbranded id (`official:group/pkg`, `community:owner/repo`, or `installed:name`).
 * @returns the same string as `MarketplacePluginId`.
 */
export function marketplacePluginId(value: string): MarketplacePluginId {
  return value as MarketplacePluginId
}

/**
 * Parse `owner/repo` and reject empty segments or extra slashes.
 * @param value - Config `officialRepository`.
 * @returns owner and repo, or `undefined` when the value is not `owner/repo`.
 */
export function parseOwnerRepo(value: string): { owner: string; repo: string } | undefined {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(value)
  if (match === null || match[1] === undefined || match[2] === undefined) return undefined
  return { owner: match[1], repo: match[2] }
}

/**
 * GitHub Open Graph image for a repository, no extra API request.
 * @param ownerRepo - `owner/repo`.
 * @returns the Open Graph image URL GitHub hosts for that repository.
 */
export function githubOpenGraphUrl(ownerRepo: string): string {
  return `https://opengraph.githubassets.com/1/${ownerRepo}`
}

/**
 * GitHub identicon/avatar for an owner, no extra API request.
 * @param owner - GitHub login.
 * @returns the PNG avatar URL GitHub hosts for that owner.
 */
export function githubOwnerAvatarUrl(owner: string): string {
  return `https://github.com/${owner}.png`
}

/**
 * HTTP headers GitHub requires plus optional token.
 * @param userAgent - Config `githubUserAgent`.
 * @param token - Config `githubToken`, or `undefined`/`''` for anonymous requests.
 * @returns Accept, User-Agent, API version, and Bearer when a token is present.
 */
export function githubHeaders(userAgent: string, token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': userAgent,
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token !== undefined && token.length > 0) headers.Authorization = `Bearer ${token}`
  return headers
}

/**
 * Default fetcher: `globalThis.fetch` with UTF-8 text.
 * @param url - absolute request URL.
 * @param headers - GitHub headers.
 * @returns HTTP status, ok flag, and response body text.
 */
export async function defaultCatalogFetcher(
  url: string,
  headers: Readonly<Record<string, string>>,
): Promise<{ ok: boolean; status: number; body: string }> {
  const response = await fetch(url, { headers: { ...headers } })
  return { ok: response.ok, status: response.status, body: await response.text() }
}

function emptyDiscovery(): Pick<
  MarketplacePlugin,
  'imageUrl' | 'coverUrl' | 'owner' | 'language' | 'updatedAt' | 'forks' | 'topics'
> {
  return {
    imageUrl: null,
    coverUrl: null,
    owner: null,
    language: null,
    updatedAt: null,
    forks: null,
    topics: [],
  }
}

/**
 * Map a GitHub `owner/repo` into avatar and cover URLs.
 * @param ownerRepo - `owner/repo`.
 * @param avatarUrl - search/repo avatar when GitHub already supplied one.
 * @returns owner login plus image URLs.
 */
export function githubDiscovery(
  ownerRepo: string,
  avatarUrl?: string | undefined,
): Pick<MarketplacePlugin, 'imageUrl' | 'coverUrl' | 'owner'> {
  const parsed = parseOwnerRepo(ownerRepo)
  if (parsed === undefined) {
    return { imageUrl: avatarUrl ?? null, coverUrl: null, owner: null }
  }
  return {
    imageUrl: avatarUrl ?? githubOwnerAvatarUrl(parsed.owner),
    coverUrl: githubOpenGraphUrl(ownerRepo),
    owner: parsed.owner,
  }
}

/**
 * Read profile dependencies; missing or invalid manifests yield an empty installed source.
 * @param profileDir - `$DSH_HOME/profiles/<profile>`.
 * @returns installed rows plus the installed-source status.
 */
export function readInstalledPlugins(profileDir: string): {
  readonly entries: MarketplacePlugin[]
  readonly source: MarketplaceSourceStatus
} {
  let raw: string
  try {
    raw = readFileSync(join(profileDir, 'package.json'), 'utf8')
  } catch (error) {
    /* v8 ignore next -- fs.readFileSync throws Error; Node never rejects with a non-Error. */
    const message = error instanceof Error ? error.message : 'profile package.json is unreadable'
    return { entries: [], source: { id: 'installed', ok: false, message } }
  }
  let manifest: ProfilePackageJson
  try {
    manifest = JSON.parse(raw) as ProfilePackageJson
  } catch {
    return { entries: [], source: { id: 'installed', ok: false, message: 'profile package.json is not JSON' } }
  }
  const dependencies = manifest.dependencies ?? {}
  const bundles = new Set(manifest.dsh?.profile?.bundles ?? [])
  const entries: MarketplacePlugin[] = []
  for (const [packageName, spec] of Object.entries(dependencies)) {
    const github = GITHUB_SPEC.exec(spec)
    const discovery = github?.[1] === undefined ? emptyDiscovery() : {
      ...emptyDiscovery(),
      ...githubDiscovery(github[1]),
    }
    entries.push({
      id: marketplacePluginId(`installed:${packageName}`),
      title: packageName,
      description: bundles.has(packageName) ? 'Active profile bundle' : 'Profile dependency',
      origin: 'installed',
      htmlUrl: github?.[1] === undefined ? '' : `https://github.com/${github[1]}`,
      installSpec: spec.startsWith('github:') ? spec : packageName,
      packageName,
      stars: null,
      group: null,
      ...discovery,
    })
  }
  return { entries, source: { id: 'installed', ok: true, message: '' } }
}

/**
 * Map the official repository's package.json tree entries into browse-only rows.
 * @param body - GitHub git-tree JSON.
 * @param repository - `owner/repo`.
 * @param ref - git ref used in blob URLs.
 * @param skipGroups - package groups omitted from the official catalog.
 * @param meta - repository-level avatar and counts shared by every official row.
 * @param includeGroups - when non-empty, only these groups are kept after skip.
 * @returns browse-only official rows (`installSpec` is null).
 */
export function parseOfficialTree(
  body: string,
  repository: string,
  ref: string,
  skipGroups: ReadonlySet<string>,
  meta: OfficialRepoMeta | undefined = undefined,
  includeGroups: ReadonlySet<string> = new Set(),
): MarketplacePlugin[] {
  const parsed = JSON.parse(body) as GitHubTreeResponse
  const owner = meta?.owner ?? parseOwnerRepo(repository)?.owner ?? null
  const entries: MarketplacePlugin[] = []
  for (const node of parsed.tree ?? []) {
    if (node.type !== 'blob' || node.path === undefined) continue
    const match = PACKAGE_JSON_PATH.exec(node.path)
    if (match === null || match[1] === undefined || match[2] === undefined) continue
    const group = match[1]
    const pkg = match[2]
    if (skipGroups.has(group)) continue
    if (includeGroups.size > 0 && !includeGroups.has(group)) continue
    entries.push({
      id: marketplacePluginId(`official:${group}/${pkg}`),
      title: pkg,
      description: group,
      origin: 'official',
      htmlUrl: `https://github.com/${repository}/tree/${ref}/packages/${group}/${pkg}`,
      installSpec: null,
      packageName: null,
      stars: meta?.stars ?? null,
      group,
      imageUrl: meta?.imageUrl ?? (owner === null ? null : githubOwnerAvatarUrl(owner)),
      coverUrl: null,
      owner,
      language: meta?.language ?? null,
      updatedAt: meta?.updatedAt ?? null,
      forks: meta?.forks ?? null,
      topics: [],
    })
  }
  return entries
}

/**
 * Map a GitHub repository JSON body into official-row metadata.
 * @param body - GitHub `/repos/{owner}/{repo}` JSON.
 * @param repository - `owner/repo` used when the payload omits the owner login.
 * @returns avatar and counts, or `undefined` when the body is not JSON.
 */
export function parseOfficialRepo(body: string, repository: string): OfficialRepoMeta | undefined {
  let parsed: GitHubRepoResponse
  try {
    parsed = JSON.parse(body) as GitHubRepoResponse
  } catch {
    return undefined
  }
  const owner = parsed.owner?.login ?? parseOwnerRepo(repository)?.owner
  if (owner === undefined) return undefined
  return {
    owner,
    imageUrl: parsed.owner?.avatar_url ?? githubOwnerAvatarUrl(owner),
    stars: parsed.stargazers_count ?? null,
    language: parsed.language ?? null,
    updatedAt: parsed.updated_at ?? null,
    forks: parsed.forks_count ?? null,
  }
}

/**
 * Map GitHub topic search hits into installable community rows.
 * @param body - GitHub search JSON.
 * @returns community rows with `installSpec` `github:owner/repo`.
 */
export function parseCommunitySearch(body: string): MarketplacePlugin[] {
  const parsed = JSON.parse(body) as GitHubSearchResponse
  const entries: MarketplacePlugin[] = []
  for (const item of parsed.items ?? []) {
    if (item.full_name === undefined || item.html_url === undefined) continue
    const title = item.name ?? item.full_name
    const discovery = githubDiscovery(item.full_name, item.owner?.avatar_url)
    entries.push({
      id: marketplacePluginId(`community:${item.full_name}`),
      title,
      description: item.description ?? '',
      origin: 'community',
      htmlUrl: item.html_url,
      installSpec: `github:${item.full_name}`,
      packageName: null,
      stars: item.stargazers_count ?? null,
      group: null,
      language: item.language ?? null,
      updatedAt: item.updated_at ?? null,
      forks: item.forks_count ?? null,
      topics: item.topics ?? [],
      ...discovery,
    })
  }
  return entries
}

/**
 * Drop community/official rows already represented by a profile dependency.
 * @param official - browse-only official tree rows.
 * @param community - installable GitHub topic rows.
 * @param installed - profile dependency rows, listed first.
 * @returns installed rows followed by community then official, without duplicates.
 */
export function mergeCatalog(
  official: readonly MarketplacePlugin[],
  community: readonly MarketplacePlugin[],
  installed: readonly MarketplacePlugin[],
): MarketplacePlugin[] {
  const installedSpecs = new Set<string>()
  for (const row of installed) {
    if (row.installSpec !== null) installedSpecs.add(row.installSpec)
    if (row.packageName !== null) installedSpecs.add(row.packageName)
  }
  const seen = new Set(installed.map(row => row.id))
  const entries = [...installed]
  for (const row of [...community, ...official]) {
    if (seen.has(row.id)) continue
    if (row.installSpec !== null && installedSpecs.has(row.installSpec)) continue
    seen.add(row.id)
    entries.push(row)
  }
  return entries
}

async function fetchSource(
  fetcher: CatalogFetcher,
  url: string,
  headers: Readonly<Record<string, string>>,
  id: 'official' | 'community',
  networkLabel: string,
): Promise<{ readonly ok: true; readonly body: string } | { readonly ok: false; readonly message: string }> {
  try {
    const response = await fetcher(url, headers)
    if (!response.ok) return { ok: false, message: `${networkLabel} HTTP ${String(response.status)}` }
    return { ok: true, body: response.body }
  } catch (error) {
    const fallback = id === 'official' ? 'official catalog request failed' : 'community catalog request failed'
    return { ok: false, message: error instanceof Error ? error.message : fallback }
  }
}

/**
 * Fetch official + community catalogs and merge with the profile lock.
 * @param request - Config-derived locations.
 * @param fetcher - HTTP GET (tests inject a fake).
 * @param token - optional GitHub token.
 * @returns merged snapshot; GitHub failures appear in `sources`.
 */
export async function loadCatalog(
  request: CatalogRequest,
  fetcher: CatalogFetcher,
  token: string | undefined,
): Promise<MarketplaceSnapshot> {
  const headers = githubHeaders(request.githubUserAgent, token)
  const skip = new Set(request.officialSkipGroups)
  const include = new Set(request.officialGroups)
  const installed = readInstalledPlugins(request.profileDir)
  const sources: MarketplaceSourceStatus[] = [installed.source]
  let official: MarketplacePlugin[] = []
  let community: MarketplacePlugin[] = []

  const ownerRepo = parseOwnerRepo(request.officialRepository)
  const treeUrl = ownerRepo === undefined
    ? undefined
    : `${request.githubApiBaseUrl}/repos/${ownerRepo.owner}/${ownerRepo.repo}/git/trees/${request.githubRef}?recursive=1`
  const repoUrl = ownerRepo === undefined
    ? undefined
    : `${request.githubApiBaseUrl}/repos/${ownerRepo.owner}/${ownerRepo.repo}`
  const searchUrl = `${request.githubApiBaseUrl}/search/repositories?q=topic:${encodeURIComponent(request.githubTopic)}&sort=stars&order=desc&per_page=100`

  const treeTask = treeUrl === undefined
    ? Promise.resolve(undefined)
    : fetchSource(fetcher, treeUrl, headers, 'official', 'GitHub tree')
  const repoTask = repoUrl === undefined
    ? Promise.resolve(undefined)
    : fetchSource(fetcher, repoUrl, headers, 'official', 'GitHub repository')
  const searchTask = fetchSource(fetcher, searchUrl, headers, 'community', 'GitHub search')
  const [treeResult, repoResult, searchResult] = await Promise.all([treeTask, repoTask, searchTask])

  if (treeResult === undefined || repoResult === undefined) {
    sources.push({
      id: 'official',
      ok: false,
      message: `officialRepository must be owner/repo, got ${JSON.stringify(request.officialRepository)}`,
    })
  } else if (!treeResult.ok) {
    sources.push({ id: 'official', ok: false, message: treeResult.message })
  } else {
    const meta = repoResult.ok
      ? parseOfficialRepo(repoResult.body, request.officialRepository)
      : undefined
    official = parseOfficialTree(
      treeResult.body, request.officialRepository, request.githubRef, skip, meta, include,
    )
    sources.push({ id: 'official', ok: true, message: '' })
  }

  if (!searchResult.ok) {
    sources.push({ id: 'community', ok: false, message: searchResult.message })
  } else {
    community = parseCommunitySearch(searchResult.body)
    sources.push({ id: 'community', ok: true, message: '' })
  }

  return {
    entries: mergeCatalog(official, community, installed.entries),
    sources,
    profile: request.profile,
  }
}
