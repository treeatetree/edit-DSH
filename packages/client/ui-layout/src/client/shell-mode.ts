/**
 * Shell layout mode: compact (phone / folded cover), split (dual-segment
 * fold), or desktop (three-column AppFrame, including the existing narrow rail).
 */

/** User override; `auto` follows viewport, pointer, and fold segments. */
export type ShellPreference = 'auto' | 'compact' | 'desktop'

/** Resolved chrome the frame actually paints. */
export type ShellMode = 'compact' | 'split' | 'desktop'

/** Width below which auto mode is always compact, including fine-pointer windows. */
export const COMPACT_MAX = 720

/**
 * Compact bottom-nav height in CSS px, excluding `safe-area-inset-bottom`.
 * Conversation, details, and center.cover pad with `--dsh-shell-gutter-bottom`.
 */
export const COMPACT_NAV_HEIGHT = 56

/** localStorage key for {@link ShellPreference}; missing or invalid values are `auto`. */
export const SHELL_PREFERENCE_KEY = 'dsh.layout.shellPreference'

const PREFERENCES = ['auto', 'compact', 'desktop'] as const satisfies readonly ShellPreference[]

/**
 * Accept a stored preference or fall back to auto.
 * @param raw - localStorage value, or `null` when absent.
 * @returns a closed preference.
 */
export function parseShellPreference(raw: string | null): ShellPreference {
  if (raw === 'auto' || raw === 'compact' || raw === 'desktop') return raw
  return 'auto'
}

/**
 * Cycle auto → compact → desktop → auto for the chrome switch.
 * @param current - stored preference.
 * @returns the next preference.
 */
export function nextShellPreference(current: ShellPreference): ShellPreference {
  return PREFERENCES[(PREFERENCES.indexOf(current) + 1) % PREFERENCES.length] as ShellPreference
}

/**
 * Next stored preference that actually changes the painted shell. Auto and a
 * forced mode that already match the viewport would otherwise take an extra
 * click with no visual change (phone auto already paints compact).
 * @param current - stored preference.
 * @param viewport - width, fold spanning, and pointer; preference is applied per candidate.
 * @returns the next preference whose resolved mode differs, or the simple next if none do.
 */
export function nextDistinctShellPreference(
  current: ShellPreference,
  viewport: Omit<ShellModeInput, 'preference'>,
): ShellPreference {
  const painted = resolveShellMode({ ...viewport, preference: current })
  const first = nextShellPreference(current)
  if (resolveShellMode({ ...viewport, preference: first }) !== painted) return first
  return nextShellPreference(first)
}

/** Inputs {@link resolveShellMode} needs from the frame. */
export interface ShellModeInput {
  /** Frame width in CSS px. */
  readonly width: number
  /** True when CSS `(horizontal-viewport-segments: 2)` matches. */
  readonly dualSegment: boolean
  /** True when CSS `(pointer: coarse)` matches (phones, fold cover/inner). */
  readonly coarsePointer: boolean
  readonly preference: ShellPreference
}

/**
 * Resolve the painted shell. Forced compact/desktop win; auto uses dual-segment
 * split, then compact for narrow or coarse-pointer tablets, else desktop.
 * @param input - viewport and preference.
 * @returns the mode AppFrame paints.
 */
export function resolveShellMode(input: ShellModeInput): ShellMode {
  if (input.preference === 'compact') return 'compact'
  if (input.preference === 'desktop') return 'desktop'
  if (input.dualSegment) return 'split'
  if (input.width < COMPACT_MAX) return 'compact'
  if (input.coarsePointer && input.width < 1024) return 'compact'
  return 'desktop'
}

/**
 * Read fold spanning and coarse pointer from the window. jsdom's matchMedia
 * reports `matches: false` unless a test stubs it.
 * @param media - `window.matchMedia`.
 * @returns dual-segment and coarse-pointer flags.
 */
export function readShellMedia(media: typeof window.matchMedia): {
  readonly dualSegment: boolean
  readonly coarsePointer: boolean
} {
  return {
    dualSegment: media('(horizontal-viewport-segments: 2)').matches,
    coarsePointer: media('(pointer: coarse)').matches,
  }
}
