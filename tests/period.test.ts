import { describe, expect, it } from 'vitest'
import { inRange, localDay, monthFraction, monthsOfRange, rangeOf } from '../src/lib/period'
import { allocate, type UsageRecord } from '../src/lib/allocation'
import { emptyRegistry, type Subscription } from '../src/lib/registry'
import { zero } from '../src/lib/usage'

const NOW = new Date(2026, 10, 18, 15, 0) // Wednesday 18 November 2026, local time

describe('period presets', () => {
  it('today, this week (Monday → Sunday), this month, last month, this year', () => {
    expect(rangeOf({ preset: 'today' }, NOW)).toEqual({ from: '2026-11-18', to: '2026-11-18' })
    expect(rangeOf({ preset: 'week' }, NOW)).toEqual({ from: '2026-11-16', to: '2026-11-22' })
    expect(rangeOf({ preset: 'month' }, NOW)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(rangeOf({ preset: 'last-month' }, NOW)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(rangeOf({ preset: 'year' }, NOW)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(rangeOf({ preset: 'all' }, NOW)).toEqual({ from: null, to: null })
  })
  it('a Sunday still belongs to the week that started on Monday', () => {
    expect(rangeOf({ preset: 'week' }, new Date(2026, 10, 22))).toEqual({ from: '2026-11-16', to: '2026-11-22' })
  })
  it('custom ranges are inclusive and may be open', () => {
    const r = rangeOf({ preset: 'custom', from: '2026-11-10', to: '2026-11-12' }, NOW)
    expect(inRange('2026-11-10', r)).toBe(true)
    expect(inRange('2026-11-12', r)).toBe(true)
    expect(inRange('2026-11-13', r)).toBe(false)
    expect(inRange('2026-01-01', rangeOf({ preset: 'custom', to: '2026-11-12' }, NOW))).toBe(true)
  })
  it('timestamps are compared on the local calendar day', () => {
    const d = new Date(2026, 10, 18, 23, 30)
    expect(localDay(d.toISOString())).toBe('2026-11-18')
  })
  it('months of a range and the share of a month it covers', () => {
    expect(monthsOfRange({ from: '2026-10-28', to: '2026-12-02' })).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(monthFraction('2026-11', { from: '2026-11-16', to: '2026-11-22' })).toBeCloseTo(7 / 30)
    expect(monthFraction('2026-11', { from: '2026-11-01', to: '2026-11-30' })).toBe(1)
    expect(monthFraction('2026-10', { from: '2026-11-01', to: '2026-11-30' })).toBe(0)
  })
})

describe('allocation over a period shorter than a month', () => {
  const s: Subscription = {
    id: 'claude', name: 'Claude', provider: 'p', status: 'active', billing: [{ from: '2026-01-01', model: 'fixed' }],
    prices: [{ from: '2026-01-01', amount: 30, currency: 'USD', frequency: 'monthly' }], budgets: [], currency: 'USD',
    startDate: '2026-01-01', renewalDate: '', usageSources: [{ tool: 'claude', models: [] }], measurement: 'exact',
    expenses: [], planUsage: [], notes: '', createdAt: '', updatedAt: '',
  }
  const rec = (date: string, project: string, acu: number): UsageRecord => ({
    id: date + project, kind: 'run', tool: 'claude', providerId: 'p', subscriptionId: 'claude', date, month: date.slice(0, 7), models: ['m'],
    agent: 'a', projectKey: project, taskKey: null, label: '', tokens: zero(), requests: 1, acu, acuVersion: 1, method: 'exact',
    confidence: 'high', source: '', durationMs: null, contextPct: null, apiCost: 0, unpriced: false, sessionId: null, ref: {} as never,
  })
  const reg = { ...emptyRegistry(), present: true, subscriptions: [s] }
  const records = [rec('2026-11-03', 'e/A', 10), rec('2026-11-17', 'e/B', 30), rec('2026-11-18', 'e/A', 10)]

  it('keeps only the records of the period and prorates the monthly fee (7/30 of $30 = $7)', () => {
    const week = { from: '2026-11-16', to: '2026-11-22' }
    const r = allocate(reg, records, ['2026-11'], null, week)[0]
    expect(r.records).toHaveLength(2)
    expect(r.expense).toBeCloseTo(7)
    expect(r.projects.find((p) => p.projectKey === 'e/B')!.allocated).toBeCloseTo(7 * 0.75)
    expect(r.allocated + r.unallocated).toBeCloseTo(r.expense)
  })
  it('a whole month is not prorated', () => {
    const r = allocate(reg, records, ['2026-11'], null, { from: '2026-11-01', to: '2026-11-30' })[0]
    expect(r.expense).toBe(30)
    expect(r.records).toHaveLength(3)
  })
})
