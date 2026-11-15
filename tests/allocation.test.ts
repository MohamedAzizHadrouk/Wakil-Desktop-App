import { describe, expect, it } from 'vitest'
import { acuEstimated, acuFromReported, acuFromTokens, configAt, multiplierFor } from '../src/lib/acu'
import { allocate, matchSubscription, periodMonths, subscriptionExpense, totalsOf, type UsageRecord } from '../src/lib/allocation'
import { DEFAULT_ACU, emptyRegistry, inEffect, monthlyAmount, parseRegistry, toBase, type Registry, type Subscription } from '../src/lib/registry'
import { zero } from '../src/lib/usage'
import type { ByModel } from '../src/lib/types'

// ---------- helpers ----------
const sub = (over: Partial<Subscription>): Subscription => ({
  id: 'sub',
  name: 'Sub',
  provider: 'p',
  status: 'active',
  billing: [{ from: '2026-01-01', model: 'fixed' }],
  prices: [{ from: '2026-01-01', amount: 20, currency: 'USD', frequency: 'monthly' }],
  budgets: [],
  currency: 'USD',
  startDate: '2026-01-01',
  renewalDate: '',
  usageSources: [{ tool: 'claude', models: [] }],
  measurement: 'exact',
  expenses: [],
  planUsage: [],
  notes: '',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...over,
})
const reg = (subs: Subscription[], over: Partial<Registry> = {}): Registry => ({ ...emptyRegistry(), present: true, subscriptions: subs, ...over })
let n = 0
const rec = (subscriptionId: string | null, project: string | null, acu: number | null, over: Partial<UsageRecord> = {}): UsageRecord => ({
  id: `r${n++}`,
  kind: 'run',
  tool: 'claude',
  providerId: 'p',
  subscriptionId,
  date: '2026-11-10T10:00:00Z',
  month: '2026-11',
  models: ['claude-opus-5-5'],
  agent: 'a',
  projectKey: project,
  taskKey: null,
  label: '',
  tokens: zero(),
  requests: 1,
  acu,
  acuVersion: 1,
  method: 'exact',
  confidence: 'high',
  source: 'test',
  durationMs: null,
  contextPct: null,
  apiCost: 0,
  unpriced: false,
  sessionId: null,
  ref: {} as never,
  ...over,
})
const NOV = ['2026-11']

// ---------- ACU ----------
describe('ACU formula', () => {
  it('applies (I×Wi + O×Wo + C×Wc) × M + R with default weights', () => {
    const t: ByModel = { m: { ...zero(), input: 1000, output: 1000, cacheRead: 1000, requests: 1 } }
    // (1×1 + 1×2 + 1×0.25) × 1 + 0.5 = 3.75
    expect(acuFromTokens(t, DEFAULT_ACU)!.acu).toBeCloseTo(3.75)
  })
  it('counts cache writes as uncached input once and cache reads only as cached', () => {
    const t: ByModel = { m: { ...zero(), input: 500, cacheWrite5m: 300, cacheWrite1h: 200, cacheRead: 4000, requests: 2 } }
    // I = 1.0 → 1 ; C = 4 → 1 ; R = 2×0.5 = 1  → 3
    expect(acuFromTokens(t, DEFAULT_ACU)!.acu).toBeCloseTo(3)
  })
  it('reported totals: cached tokens are removed from total input (no double count)', () => {
    // total input 10k of which 8k cached → I = 2, C = 8 → 2 + 2 + 0.5 = 4.5 for 1 request, output 0
    expect(acuFromReported({ input: 10000, output: 0, cached: 8000 }, 'x', 1, DEFAULT_ACU)).toBeCloseTo(4.5)
  })
  it('uses the longest matching model multiplier', () => {
    const cfg = { ...DEFAULT_ACU, multipliers: [{ match: 'claude', value: 1.2 }, { match: 'claude-opus', value: 1.5 }] }
    expect(multiplierFor('claude-opus-5-5', cfg)).toBe(1.5)
    expect(multiplierFor('claude-sonnet-5-5', cfg)).toBe(1.2)
    expect(multiplierFor('gpt-6-sol', cfg)).toBe(1)
    const t: ByModel = { 'claude-opus-5-5': { ...zero(), output: 1000, requests: 1 } }
    expect(acuFromTokens(t, cfg)!.acu).toBeCloseTo(2 * 1.5 + 0.5) // multiplier does not apply to R
  })
  it('missing telemetry is unavailable (null), never 0', () => {
    expect(acuFromTokens({}, DEFAULT_ACU)).toBeNull()
    expect(acuEstimated(10, ['cursor'], DEFAULT_ACU)).toBeNull()
  })
  it('estimates from request counts only with a configured rule (Mode 2)', () => {
    const cfg = { ...DEFAULT_ACU, estimation: [{ match: 'cursor', acuPerRequest: 4 }] }
    expect(acuEstimated(6, [null, 'cursor'], cfg)).toBe(24)
  })
  it('selects the formula version in effect at the date, or the latest one for recalculation', () => {
    const r = reg([], { acu: [DEFAULT_ACU, { ...DEFAULT_ACU, version: 2, from: '2026-11-15', weights: { ...DEFAULT_ACU.weights, output: 3 } }] })
    expect(configAt(r, '2026-11-01', 'historical').version).toBe(1)
    expect(configAt(r, '2026-11-20', 'historical').version).toBe(2)
    expect(configAt(r, '2026-11-01', 'current').version).toBe(2)
  })
})

// ---------- registry helpers ----------
describe('registry', () => {
  it('keeps price history: the price in effect depends on the month', () => {
    const s = sub({ prices: [{ from: '2026-01-01', amount: 20, currency: 'USD', frequency: 'monthly' }, { from: '2026-12-01', amount: 25, currency: 'USD', frequency: 'monthly' }] })
    expect(inEffect(s.prices, '2026-11')!.amount).toBe(20)
    expect(inEffect(s.prices, '2026-12')!.amount).toBe(25)
  })
  it('monthly equivalents of yearly and custom prices', () => {
    expect(monthlyAmount({ from: 'x', amount: 240, currency: 'USD', frequency: 'yearly' })).toBe(20)
    expect(monthlyAmount({ from: 'x', amount: 60, currency: 'USD', frequency: 'custom', months: 3 })).toBe(20)
  })
  it('converts currencies, and reports a missing rate instead of guessing', () => {
    const r = reg([], { settings: { baseCurrency: 'USD', fx: { EUR: 1.1 } } })
    expect(toBase(10, 'EUR', r)).toBeCloseTo(11)
    expect(toBase(10, 'TND', r)).toBeNull()
  })
  it('reads a malformed file as an error, not a crash', () => {
    expect(parseRegistry('{oops').error).toMatch(/illisible/)
    expect(parseRegistry(undefined).registry.present).toBe(false)
  })
  it('maps usage to the most specific subscription of the same tool', () => {
    const r = reg([
      sub({ id: 'claude-pro', usageSources: [{ tool: 'claude', models: [] }] }),
      sub({ id: 'claude-opus-only', usageSources: [{ tool: 'claude', models: ['claude-opus'] }] }),
      sub({ id: 'codex', usageSources: [{ tool: 'codex', models: [] }] }),
    ])
    expect(matchSubscription(r, 'claude', ['claude-opus-5-5'], '2026-11-10')!.id).toBe('claude-opus-only')
    expect(matchSubscription(r, 'claude', ['claude-sonnet-5-5'], '2026-11-10')!.id).toBe('claude-pro')
    expect(matchSubscription(r, 'codex', ['gpt-6-sol'], '2026-11-10')!.id).toBe('codex')
    expect(matchSubscription(r, 'cursor', ['x'], '2026-11-10')).toBeNull()
    expect(matchSubscription(r, 'claude', ['claude-opus-5-5'], '2025-12-01')).toBeNull() // before start
  })
})

// ---------- expenses per billing model ----------
describe('billing models', () => {
  it('fixed: the configured price is the monthly expense', () => {
    const e = subscriptionExpense(sub({}), '2026-11', [])
    expect(e.expense).toBe(20)
    expect(e.fixedSource).toBe('configured')
    expect(e.status).toBe('actual')
  })
  it('fixed: a recorded actual fixed expense overrides the configured price', () => {
    const s = sub({ expenses: [{ period: '2026-11', kind: 'fixed', amount: 23.6, currency: 'USD', status: 'actual', source: 'invoice', note: '', at: '' }] })
    expect(subscriptionExpense(s, '2026-11', []).expense).toBeCloseTo(23.6)
  })
  it('pay-as-you-go: a budget is NOT an expense; estimated charges are provisional', () => {
    const s = sub({ billing: [{ from: '2026-01-01', model: 'payg' }], prices: [], budgets: [{ from: '2026-01-01', monthly: 50, currency: 'USD' }] })
    const none = subscriptionExpense(s, '2026-11', [])
    expect(none.expense).toBe(0)
    expect(none.budget).toBe(50)
    expect(none.remainingBudget).toBe(50)
    const est = subscriptionExpense(s, '2026-11', [rec('sub', 'a/x', 10, { apiCost: 12 })])
    expect(est.expense).toBe(12)
    expect(est.status).toBe('provisional')
    expect(est.remainingBudget).toBe(38)
    expect(est.budgetIsEstimate).toBe(true)
  })
  it('pay-as-you-go: actual charges replace estimates (no double counting)', () => {
    const s = sub({
      billing: [{ from: '2026-01-01', model: 'payg' }],
      prices: [],
      expenses: [{ period: '2026-11', kind: 'variable', amount: 13.4, currency: 'USD', status: 'actual', source: 'invoice', note: '', at: '' }],
    })
    const e = subscriptionExpense(s, '2026-11', [rec('sub', 'a/x', 10, { apiCost: 99 })])
    expect(e.expense).toBeCloseTo(13.4)
    expect(e.status).toBe('actual')
  })
  it('hybrid: total = fixed fee + actual variable charges, kept separate', () => {
    const s = sub({
      billing: [{ from: '2026-01-01', model: 'hybrid' }],
      expenses: [{ period: '2026-11', kind: 'variable', amount: 7, currency: 'USD', status: 'reported', source: 'provider', note: '', at: '' }],
    })
    const e = subscriptionExpense(s, '2026-11', [])
    expect(e.fixed).toBe(20)
    expect(e.variableActual).toBe(7)
    expect(e.expense).toBe(27)
  })
  it('an inactive subscription stops counting after the month it was deactivated', () => {
    const s = sub({ status: 'inactive', updatedAt: '2026-10-05' })
    expect(subscriptionExpense(s, '2026-10', []).expense).toBe(20)
    expect(subscriptionExpense(s, '2026-11', []).expense).toBe(0)
  })
})

// ---------- independent pools & allocation ----------
describe('allocation', () => {
  const cursor = sub({ id: 'cursor', usageSources: [{ tool: 'cursor', models: [] }] })
  const claude = sub({ id: 'claude', usageSources: [{ tool: 'claude', models: [] }] })
  const codex = sub({ id: 'codex', usageSources: [{ tool: 'codex', models: [] }] })
  const R = reg([cursor, claude, codex])
  const records = [
    rec('cursor', 'e/A', 600), rec('cursor', 'e/B', 300), rec('cursor', 'e/C', 100),
    rec('claude', 'e/A', 200), rec('claude', 'e/B', 500), rec('claude', 'e/C', 300),
    rec('codex', 'e/A', 400), rec('codex', 'e/B', 600),
  ]

  it('computes percentages inside each subscription pool independently (spec example)', () => {
    const res = allocate(R, records, NOV, null)
    const pctA = (id: string) => res.find((r) => r.sub.id === id)!.projects.find((p) => p.projectKey === 'e/A')!.pct
    expect(pctA('cursor')).toBeCloseTo(0.6)
    expect(pctA('claude')).toBeCloseTo(0.2)
    expect(pctA('codex')).toBeCloseTo(0.4)
  })
  it('allocates each $20 subscription proportionally: project A = 12 + 4 + 8 = $24', () => {
    const res = allocate(R, records, NOV, null)
    const totalA = res.flatMap((r) => r.projects).filter((p) => p.projectKey === 'e/A').reduce((a, p) => a + p.allocated, 0)
    expect(totalA).toBeCloseTo(24)
  })
  it('never allocates a subscription to a project that did not consume it', () => {
    const res = allocate(R, records, NOV, null)
    expect(res.find((r) => r.sub.id === 'codex')!.projects.some((p) => p.projectKey === 'e/C')).toBe(false)
  })
  it('keeps consumption without a project unallocated and reconciles to the expense', () => {
    const res = allocate(reg([claude]), [rec('claude', 'e/A', 75), rec('claude', null, 25)], NOV, null)[0]
    expect(res.allocated).toBeCloseTo(15)
    expect(res.unallocated).toBeCloseTo(5)
    expect(res.allocated + res.unallocated).toBeCloseTo(res.expense)
  })
  it('an expense without measured consumption is fully unallocated, not spread', () => {
    const res = allocate(reg([claude]), [], NOV, null)[0]
    expect(res.allocationStatus).toBe('no-consumption')
    expect(res.unallocated).toBe(20)
    expect(res.allocated).toBe(0)
  })
  it('records with unavailable telemetry are excluded from the pool, not counted as 0', () => {
    const res = allocate(reg([claude]), [rec('claude', 'e/A', 10), rec('claude', 'e/B', null)], NOV, null)[0]
    expect(res.projects.map((p) => p.projectKey)).toEqual(['e/A'])
    expect(res.unmeasuredRecords).toBe(1)
    expect(res.allocated).toBeCloseTo(20)
  })
  it('a subscription without any usage source is "unavailable"', () => {
    const res = allocate(reg([sub({ id: 'x', usageSources: [] })]), [], NOV, null)[0]
    expect(res.allocationStatus).toBe('unavailable')
  })
  it('filters: one subscription, several, or all – without duplicates', () => {
    const one = allocate(R, records, NOV, new Set(['claude']))
    expect(one.map((r) => r.sub.id)).toEqual(['claude'])
    const two = totalsOf(allocate(R, records, NOV, new Set(['claude', 'codex'])))
    expect(two.expense).toBe(40)
    expect(two.acu).toBe(2000)
    const all = totalsOf(allocate(R, records, NOV, null))
    expect(all.expense).toBe(60)
    expect(all.allocated + all.unallocated).toBeCloseTo(all.expense)
  })
  it('allocates month by month: a price change does not rewrite earlier months', () => {
    const s = sub({ id: 'claude', prices: [{ from: '2026-01-01', amount: 20, currency: 'USD', frequency: 'monthly' }, { from: '2026-11-01', amount: 30, currency: 'USD', frequency: 'monthly' }] })
    const recs = [rec('claude', 'e/A', 10, { month: '2026-10', date: '2026-10-10' }), rec('claude', 'e/B', 10, { month: '2026-11' })]
    const res = allocate(reg([s]), recs, ['2026-10', '2026-11'], null)[0]
    expect(res.projects.find((p) => p.projectKey === 'e/A')!.allocated).toBeCloseTo(20)
    expect(res.projects.find((p) => p.projectKey === 'e/B')!.allocated).toBeCloseTo(30)
    expect(res.expense).toBe(50)
  })
  it('multi-currency: converts with the configured rate, flags missing rates', () => {
    const eur = sub({ id: 'e', currency: 'EUR', prices: [{ from: '2026-01-01', amount: 10, currency: 'EUR', frequency: 'monthly' }] })
    const tnd = sub({ id: 't', currency: 'TND', prices: [{ from: '2026-01-01', amount: 60, currency: 'TND', frequency: 'monthly' }] })
    const res = allocate(reg([eur, tnd], { settings: { baseCurrency: 'USD', fx: { EUR: 1.1 } } }), [], NOV, null)
    expect(res.find((r) => r.sub.id === 'e')!.expense).toBeCloseTo(11)
    expect(res.find((r) => r.sub.id === 't')!.fxMissing).toBe(true)
  })
  it('period "all" spans from the first subscription month to now', () => {
    const months = periodMonths(reg([sub({ startDate: '2026-09-15' })]), [], 'all', new Date('2026-11-20'))
    expect(months).toEqual(['2026-09', '2026-10', '2026-11'])
  })
})
