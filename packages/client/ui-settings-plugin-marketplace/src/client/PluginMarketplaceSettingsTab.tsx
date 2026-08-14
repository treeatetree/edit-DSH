import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type {
  MarketplaceMutationResult,
  MarketplaceOrigin,
  MarketplacePlugin,
  MarketplaceSnapshot,
} from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconChevronDownOutline14,
  IconSearchOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginMarketplaceLocaleKey } from './locales.ts'
import css from './PluginMarketplaceSettingsTab.module.css'

/** Registration-side Remote face used by the tab. */
export interface PluginMarketplaceSettingsTabInjected {
  /** Read the current marketplace snapshot. */
  catalog: () => Promise<MarketplaceSnapshot>
  /** Install one `dsh plugin add` spec. */
  install: (spec: string) => Promise<MarketplaceMutationResult>
  /** Remove one installed profile dependency. */
  remove: (packageName: string) => Promise<MarketplaceMutationResult>
  /** Last successful catalog, used to paint immediately while a refresh runs. */
  lastCatalog?: () => MarketplaceSnapshot | undefined
}

/** Catalog body props: locale plus the Host Remote face. */
export type PluginMarketplaceSettingsTabProps =
  PropsLocale<'settings.pluginMarketplace'>
  & InjectFace<PluginMarketplaceSettingsTabInjected>

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: MarketplaceSnapshot }

type FilterId = 'all' | MarketplaceOrigin

const ORIGIN_KEYS = {
  official: 'officialTag',
  community: 'communityTag',
  installed: 'installedTag',
} satisfies Record<MarketplaceOrigin, PluginMarketplaceLocaleKey>

const FILTER_KEYS = {
  all: 'filterAll',
  official: 'filterOfficial',
  community: 'filterCommunity',
  installed: 'filterInstalled',
} satisfies Record<FilterId, PluginMarketplaceLocaleKey>

const FILTERS = ['all', 'official', 'community', 'installed'] as const satisfies readonly FilterId[]

/** Whether a catalog row matches the local query and origin filter. */
function matches(entry: MarketplacePlugin, query: string, filter: FilterId): boolean {
  if (filter !== 'all' && entry.origin !== filter) return false
  if (query.length === 0) return true
  return [
    entry.title,
    entry.description,
    entry.installSpec ?? '',
    entry.packageName ?? '',
    entry.group ?? '',
    entry.owner ?? '',
    entry.language ?? '',
    ...(entry.topics ?? []),
  ].some(value => value.toLocaleLowerCase().includes(query))
}

/** Render the plugin marketplace catalog, install, and remove controls. */
export function PluginMarketplaceSettingsTab({
  catalog,
  install,
  remove,
  lastCatalog,
  t,
}: PluginMarketplaceSettingsTabProps): ReactNode {
  const catalogId = useId()
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterId>('all')
  const [expanded, setExpanded] = useState<MarketplacePlugin['id'] | null>(null)
  const [customSpec, setCustomSpec] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [state, setState] = useState<ViewState>(() => {
    const snapshot = lastCatalog?.()
    return snapshot === undefined ? { status: 'loading' } : { status: 'ready', snapshot }
  })

  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => catalog()).then(
      (snapshot) => { if (current) setState({ status: 'ready', snapshot }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [catalog, request])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredEntries = useMemo(
    () => state.status === 'ready'
      ? state.snapshot.entries.filter(entry => matches(entry, normalizedQuery, filter))
      : [],
    [filter, normalizedQuery, state],
  )

  useEffect(() => {
    if (expanded !== null && !filteredEntries.some(entry => entry.id === expanded)) {
      setExpanded(null)
    }
  }, [expanded, filteredEntries])

  const retry = (): void => {
    setState({ status: 'loading' })
    setNotice(null)
    setRequest(value => value + 1)
  }

  const runMutation = async (id: string, action: () => Promise<MarketplaceMutationResult>): Promise<void> => {
    setBusyId(id)
    setNotice(null)
    try {
      const result = await action()
      if (!result.ok) {
        setNotice(result.code === 'missing-pnpm' ? t('pnpmMissing') : result.message)
        return
      }
      setNotice(t('restart'))
      setState({ status: 'loading' })
      setRequest(value => value + 1)
    } catch {
      setNotice(t('error'))
    } finally {
      setBusyId(null)
    }
  }

  const onCustomInstall = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const spec = customSpec.trim()
    if (spec.length === 0 || busyId !== null) return
    void runMutation('custom', () => install(spec))
  }

  return (
    <div className={css.section} aria-busy={state.status === 'loading' || busyId !== null}>
      <p className={css.intro}>{t('intro')}</p>
      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p role="alert">{t('error')}</p>
          <button type="button" onClick={retry}>{t('retry')}</button>
        </div>
      ) : null}
      {notice !== null ? (
        <p className={css.restart} role="status">
          <span>{notice}</span>
          <button type="button" className={css.dismiss} onClick={() => { setNotice(null) }}>
            {t('dismissNotice')}
          </button>
        </p>
      ) : null}
      {state.status === 'ready' ? (
        <div className={css.catalog}>
          <div className={css.chrome} data-marketplace-chrome="true">
            <label className={css.search}>
              <IconSearchOutline16 aria-hidden="true" />
              <span className={css.visuallyHidden}>{t('search')}</span>
              <input
                type="search"
                value={query}
                placeholder={t('search')}
                aria-label={t('search')}
                onChange={(event) => { setQuery(event.currentTarget.value) }}
              />
            </label>
            <div className={css.filters} role="group" aria-label={t('catalog')}>
              {FILTERS.map(id => (
                <button
                  key={id}
                  type="button"
                  data-active={filter === id ? 'true' : undefined}
                  aria-pressed={filter === id}
                  onClick={() => { setFilter(id) }}
                >
                  {t(FILTER_KEYS[id])}
                </button>
              ))}
            </div>
            <form className={css.custom} onSubmit={onCustomInstall}>
              <label className={css.customLabel} htmlFor={`${catalogId}-spec`}>{t('customSpec')}</label>
              <div className={css.customRow}>
                <input
                  id={`${catalogId}-spec`}
                  value={customSpec}
                  placeholder={t('customSpecPlaceholder')}
                  aria-label={t('customSpec')}
                  onChange={(event) => { setCustomSpec(event.currentTarget.value) }}
                />
                <button type="submit" disabled={busyId !== null || customSpec.trim().length === 0}>
                  {busyId === 'custom' ? t('installing') : t('customSpecSubmit')}
                </button>
              </div>
            </form>
          </div>
          <div className={css.sources}>
            {state.snapshot.sources.filter(source => !source.ok).map(source => (
              <p className={css.source} data-ok="false" key={source.id}>
                {t('sourceFailed')}: {source.message}
              </p>
            ))}
          </div>
          <div className={css.catalogHeading}>
            <h3>{t('catalog')}</h3>
            <span data-marketplace-count={filteredEntries.length}>{filteredEntries.length}</span>
          </div>
          {state.snapshot.entries.length === 0 ? <p className={css.status}>{t('empty')}</p> : null}
          {state.snapshot.entries.length > 0 && filteredEntries.length === 0
            ? <p className={css.status}>{t('emptySearch')}</p>
            : null}
          {filteredEntries.length > 0 ? (
            <ul className={css.cards}>
              {filteredEntries.map((entry) => {
                const origin = t(ORIGIN_KEYS[entry.origin])
                const open = expanded === entry.id
                const detailId = `${catalogId}-details-${encodeURIComponent(entry.id)}`
                const busy = busyId === entry.id
                return (
                  <li
                    className={css.card}
                    key={entry.id}
                    data-marketplace-entry={entry.id}
                    data-open={open ? 'true' : undefined}
                  >
                    <button
                      className={css.cardContent}
                      type="button"
                      aria-expanded={open}
                      aria-controls={detailId}
                      aria-label={`${entry.title}, ${origin}`}
                      onClick={() => {
                        setExpanded(current => current === entry.id ? null : entry.id)
                      }}
                    >
                      {entry.imageUrl !== null && entry.imageUrl.length > 0 ? (
                        <img
                          className={css.avatar}
                          src={entry.imageUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onError={(event) => { event.currentTarget.hidden = true }}
                        />
                      ) : null}
                      <span className={css.cardCopy}>
                        <strong className={css.cardTitle} title={entry.title}>{entry.title}</strong>
                        {entry.description.length > 0
                          ? <span className={css.summary}>{entry.description}</span>
                          : null}
                      </span>
                      <span className={css.cardTrailing}>
                        <span className={css.configTag} data-origin={entry.origin}>{origin}</span>
                        {entry.installSpec === null ? (
                          <span className={css.configTag} data-kind="browse">{t('browseOnly')}</span>
                        ) : null}
                        {entry.stars !== null ? (
                          <span className={css.metric} title={t('stars')}>{entry.stars}</span>
                        ) : null}
                        <IconChevronDownOutline14 className={css.chevron} size={12} aria-hidden="true" />
                      </span>
                    </button>
                    {open ? (
                      <div className={css.cardDetails} id={detailId}>
                        {entry.coverUrl !== null && entry.coverUrl.length > 0 ? (
                          <img
                            className={css.cover}
                            src={entry.coverUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            onError={(event) => { event.currentTarget.hidden = true }}
                          />
                        ) : null}
                        <dl className={css.details}>
                          {entry.owner !== null ? (
                            <div>
                              <dt>{t('owner')}</dt>
                              <dd>{entry.owner}</dd>
                            </div>
                          ) : null}
                          {entry.group !== null ? (
                            <div>
                              <dt>{t('group')}</dt>
                              <dd>{entry.group}</dd>
                            </div>
                          ) : null}
                          {entry.language !== null ? (
                            <div>
                              <dt>{t('language')}</dt>
                              <dd>{entry.language}</dd>
                            </div>
                          ) : null}
                          {entry.installSpec !== null ? (
                            <div>
                              <dt>{t('spec')}</dt>
                              <dd><code>{entry.installSpec}</code></dd>
                            </div>
                          ) : null}
                          {entry.stars !== null ? (
                            <div>
                              <dt>{t('stars')}</dt>
                              <dd>{entry.stars}</dd>
                            </div>
                          ) : null}
                          {entry.forks !== null ? (
                            <div>
                              <dt>{t('forks')}</dt>
                              <dd>{entry.forks}</dd>
                            </div>
                          ) : null}
                          {entry.updatedAt !== null ? (
                            <div>
                              <dt>{t('updated')}</dt>
                              <dd>{entry.updatedAt.slice(0, 10)}</dd>
                            </div>
                          ) : null}
                          {entry.topics !== undefined && entry.topics.length > 0 ? (
                            <div>
                              <dt>{t('topics')}</dt>
                              <dd>{entry.topics.join(', ')}</dd>
                            </div>
                          ) : null}
                        </dl>
                        <div className={css.cardActions}>
                          {entry.htmlUrl.length > 0 ? (
                            <a href={entry.htmlUrl} target="_blank" rel="noreferrer">{t('browse')}</a>
                          ) : null}
                          {entry.origin !== 'installed' && entry.installSpec !== null ? (
                            <button
                              className={css.action}
                              data-kind="install"
                              type="button"
                              disabled={busyId !== null}
                              onClick={() => {
                                void runMutation(entry.id, () => install(entry.installSpec as string))
                              }}
                            >
                              {busy ? t('installing') : t('install')}
                            </button>
                          ) : null}
                          {entry.origin === 'installed' && entry.packageName !== null ? (
                            <button
                              className={css.action}
                              data-kind="remove"
                              type="button"
                              disabled={busyId !== null}
                              onClick={() => {
                                void runMutation(entry.id, () => remove(entry.packageName as string))
                              }}
                            >
                              {busy ? t('removing') : t('remove')}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
