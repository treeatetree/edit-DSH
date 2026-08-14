import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  defaultCatalogFetcher,
  githubDiscovery,
  githubHeaders,
  githubOpenGraphUrl,
  githubOwnerAvatarUrl,
  loadCatalog,
  marketplacePluginId,
  mergeCatalog,
  parseCommunitySearch,
  parseOfficialRepo,
  parseOfficialTree,
  parseOwnerRepo,
  readInstalledPlugins,
} from '../src/catalog.ts'
import type { MarketplacePlugin } from '../src/types.ts'

const skip = new Set(['boot', 'util'])
const blankDiscovery = {
  imageUrl: null,
  coverUrl: null,
  owner: null,
  language: null,
  updatedAt: null,
  forks: null,
  topics: [] as readonly string[],
} satisfies Pick<MarketplacePlugin, 'imageUrl' | 'coverUrl' | 'owner' | 'language' | 'updatedAt' | 'forks' | 'topics'>

describe('plugin marketplace catalog helpers', () => {
  it('parses owner/repo and rejects extra path segments', () => {
    expect(parseOwnerRepo('deepseek-ai/deepseek-harness')).toEqual({
      owner: 'deepseek-ai',
      repo: 'deepseek-harness',
    })
    expect(parseOwnerRepo('deepseek-ai/deepseek-harness/extra')).toBeUndefined()
    expect(parseOwnerRepo('')).toBeUndefined()
  })

  it('omits Authorization when the token is empty and brands catalog ids', () => {
    expect(githubHeaders('ua', undefined)).toEqual({
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ua',
      'X-GitHub-Api-Version': '2022-11-28',
    })
    expect(githubHeaders('ua', 'tok').Authorization).toBe('Bearer tok')
    expect(githubHeaders('ua', '')).not.toHaveProperty('Authorization')
    expect(marketplacePluginId('official:host/x')).toBe('official:host/x')
  })

  it('maps official package.json tree entries and skips configured groups', () => {
    const entries = parseOfficialTree(JSON.stringify({
      tree: [
        { path: 'packages/host/plugin-inventory/package.json', type: 'blob' },
        { type: 'blob' },
        { path: 'packages/boot/app-boot/package.json', type: 'blob' },
        { path: 'packages/host/plugin-inventory/src/index.ts', type: 'blob' },
        { path: 'README.md', type: 'blob' },
        { type: 'tree', path: 'packages/host' },
      ],
    }), 'deepseek-ai/deepseek-harness', 'master', skip)
    expect(entries).toEqual([{
      id: 'official:host/plugin-inventory',
      title: 'plugin-inventory',
      description: 'host',
      origin: 'official',
      htmlUrl: 'https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/host/plugin-inventory',
      installSpec: null,
      packageName: null,
      stars: null,
      group: 'host',
      imageUrl: 'https://github.com/deepseek-ai.png',
      coverUrl: null,
      owner: 'deepseek-ai',
      language: null,
      updatedAt: null,
      forks: null,
      topics: [],
    }])
    expect(parseOfficialTree(JSON.stringify({
      tree: [
        { path: 'packages/host/plugin-inventory/package.json', type: 'blob' },
        { path: 'packages/bundle/web-app/package.json', type: 'blob' },
      ],
    }), 'deepseek-ai/deepseek-harness', 'master', skip, undefined, new Set(['bundle']))
      .map(entry => entry.id)).toEqual(['official:bundle/web-app'])
    expect(parseOfficialTree('{}', 'not-a-repo', 'master', skip)).toEqual([])
    expect(parseOfficialTree(JSON.stringify({
      tree: [{ path: 'packages/host/plugin-inventory/package.json', type: 'blob' }],
    }), 'not-a-repo', 'master', skip)[0]).toMatchObject({
      owner: null,
      imageUrl: null,
    })
  })

  it('copies official repository metadata onto every tree row', () => {
    const entries = parseOfficialTree(JSON.stringify({
      tree: [{ path: 'packages/host/plugin-inventory/package.json', type: 'blob' }],
    }), 'deepseek-ai/deepseek-harness', 'master', skip, {
      owner: 'deepseek-ai',
      imageUrl: 'https://avatars.example/deepseek.png',
      stars: 99,
      language: 'TypeScript',
      updatedAt: '2026-08-14T00:00:00Z',
      forks: 3,
    })
    expect(entries[0]).toMatchObject({
      stars: 99,
      imageUrl: 'https://avatars.example/deepseek.png',
      language: 'TypeScript',
      forks: 3,
      owner: 'deepseek-ai',
      coverUrl: null,
    })
    expect(parseOfficialRepo('not-json', 'deepseek-ai/deepseek-harness')).toBeUndefined()
    expect(parseOfficialRepo('{}', 'not-a-repo')).toBeUndefined()
    expect(parseOfficialRepo('{}', 'deepseek-ai/deepseek-harness')).toEqual({
      owner: 'deepseek-ai',
      imageUrl: 'https://github.com/deepseek-ai.png',
      stars: null,
      language: null,
      updatedAt: null,
      forks: null,
    })
    expect(parseOfficialRepo(JSON.stringify({
      owner: { login: 'deepseek-ai', avatar_url: 'https://avatars.example/d.png' },
      stargazers_count: 7,
      forks_count: 2,
      language: 'TypeScript',
      updated_at: '2026-08-01T00:00:00Z',
    }), 'deepseek-ai/deepseek-harness')).toEqual({
      owner: 'deepseek-ai',
      imageUrl: 'https://avatars.example/d.png',
      stars: 7,
      language: 'TypeScript',
      updatedAt: '2026-08-01T00:00:00Z',
      forks: 2,
    })
    expect(githubOpenGraphUrl('acme/dsh-hello')).toBe('https://opengraph.githubassets.com/1/acme/dsh-hello')
    expect(githubOwnerAvatarUrl('acme')).toBe('https://github.com/acme.png')
    expect(githubDiscovery('not a repo')).toEqual({ imageUrl: null, coverUrl: null, owner: null })
    expect(githubDiscovery('not a repo', 'https://avatars.example/x.png')).toEqual({
      imageUrl: 'https://avatars.example/x.png',
      coverUrl: null,
      owner: null,
    })
  })

  it('maps community search hits and drops incomplete items', () => {
    const entries = parseCommunitySearch(JSON.stringify({
      items: [
        {
          full_name: 'acme/dsh-hello',
          name: 'dsh-hello',
          description: 'Hello bundle',
          html_url: 'https://github.com/acme/dsh-hello',
          stargazers_count: 12,
          forks_count: 4,
          language: 'TypeScript',
          updated_at: '2026-08-14T12:00:00Z',
          topics: ['dsh-plugin'],
          owner: { login: 'acme', avatar_url: 'https://avatars.example/acme.png' },
        },
        { name: 'orphan' },
        { full_name: 'acme/no-url' },
        {
          full_name: 'acme/no-desc',
          html_url: 'https://github.com/acme/no-desc',
        },
      ],
    }))
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      id: 'community:acme/dsh-hello',
      title: 'dsh-hello',
      origin: 'community',
      installSpec: 'github:acme/dsh-hello',
      stars: 12,
      forks: 4,
      language: 'TypeScript',
      updatedAt: '2026-08-14T12:00:00Z',
      topics: ['dsh-plugin'],
      owner: 'acme',
      imageUrl: 'https://avatars.example/acme.png',
      coverUrl: 'https://opengraph.githubassets.com/1/acme/dsh-hello',
    })
    expect(entries[1]).toMatchObject({
      title: 'acme/no-desc',
      description: '',
      stars: null,
    })
    expect(parseCommunitySearch('{}')).toEqual([])
  })

  it('keeps installed rows first and drops later rows that share an id or install spec', () => {
    const installed = [{
      id: marketplacePluginId('installed:dsh-hello'),
      title: 'dsh-hello',
      description: '',
      origin: 'installed' as const,
      htmlUrl: '',
      installSpec: null,
      packageName: null,
      stars: null,
      group: null,
      ...blankDiscovery,
    }, {
      id: marketplacePluginId('installed:named'),
      title: 'named',
      description: '',
      origin: 'installed' as const,
      htmlUrl: '',
      installSpec: 'github:acme/named',
      packageName: 'named',
      stars: null,
      group: null,
      ...blankDiscovery,
    }]
    const community = [{
      id: marketplacePluginId('community:acme/named'),
      title: 'named',
      description: '',
      origin: 'community' as const,
      htmlUrl: 'https://github.com/acme/named',
      installSpec: 'github:acme/named',
      packageName: null,
      stars: null,
      group: null,
      ...blankDiscovery,
    }, {
      id: marketplacePluginId('installed:dsh-hello'),
      title: 'dup',
      description: '',
      origin: 'community' as const,
      htmlUrl: 'https://github.com/acme/dup',
      installSpec: 'github:acme/dup',
      packageName: null,
      stars: null,
      group: null,
      ...blankDiscovery,
    }]
    const official = [{
      id: marketplacePluginId('official:host/x'),
      title: 'x',
      description: 'host',
      origin: 'official' as const,
      htmlUrl: 'https://github.com/example/x',
      installSpec: null,
      packageName: null,
      stars: null,
      group: 'host',
      ...blankDiscovery,
    }]
    expect(mergeCatalog(official, community, installed).map(row => row.id)).toEqual([
      'installed:dsh-hello',
      'installed:named',
      'official:host/x',
    ])
  })

  it('reads profile dependencies and reports missing or invalid manifests', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-market-'))
    expect(readInstalledPlugins(join(dir, 'missing')).source.ok).toBe(false)
    writeFileSync(join(dir, 'package.json'), '{')
    expect(readInstalledPlugins(dir).source).toEqual({
      id: 'installed',
      ok: false,
      message: 'profile package.json is not JSON',
    })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      dependencies: {
        'dsh-hello': 'github:acme/dsh-hello',
        'plain-lib': '1.0.0',
      },
      dsh: { profile: { bundles: ['dsh-hello'] } },
    }))
    const installed = readInstalledPlugins(dir)
    expect(installed.source.ok).toBe(true)
    expect(installed.entries).toEqual([
      expect.objectContaining({
        id: 'installed:dsh-hello',
        origin: 'installed',
        installSpec: 'github:acme/dsh-hello',
        description: 'Active profile bundle',
        htmlUrl: 'https://github.com/acme/dsh-hello',
        owner: 'acme',
        coverUrl: 'https://opengraph.githubassets.com/1/acme/dsh-hello',
        imageUrl: 'https://github.com/acme.png',
      }),
      expect.objectContaining({
        packageName: 'plain-lib',
        installSpec: 'plain-lib',
        description: 'Profile dependency',
      }),
    ])
  })
})

describe('loadCatalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('merges sources, hides community rows already installed, and records HTTP failures', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-market-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      dependencies: { 'dsh-hello': 'github:acme/dsh-hello' },
    }))
    const snapshot = await loadCatalog({
      officialRepository: 'deepseek-ai/deepseek-harness',
      githubTopic: 'dsh-plugin',
      githubApiBaseUrl: 'https://api.example.test',
      githubRef: 'master',
      githubUserAgent: 'ua',
      officialSkipGroups: ['boot'],
      officialGroups: [],
      profile: 'web',
      profileDir: dir,
    }, async (url) => {
      if (url.includes('/git/trees/')) {
        return {
          ok: true,
          status: 200,
          body: JSON.stringify({
            tree: [
              { path: 'packages/host/plugin-inventory/package.json', type: 'blob' },
              { path: 'packages/boot/app-boot/package.json', type: 'blob' },
            ],
          }),
        }
      }
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({
          items: [
            {
              full_name: 'acme/dsh-hello',
              name: 'dsh-hello',
              html_url: 'https://github.com/acme/dsh-hello',
            },
            {
              full_name: 'acme/other',
              name: 'other',
              html_url: 'https://github.com/acme/other',
            },
          ],
        }),
      }
    }, undefined)
    expect(snapshot.profile).toBe('web')
    expect(snapshot.sources.every(source => source.ok)).toBe(true)
    expect(snapshot.entries.map(entry => entry.id)).toEqual([
      'installed:dsh-hello',
      'community:acme/other',
      'official:host/plugin-inventory',
    ])
  })

  it('keeps only configured officialGroups when the include set is non-empty', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-market-'))
    writeFileSync(join(dir, 'package.json'), '{}')
    const snapshot = await loadCatalog({
      officialRepository: 'deepseek-ai/deepseek-harness',
      githubTopic: 'dsh-plugin',
      githubApiBaseUrl: 'https://api.example.test',
      githubRef: 'master',
      githubUserAgent: 'ua',
      officialSkipGroups: [],
      officialGroups: ['bundle'],
      profile: 'web',
      profileDir: dir,
    }, async (url) => {
      if (url.includes('/git/trees/')) {
        return {
          ok: true,
          status: 200,
          body: JSON.stringify({
            tree: [
              { path: 'packages/host/plugin-inventory/package.json', type: 'blob' },
              { path: 'packages/bundle/web-app/package.json', type: 'blob' },
            ],
          }),
        }
      }
      return { ok: true, status: 200, body: '{"items":[]}' }
    }, undefined)
    expect(snapshot.entries.map(entry => entry.id)).toEqual(['official:bundle/web-app'])
  })

  it('applies official repository metadata from the GitHub repo payload', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-market-'))
    writeFileSync(join(dir, 'package.json'), '{}')
    const snapshot = await loadCatalog({
      officialRepository: 'deepseek-ai/deepseek-harness',
      githubTopic: 'dsh-plugin',
      githubApiBaseUrl: 'https://api.example.test',
      githubRef: 'master',
      githubUserAgent: 'ua',
      officialSkipGroups: [],
      officialGroups: [],
      profile: 'web',
      profileDir: dir,
    }, async (url) => {
      if (url.endsWith('/repos/deepseek-ai/deepseek-harness')) {
        return {
          ok: true,
          status: 200,
          body: JSON.stringify({
            owner: { login: 'deepseek-ai', avatar_url: 'https://avatars.example/d.png' },
            stargazers_count: 42,
            language: 'TypeScript',
          }),
        }
      }
      if (url.includes('/git/trees/')) {
        return {
          ok: true,
          status: 200,
          body: JSON.stringify({
            tree: [{ path: 'packages/host/plugin-inventory/package.json', type: 'blob' }],
          }),
        }
      }
      return { ok: true, status: 200, body: '{"items":[]}' }
    }, undefined)
    expect(snapshot.entries[0]).toMatchObject({
      id: 'official:host/plugin-inventory',
      stars: 42,
      imageUrl: 'https://avatars.example/d.png',
      language: 'TypeScript',
      owner: 'deepseek-ai',
    })
  })

  it('records malformed officialRepository, GitHub HTTP errors, thrown fetches, and empty trees', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-market-'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    const failed = await loadCatalog({
      officialRepository: 'not-a-repo',
      githubTopic: 'dsh-plugin',
      githubApiBaseUrl: 'https://api.example.test',
      githubRef: 'master',
      githubUserAgent: 'ua',
      officialSkipGroups: [],
      officialGroups: [],
      profile: 'web',
      profileDir: dir,
    }, async (url) => {
      if (url.includes('/search/')) return { ok: false, status: 403, body: 'nope' }
      return { ok: true, status: 200, body: '{}' }
    }, undefined)
    expect(failed.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'official', ok: false }),
      expect.objectContaining({ id: 'community', ok: false, message: 'GitHub search HTTP 403' }),
    ]))

    const thrown = await loadCatalog({
      officialRepository: 'deepseek-ai/deepseek-harness',
      githubTopic: 'dsh-plugin',
      githubApiBaseUrl: 'https://api.example.test',
      githubRef: 'master',
      githubUserAgent: 'ua',
      officialSkipGroups: [],
      officialGroups: [],
      profile: 'web',
      profileDir: dir,
    }, async (url) => {
      if (url.includes('/git/trees/')) throw new Error('tree down')
      throw 'community down'
    }, undefined)
    expect(thrown.sources.find(source => source.id === 'official')?.message).toBe('tree down')
    expect(thrown.sources.find(source => source.id === 'community')?.message).toBe('community catalog request failed')

    const httpOfficial = await loadCatalog({
      officialRepository: 'deepseek-ai/deepseek-harness',
      githubTopic: 'dsh-plugin',
      githubApiBaseUrl: 'https://api.example.test',
      githubRef: 'master',
      githubUserAgent: 'ua',
      officialSkipGroups: [],
      officialGroups: [],
      profile: 'web',
      profileDir: dir,
    }, async (url) => {
      if (url.includes('/git/trees/')) return { ok: false, status: 500, body: '' }
      return { ok: true, status: 200, body: '{"items":[]}' }
    }, undefined)
    expect(httpOfficial.sources.find(source => source.id === 'official')?.message).toBe('GitHub tree HTTP 500')

    const repoFailed = await loadCatalog({
      officialRepository: 'deepseek-ai/deepseek-harness',
      githubTopic: 'dsh-plugin',
      githubApiBaseUrl: 'https://api.example.test',
      githubRef: 'master',
      githubUserAgent: 'ua',
      officialSkipGroups: [],
      officialGroups: [],
      profile: 'web',
      profileDir: dir,
    }, async (url) => {
      if (url.includes('/git/trees/')) {
        return {
          ok: true,
          status: 200,
          body: JSON.stringify({
            tree: [{ path: 'packages/host/plugin-inventory/package.json', type: 'blob' }],
          }),
        }
      }
      if (url.endsWith('/repos/deepseek-ai/deepseek-harness')) {
        return { ok: false, status: 404, body: '' }
      }
      return { ok: true, status: 200, body: '{"items":[]}' }
    }, undefined)
    expect(repoFailed.sources.find(source => source.id === 'official')?.ok).toBe(true)
    expect(repoFailed.entries[0]).toMatchObject({
      id: 'official:host/plugin-inventory',
      stars: null,
      imageUrl: 'https://github.com/deepseek-ai.png',
    })

    const officialThrownNonError = await loadCatalog({
      officialRepository: 'deepseek-ai/deepseek-harness',
      githubTopic: 'dsh-plugin',
      githubApiBaseUrl: 'https://api.example.test',
      githubRef: 'master',
      githubUserAgent: 'ua',
      officialSkipGroups: [],
      officialGroups: [],
      profile: 'web',
      profileDir: dir,
    }, async (url) => {
      if (url.includes('/git/trees/')) throw 'tree down'
      throw new Error('search down')
    }, undefined)
    expect(officialThrownNonError.sources.find(source => source.id === 'official')?.message)
      .toBe('official catalog request failed')
    expect(officialThrownNonError.sources.find(source => source.id === 'community')?.message)
      .toBe('search down')
  })

  it('uses global fetch in the default catalog fetcher', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'body',
    })))
    await expect(defaultCatalogFetcher('https://example.test', { Accept: 'x' }))
      .resolves.toEqual({ ok: true, status: 200, body: 'body' })
    expect(fetch).toHaveBeenCalledWith('https://example.test', { headers: { Accept: 'x' } })
  })
})
