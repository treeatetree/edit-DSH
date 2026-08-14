/**
 * The root entry's transient layout store: panel geometry as plain widths in
 * px (0 = closed). Module level exports the factory only — a module-level
 * handle would pin the store's identity in the module
 * cache (a de-facto singleton surviving plugin reloads). register() receives
 * the factory (exclusive use: the framework instantiates per entry), AppFrame
 * derives its PropsStore share from the return type, and the service face
 * receives the bound actions through the registration's inject hook.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import {
  clampWidth, DETAILS_DEFAULT, DETAILS_MAX, DETAILS_MIN,
  SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN,
} from './columns.ts'
import {
  parseShellPreference, SHELL_PREFERENCE_KEY, type ShellPreference,
} from './shell-mode.ts'

/**
 * Layout store state: panel width preferences in px (0 = closed), plus the
 * narrow-viewport pair — `narrow` mirrors AppFrame's overlay-toggle reading
 * (desktop below SIDEBAR_AUTO_COLLAPSE, or compact shell) so toggleSidebar
 * can pick semantics, and `narrowExpanded` is the manual override that
 * re-expands the auto-collapsed sidebar (or opens the compact drawer)
 * without rewriting the width preference. `shellPreference` is the only
 * field written to localStorage (`dsh.layout.shellPreference`).
 */
type LayoutState = {
  sidebar: number
  details: number
  narrow: boolean
  narrowExpanded: boolean
  shellPreference: ShellPreference
}

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type LayoutActions = {
  setSidebar: (draft: LayoutState, px: number) => void
  setDetails: (draft: LayoutState, px: number) => void
  toggleSidebar: (draft: LayoutState) => void
  setNarrow: (draft: LayoutState, narrow: boolean) => void
  setShellPreference: (draft: LayoutState, preference: ShellPreference) => void
  openDetails: (draft: LayoutState) => void
  closeDetails: (draft: LayoutState) => void
}

/**
 * Create the layout panel store handle. The preference IS the width, so
 * closing a panel forgets its drag width — reopening restores the contract
 * default. Actions are the complete write set: drag writes clamp
 * into the panel's contract range and never cross the open/closed line;
 * open/close transitions write 0 / the default explicitly. Below the
 * auto-collapse breakpoint or in the compact shell (AppFrame feeds setNarrow)
 * the sidebar toggle flips the narrowExpanded override instead of the
 * preference. Shell compact/desktop/auto is stored under
 * {@link SHELL_PREFERENCE_KEY}; panel widths stay process-local.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createLayoutStore(): EngineStoreHandle<LayoutState, LayoutActions>  {
  const handle = defineStore({
    init: (): LayoutState => ({
      sidebar: SIDEBAR_DEFAULT,
      details: 0,
      narrow: false,
      narrowExpanded: false,
      shellPreference: readStoredShellPreference(),
    }),
    actions: {
      setSidebar: (d, px: number) => { d.sidebar = clampWidth(px, SIDEBAR_MIN, SIDEBAR_MAX) },
      setDetails: (d, px: number) => { d.details = clampWidth(px, DETAILS_MIN, DETAILS_MAX) },
      // Narrow toggles flip only the override: the width preference survives
      // untouched, so re-widening restores the pre-squeeze layout.
      toggleSidebar: (d) => {
        if (d.narrow) d.narrowExpanded = !d.narrowExpanded
        else d.sidebar = d.sidebar === 0 ? SIDEBAR_DEFAULT : 0
      },
      // Crossing the breakpoint in either direction drops the override: the
      // narrow default is auto-collapsed, the wide state is the preference.
      setNarrow: (d, narrow: boolean) => {
        if (d.narrow === narrow) return
        d.narrow = narrow
        d.narrowExpanded = false
      },
      setShellPreference: (d, preference: ShellPreference) => {
        d.shellPreference = preference
        persistShellPreference(preference)
      },
      openDetails: (d) => { if (d.details === 0) d.details = DETAILS_DEFAULT },
      closeDetails: (d) => { d.details = 0 },
    },
  })
  return handle
}

function readStoredShellPreference(): ShellPreference {
  try {
    return parseShellPreference(localStorage.getItem(SHELL_PREFERENCE_KEY))
  } catch {
    // Private mode or missing storage: auto until the user picks a mode.
    return 'auto'
  }
}

function persistShellPreference(preference: ShellPreference): void {
  try {
    localStorage.setItem(SHELL_PREFERENCE_KEY, preference)
  } catch {
    // Quota or private mode: the preference stays in this process only.
  }
}
