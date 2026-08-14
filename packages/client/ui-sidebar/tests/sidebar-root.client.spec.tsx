// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type {
  SidebarFooterActionOwnerProps, SidebarRootComponentProps, SidebarSectionOwnerProps,
  SidebarSettingsOwnerProps,
} from '../src/client/contract/slots.ts'
import { SidebarRoot } from '../src/client/SidebarRoot.tsx'
import { en } from '../src/client/locales.ts'

// English-dictionary translate stub: the shell renders the same copy the
// assertions below query by accessible name.
const t: SidebarRootComponentProps['t'] = key => (en as Record<string, string>)[key] ?? key

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// The shell never reads the global hooks itself, but they ride the standard
// props share; stub them as never-called functions.
const neverHook = (() => { throw new Error('shell must not read global hooks') }) as never

function mountShell({
  collapsed = false, width = 300, presentation = 'column' as 'column' | 'drawer',
}: { collapsed?: boolean; width?: number; presentation?: 'column' | 'drawer' } = {}) {
  const startSession = vi.fn()
  const toggleSidebar = vi.fn()
  const setShellPreference = vi.fn()
  let regionOwner: SidebarSectionOwnerProps | undefined
  let settingsOwner: SidebarSettingsOwnerProps | undefined
  let footerActionOwner: SidebarFooterActionOwnerProps | undefined
  let current = { collapsed, width, presentation }
  const root = () => (
    <SidebarRoot
      collapsed={current.collapsed} width={current.width} presentation={current.presentation}
      shellPreference="auto" shellMode={current.presentation === 'drawer' ? 'compact' : 'desktop'}
      useSessions={neverHook} useWorkspaces={neverHook}
      startSession={startSession} toggleSidebar={toggleSidebar} setShellPreference={setShellPreference} t={t}
      renderSlot={((
        key: string,
        owner: SidebarFooterActionOwnerProps | SidebarSectionOwnerProps | SidebarSettingsOwnerProps,
      ) => {
        if (key === 'sidebar.settings') {
          settingsOwner = owner
          return <div data-testid="settings-seat" data-wide={owner.wide} />
        }
        if (key === 'sidebar.footer.action') {
          footerActionOwner = owner
          return <div data-testid="footer-action-seat" data-wide={owner.wide} />
        }
        regionOwner = owner as SidebarSectionOwnerProps
        return <div data-testid="region" data-wide={owner.wide} />
      }) as SidebarRootComponentProps['renderSlot']}
    />
  )
  const view = render(root())
  return {
    startSession,
    toggleSidebar,
    setShellPreference,
    regionOwner: () => {
      if (regionOwner === undefined) throw new Error('region owner not rendered')
      return regionOwner
    },
    settingsOwner: () => {
      if (settingsOwner === undefined) throw new Error('settings owner not rendered')
      return settingsOwner
    },
    footerActionOwner: () => {
      if (footerActionOwner === undefined) throw new Error('footer action owner not rendered')
      return footerActionOwner
    },
    rerender(next: Partial<typeof current>) {
      current = { ...current, ...next }
      view.rerender(root())
    },
  }
}

describe('SidebarRoot shell', () => {
  it('routes New Session (capsule + wordmark) and the column toggle', () => {
    const b = mountShell()
    // Expanded, both the wordmark and the capsule start a session.
    const starters = screen.getAllByRole('button', { name: 'New session' })
    expect(starters).toHaveLength(2)
    for (const button of starters) fireEvent.click(button)
    expect(b.startSession).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('hands the region its wide flag and clamps expandSidebar to the collapsed state', () => {
    const b = mountShell()
    expect(b.regionOwner().wide).toBe(true)
    // The settings seat rides the same wide flag (ui-settings renders the row).
    expect(b.settingsOwner().wide).toBe(true)
    expect(b.footerActionOwner().wide).toBe(true)
    // Expanded: the request is a no-op (no accidental collapse).
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).not.toHaveBeenCalled()
  })

  it('keeps the region mounted through collapse and expands on its request', () => {
    vi.useFakeTimers()
    const b = mountShell()
    b.rerender({ collapsed: true })
    // Wide content survives the crossfade window, then settles into the rail.
    expect(b.regionOwner().wide).toBe(true)
    vi.advanceTimersByTime(200)
    b.rerender({})
    expect(b.regionOwner().wide).toBe(false)
    expect(b.footerActionOwner().wide).toBe(false)
    expect(screen.getByTestId('region')).toBeTruthy()
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('renders statically collapsed on a cold start (no crossfade classes)', () => {
    const b = mountShell({ collapsed: true })
    expect(b.regionOwner().wide).toBe(false)
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeTruthy()
  })

  it('labels the switch with the automatic layout copy', () => {
    render(
      <SidebarRoot
        collapsed={false} width={300} nextPreference="auto"
        useSessions={neverHook} useWorkspaces={neverHook}
        startSession={vi.fn()} toggleSidebar={vi.fn()} setShellPreference={vi.fn()} t={t}
        renderSlot={((() => <div />) as SidebarRootComponentProps['renderSlot'])}
      />,
    )
    expect(screen.getByRole('button', { name: 'Switch layout' }).title).toBe('Automatic layout')
  })

  it('cycles the stored chrome from the footer switch', () => {
    const b = mountShell()
    fireEvent.click(screen.getByRole('button', { name: 'Switch layout' }))
    expect(b.setShellPreference).toHaveBeenCalledWith('compact')
  })
})

describe('SidebarRoot compact drawer', () => {
  it('paints the bottom nav while the session list stays closed', () => {
    mountShell({ presentation: 'drawer', collapsed: true, width: 320 })
    expect(screen.getByRole('navigation', { name: 'Sessions' })).toBeTruthy()
    expect(screen.queryByTestId('region')).toBeNull()
  })

  it('opens the session list, closes on Escape, and starts a session from the drawer brand', () => {
    const b = mountShell({ presentation: 'drawer', collapsed: false, width: 320 })
    expect(screen.getByTestId('region')).toBeTruthy()
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
    const starters = screen.getAllByRole('button', { name: 'New session' })
    fireEvent.click(starters[0]!)
    expect(b.startSession).toHaveBeenCalledOnce()
    expect(b.toggleSidebar).toHaveBeenCalledTimes(2)
    const closers = screen.getAllByRole('button', { name: 'Collapse sidebar' })
    expect(closers).toHaveLength(2)
    fireEvent.click(closers[0]!)
    fireEvent.click(closers[1]!)
    expect(b.toggleSidebar).toHaveBeenCalledTimes(4)
  })

  it('starts a session from the compact nav without opening the drawer', () => {
    const b = mountShell({ presentation: 'drawer', collapsed: true, width: 320 })
    fireEvent.click(screen.getByRole('button', { name: 'New session' }))
    expect(b.startSession).toHaveBeenCalledOnce()
    expect(b.toggleSidebar).not.toHaveBeenCalled()
  })

  it('toggles the drawer from the sessions nav item and ignores unrelated keys', () => {
    const b = mountShell({ presentation: 'drawer', collapsed: false, width: 320 })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(b.toggleSidebar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sessions' }))
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('uses an explicit nextPreference on the compact layout switch', () => {
    const setShellPreference = vi.fn()
    render(
      <SidebarRoot
        collapsed={true} width={320} presentation="drawer" nextPreference="desktop"
        useSessions={neverHook} useWorkspaces={neverHook}
        startSession={vi.fn()} toggleSidebar={vi.fn()} setShellPreference={setShellPreference} t={t}
        renderSlot={((() => <div />) as SidebarRootComponentProps['renderSlot'])}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Switch layout' }))
    expect(setShellPreference).toHaveBeenCalledWith('desktop')
  })
})
