import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isInstallSpec, isPackageName } from '../src/spec.ts'
import { installPlugin, mutationFailure, removePlugin, runPluginCommand } from '../src/install.ts'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('marketplace spec validation', () => {
  it('accepts registry names, versions, and github specs', () => {
    expect(isInstallSpec('dsh-hello')).toBe(true)
    expect(isInstallSpec('@acme/dsh-hello@1.2.3')).toBe(true)
    expect(isInstallSpec('github:acme/dsh-hello')).toBe(true)
    expect(isInstallSpec('github:acme/dsh-hello#abc123')).toBe(true)
    expect(isPackageName('@acme/dsh-hello')).toBe(true)
  })

  it('rejects paths, file specs, surrounding whitespace, and shell metacharacters', () => {
    expect(isInstallSpec('./plugin')).toBe(false)
    expect(isInstallSpec('file:/tmp/p')).toBe(false)
    expect(isInstallSpec('github:acme/dsh-hello;rm')).toBe(false)
    expect(isInstallSpec(' dsh-hello')).toBe(false)
    expect(isInstallSpec('')).toBe(false)
    expect(isPackageName('github:acme/x')).toBe(false)
    expect(isPackageName(' dsh-hello')).toBe(false)
  })
})

describe('dsh plugin mutations', () => {
  it('refuses invalid specs without spawning', async () => {
    const run = vi.fn()
    await expect(installPlugin({ cliPath: 'dsh', profile: 'web', timeoutMs: 1000 }, '../x', run))
      .resolves.toEqual(mutationFailure('invalid-spec', 'refusing install spec "../x"'))
    await expect(removePlugin({ cliPath: 'dsh', profile: 'web', timeoutMs: 1000 }, 'github:x/y', run))
      .resolves.toEqual(mutationFailure('invalid-spec', 'refusing package name "github:x/y"'))
    expect(run).not.toHaveBeenCalled()
  })

  it('installs through dsh plugin add and maps command failures', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ stdout: 'ok', stderr: '' })
      .mockRejectedValueOnce(Object.assign(new Error('pnpm failed'), { stdout: 'out', stderr: 'err' }))
      .mockRejectedValueOnce('boom')
    await expect(installPlugin({ cliPath: '/opt/dsh', profile: 'web', timeoutMs: 1000 }, 'dsh-hello', run))
      .resolves.toEqual({ ok: true, stdout: 'ok', stderr: '', restartRequired: true })
    expect(run.mock.calls[0]?.[0]).toBe('/opt/dsh')
    expect(run.mock.calls[0]?.[1]).toEqual(['plugin', '--profile', 'web', 'add', 'dsh-hello'])

    await expect(runPluginCommand(
      { cliPath: 'dsh', profile: 'web', timeoutMs: 1000 },
      'add',
      'dsh-hello',
      run,
    )).resolves.toEqual(mutationFailure('command-failed', 'pnpm failed', 'out', 'err'))
    await expect(runPluginCommand(
      { cliPath: 'dsh', profile: 'web', timeoutMs: 1000 },
      'add',
      'dsh-hello',
      run,
    )).resolves.toEqual(mutationFailure('command-failed', 'dsh plugin add failed'))
  })

  it('maps abort to timeout', async () => {
    vi.useFakeTimers()
    const pending = runPluginCommand(
      { cliPath: 'dsh', profile: 'web', timeoutMs: 5 },
      'add',
      'dsh-hello',
      async (_command, _args, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { stdout: 'x', stderr: 'y' }))
        })
      }),
    )
    await vi.advanceTimersByTimeAsync(5)
    await expect(pending).resolves.toEqual(
      mutationFailure('timeout', 'dsh plugin add exceeded 5ms', 'x', 'y'),
    )
  })

  it('removes a recorded dependency and refuses unknown packages', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-home-'))
    const profileDir = join(home, 'profiles', 'web')
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
      dependencies: { 'dsh-hello': 'github:acme/dsh-hello' },
    }))
    vi.stubEnv('DSH_HOME', home)
    const run = vi.fn().mockResolvedValue({ stdout: 'removed', stderr: '' })
    await expect(removePlugin({ cliPath: 'dsh', profile: 'web', timeoutMs: 1000 }, 'missing-pkg', run))
      .resolves.toEqual(mutationFailure(
        'not-installed',
        'missing-pkg is not a dependency of profile web',
      ))
    expect(run).not.toHaveBeenCalled()
    await expect(removePlugin({ cliPath: 'dsh', profile: 'web', timeoutMs: 1000 }, 'dsh-hello', run))
      .resolves.toEqual({ ok: true, stdout: 'removed', stderr: '', restartRequired: true })
    expect(run.mock.calls[0]?.[1]).toEqual(['plugin', '--profile', 'web', 'remove', 'dsh-hello'])
  })
})
