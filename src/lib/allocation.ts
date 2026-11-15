// Subscription expense allocation.
// Every subscription has its OWN ACU pool. For each subscription and each month:
//   project % = project ACU / subscription ACU          allocated = project % × subscription expense
// Consumption without a project stays "unallocated"; allocated + unallocated always equals the expense used.
// Expenses: fixed fee (recorded actual, else the configured price in effect) + variable charges (recorded actual /
// provider-reported, else an ESTIMATE from API list prices, flagged provisional). A budget is never an expense.
import { acuEstimated, acuFromReported, acuFromTokens, configAt, type AcuMode } from './acu'
import { inEffect, monthlyAmount, toBase, type BillingModel, type Confidence, type Method, type Registry, type Subscription } from './registry'
import { attributeRun, costOf, priceUsage, sumTokens, totalOf, zero } from './usage'
import type { ManualUsage } from './registry'
import type { CreditLine, Model, Run, Tokens, Turn, UsageView } from './types'
import { inRange, localDay, monthFraction, type Range } from './period'

export type UsageRecord = {
  id: string
  kind: 'run' | 'turn' | 'manual'
  tool: string
  providerId: string | null
  subscriptionId: string | null
  date: string
  month: string
  models: string[]
  agent: string
  projectKey: string | null // "<entity>/<project|none>"
  taskKey: string | null
  label: string
  tokens: Tokens | null
  requests: number
  acu: number | null // null = telemetry unavailable (never silently 0)
  acuVersion: number
  method: Method
  confidence: Confidence
  source: string
  durationMs: number | null
  contextPct: number | null
  apiCost: number // API-equivalent estimate (usage/PRICING.md)
  unpriced: boolean
  sessionId: string | null
  sessionTitle?: string
  fromLog?: boolean // the record comes from usage/credits.jsonl
  ref: Run | Turn | ManualUsage | CreditLine
}

const LOG_SOURCE: Record<string, string> = {
  'claude-code-logs': 'Journal de crédits – Claude Code',
  'codex-logs': 'Journal de crédits – Codex',
  'cursor-hook': 'Journal de crédits – Cursor (estimé)',
}

/** Measured records from the credit log: one line per prompt / sub-agent run (the desktop's single source when present). */
function recordsFromLog(m: Model, lines: CreditLine[], mode: AcuMode): UsageRecord[] {
  const reg = m.registry
  return lines.map((l) => {
    const models = l.byModel ? Object.keys(l.byModel) : l.model ? [l.model] : []
    const sub = matchSubscription(reg, l.tool, models, l.at)
    // historical = credits frozen in the line (formula in effect that day); current = recomputed with the latest formula
    let acu: number | null = l.credits
    let acuVersion = l.acuVersion
    if (mode === 'current') {
      const cfg = configAt(reg, l.at, 'current')
      acuVersion = cfg.version
      if (l.byModel) acu = acuFromTokens(l.byModel, cfg)?.acu ?? l.credits
      else if (l.creditsMethod === 'estimated') acu = acuEstimated(l.requests, [l.model, l.tool, sub?.provider, sub?.id], cfg)
    }
    let entity = l.entity
    let project = l.project
    let task = l.task
    if (!entity) {
      const a = attributeRun(m, l.prompt)
      if (a.entity) {
        entity = a.entity
        project = a.project ?? null
        task = a.taskKey ? a.taskKey.split('/')[2] ?? null : null
      }
    }
    const projectKey = entity ? `${entity}/${project ?? 'none'}` : null
    const tokens: Tokens | null = l.byModel ? sumTokens(Object.values(l.byModel)) : null
    const pr = l.byModel ? priceUsage(l.byModel, m.pricing) : { cost: 0, unpriced: true }
    const method: Method = l.creditsMethod === 'exact' ? 'exact' : 'estimated'
    return {
      id: `log:${l.id}`,
      kind: l.kind === 'agent' ? 'run' : l.kind === 'manual' ? 'manual' : 'turn',
      tool: l.tool,
      providerId: sub?.provider ?? l.provider ?? null,
      subscriptionId: sub?.id ?? null,
      date: l.at,
      month: monthOf(localDay(l.at)),
      models,
      agent: l.agent || 'manager',
      projectKey,
      taskKey: task && projectKey ? `${projectKey}/${task}` : null,
      label: l.prompt,
      tokens,
      requests: l.requests,
      acu,
      acuVersion,
      method,
      confidence: method === 'exact' ? 'high' : l.creditsMethod === 'declared' ? 'medium' : 'low',
      source: LOG_SOURCE[l.source] ?? `Journal de crédits – ${l.source}`,
      durationMs: null,
      contextPct: null,
      apiCost: pr.cost,
      unpriced: pr.unpriced,
      sessionId: l.session,
      sessionTitle: l.sessionTitle,
      fromLog: true,
      ref: l,
    }
  })
}

const monthOf = (d: string) => d.slice(0, 7)

/** Which subscription a measured record belongs to: same tool, matching model prefix if listed, started on that date. */
export function matchSubscription(reg: Registry, tool: string, models: string[], date: string): Subscription | null {
  const day = date.slice(0, 10)
  const candidates = reg.subscriptions.filter(
    (s) =>
      (!s.startDate || s.startDate <= day) &&
      s.usageSources.some((src) => src.tool === tool && (!src.models.length || models.some((m) => src.models.some((p) => m.toLowerCase().startsWith(p.toLowerCase()))))),
  )
  if (!candidates.length) return null
  const specific = (s: Subscription) => (s.usageSources.some((src) => src.tool === tool && src.models.length) ? 1 : 0)
  return candidates.sort((a, b) => specific(b) - specific(a) || (a.status === 'active' ? -1 : 1) - (b.status === 'active' ? -1 : 1) || b.startDate.localeCompare(a.startDate))[0]
}

function providerForTool(reg: Registry, tool: string): string | null {
  const integ = tool === 'claude' ? 'claude-code-logs' : tool === 'codex' ? 'codex-logs' : null
  return reg.providers.find((p) => p.integration === integ)?.id ?? null
}

export function buildRecords(m: Model, usage: UsageView | null, mode: AcuMode): UsageRecord[] {
  const reg = m.registry
  const out: UsageRecord[] = []
  const pushMeasured = (x: Run | Turn) => {
    const date = x.kind === 'agent' ? x.at || x.start || '' : x.at
    if (!date) return
    const models = Object.keys(x.byModel)
    const sub = matchSubscription(reg, x.tool ?? 'claude', models, date)
    const cfg = configAt(reg, date, mode)
    const calc = acuFromTokens(x.byModel, cfg)
    const peak = Math.max(0, ...Object.values(x.byModel).map((t) => t.peak ?? 0))
    const win = Math.max(0, ...Object.values(x.byModel).map((t) => t.window ?? 0))
    const start = x.kind === 'agent' ? x.start : null
    const end = x.kind === 'agent' ? x.end : null
    out.push({
      id: x.kind === 'agent' ? `run:${x.id}` : `turn:${x.sessionId}:${x.at}`,
      kind: x.kind === 'agent' ? 'run' : 'turn',
      tool: x.tool ?? 'claude',
      providerId: sub?.provider ?? providerForTool(reg, x.tool ?? 'claude'),
      subscriptionId: sub?.id ?? null,
      date,
      month: monthOf(date),
      models,
      agent: x.kind === 'agent' ? x.agentType : 'manager',
      projectKey: x.attr.entity ? `${x.attr.entity}/${x.attr.project ?? 'none'}` : null,
      taskKey: x.attr.taskKey ?? null,
      label: x.kind === 'agent' ? x.description || x.prompt.slice(0, 120) : x.prompt,
      tokens: x.tokens,
      requests: x.tokens.requests ?? 0,
      acu: calc ? calc.acu : null,
      acuVersion: cfg.version,
      method: 'exact',
      confidence: 'high',
      source: x.tool === 'codex' ? 'Codex – journaux locaux' : 'Claude Code – journaux locaux',
      durationMs: start && end ? new Date(end).getTime() - new Date(start).getTime() : null,
      contextPct: win && peak ? Math.min(1, peak / win) : null,
      apiCost: x.cost,
      unpriced: x.unpriced,
      sessionId: x.sessionId,
      ref: x,
    })
  }
  const log = usage?.raw.creditLog
  if (log?.present) out.push(...recordsFromLog(m, log.lines, mode))
  else {
    // no credit log yet: fall back to reading the tools' local logs directly
    for (const r of usage?.runs ?? []) pushMeasured(r)
    for (const t of usage?.turns ?? []) pushMeasured(t)
  }

  for (const u of reg.usage) {
    const sub = reg.subscriptions.find((s) => s.id === u.subscription) ?? null
    const cfg = configAt(reg, u.date, mode)
    const tool = sub?.usageSources[0]?.tool ?? 'other'
    let acu: number | null
    let tokens: Tokens | null = null
    if (u.tokens) {
      acu = acuFromReported(u.tokens, u.model ?? '', u.requests, cfg)
      tokens = { ...zero(), input: Math.max(0, u.tokens.input - u.tokens.cached), output: u.tokens.output, cacheRead: u.tokens.cached, requests: u.requests }
    } else {
      acu = acuEstimated(u.requests, [u.model, u.category, tool, sub?.provider, sub?.id], cfg)
    }
    out.push({
      id: `manual:${u.id}`,
      kind: 'manual',
      tool,
      providerId: sub?.provider ?? null,
      subscriptionId: sub?.id ?? null,
      date: u.date,
      month: monthOf(u.date),
      models: u.model ? [u.model] : [],
      agent: u.agent ?? '—',
      projectKey: u.project,
      taskKey: u.task && u.project ? `${u.project}/${u.task}` : null,
      label: u.note || `${u.requests} requête(s)${u.category ? ' · ' + u.category : ''}`,
      tokens,
      requests: u.requests,
      acu,
      acuVersion: cfg.version,
      method: u.method,
      confidence: u.confidence,
      source: u.source,
      durationMs: null,
      contextPct: null,
      apiCost: tokens ? costOf({ [u.model ?? 'unknown']: tokens }, m.pricing) : 0,
      unpriced: !tokens,
      sessionId: null,
      ref: u,
    })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

// ---------- expenses ----------
export type SubMonthExpense = {
  subscriptionId: string
  month: string
  active: boolean
  billing: BillingModel
  currency: string
  fixed: number // in subscription currency
  fixedSource: 'recorded' | 'configured' | 'none'
  variableActual: number | null // recorded actual / provider-reported variable charges
  variableEstimated: number // API-equivalent estimate of the month's usage (payg / hybrid only)
  expense: number // amount used for allocation: fixed + (actual variable, else estimated variable)
  status: 'actual' | 'provisional' | 'none'
  budget: number | null
  spentAgainstBudget: number | null
  remainingBudget: number | null
  budgetIsEstimate: boolean
  prorated?: number // share of the month counted when a period shorter than the month is selected
}

function monthsBetween(a: string, b: string): string[] {
  const out: string[] = []
  let [y, m] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  while (y < yb || (y === yb && m <= mb)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

export function subscriptionActiveIn(s: Subscription, month: string): boolean {
  if (s.startDate && monthOf(s.startDate) > month) return false
  // status has no history: an inactive / archived subscription stops counting after the month it was last changed
  if (s.status !== 'active' && s.updatedAt && monthOf(s.updatedAt) < month) return false
  return true
}

export function subscriptionExpense(s: Subscription, month: string, monthRecords: UsageRecord[]): SubMonthExpense {
  const billing = (inEffect(s.billing, month) ?? s.billing[0])?.model ?? 'fixed'
  const active = subscriptionActiveIn(s, month)
  const rec = s.expenses.filter((e) => e.period === month)
  const recFixed = rec.filter((e) => e.kind === 'fixed')
  const recVar = rec.filter((e) => e.kind === 'variable')
  // prefer invoice-level "actual" figures over provider-"reported" ones for the same month
  const pick = (list: typeof rec) => (list.some((e) => e.status === 'actual') ? list.filter((e) => e.status === 'actual') : list)
  let fixed = 0
  let fixedSource: SubMonthExpense['fixedSource'] = 'none'
  if (billing !== 'payg' && active) {
    if (recFixed.length) {
      fixed = pick(recFixed).reduce((a, e) => a + e.amount, 0)
      fixedSource = 'recorded'
    } else {
      const p = inEffect(s.prices, month)
      if (p) {
        fixed = monthlyAmount(p)
        fixedSource = 'configured'
      }
    }
  }
  const variableActual = recVar.length ? pick(recVar).reduce((a, e) => a + e.amount, 0) : null
  const variableEstimated = billing === 'fixed' ? 0 : monthRecords.reduce((a, r) => a + r.apiCost, 0)
  const variable = billing === 'fixed' ? 0 : variableActual ?? variableEstimated
  const expense = fixed + variable
  const provisional = billing !== 'fixed' && variableActual === null && variableEstimated > 0
  const budget = inEffect(s.budgets, month)?.monthly ?? null
  // the budget limits usage charges (payg / hybrid) or the whole fee (fixed)
  const spent = budget === null ? null : billing === 'fixed' ? fixed : variable
  return {
    subscriptionId: s.id,
    month,
    active,
    billing,
    currency: s.currency,
    fixed,
    fixedSource,
    variableActual,
    variableEstimated,
    expense,
    status: expense === 0 && !rec.length ? 'none' : provisional ? 'provisional' : 'actual',
    budget,
    spentAgainstBudget: spent,
    remainingBudget: budget === null || spent === null ? null : budget - spent,
    budgetIsEstimate: billing !== 'fixed' && variableActual === null,
  }
}

// ---------- pools & allocation ----------
export type ProjectShare = {
  projectKey: string
  subscriptionId: string
  acu: number
  pct: number // of the subscription pool over the period
  allocated: number // base currency (null-safe: 0 when no rate)
  requests: number
  records: number
  methods: Method[]
  confidence: Confidence
}

export type SubResult = {
  sub: Subscription
  months: SubMonthExpense[]
  expense: number // base currency
  expenseLocal: number // subscription currency
  fixed: number
  variableActual: number | null
  variableEstimated: number
  expenseEstimated: boolean // the expense itself contains an estimate (no actual / reported variable charge)
  provisional: boolean // the allocation is provisional (estimated expense OR estimated / plan-level consumption)
  fxMissing: boolean
  acu: number
  unmeasuredRecords: number // records with unavailable ACU
  requests: number
  records: UsageRecord[]
  projects: ProjectShare[]
  allocated: number
  unallocated: number
  unallocatedAcu: number
  allocationStatus: 'ok' | 'provisional' | 'no-consumption' | 'unavailable'
  budget: number | null
  remainingBudget: number | null
  planUsage: Subscription['planUsage']
}

const minConfidence = (list: Confidence[]): Confidence => (list.includes('low') ? 'low' : list.includes('medium') ? 'medium' : 'high')

/**
 * @param range optional date range (local days). Records outside it are ignored and each monthly fee is prorated by
 *              the share of the month the range covers (e.g. "this week" = 7/30 of the month's fixed fee).
 */
export function allocate(reg: Registry, records: UsageRecord[], months: string[], selected: Set<string> | null, range?: Range): SubResult[] {
  const results: SubResult[] = []
  for (const s of reg.subscriptions) {
    if (selected && !selected.has(s.id)) continue
    const subRecords = records.filter((r) => r.subscriptionId === s.id && months.includes(r.month) && (!range || inRange(r.date, range)))
    const monthsResult: SubMonthExpense[] = []
    const shares = new Map<string, ProjectShare>()
    let allocated = 0
    let unallocated = 0
    let unallocatedAcu = 0
    let fxMissing = false
    let expenseBase = 0
    let expenseLocal = 0
    for (const month of months) {
      const mr = subRecords.filter((r) => r.month === month)
      const full = subscriptionExpense(s, month, mr)
      const frac = range ? monthFraction(month, range) : 1
      // prorate monthly amounts (fixed fee, recorded variable charges); estimates already come from the in-range records
      const e: SubMonthExpense =
        frac >= 1
          ? full
          : (() => {
              const fixed = full.fixed * frac
              const variableActual = full.variableActual === null ? null : full.variableActual * frac
              const variable = full.billing === 'fixed' ? 0 : variableActual ?? full.variableEstimated
              return { ...full, fixed, variableActual, expense: fixed + variable, prorated: frac }
            })()
      if (!e.active && !mr.length && e.expense === 0) continue
      monthsResult.push(e)
      const base = toBase(e.expense, s.currency, reg)
      if (base === null && e.expense > 0) fxMissing = true
      const exp = base ?? 0
      expenseBase += exp
      expenseLocal += e.expense
      // independent pool for this subscription and month
      const measured = mr.filter((r) => r.acu !== null)
      const total = measured.reduce((a, r) => a + (r.acu as number), 0)
      if (total <= 0) {
        unallocated += exp
        continue
      }
      for (const r of measured) {
        const share = (r.acu as number) / total
        if (!r.projectKey) {
          unallocated += share * exp
          unallocatedAcu += r.acu as number
          continue
        }
        const k = r.projectKey
        const cur = shares.get(k) ?? { projectKey: k, subscriptionId: s.id, acu: 0, pct: 0, allocated: 0, requests: 0, records: 0, methods: [], confidence: 'high' as Confidence }
        cur.acu += r.acu as number
        cur.allocated += share * exp
        cur.requests += r.requests
        cur.records += 1
        if (!cur.methods.includes(r.method)) cur.methods.push(r.method)
        cur.confidence = minConfidence([cur.confidence, r.confidence])
        shares.set(k, cur)
        allocated += share * exp
      }
    }
    const acu = subRecords.reduce((a, r) => a + (r.acu ?? 0), 0)
    for (const sh of shares.values()) sh.pct = acu ? sh.acu / acu : 0
    const expenseEstimated = monthsResult.some((x) => x.status === 'provisional')
    const provisional = expenseEstimated || subRecords.some((r) => r.method !== 'exact')
    const hasSource = s.usageSources.length > 0 || reg.usage.some((u) => u.subscription === s.id)
    const lastMonth = monthsResult[monthsResult.length - 1]
    results.push({
      sub: s,
      months: monthsResult,
      expense: expenseBase,
      expenseLocal,
      fixed: monthsResult.reduce((a, x) => a + x.fixed, 0),
      variableActual: monthsResult.some((x) => x.variableActual !== null) ? monthsResult.reduce((a, x) => a + (x.variableActual ?? 0), 0) : null,
      variableEstimated: monthsResult.reduce((a, x) => a + (x.variableActual === null ? x.variableEstimated : 0), 0),
      expenseEstimated,
      provisional,
      fxMissing,
      acu,
      unmeasuredRecords: subRecords.filter((r) => r.acu === null).length,
      requests: subRecords.reduce((a, r) => a + r.requests, 0),
      records: subRecords,
      projects: [...shares.values()].sort((a, b) => b.acu - a.acu),
      allocated,
      unallocated,
      unallocatedAcu,
      allocationStatus: !hasSource ? 'unavailable' : acu <= 0 ? 'no-consumption' : provisional ? 'provisional' : 'ok',
      budget: lastMonth?.budget ?? null,
      remainingBudget: lastMonth?.remainingBudget ?? null,
      planUsage: s.planUsage.filter((p) => months.includes(p.date.slice(0, 7))),
    })
  }
  return results
}

/** Months to compute: one month, or from the first subscription / record month to the current month. */
export function periodMonths(reg: Registry, records: UsageRecord[], period: string, now = new Date()): string[] {
  const current = now.toISOString().slice(0, 7)
  if (period !== 'all') return [period]
  const starts = [...reg.subscriptions.map((s) => monthOf(s.startDate || current)), ...records.map((r) => r.month)].filter(Boolean).sort()
  return monthsBetween(starts[0] ?? current, current)
}

export function availableMonths(reg: Registry, records: UsageRecord[], now = new Date()): string[] {
  return periodMonths(reg, records, 'all', now).reverse()
}

export function totalsOf(results: SubResult[]) {
  return {
    expense: results.reduce((a, r) => a + r.expense, 0),
    allocated: results.reduce((a, r) => a + r.allocated, 0),
    unallocated: results.reduce((a, r) => a + r.unallocated, 0),
    acu: results.reduce((a, r) => a + r.acu, 0),
    requests: results.reduce((a, r) => a + r.requests, 0),
    variableActual: results.some((r) => r.variableActual !== null) ? results.reduce((a, r) => a + (r.variableActual ?? 0), 0) : null,
    variableEstimated: results.reduce((a, r) => a + r.variableEstimated, 0),
    provisional: results.some((r) => r.provisional),
    expenseEstimated: results.some((r) => r.expenseEstimated),
    fxMissing: results.some((r) => r.fxMissing),
  }
}

export const tokensOf = (records: UsageRecord[]) => sumTokens(records.map((r) => r.tokens ?? zero()))
export const tokenTotal = (records: UsageRecord[]) => totalOf(tokensOf(records))
