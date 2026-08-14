// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginMarketplaceSettingsTab } from '../src/client/PluginMarketplaceSettingsTab.tsx'
import type {
  PluginMarketplaceSettingsTabInjected,
  PluginMarketplaceSettingsTabProps,
} from '../src/client/PluginMarketplaceSettingsTab.tsx'
import { en, type PluginMarketplaceLocaleKey } from '../src/client/locales.ts'
import type { MarketplaceMutationResult } from '@deepseek-ai/dsh-api-remotes/client'

afterEach(cleanup)

type Snapshot = Awaited<ReturnType<PluginMarketplaceSettingsTabInjected['catalog']>>
const t = ((key: PluginMarketplaceLocaleKey): string => en[key]) as PluginMarketplaceSettingsTabProps['t']

function props(overrides: Partial<PluginMarketplaceSettingsTabInjected>): PluginMarketplaceSettingsTabProps {
  return {
    t,
    catalog: async () => EMPTY,
    install: async () => SUCCESS,
    remove: async () => SUCCESS,
    ...overrides,
  } as PluginMarketplaceSettingsTabProps
}

const SUCCESS: MarketplaceMutationResult = {
  ok: true,
  stdout: '',
  stderr: '',
  restartRequired: true,
}

function cardAction(kind: 'install' | 'remove'): HTMLElement {
  const button = document.querySelector(`[data-kind="${kind}"]`)
  if (!(button instanceof HTMLElement)) throw new Error(`missing ${kind} action`)
  return button
}

const EMPTY: Snapshot = {
  entries: [],
  sources: [],
  profile: 'web',
}

const BLANK = {
  imageUrl: null,
  coverUrl: null,
  owner: null,
  language: null,
  updatedAt: null,
  forks: null,
  topics: [],
} as const

const SNAPSHOT = {
  entries: [
    {
      id: 'official:host/plugin-inventory',
      title: 'plugin-inventory',
      description: 'host',
      origin: 'official',
      htmlUrl: 'https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/host/plugin-inventory',
      installSpec: null,
      packageName: null,
      stars: null,
      group: 'host',
      ...BLANK,
      imageUrl: 'https://github.com/deepseek-ai.png',
      owner: 'deepseek-ai',
    },
    {
      id: 'community:acme/dsh-hello',
      title: 'dsh-hello',
      description: 'Hello bundle',
      origin: 'community',
      htmlUrl: 'https://github.com/acme/dsh-hello',
      installSpec: 'github:acme/dsh-hello',
      packageName: null,
      stars: 12,
      group: null,
      ...BLANK,
      imageUrl: 'https://avatars.example/acme.png',
      coverUrl: 'https://opengraph.githubassets.com/1/acme/dsh-hello',
      owner: 'acme',
      language: 'TypeScript',
      updatedAt: '2026-08-14T12:00:00Z',
      forks: 4,
      topics: ['dsh-plugin'],
    },
    {
      id: 'community:acme/silent',
      title: 'silent',
      description: '',
      origin: 'community',
      htmlUrl: 'https://github.com/acme/silent',
      installSpec: 'github:acme/silent',
      packageName: null,
      stars: null,
      group: null,
      ...BLANK,
    },
    {
      id: 'installed:dsh-world',
      title: 'dsh-world',
      description: 'Profile dependency',
      origin: 'installed',
      htmlUrl: '',
      installSpec: 'dsh-world',
      packageName: 'dsh-world',
      stars: null,
      group: null,
      ...BLANK,
    },
  ],
  sources: [
    { id: 'official', ok: true, message: '' },
    { id: 'community', ok: false, message: 'GitHub search HTTP 403' },
    { id: 'installed', ok: true, message: '' },
  ],
  profile: 'web',
} as unknown as Snapshot

describe('PluginMarketplaceSettingsTab', () => {
  it('renders origin filters, failed sources, and disclosure details', async () => {
    const deferred = Promise.withResolvers<Snapshot>()
    const catalog = vi.fn(() => deferred.promise)
    const view = render(<PluginMarketplaceSettingsTab {...props({ catalog })} />)
    expect(screen.getByText(en.loading)).toBeTruthy()

    await act(async () => { deferred.resolve(SNAPSHOT) })
    expect(catalog).toHaveBeenCalledOnce()
    expect(screen.getByRole('searchbox', { name: en.search })).toBeTruthy()
    expect(screen.getByRole('heading', { name: en.catalog })).toBeTruthy()
    expect(view.container.querySelector('[data-marketplace-count]')?.textContent).toBe('4')
    expect(screen.getByText(`${en.sourceFailed}: GitHub search HTTP 403`)).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByText(en.browseOnly)).toBeTruthy()
    expect(screen.getByText(en.customSpec)).toBeTruthy()
    expect(view.container.querySelector('img[src="https://opengraph.githubassets.com/1/acme/dsh-hello"]'))
      .toBeNull()

    const official = screen.getByRole('button', { name: 'plugin-inventory, Official' })
    expect(official.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(official)
    expect(official.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(en.group)).toBeTruthy()
    expect(screen.getAllByText('host').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: en.browse }).getAttribute('href'))
      .toContain('packages/host/plugin-inventory')
    expect(document.querySelector('[data-kind="install"]')).toBeNull()
    fireEvent.click(official)
    expect(view.container.querySelector('[data-marketplace-entry="official:host/plugin-inventory"]')
      ?.getAttribute('data-open')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'dsh-hello, Community' }))
    expect(screen.getByText('Hello bundle')).toBeTruthy()
    expect(screen.getByText(en.spec)).toBeTruthy()
    expect(screen.getByText('github:acme/dsh-hello')).toBeTruthy()
    expect(screen.getByText(en.stars)).toBeTruthy()
    expect(screen.getAllByText('12').length).toBeGreaterThan(0)
    expect(screen.getByText(en.owner)).toBeTruthy()
    expect(screen.getByText('acme')).toBeTruthy()
    expect(document.querySelector('[data-kind="install"]')).toBeTruthy()
    expect(view.container.querySelector('img.cover, [class*="cover"]')).toBeTruthy()
    expect(view.container.querySelector('img[src="https://avatars.example/acme.png"]')).toBeTruthy()
    const cover = view.container.querySelector('img[src="https://opengraph.githubassets.com/1/acme/dsh-hello"]')
    expect(cover).toBeTruthy()
    fireEvent.error(cover!)
    expect((cover as HTMLImageElement).hidden).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'silent, Community' }))
    expect(view.container.querySelector('[data-marketplace-entry="community:acme/dsh-hello"]')
      ?.getAttribute('data-open')).toBeNull()
    expect(screen.queryByText('github:acme/dsh-hello')).toBeNull()
    expect(screen.queryByText(en.owner)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'dsh-world, Installed' }))
    expect(screen.getByRole('button', { name: en.remove })).toBeTruthy()
    expect(screen.queryByRole('link', { name: en.browse })).toBeNull()
  })

  it('filters by origin and local query', async () => {
    render(<PluginMarketplaceSettingsTab {...props({ catalog: async () => SNAPSHOT })} />)
    const search = await screen.findByRole('searchbox', { name: en.search })

    fireEvent.click(screen.getByRole('button', { name: en.filterOfficial }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('plugin-inventory')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: en.filterCommunity }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: en.filterInstalled }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('dsh-world')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: en.filterAll }))
    fireEvent.change(search, { target: { value: 'dsh-hello' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'dsh-hello, Community' }))
    fireEvent.change(search, { target: { value: 'not-a-plugin' } })
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText(en.emptySearch)).toBeTruthy()
  })

  it('matches owner and language when topics is absent', async () => {
    const snapshot = {
      ...SNAPSHOT,
      entries: [{
        ...SNAPSHOT.entries[1]!,
        id: 'community:acme/orphan-topics',
        title: 'orphan-topics',
        owner: 'search-owner',
        language: 'Go',
        topics: undefined,
      }],
    } as unknown as Snapshot
    render(<PluginMarketplaceSettingsTab {...props({ catalog: async () => snapshot })} />)
    const search = await screen.findByRole('searchbox', { name: en.search })
    fireEvent.change(search, { target: { value: 'search-owner' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    fireEvent.change(search, { target: { value: 'Go' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('shows a generic failure and retries into the empty state', async () => {
    const catalog = vi.fn<PluginMarketplaceSettingsTabInjected['catalog']>()
      .mockRejectedValueOnce(new Error('private transport detail'))
      .mockResolvedValueOnce(EMPTY)
    render(<PluginMarketplaceSettingsTab {...props({ catalog })} />)

    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    expect(screen.queryByText('private transport detail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => { expect(catalog).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText(en.empty)).toBeTruthy()
  })

  it('installs a community spec, reports Host failures, and removes an installed package', async () => {
    const catalog = vi.fn<PluginMarketplaceSettingsTabInjected['catalog']>()
      .mockResolvedValue(SNAPSHOT)
    const install = vi.fn<PluginMarketplaceSettingsTabInjected['install']>()
      .mockResolvedValueOnce({ ok: false, code: 'invalid-spec', message: 'refusing install spec', stdout: '', stderr: '' })
      .mockResolvedValueOnce(SUCCESS)
    const removeDeferred = Promise.withResolvers<MarketplaceMutationResult>()
    const remove = vi.fn<PluginMarketplaceSettingsTabInjected['remove']>()
      .mockRejectedValueOnce(new Error('transport'))
      .mockReturnValueOnce(removeDeferred.promise)
    render(<PluginMarketplaceSettingsTab {...props({ catalog, install, remove })} />)

    fireEvent.click(await screen.findByRole('button', { name: 'dsh-hello, Community' }))
    fireEvent.click(cardAction('install'))
    await waitFor(() => { expect(screen.getByRole('status').querySelector('span')?.textContent).toBe('refusing install spec') })
    expect(install).toHaveBeenCalledWith('github:acme/dsh-hello')
    fireEvent.click(screen.getByRole('button', { name: en.dismissNotice }))
    expect(screen.queryByRole('status')).toBeNull()

    fireEvent.click(cardAction('install'))
    await waitFor(() => { expect(screen.getByRole('status').querySelector('span')?.textContent).toBe(en.restart) })
    expect(catalog).toHaveBeenCalledTimes(2)

    fireEvent.click(await screen.findByRole('button', { name: 'dsh-world, Installed' }))
    fireEvent.click(cardAction('remove'))
    await waitFor(() => { expect(screen.getByRole('status').querySelector('span')?.textContent).toBe(en.error) })
    fireEvent.click(cardAction('remove'))
    expect(await screen.findByRole('button', { name: en.removing })).toBeTruthy()
    await act(async () => { removeDeferred.resolve(SUCCESS) })
    await waitFor(() => { expect(remove).toHaveBeenCalledTimes(2) })
    expect(remove).toHaveBeenCalledWith('dsh-world')
  })

  it('installs a custom spec and ignores empty or busy submits', async () => {
    const install = vi.fn<PluginMarketplaceSettingsTabInjected['install']>()
    const deferred = Promise.withResolvers<MarketplaceMutationResult>()
    install.mockReturnValueOnce(deferred.promise)
    render(<PluginMarketplaceSettingsTab {...props({ catalog: async () => SNAPSHOT, install })} />)
    await screen.findByRole('searchbox', { name: en.search })

    const spec = screen.getByRole('textbox', { name: en.customSpec })
    const submit = screen.getByRole('button', { name: en.customSpecSubmit })
    expect(submit).toHaveProperty('disabled', true)
    fireEvent.change(spec, { target: { value: '   ' } })
    fireEvent.submit(spec.closest('form')!)
    expect(install).not.toHaveBeenCalled()

    fireEvent.change(spec, { target: { value: 'github:acme/extra' } })
    fireEvent.click(submit)
    await waitFor(() => { expect(install).toHaveBeenCalledWith('github:acme/extra') })
    expect(screen.getByRole('button', { name: en.installing })).toBeTruthy()
    fireEvent.submit(spec.closest('form')!)
    expect(install).toHaveBeenCalledTimes(1)
    await act(async () => { deferred.resolve(SUCCESS) })
    await waitFor(() => { expect(screen.getByRole('status').querySelector('span')?.textContent).toBe(en.restart) })
  })

  it('maps a missing-pnpm Host failure to the local diagnostic', async () => {
    const install = vi.fn<PluginMarketplaceSettingsTabInjected['install']>()
      .mockResolvedValueOnce({
        ok: false,
        code: 'missing-pnpm',
        message: 'Command failed: /opt/dsh/app/node_modules/.bin/dsh plugin --profile web add dsh-hello',
        stdout: '',
        stderr: 'dsh: pnpm not found on PATH',
      })
    render(<PluginMarketplaceSettingsTab {...props({ catalog: async () => SNAPSHOT, install })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'dsh-hello, Community' }))
    fireEvent.click(cardAction('install'))
    await waitFor(() => {
      expect(screen.getByRole('status').querySelector('span')?.textContent).toBe(en.pnpmMissing)
    })
    expect(screen.queryByText(/Command failed/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.dismissNotice }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('contains a synchronous Remote failure and ignores a result after unmount', async () => {
    const syncFailure = vi.fn(() => { throw new Error('namespace unavailable') }) as PluginMarketplaceSettingsTabInjected['catalog']
    const failed = render(<PluginMarketplaceSettingsTab {...props({ catalog: syncFailure })} />)
    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    failed.unmount()

    const deferred = Promise.withResolvers<Snapshot>()
    const pending = render(<PluginMarketplaceSettingsTab {...props({ catalog: () => deferred.promise })} />)
    pending.unmount()
    await act(async () => { deferred.resolve(SNAPSHOT) })

    const deferredFailure = Promise.withResolvers<Snapshot>()
    const pendingFailure = render(<PluginMarketplaceSettingsTab {...props({ catalog: () => deferredFailure.promise })} />)
    pendingFailure.unmount()
    await act(async () => { deferredFailure.reject(new Error('late failure')) })
  })

  it('paints a cached catalog immediately while a refresh is in flight', async () => {
    const deferred = Promise.withResolvers<Snapshot>()
    const view = render(<PluginMarketplaceSettingsTab {...props({
      catalog: () => deferred.promise,
      lastCatalog: () => SNAPSHOT,
    })} />)
    expect(view.container.querySelector('[data-marketplace-count]')?.textContent).toBe('4')
    expect(screen.queryByText(en.loading)).toBeNull()
    const avatar = view.container.querySelector('img[src="https://github.com/deepseek-ai.png"]')
    expect(avatar).toBeTruthy()
    fireEvent.error(avatar!)
    expect((avatar as HTMLImageElement).hidden).toBe(true)
    await act(async () => { deferred.resolve(EMPTY) })
    expect(await screen.findByText(en.empty)).toBeTruthy()
  })
})
