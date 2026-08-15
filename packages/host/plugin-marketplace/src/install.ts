/**
 * Run `dsh plugin --profile` without a shell.
 * @module @deepseek-ai/dsh-host-plugin-marketplace/install
 */

import { resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { runNativeCommand, type NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import { isInstallSpec, isPackageName, resolveInstallTarget } from './spec.ts'
import { readInstalledPlugins } from './catalog.ts'
import type { MarketplaceMutationFailure, MarketplaceMutationResult } from './types.ts'

/** Inputs for one profile mutation. */
export interface PluginCommandRequest {
  readonly cliPath: string
  readonly profile: string
  readonly timeoutMs: number
}

/**
 * Rejected-spec failure shared by install and remove.
 * @param code - wire failure code.
 * @param message - user-visible reason.
 * @param stdout - captured CLI stdout; empty when the command did not run.
 * @param stderr - captured CLI stderr; empty when the command did not run.
 * @returns `ok: false` mutation payload.
 */
export function mutationFailure(
  code: MarketplaceMutationFailure['code'],
  message: string,
  stdout = '',
  stderr = '',
): MarketplaceMutationFailure {
  return { ok: false, code, message, stdout, stderr }
}

/**
 * Run `dsh plugin --profile <name> <verb> <target>` and map exit text to a mutation result.
 * @param request - CLI path, profile, timeout.
 * @param verb - pnpm verb forwarded by `dsh plugin`.
 * @param target - validated spec or package name.
 * @param run - command runner (tests inject a fake).
 * @returns success with `restartRequired`, or a mapped command/timeout failure.
 */
export async function runPluginCommand(
  request: PluginCommandRequest,
  verb: 'add' | 'remove',
  target: string,
  run: NativeCommandRunner,
): Promise<MarketplaceMutationResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, request.timeoutMs)
  try {
    const forwarded = verb === 'add' ? resolveInstallTarget(target) : target
    const result = await run(
      request.cliPath,
      ['plugin', '--profile', request.profile, verb, forwarded],
      controller.signal,
    )
    return { ok: true, stdout: result.stdout, stderr: result.stderr, restartRequired: true }
  } catch (error) {
    const stdout = errorHasStdio(error) ? error.stdout : ''
    const stderr = errorHasStdio(error) ? error.stderr : ''
    const text = `${error instanceof Error ? error.message : ''} ${stderr}`
    if (/pnpm not found/i.test(text)) {
      return mutationFailure(
        'missing-pnpm',
        'pnpm is not installed on PATH',
        stdout,
        stderr,
      )
    }
    if (controller.signal.aborted) {
      return mutationFailure('timeout', `dsh plugin ${verb} exceeded ${String(request.timeoutMs)}ms`, stdout, stderr)
    }
    return mutationFailure('command-failed', `dsh plugin ${verb} failed`, stdout, stderr)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Install `spec` into the configured profile.
 * @param request - CLI path, profile, timeout.
 * @param spec - raw marketplace install field.
 * @param run - command runner.
 * @returns mutation result; invalid specs do not spawn.
 */
export async function installPlugin(
  request: PluginCommandRequest,
  spec: string,
  run: NativeCommandRunner = runNativeCommand,
): Promise<MarketplaceMutationResult> {
  if (!isInstallSpec(spec)) {
    return mutationFailure('invalid-spec', `refusing install spec ${JSON.stringify(spec)}`)
  }
  return runPluginCommand(request, 'add', spec, run)
}

/**
 * Remove `packageName` from the configured profile when it is a recorded dependency.
 * @param request - CLI path, profile, timeout.
 * @param packageName - profile dependency key.
 * @param run - command runner.
 * @returns mutation result; unknown names do not spawn.
 */
export async function removePlugin(
  request: PluginCommandRequest,
  packageName: string,
  run: NativeCommandRunner = runNativeCommand,
): Promise<MarketplaceMutationResult> {
  if (!isPackageName(packageName)) {
    return mutationFailure('invalid-spec', `refusing package name ${JSON.stringify(packageName)}`)
  }
  const profileDir = resolveProfileDir(request.profile, resolveDshHome())
  const installed = readInstalledPlugins(profileDir)
  if (!installed.entries.some(entry => entry.packageName === packageName)) {
    return mutationFailure('not-installed', `${packageName} is not a dependency of profile ${request.profile}`)
  }
  return runPluginCommand(request, 'remove', packageName, run)
}

interface ErrorStdio {
  readonly stdout: string
  readonly stderr: string
}

function errorHasStdio(error: unknown): error is ErrorStdio {
  if (typeof error !== 'object' || error === null) return false
  return 'stdout' in error && 'stderr' in error
    && typeof error.stdout === 'string' && typeof error.stderr === 'string'
}
