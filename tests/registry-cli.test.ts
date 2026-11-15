// End-to-end tests of the chat command processor (tools/ai-registry.cjs) on a temporary ecosystem folder.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const CLI = path.resolve(__dirname, '..', 'template', 'tools', 'ai-registry.cjs')
let root = ''
const run = (...args: string[]) => {
  try {
    return { code: 0, out: execFileSync('node', [CLI, ...args], { env: { ...process.env, WAKIL_ROOT: root }, encoding: 'utf8' }) }
  } catch (e) {
    const err = e as { status: number; stderr: string }
    return { code: err.status, out: err.stderr }
  }
}
const registry = () => JSON.parse(readFileSync(path.join(root, 'usage', 'registry.json'), 'utf8'))

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'wakil-reg-'))
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('ai-registry CLI', () => {
  it('registers a provider and a fixed subscription, logged with the source chat', () => {
    expect(run('provider', 'add', '--name', 'Anthropic', '--integration', 'claude-code-logs', '--source-tool', 'claude').code).toBe(0)
    const r = run('sub', 'add', '--provider', 'anthropic', '--name', 'Claude Pro', '--billing', 'fixed', '--price', '20', '--tool', 'claude', '--source-tool', 'claude', '--command', 'Add Claude Pro subscription at $20/month')
    expect(r.code).toBe(0)
    const reg = registry()
    expect(reg.subscriptions[0]).toMatchObject({ id: 'claude-pro', provider: 'anthropic', prices: [{ amount: 20, currency: 'USD', frequency: 'monthly' }] })
    expect(reg.log.at(-1)).toMatchObject({ action: 'SUB_ADD', sourceTool: 'claude', command: 'Add Claude Pro subscription at $20/month' })
  })
  it('rejects invalid input with a clear message and writes nothing', () => {
    const before = registry().log.length
    expect(run('sub', 'add', '--provider', 'cursor', '--name', 'Cursor Pro', '--price', '20', '--source-tool', 'cursor').code).toBe(2)
    expect(run('sub', 'add', '--provider', 'anthropic', '--name', 'X', '--billing', 'monthly', '--price', '1', '--source-tool', 'claude').out).toMatch(/billing must be one of/)
    expect(run('sub', 'budget', 'claude-pro', '--budget', 'abc', '--source-tool', 'claude').code).toBe(2)
    expect(run('provider', 'add', '--name', 'OpenAI').out).toMatch(/source-tool/)
    expect(registry().log.length).toBe(before)
  })
  it('needs --yes for financially significant changes and keeps price history', () => {
    expect(run('sub', 'price', 'claude-pro', '--price', '25', '--source-tool', 'claude').code).toBe(2)
    expect(run('sub', 'price', 'claude-pro', '--price', '25', '--from', '2099-01-01', '--yes', '--source-tool', 'claude').code).toBe(0)
    const prices = registry().subscriptions[0].prices
    expect(prices.map((p: { amount: number }) => p.amount)).toEqual([20, 25])
  })
  it('stores a budget separately from expenses', () => {
    run('sub', 'budget', 'claude-pro', '--budget', '50', '--source-tool', 'claude')
    const s = registry().subscriptions[0]
    expect(s.budgets.at(-1).monthly).toBe(50)
    expect(s.expenses).toEqual([])
  })
  it('refuses to remove entities with history and suggests archiving', () => {
    run('sub', 'expense', 'claude-pro', '--period', '2026-11', '--amount', '20', '--kind', 'fixed', '--yes', '--source-tool', 'claude')
    const r = run('sub', 'remove', 'claude-pro', '--yes', '--source-tool', 'claude')
    expect(r.code).toBe(2)
    expect(r.out).toMatch(/archive/)
    expect(run('provider', 'remove', 'anthropic', '--yes', '--source-tool', 'claude').out).toMatch(/archive/)
    expect(run('sub', 'archive', 'claude-pro', '--yes', '--source-tool', 'claude').code).toBe(0)
    expect(registry().subscriptions[0].status).toBe('archived')
  })
  it('versions the ACU formula instead of overwriting it', () => {
    expect(run('acu', 'set', '--multiplier', 'claude-opus=1.5', '--source-tool', 'codex').code).toBe(2)
    expect(run('acu', 'set', '--multiplier', 'claude-opus=1.5', '--estimate', 'cursor=4', '--yes', '--source-tool', 'codex').code).toBe(0)
    const acu = registry().acu
    expect(acu).toHaveLength(2)
    expect(acu[0].multipliers).toEqual([])
    expect(acu[1]).toMatchObject({ version: 2, multipliers: [{ match: 'claude-opus', value: 1.5 }], estimation: [{ match: 'cursor', acuPerRequest: 4 }] })
  })
  it('records manual (Mode 2) usage with method and confidence', () => {
    run('provider', 'add', '--name', 'Cursor', '--integration', 'manual', '--source-tool', 'cursor')
    run('sub', 'add', '--provider', 'cursor', '--name', 'Cursor Pro', '--billing', 'payg', '--budget', '50', '--tool', 'cursor', '--source-tool', 'cursor')
    expect(run('usage', 'record', 'cursor-pro', '--project', 'acme/site', '--requests', '6', '--model', 'claude-sonnet', '--source-tool', 'cursor').code).toBe(0)
    expect(run('usage', 'record', 'cursor-pro', '--project', 'not a project', '--source-tool', 'cursor').code).toBe(2)
    const u = registry().usage
    expect(u).toHaveLength(1)
    expect(u[0]).toMatchObject({ subscription: 'cursor-pro', project: 'acme/site', requests: 6, method: 'estimated', confidence: 'low', tokens: null })
  })
})
