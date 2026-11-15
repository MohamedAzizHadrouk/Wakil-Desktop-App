// AI registry (usage/registry.json) – written by tools/ai-registry.cjs from the chats, only READ here.

export type BillingModel = 'fixed' | 'payg' | 'hybrid'
export type EntityStatus = 'active' | 'inactive' | 'archived'
export type Method = 'exact' | 'estimated' | 'plan'
export type Confidence = 'high' | 'medium' | 'low'

export type Provider = {
  id: string
  name: string
  category: string
  description: string
  website: string
  integration: 'claude-code-logs' | 'codex-logs' | 'manual' | 'none'
  status: EntityStatus
  notes: string
  createdAt: string
  updatedAt: string
}

export type PriceEntry = { from: string; amount: number; currency: string; frequency: 'monthly' | 'yearly' | 'custom'; months?: number }
export type BudgetEntry = { from: string; monthly: number | null; currency: string }
export type Expense = {
  period: string // YYYY-MM
  kind: 'fixed' | 'variable'
  amount: number
  currency: string
  status: 'actual' | 'reported'
  source: string
  note: string
  at: string
}
export type BillingPeriodEntry = { start: string; end: string; amount: number; currency: string; note?: string; at?: string }
export type PlanUsage ={ date: string; metric: string; value: number; limit: number | null; window: string; source: string; confidence: Confidence }

export type Subscription = {
  id: string
  name: string
  provider: string
  status: EntityStatus
  billing: { from: string; model: BillingModel }[]
  prices: PriceEntry[]
  budgets: BudgetEntry[]
  currency: string
  startDate: string
  renewalDate: string
  usageSources: { tool: string; models: string[] }[]
  measurement: Method
  expenses: Expense[]
  planUsage: PlanUsage[]
  periods: BillingPeriodEntry[] // declared with /wakil.billing-period; others are derived from startDate + frequency
  notes: string
  createdAt: string
  updatedAt: string
}

export type ManualUsage = {
  id: string
  subscription: string
  date: string
  project: string | null
  task: string | null
  agent: string | null
  model: string | null
  category: string | null
  requests: number
  tokens: { input: number; output: number; cached: number } | null
  method: Method
  confidence: Confidence
  source: string
  note: string
}

export type AcuConfig = {
  version: number
  from: string
  weights: { input: number; output: number; cached: number; overhead: number }
  multipliers: { match: string; value: number }[]
  defaultMultiplier: number
  estimation: { match: string; acuPerRequest: number }[]
  note: string
}

export type RegistryLog = { at: string; action: string; target: string; summary: string; sourceTool: string; agent: string; command: string }

export type Registry = {
  version: number
  settings: { baseCurrency: string; fx: Record<string, number> }
  providers: Provider[]
  subscriptions: Subscription[]
  usage: ManualUsage[]
  acu: AcuConfig[]
  log: RegistryLog[]
  present: boolean // false when usage/registry.json does not exist yet
}

export const DEFAULT_ACU: AcuConfig = {
  version: 1,
  from: '2000-01-01',
  weights: { input: 1.0, output: 2.0, cached: 0.25, overhead: 0.5 },
  multipliers: [],
  defaultMultiplier: 1.0,
  estimation: [],
  note: 'Defaults',
}

export function emptyRegistry(): Registry {
  return { version: 1, settings: { baseCurrency: 'USD', fx: {} }, providers: [], subscriptions: [], usage: [], acu: [DEFAULT_ACU], log: [], present: false }
}

/** Tolerant reader: a malformed file never breaks the app, it is reported instead. */
export function parseRegistry(raw: string | undefined): { registry: Registry; error: string | null } {
  if (!raw) return { registry: emptyRegistry(), error: null }
  try {
    const r = JSON.parse(raw)
    const reg: Registry = {
      version: r.version ?? 1,
      settings: { baseCurrency: r.settings?.baseCurrency ?? 'USD', fx: r.settings?.fx ?? {} },
      providers: Array.isArray(r.providers) ? r.providers : [],
      subscriptions: (Array.isArray(r.subscriptions) ? r.subscriptions : []).map((s: Subscription) => ({
        ...s,
        billing: s.billing ?? [],
        prices: s.prices ?? [],
        budgets: s.budgets ?? [],
        usageSources: s.usageSources ?? [],
        expenses: s.expenses ?? [],
        planUsage: s.planUsage ?? [],
        periods: Array.isArray(s.periods) ? s.periods : [],
      })),
      usage: Array.isArray(r.usage) ? r.usage : [],
      acu: Array.isArray(r.acu) && r.acu.length ? r.acu : [DEFAULT_ACU],
      log: Array.isArray(r.log) ? r.log : [],
      present: true,
    }
    return { registry: reg, error: null }
  } catch (e) {
    return { registry: emptyRegistry(), error: `usage/registry.json illisible : ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** Entry in effect at a date (YYYY-MM-DD or YYYY-MM): the latest one whose "from" is not after it. */
export function inEffect<T extends { from: string }>(history: T[], at: string): T | undefined {
  const key = at.length === 7 ? at + '-31' : at
  return [...history].filter((h) => h.from <= key).sort((a, b) => a.from.localeCompare(b.from)).pop()
}

/** Monthly equivalent of a price entry (yearly → /12, custom → /months). */
export function monthlyAmount(p: PriceEntry): number {
  if (p.frequency === 'yearly') return p.amount / 12
  if (p.frequency === 'custom') return p.amount / Math.max(1, p.months ?? 1)
  return p.amount
}

/** Converts an amount to the base currency; null when no rate is known. */
export function toBase(amount: number, currency: string, reg: Registry): number | null {
  const base = reg.settings.baseCurrency
  if (!currency || currency === base) return amount
  const rate = reg.settings.fx[currency]
  return rate ? amount * rate : null
}
