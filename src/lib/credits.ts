// Cost of one credit, per subscription billing period – the same rule as `node tools/credit-log.cjs report`:
//   cost of one day   = period fee ÷ days in the period          (20 $ ÷ 30 days = 0.667 $)
//   cost to date      = cost of one day × days elapsed            (0.667 $ × 20 days = 13.33 $)
//   cost of 1 credit  = cost to date ÷ credits of the period      (13.33 $ ÷ 4 000 credits)
//   cost of anything  = its credits × cost of 1 credit            (prompt, session, project, task, entity, agent…)
// Periods come from /wakil.billing-period; between and around them they are derived from the start date and the
// price frequency (monthly → same day every month). When a period has requests but no credit at all (e.g. Cursor
// without a per-request estimate), the unit becomes the request, flagged as estimated.
import type { UsageRecord } from './allocation'
import { inEffect, toBase, type Registry, type Subscription } from './registry'
import { localDay, ymd } from './period'

export type CostPeriod = {
  key: string
  sub: Subscription
  start: string
  end: string
  source: 'declared' | 'derived'
  amount: number | null // sub currency
  variable: number // recorded variable charges of the start month (hybrid / payg)
  currency: string
  days: number
  elapsed: number
  daily: number
  costToDate: number // sub currency
  costToDateBase: number | null
  status: 'running' | 'closed' | 'future'
  credits: number
  requests: number
  unit: 'credits' | 'requests'
  perUnit: number | null // sub currency
  perUnitBase: number | null
  records: UsageRecord[]
  missingCredits: number // records without credits (counted 0 in a credit-based period)
}

const pad = (n: number) => String(n).padStart(2, '0')
const D = (s: string) => Date.parse(s + 'T12:00:00Z')
export const addDays = (day: string, n: number) => new Date(D(day) + n * 86400000).toISOString().slice(0, 10)
export const daysIncl = (a: string, b: string) => Math.round((D(b) - D(a)) / 86400000) + 1
function addMonths(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + n, 1))
  const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(d, dim))}`
}
const stepMonths = (p?: { frequency: string; months?: number }) => (!p || p.frequency === 'monthly' ? 1 : p.frequency === 'yearly' ? 12 : Math.max(1, p.months ?? 1))

type RawPeriod = { start: string; end: string; amount: number | null; currency: string; source: 'declared' | 'derived' }

/** Declared periods, and derived ones before, between and after them (a derived period cut short is charged pro rata). */
export function periodsOf(s: Subscription, until: string): RawPeriod[] {
  const declared: RawPeriod[] = [...(s.periods ?? [])].sort((a, b) => a.start.localeCompare(b.start)).map((p) => ({ start: p.start, end: p.end, amount: p.amount, currency: p.currency || s.currency, source: 'declared' }))
  const out: RawPeriod[] = []
  let cursor = s.startDate || s.prices[0]?.from || declared[0]?.start
  if (!cursor) return declared
  for (let i = 0; i < 1200; i++) {
    const d = declared.find((x) => x.end >= cursor)
    if (d && d.start <= cursor) {
      out.push(d)
      cursor = addDays(d.end, 1)
      continue
    }
    if (cursor > until) break
    const p = inEffect(s.prices, cursor)
    let end = addDays(addMonths(cursor, stepMonths(p)), -1)
    let amount = p ? p.amount : null
    if (d && d.start <= end) {
      const full = daysIncl(cursor, end)
      end = addDays(d.start, -1)
      if (amount !== null) amount = (amount * daysIncl(cursor, end)) / full
    }
    out.push({ start: cursor, end, amount, currency: p?.currency || s.currency, source: 'derived' })
    cursor = addDays(end, 1)
  }
  return out.concat(declared.filter((d) => !out.includes(d)))
}

export type CostModel = {
  periods: CostPeriod[]
  costOf: Map<string, number> // record id → cost in base currency (records of a subscription only)
  fxMissing: boolean
}

export function buildCostModel(reg: Registry, records: UsageRecord[], now = new Date()): CostModel {
  const today = ymd(now)
  const periods: CostPeriod[] = []
  const costOf = new Map<string, number>()
  let fxMissing = false
  const bySub = new Map<string, UsageRecord[]>()
  for (const r of records) if (r.subscriptionId) bySub.set(r.subscriptionId, [...(bySub.get(r.subscriptionId) ?? []), r])
  for (const s of reg.subscriptions) {
    const recs = bySub.get(s.id) ?? []
    const raws = periodsOf(s, today)
    // records after the last generated period (should not happen) stay without cost
    for (const p of raws) {
      const inP = recs.filter((r) => {
        const d = localDay(r.date)
        return d >= p.start && d <= p.end
      })
      const days = daysIncl(p.start, p.end)
      const status: CostPeriod['status'] = p.start > today ? 'future' : p.end < today ? 'closed' : 'running'
      const elapsed = status === 'future' ? 0 : daysIncl(p.start, p.end < today ? p.end : today)
      const variable = s.expenses.filter((e) => e.kind === 'variable' && e.period === p.start.slice(0, 7)).reduce((a, e) => a + e.amount, 0)
      const daily = ((p.amount ?? 0) + variable) / days
      const costToDate = daily * elapsed
      const credits = inP.reduce((a, r) => a + (r.acu ?? 0), 0)
      const requests = inP.reduce((a, r) => a + r.requests, 0)
      const unit: CostPeriod['unit'] = credits > 0 ? 'credits' : 'requests'
      const units = unit === 'credits' ? credits : requests
      const perUnit = units > 0 ? costToDate / units : null
      const costBase = toBase(costToDate, p.currency, reg)
      if (costBase === null && costToDate > 0) fxMissing = true
      const perUnitBase = perUnit === null ? null : toBase(perUnit, p.currency, reg)
      for (const r of inP) costOf.set(r.id, perUnitBase === null ? 0 : (unit === 'credits' ? r.acu ?? 0 : r.requests) * perUnitBase)
      periods.push({
        key: `${s.id}:${p.start}`,
        sub: s,
        start: p.start,
        end: p.end,
        source: p.source,
        amount: p.amount,
        variable,
        currency: p.currency,
        days,
        elapsed,
        daily,
        costToDate,
        costToDateBase: costBase,
        status,
        credits,
        requests,
        unit,
        perUnit,
        perUnitBase,
        records: inP,
        missingCredits: unit === 'credits' ? inP.filter((r) => r.acu === null).length : 0,
      })
    }
  }
  return { periods, costOf, fxMissing }
}

// ---------- breakdowns ----------
export type Dimension = 'prompt' | 'session' | 'project' | 'task' | 'entity' | 'agent' | 'model' | 'provider' | 'day'
export const DIMENSIONS: { id: Dimension; label: string }[] = [
  { id: 'project', label: 'Projet' },
  { id: 'entity', label: 'Organisation / entité' },
  { id: 'task', label: 'Tâche' },
  { id: 'session', label: 'Session' },
  { id: 'agent', label: 'Agent' },
  { id: 'prompt', label: 'Prompt' },
  { id: 'model', label: 'Modèle' },
  { id: 'provider', label: 'Fournisseur' },
  { id: 'day', label: 'Jour' },
]

export type CostRow = { key: string; credits: number; requests: number; cost: number; lines: number; pct: number; estimated: boolean; first: string; last: string; sample: UsageRecord }

export function keyOf(r: UsageRecord, dim: Dimension): string {
  switch (dim) {
    case 'prompt':
      return r.id
    case 'session':
      return r.sessionId ?? '—'
    case 'project':
      return r.projectKey ?? '—'
    case 'task':
      return r.taskKey ?? '—'
    case 'entity':
      return r.projectKey ? r.projectKey.split('/')[0] : '—'
    case 'agent':
      return r.agent || '—'
    case 'model':
      return r.models[0] ?? '—'
    case 'provider':
      return r.providerId ?? r.tool
    case 'day':
      return localDay(r.date)
  }
}

/** Groups records; pct = share of the credits of the selection (one provider) or of the cost (several providers). */
export function breakdown(records: UsageRecord[], dim: Dimension, cm: CostModel, pctBy: 'credits' | 'cost'): CostRow[] {
  const map = new Map<string, CostRow>()
  for (const r of records) {
    const k = keyOf(r, dim)
    const row = map.get(k) ?? { key: k, credits: 0, requests: 0, cost: 0, lines: 0, pct: 0, estimated: false, first: r.date, last: r.date, sample: r }
    row.credits += r.acu ?? 0
    row.requests += r.requests
    row.cost += cm.costOf.get(r.id) ?? 0
    row.lines += 1
    if (r.method !== 'exact' || r.acu === null) row.estimated = true
    if (r.date < row.first) row.first = r.date
    if (r.date > row.last) row.last = r.date
    map.set(k, row)
  }
  const rows = [...map.values()]
  const total = rows.reduce((a, x) => a + (pctBy === 'credits' ? x.credits : x.cost), 0)
  for (const x of rows) x.pct = total ? (pctBy === 'credits' ? x.credits : x.cost) / total : 0
  return rows.sort((a, b) => b.cost - a.cost || b.credits - a.credits)
}

/** Prompts present in the tools' local logs but missing from usage/credits.jsonl (a hook that did not run). */
export function pendingLines(logIds: Set<string>, turns: { tool?: string; sessionId: string; at: string; byModel: object }[], runs: { tool?: string; id: string; byModel: object }[]) {
  let n = 0
  for (const t of turns) if (Object.keys(t.byModel).length && !logIds.has(`${t.tool ?? 'claude'}:turn:${t.sessionId}:${t.at}`)) n++
  for (const r of runs) if (Object.keys(r.byModel).length && !logIds.has(`${r.tool ?? 'claude'}:agent:${r.id}`)) n++
  return n
}
