/**
 * The /DSH/ overlay must rewrite Vite stylesheet and modulepreload hrefs.
 * Origin-root /assets on the IP vhost is liushui HTML (200), so an unrewritten
 * CSS link boots the UI without styles.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const nginxConf = readFileSync(resolve(root, 'deploy/nginx/dsh-web.conf'), 'utf8')

function extractSubFilters(block: string): Array<readonly [needle: string, replacement: string]> {
  const filters: Array<readonly [string, string]> = []
  const pattern = /sub_filter '([^']*)' '([^']*)';/g
  for (const match of block.matchAll(pattern)) {
    const needle = match[1]
    const replacement = match[2]
    if (needle === undefined || replacement === undefined) continue
    filters.push([needle, replacement])
  }
  return filters
}

function applySubFilters(input: string, filters: ReadonlyArray<readonly [string, string]>): string {
  let output = input
  for (const [needle, replacement] of filters) {
    output = output.split(needle).join(replacement)
  }
  return output
}

function locationBlock(prefix: string): string {
  const start = nginxConf.indexOf(prefix)
  if (start < 0) throw new Error(`missing ${prefix}`)
  const brace = nginxConf.indexOf('{', start)
  let depth = 0
  for (let i = brace; i < nginxConf.length; i++) {
    const ch = nginxConf[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return nginxConf.slice(start, i + 1)
    }
  }
  throw new Error(`unclosed ${prefix}`)
}

const htmlLocation = locationBlock('location ^~ /__DSH_HTTP_PATH__/ {')
const assetsLocation = locationBlock('location ^~ /__DSH_HTTP_PATH__/assets/ {')
const pluginsLocation = locationBlock('location ^~ /__DSH_HTTP_PATH__/plugins/ {')
const htmlFilters = extractSubFilters(htmlLocation)
const assetFilters = extractSubFilters(assetsLocation)

const viteHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <script type="module" crossorigin src="/assets/index-Dqw48FrP.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/vendor-Cjbwl5VI.js">
    <link rel="stylesheet" crossorigin href="/assets/vendor-CjyC-hUb.css">
    <link rel="stylesheet" crossorigin href="/assets/index-CSGf6Qzd.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`

describe('cloud web /DSH/ nginx path-prefix rewrite', () => {
  it('rewrites stylesheet and modulepreload hrefs without touching the fetch-patch needle', () => {
    const rewritten = applySubFilters(viteHtml, htmlFilters)
    expect(rewritten).toContain('src="/__DSH_HTTP_PATH__/assets/index-Dqw48FrP.js"')
    expect(rewritten).toContain('href="/__DSH_HTTP_PATH__/assets/vendor-Cjbwl5VI.js"')
    expect(rewritten).toContain('href="/__DSH_HTTP_PATH__/assets/vendor-CjyC-hUb.css"')
    expect(rewritten).toContain('href="/__DSH_HTTP_PATH__/assets/index-CSGf6Qzd.css"')
    expect(rewritten).toContain('href="/__DSH_HTTP_PATH__/manifest.webmanifest"')
    expect(rewritten).toContain('href="/__DSH_HTTP_PATH__/favicon.svg"')
    expect(rewritten).not.toMatch(/href="\/assets\//)
    expect(rewritten).not.toMatch(/src="\/assets\//)
    expect(rewritten).toContain('x.pathname.indexOf("/assets/")===0')
    expect(rewritten).not.toContain('indexOf("/__DSH_HTTP_PATH__/assets/")')
  })

  it('rewrites KaTeX origin-root font urls in CSS', () => {
    const css = '@font-face{src:url(/assets/fonts/KaTeX_Main-Regular-B22Nviop.woff2) format("woff2")}'
    const rewritten = applySubFilters(css, assetFilters)
    expect(rewritten).toContain('url(/__DSH_HTTP_PATH__/assets/fonts/KaTeX_Main-Regular-B22Nviop.woff2)')
    expect(rewritten).not.toContain('url(/assets/')
    expect(assetsLocation).toContain('sub_filter_types text/css')
  })

  it('keeps href=/assets/ as its own substitution, not a generic "/assets/ rewrite', () => {
    expect(htmlLocation).toContain("sub_filter 'href=\"/assets/'")
    expect(htmlLocation.includes("sub_filter '\"/assets/'")).toBe(false)
  })

  it('gzips buffered plugin JS and hashed assets after stripping upstream encoding', () => {
    expect(nginxConf).toMatch(/^\s*gzip on;/m)
    expect(nginxConf).toMatch(/^\s*gzip_proxied any;/m)
    expect(nginxConf).toMatch(/^\s*gzip_types .*application\/javascript/m)
    expect(assetsLocation).toContain('proxy_buffering on')
    expect(assetsLocation).toContain('expires 7d')
    expect(pluginsLocation).toContain('proxy_buffering on')
    expect(pluginsLocation).toContain('Accept-Encoding ""')
    expect(pluginsLocation.includes('sub_filter')).toBe(false)
    expect(htmlLocation).toContain('proxy_buffering off')
  })
})
