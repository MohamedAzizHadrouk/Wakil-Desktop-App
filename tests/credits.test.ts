import { describe, expect, it } from 'vitest'
import { breakdown, buildCostModel, pendingLines, periodsOf } from '../src/lib/credits'
import type { UsageRecord } from '../src/lib/allocation'
import { emptyRegistry, type Registry, type Subscription } from '../src/lib/registry'

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: 'claude-pro',
  name: 'Claude Pro',
  provider: 'anthropic',
  status: 'active',
  billing: [{ from: '2026-11-15', model: 'fixed' }],
  prices: [{ from: '2026-11-15', amount: 20, currency: 'USD', frequency: 'monthly' }],
  budgets: [],
  currency: 'USD',
  startDate: '2026-11-15',
  renewalDate: '',
  usageSources: [{ tool: 'claude', models: [] }],
  measurement: 'exact',
  expenses: [],
  planUsage: [],
  periods: [],
  notes: '',
  createdAt: '2026-11-15',
  updatedAt: '2026-11-15',
  ...over,
})
const reg = (s: Subscription[]): Registry => ({ ...emptyRegistry(), subscriptions: s, present: true })
let n = 0
const rec = (date: string, acu: number | null, over: Partial<UsageRecord> = {}): UsageRecord =>
  ({
    id: `r${n++}`, kind: 'turn', tool: 'claude', providerId: 'anthropic', subscriptionId: 'claude-pro', date: `${date}T10:00:00`, month: date.slice(0, 7), models: ['claude-opus-5-5'],
    agent: 'manager', projectKey: null, taskKey: null, label: 'p', tokens: null, requests: 1, acu, acuVersion: 1, method: 'exact', confidence: 'high', source: 'log',
    durationMs: null, contextPct: null, apiCost: 0, unpriced: false, sessionId: 's1', ref: {} as UsageRecord['ref'], ...over,
  }) as UsageRecord

describe('billing periods', () => {
  it('derives monthly periods from the start date (15 Nov → 14 Dec = 30 days)', () => {
    const p = periodsOf(sub(), '2026-12-20')
    expect(p.map((x) => [x.start, x.end])).toEqual([
      ['2026-11-15', '2026-12-14'],
      ['2026-12-15', '2027-01-14'],
    ])
  })
  it('fills the gap before a declared period pro rata, then uses the declared one', () => {
    const p = periodsOf(sub({ periods: [{ start: '2026-11-20', end: '2026-12-19', amount: 25, currency: 'USD' }] }), '2026-12-01')
    expect(p[0]).toMatchObject({ start: '2026-11-15', end: '2026-11-19', source: 'derived' })
    expect(p[0].amount).toBeCloseTo((20 * 5) / 30)
    expect(p[1]).toMatchObject({ start: '2026-11-20', end: '2026-12-19', amount: 25, source: 'declared' })
  })
})

describe('cost of one credit', () => {
  it('20 $ / 30 days, 20 days elapsed, 4 000 credits → 1 credit = 13.33 $ / 4 000', () => {
    const records = [rec('2026-11-16', 1000, { projectKey: 'acme/site', agent: 'ui-ux' }), rec('2026-11-20', 3000, { projectKey: 'acme/app' })]
    const cm = buildCostModel(reg([sub()]), records, new Date('2026-12-04T12:00:00')) // 15 Nov → 4 Dec = 20 days
    const p = cm.periods[0]
    expect(p.days).toBe(30)
    expect(p.elapsed).toBe(20)
    expect(p.daily).toBeCloseTo(20 / 30)
    expect(p.costToDate).toBeCloseTo(13.333, 2)
    expect(p.perUnit).toBeCloseTo(13.333 / 4000, 6)
    expect(cm.costOf.get(records[0].id)).toBeCloseTo(13.333 / 4, 2)
    const byProject = breakdown(records, 'project', cm, 'credits')
    expect(byProject.map((r) => [r.key, r.pct])).toEqual([
      ['acme/app', 0.75],
      ['acme/site', 0.25],
    ])
    const total = byProject.reduce((a, r) => a + r.cost, 0)
    expect(total).toBeCloseTo(p.costToDate)
  })
  it('a closed period costs exactly its fee', () => {
    const records = [rec('2026-11-16', 10), rec('2026-12-10', 30)]
    const cm = buildCostModel(reg([sub()]), records, new Date('2027-01-20T12:00:00'))
    expect(cm.periods[0].costToDate).toBeCloseTo(20)
    expect([...cm.costOf.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(20)
  })
  it('falls back to requests when a period has no credit (Cursor without estimate)', () => {
    const s = sub({ id: 'cursor-pro', provider: 'cursor', usageSources: [{ tool: 'cursor', models: [] }] })
    const records = [rec('2026-11-16', null, { subscriptionId: 'cursor-pro', tool: 'cursor', requests: 3 }), rec('2026-11-17', null, { subscriptionId: 'cursor-pro', tool: 'cursor', requests: 1 })]
    const cm = buildCostModel(reg([s]), records, new Date('2026-11-24T12:00:00'))
    expect(cm.periods[0].unit).toBe('requests')
    expect(cm.costOf.get(records[0].id)).toBeCloseTo((20 / 30) * 10 * 0.75)
  })
})

describe('pending lines', () => {
  it('counts prompts of the local logs that the credit log does not hold', () => {
    const ids = new Set(['claude:turn:s1:2026-11-15T10:00:00Z', 'claude:agent:a1'])
    const turns = [
      { tool: 'claude', sessionId: 's1', at: '2026-11-15T10:00:00Z', byModel: { m: {} } },
      { tool: 'claude', sessionId: 's1', at: '2026-11-15T11:00:00Z', byModel: { m: {} } },
      { tool: 'claude', sessionId: 's1', at: '2026-11-15T12:00:00Z', byModel: {} },
    ]
    expect(pendingLines(ids, turns, [{ tool: 'claude', id: 'a1', byModel: { m: {} } }, { tool: 'claude', id: 'a2', byModel: { m: {} } }])).toBe(2)
  })
})
