# @deepseek-ai/dsh-client-ui-layout

English | [中文](README.zh.md)

Shell plugin: AppFrame plus the `ctx.layout` panel-geometry service; it registers into the runtime-owned `root` slot and declares `sidebar`, `conversation`, `center.cover`, `details`, and `shell.overlay`. Auto chrome is `compact` below 720px (or a coarse-pointer viewport below 1024px), `split` when CSS `(horizontal-viewport-segments: 2)` matches a dual-segment fold, and `desktop` otherwise — the existing three-column concession chain, including the 56px rail below 1024px. Compact stacks the columns, paints a bottom nav plus session drawer, and sets `--dsh-shell-gutter-bottom` so the composer and center covers clear the nav and `safe-area-inset-bottom`. Split places the sidebar in the first viewport segment and stacks conversation plus details overlay in the second. A stored `shellPreference` (`auto` / `compact` / `desktop`) is the only layout value written to `localStorage` (`dsh.layout.shellPreference`); panel widths stay process-local. The layout switch stores the next preference that actually changes the painted shell, so auto on a phone does not take an extra click through forced compact. Compact and split paint no drag handles. The sidebar resize boundary is an invisible hit strip, while the details boundary retains its floating pill; only details shrinks during concession and then auto-closes. A closed desktop sidebar retains a 56px control rail while details closes to zero width. The package also seats the theme presenter: it consumes resolved `ctx.theme` snapshots and projects them onto the document (`html { color-scheme }` for native UA chrome, `body[data-ds-dark-theme]` from the active color scheme, the theme's alias tokens as inline variables on body, and one owned `<meta name="theme-color">` whose content follows the computed body background). Measuring after palette and token application keeps the rendered background as the single color authority; disposing the presenter removes its metadata node with its other global writes. When a `viewport` meta already exists, the presenter appends `viewport-fit=cover` if missing and restores the original content on dispose.

AppFrame always mounts the conversation and details columns; a connected Session renders through `SessionProvider`. The transient layout store starts the sidebar at its default width and details closed. Hero and other unselected states also derive a zero rendered details width without changing that stored preference. AppFrame retains the last non-blank Session id across those states: the first Session remains closed, an explicit details action opens the contract default width, returning to the same Session restores its unchanged width, and selecting a different Session closes details before paint. Compact chrome also closes the session drawer when the current Session id changes. The conversation owner share is empty, while the sidebar owner share contains `collapsed`, `width`, `presentation` (`column` / `drawer`), `shellPreference`, `shellMode`, and `nextPreference`; registrants obtain business data from standard hooks and actions from their own inject faces.

The `/client` exports are the plugin body (`apply`/`inject`), `LayoutController`, `ILayout.setShellPreference`, `nextDistinctShellPreference` / `nextShellPreference` / `parseShellPreference`, and the owner-share interfaces (`SidebarOwnerProps`, `ConvOwnerProps`, `CenterCoverOwnerProps`, `DetailsOwnerProps`). AppFrame, the panel store, and the concession solver remain package-internal.

## Model Experience

None, as the layout shell manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Panel geometry is transient** — reload restores the sidebar default and details closed; switching between distinct Session ids also closes details and forgets its dragged width, while unselected surfaces render details at zero width without modifying geometry. `shellPreference` is the exception: it is reread from `localStorage` on create.
- **Concession-chain auto-close derives a zero width without touching the preferred width** — the panel restores itself when the window widens; consumers must not read the stored details width as the rendered truth.
- **No scroll anchoring during squeeze reflow** — layout changes may move the reader's viewport.
- **Split chrome uses CSS viewport-segment environment variables** — a browser that reports two horizontal segments but does not resolve `env(viewport-segment-*)` falls back to a 40% / `minmax(0, 1fr)` pair with no hinge gap.
