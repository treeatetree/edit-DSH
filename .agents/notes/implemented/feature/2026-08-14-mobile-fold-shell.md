# Agent Note: Mobile and foldable web shell

Status: implemented

English | [中文](2026-08-14-mobile-fold-shell.zh.md)

## Problem

The web shell is a three-column AppFrame with a 56px rail below 1024px. On a phone that rail still occupies horizontal space, the session list is not a drawer, the composer sits under the home-indicator, and dual-segment foldables keep a single grid that ignores the hinge. Users also need an explicit compact/desktop override that survives reload without persisting drag widths.

## Decision

**Three painted modes, one stored preference.** `resolveShellMode` maps `shellPreference` plus viewport facts to `compact`, `split`, or `desktop`. Forced `compact` / `desktop` win. Auto paints `split` when `(horizontal-viewport-segments: 2)` matches, `compact` below 720px or on a coarse-pointer viewport below 1024px, and `desktop` otherwise (including the existing rail below 1024px on a fine pointer). Only `dsh.layout.shellPreference` is written to `localStorage`; panel widths stay process-local.

**Compact is a stacked overlay, not a squeezed three-column.** AppFrame paints one track. `ui-sidebar` receives `presentation: 'drawer'` and paints a bottom nav plus an overlay session list. `--dsh-shell-gutter-bottom` lifts the composer and `center.cover`. Details, when open, overlay the conversation with a solid background. Changing the current Session id closes the drawer. Compact and split paint no drag handles.

**Split uses CSS viewport segments.** The sidebar occupies segment 0; conversation and the details overlay share segment 1. The hinge gap is `env(viewport-segment-left 1 0) - env(viewport-segment-left 0 0) - env(viewport-segment-width 0 0)`. Browsers that match the media query but do not resolve those env values fall back to 40% / `minmax(0, 1fr)` with no gap.

**The layout switch skips a no-op twin.** `nextDistinctShellPreference` stores the next preference whose resolved mode differs from the current paint, so auto on a phone jumps to desktop instead of forced compact.

`ILayout.setShellPreference` is the cross-plugin write. The theme presenter appends `viewport-fit=cover` on an existing viewport meta so `safe-area-inset-bottom` is defined.

## Alternatives considered

**A CSS-only `@media (max-width: 720px)` restyle of the three columns.** Rejected because the session list, bottom nav, details overlay, and fold spanning need different slot owner props and hit targets, not just narrower tracks.

**Persisting panel widths with the new preference.** Rejected because the existing store contract keeps geometry process-local; mixing the two would restore a squeezed desktop layout on a phone after a desktop drag.

**Exposing compact/desktop as a Settings field instead of a chrome control.** Rejected because the switch has to be reachable from the compact nav itself, including when Settings is closed.

**Treating a coarse-pointer 1024px inner fold as desktop.** Rejected because the inner screen is still touch-first; compact chrome until 1024px matches the existing auto-collapse breakpoint.

## Consequences

Phones and folded covers get a bottom nav and a session drawer. Dual-segment folds put navigation on one half and chat on the other. Desktop users keep the three-column shell and can force compact. Overlay deploys must ship `ui-layout`, `ui-sidebar`, and the composer/marketplace CSS that consume `--dsh-shell-gutter-bottom`.

## Testing

Package tests cover preference parse/cycle/persist, `resolveShellMode` and `nextDistinctShellPreference`, AppFrame compact/split/forced desktop, compact details overlay, session-change drawer close, matchMedia updates, and the compact drawer/nav in `ui-sidebar`. The keyless web e2e `compact-shell` boots a 390×844 viewport, snapshots `[data-compact-nav]`, and clicks the layout switch to `data-shell=desktop`. Coverage gaps remain a real dual-segment foldable device and a hinge-gap measurement against `env(viewport-segment-*)`.
