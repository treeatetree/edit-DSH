/**
 * Accept only the `dsh plugin add` specs the marketplace UI may submit.
 * @module @deepseek-ai/dsh-host-plugin-marketplace/spec
 */

const NPM_NAME = /^(?:@[a-z0-9][a-z0-9-._]*\/)?[a-z0-9][a-z0-9-._]*$/
const NPM_SPEC = /^(?:@[a-z0-9][a-z0-9-._]*\/)?[a-z0-9][a-z0-9-._]*(?:@[^@\s]+)?$/
const GITHUB_SPEC = /^github:(?<repo>[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:#(?<ref>[A-Za-z0-9._/-]+))?$/

/**
 * Whether `spec` is a registry name, optional tag/version, or `github:owner/repo[#ref]`.
 * Relative paths, `file:`, `link:`, and shell metacharacters are refused.
 * @param spec - raw marketplace install field.
 * @returns true when `dsh plugin add` may receive this spec.
 */
export function isInstallSpec(spec: string): boolean {
  const trimmed = spec.trim()
  if (trimmed.length === 0 || trimmed !== spec) return false
  if (GITHUB_SPEC.test(trimmed)) return true
  return NPM_SPEC.test(trimmed)
}

/**
 * Map a marketplace `github:owner/repo[#ref]` spec to GitHub's archive tarball.
 * `pnpm add github:…` runs `git ls-remote` / clone; those git HTTPS requests
 * often stall on networks that still serve `codeload.github.com`.
 * @param spec - already-accepted marketplace install field.
 * @returns the argv forwarded to `dsh plugin add`.
 */
export function resolveInstallTarget(spec: string): string {
  const match = GITHUB_SPEC.exec(spec)
  const repo = match?.groups?.repo
  if (repo === undefined) return spec
  return `https://codeload.github.com/${repo}/tar.gz/${match?.groups?.ref ?? 'HEAD'}`
}

/**
 * Whether `packageName` is an exact npm package name the profile may list.
 * @param packageName - profile dependency key.
 * @returns true when `dsh plugin remove` may receive this name.
 */
export function isPackageName(packageName: string): boolean {
  return packageName.trim() === packageName && NPM_NAME.test(packageName)
}
