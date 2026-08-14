import { Context } from '@deepseek-ai/cordis'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import PluginMarketplaceGateway from '../src/index.ts'
import * as MarketplaceInvariant from '../src/invariant.ts'

const contexts: Context[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

function config(overrides: Partial<ReturnType<typeof PluginMarketplaceGateway.Config>> = {}) {
  return PluginMarketplaceGateway.Config({
    officialRepository: 'deepseek-ai/deepseek-harness',
    githubTopic: 'dsh-plugin',
    githubApiBaseUrl: 'https://api.example.test',
    githubRef: 'master',
    githubUserAgent: 'ua',
    githubToken: '',
    officialSkipGroups: ['boot'],
    profile: 'web',
    catalogCacheMs: 60_000,
    persistCatalog: false,
    prefetchCatalog: false,
    installTimeoutMs: 1000,
    cliPath: 'dsh',
    ...overrides,
  })
}

describe('PluginMarketplaceGateway', () => {
  it('defaults officialGroups to the bundle profile layer', () => {
    expect(config().officialGroups).toEqual(['bundle'])
    expect(config({ officialGroups: [] }).officialGroups).toEqual([])
  })

  it('publishes catalog, add, and uninstall under pluginMarketplace', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const home = mkdtempSync(join(tmpdir(), 'dsh-home-'))
    mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
    writeFileSync(join(home, 'profiles', 'web', 'package.json'), '{}')
    vi.stubEnv('DSH_HOME', home)
    const gateway = new PluginMarketplaceGateway(ctx, config(), {
      fetcher: async () => ({ ok: true, status: 200, body: '{"tree":[],"items":[]}' }),
      run: async () => ({ stdout: '', stderr: '' }),
    })
    expect(gateway.typertRemote).toMatchObject({
      serviceKey: 'pluginMarketplace',
      namespace: 'pluginMarketplace',
    })
    expect(remoteMethods(gateway)).toEqual([
      { method: 'catalog', invocation: { kind: 'direct' } },
      { method: 'add', invocation: { kind: 'direct' } },
      { method: 'uninstall', invocation: { kind: 'direct' } },
    ])
  })

  it('defaults the GitHub fetcher and command runner when tests do not inject them', () => {
    const ctx = new Context()
    contexts.push(ctx)
    expect(() => new PluginMarketplaceGateway(ctx, config())).not.toThrow()
  })

  it('forwards a GitHub token on catalog fetches', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const home = mkdtempSync(join(tmpdir(), 'dsh-home-'))
    mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
    writeFileSync(join(home, 'profiles', 'web', 'package.json'), '{}')
    vi.stubEnv('DSH_HOME', home)
    const headers: Array<Readonly<Record<string, string>>> = []
    const gateway = new PluginMarketplaceGateway(ctx, config({ githubToken: 'tok' }), {
      fetcher: async (_url, requestHeaders) => {
        headers.push(requestHeaders)
        return { ok: true, status: 200, body: '{"tree":[],"items":[]}' }
      },
      run: async () => ({ stdout: '', stderr: '' }),
    })
    await gateway.catalog()
    expect(headers.every(entry => entry.Authorization === 'Bearer tok')).toBe(true)
  })

  it('reuses a catalog snapshot until cache expires and clears it after a successful install', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const home = mkdtempSync(join(tmpdir(), 'dsh-home-'))
    mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
    writeFileSync(join(home, 'profiles', 'web', 'package.json'), '{}')
    vi.stubEnv('DSH_HOME', home)
    let fetches = 0
    const gateway = new PluginMarketplaceGateway(ctx, config(), {
      fetcher: async () => {
        fetches += 1
        return { ok: true, status: 200, body: '{"tree":[],"items":[]}' }
      },
      run: async () => ({ stdout: 'ok', stderr: '' }),
    })
    const first = await gateway.catalog()
    const [again, concurrent] = await Promise.all([gateway.catalog(), gateway.catalog()])
    expect(again).toBe(first)
    expect(concurrent).toBe(first)
    expect(fetches).toBe(3)
    await gateway.add({ spec: 'dsh-hello' })
    await gateway.catalog()
    expect(fetches).toBe(6)
  })

  it('joins in-flight catalog refreshes onto one GitHub round-trip', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const home = mkdtempSync(join(tmpdir(), 'dsh-home-'))
    mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
    writeFileSync(join(home, 'profiles', 'web', 'package.json'), '{}')
    vi.stubEnv('DSH_HOME', home)
    let fetches = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const gateway = new PluginMarketplaceGateway(ctx, config(), {
      fetcher: async () => {
        fetches += 1
        await gate
        return { ok: true, status: 200, body: '{"tree":[],"items":[]}' }
      },
      run: async () => ({ stdout: '', stderr: '' }),
    })
    const pending = gateway.catalog()
    const joined = gateway.catalog()
    release()
    const [first, second] = await Promise.all([pending, joined])
    expect(first).toBe(second)
    expect(fetches).toBe(3)
  })

  it('leaves a newer in-flight refresh in place when an older catalog settles after dropCache', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const home = mkdtempSync(join(tmpdir(), 'dsh-home-'))
    mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
    writeFileSync(join(home, 'profiles', 'web', 'package.json'), '{}')
    vi.stubEnv('DSH_HOME', home)
    let fetches = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const gateway = new PluginMarketplaceGateway(ctx, config(), {
      fetcher: async () => {
        fetches += 1
        await gate
        return { ok: true, status: 200, body: '{"tree":[],"items":[]}' }
      },
      run: async () => ({ stdout: 'ok', stderr: '' }),
    })
    const pending = gateway.catalog()
    await gateway.add({ spec: 'dsh-hello' })
    release()
    await expect(pending).resolves.toMatchObject({ profile: 'web' })
    expect(fetches).toBe(3)
  })

  it('keeps the catalog cache after a refused or failed install', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const home = mkdtempSync(join(tmpdir(), 'dsh-home-'))
    mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
    writeFileSync(join(home, 'profiles', 'web', 'package.json'), '{}')
    vi.stubEnv('DSH_HOME', home)
    let fetches = 0
    const gateway = new PluginMarketplaceGateway(ctx, config(), {
      fetcher: async () => {
        fetches += 1
        return { ok: true, status: 200, body: '{"tree":[],"items":[]}' }
      },
      run: async () => {
        throw new Error('pnpm failed')
      },
    })
    await gateway.catalog()
    expect(fetches).toBe(3)
    await gateway.add({ spec: '../x' })
    await gateway.add({ spec: 'dsh-hello' })
    await gateway.catalog()
    expect(fetches).toBe(3)
  })

  it('clears the catalog cache after a successful remove', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const home = mkdtempSync(join(tmpdir(), 'dsh-home-'))
    const profileDir = join(home, 'profiles', 'web')
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
      dependencies: { 'dsh-hello': '1.0.0' },
    }))
    vi.stubEnv('DSH_HOME', home)
    let fetches = 0
    const gateway = new PluginMarketplaceGateway(ctx, config(), {
      fetcher: async () => {
        fetches += 1
        return { ok: true, status: 200, body: '{"tree":[],"items":[]}' }
      },
      run: async () => ({ stdout: 'ok', stderr: '' }),
    })
    await gateway.catalog()
    expect(fetches).toBe(3)
    const missing = await gateway.uninstall({ packageName: 'missing-pkg' })
    expect(missing.ok).toBe(false)
    await gateway.catalog()
    expect(fetches).toBe(3)
    const removed = await gateway.uninstall({ packageName: 'dsh-hello' })
    expect(removed.ok).toBe(true)
    await gateway.catalog()
    expect(fetches).toBe(6)
  })

  it('reuses a persisted catalog across gateway instances and clears it after install', async () => {
    const ctx = new Context()
    const ctx2 = new Context()
    contexts.push(ctx, ctx2)
    const home = mkdtempSync(join(tmpdir(), 'dsh-home-'))
    mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
    writeFileSync(join(home, 'profiles', 'web', 'package.json'), '{}')
    vi.stubEnv('DSH_HOME', home)
    let fetches = 0
    const fetcher = async () => {
      fetches += 1
      return { ok: true, status: 200, body: '{"tree":[],"items":[]}' }
    }
    const first = new PluginMarketplaceGateway(ctx, config({ persistCatalog: true }), {
      fetcher,
      run: async () => ({ stdout: 'ok', stderr: '' }),
    })
    await first.catalog()
    expect(fetches).toBe(3)
    const second = new PluginMarketplaceGateway(ctx2, config({ persistCatalog: true }), {
      fetcher,
      run: async () => ({ stdout: 'ok', stderr: '' }),
    })
    await second.catalog()
    expect(fetches).toBe(3)
    await second.add({ spec: 'dsh-hello' })
    await second.catalog()
    expect(fetches).toBe(6)
  })

  it('prefetches the catalog when Config enables it', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const home = mkdtempSync(join(tmpdir(), 'dsh-home-'))
    mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
    writeFileSync(join(home, 'profiles', 'web', 'package.json'), '{}')
    vi.stubEnv('DSH_HOME', home)
    let fetches = 0
    const gateway = new PluginMarketplaceGateway(ctx, config({ prefetchCatalog: true }), {
      fetcher: async () => {
        fetches += 1
        return { ok: true, status: 200, body: '{"tree":[],"items":[]}' }
      },
      run: async () => ({ stdout: '', stderr: '' }),
    })
    await gateway.catalog()
    expect(fetches).toBe(3)
  })

  it('ignores persist save/clear failures and expired disk snapshots', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const home = mkdtempSync(join(tmpdir(), 'dsh-home-'))
    mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
    writeFileSync(join(home, 'profiles', 'web', 'package.json'), '{}')
    vi.stubEnv('DSH_HOME', home)
    let fetches = 0
    const persist = {
      load: async () => ({ expiresAt: 1, snapshot: { entries: [], sources: [], profile: 'web' } }),
      save: async () => { throw new Error('disk full') },
      clear: async () => { throw new Error('locked') },
    }
    const gateway = new PluginMarketplaceGateway(ctx, config(), {
      fetcher: async () => {
        fetches += 1
        return { ok: true, status: 200, body: '{"tree":[],"items":[]}' }
      },
      run: async () => ({ stdout: 'ok', stderr: '' }),
      persist,
    })
    await expect(gateway.catalog()).resolves.toMatchObject({ profile: 'web' })
    expect(fetches).toBe(3)
    await gateway.add({ spec: 'dsh-hello' })
    await gateway.catalog()
    expect(fetches).toBe(6)
  })
})

describe('plugin-marketplace invariant companion', () => {
  it('registers the package-owned empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(MarketplaceInvariant)
    await expect(fiber.await()).resolves.toBeDefined()
    await fiber.dispose()
    await expect(ctx.plugin(MarketplaceInvariant).await()).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })
})
