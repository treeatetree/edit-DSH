/**
 * Accept only the `dsh plugin add` specs the marketplace UI may submit.
 * @module @deepseek-ai/dsh-host-plugin-marketplace/spec
 */

const NPM_NAME = /^(?:@[a-z0-9][a-z0-9-._]*\/)?[a-z0-9][a-z0-9-._]*$/
const NPM_SPEC = /^(?:@[a-z0-9][a-z0-9-._]*\/)?[a-z0-9][a-z0-9-._]*(?:@[^@\s]+)?$/
const GITHUB_SPEC = /^github:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:#[A-Za-z0-9._/-]+)?$/

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
 * Whether `packageName` is an exact npm package name the profile may list.
 * @param packageName - profile dependency key.
 * @returns true when `dsh plugin remove` may receive this name.
 */
export function isPackageName(packageName: string): boolean {
  return packageName.trim() === packageName && NPM_NAME.test(packageName)
}
