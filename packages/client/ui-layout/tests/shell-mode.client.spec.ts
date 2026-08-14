import { describe, expect, it } from 'vitest'
import {
  nextDistinctShellPreference, nextShellPreference, parseShellPreference, readShellMedia,
  resolveShellMode,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/shell-mode.ts'

const phone = { width: 390, dualSegment: false, coarsePointer: true }
const tablet = { width: 820, dualSegment: false, coarsePointer: true }
const wide = { width: 1440, dualSegment: false, coarsePointer: false }
const fold = { width: 1440, dualSegment: true, coarsePointer: true }
const narrowDesktop = { width: 980, dualSegment: false, coarsePointer: false }

describe('parseShellPreference', () => {
  it('accepts the closed set and falls back to auto', () => {
    expect(parseShellPreference('auto')).toBe('auto')
    expect(parseShellPreference('compact')).toBe('compact')
    expect(parseShellPreference('desktop')).toBe('desktop')
    expect(parseShellPreference(null)).toBe('auto')
    expect(parseShellPreference('rail')).toBe('auto')
  })
})

describe('nextShellPreference', () => {
  it('cycles auto → compact → desktop → auto', () => {
    expect(nextShellPreference('auto')).toBe('compact')
    expect(nextShellPreference('compact')).toBe('desktop')
    expect(nextShellPreference('desktop')).toBe('auto')
  })
})

describe('resolveShellMode', () => {
  it('forced compact and desktop win over viewport and fold spanning', () => {
    expect(resolveShellMode({ ...fold, preference: 'compact' })).toBe('compact')
    expect(resolveShellMode({ ...phone, preference: 'desktop' })).toBe('desktop')
  })

  it('auto uses dual-segment split, then compact for narrow or coarse tablets', () => {
    expect(resolveShellMode({ ...fold, preference: 'auto' })).toBe('split')
    expect(resolveShellMode({ ...phone, preference: 'auto' })).toBe('compact')
    expect(resolveShellMode({ ...tablet, preference: 'auto' })).toBe('compact')
    expect(resolveShellMode({ ...narrowDesktop, preference: 'auto' })).toBe('desktop')
    expect(resolveShellMode({ ...wide, preference: 'auto' })).toBe('desktop')
  })
})

describe('nextDistinctShellPreference', () => {
  it('skips a forced twin that would not change the painted shell', () => {
    expect(nextDistinctShellPreference('auto', phone)).toBe('desktop')
    expect(nextDistinctShellPreference('desktop', phone)).toBe('auto')
    expect(nextDistinctShellPreference('compact', phone)).toBe('desktop')
    expect(nextDistinctShellPreference('auto', wide)).toBe('compact')
    expect(nextDistinctShellPreference('desktop', wide)).toBe('compact')
    expect(nextDistinctShellPreference('compact', wide)).toBe('desktop')
    expect(nextDistinctShellPreference('auto', fold)).toBe('compact')
  })
})

describe('readShellMedia', () => {
  it('reads dual-segment and coarse-pointer from matchMedia', () => {
    const media = ((query: string) => ({
      matches: query.includes('horizontal-viewport-segments: 2') || query.includes('(pointer: coarse)'),
    })) as typeof window.matchMedia
    expect(readShellMedia(media)).toEqual({ dualSegment: true, coarsePointer: true })
    const none = ((() => ({ matches: false })) as typeof window.matchMedia)
    expect(readShellMedia(none)).toEqual({ dualSegment: false, coarsePointer: false })
  })
})
