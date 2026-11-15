import { parseTables, stripComments } from './markdown'
import type { Attribution, ByModel, Model, PriceRow, Run, Task, Tokens, Turn, UsageRaw, UsageView } from './types'

// Fallback when the ecosystem has no usage/PRICING.md (USD per million tokens, Anthropic list prices 2026-11).
export const DEFAULT_PRICING: PriceRow[] = [
  { model: 'claude-fable-5-2', input: 8, output: 40, cacheWrite5m: 10, cacheWrite1h: 16, cacheRead: 0.2 },
  { model: 'claude-mythos-5-2', input: 8, output: 40, cacheWrite5m: 10, cacheWrite1h: 16, cacheRead: 0.2 },
  { model: 'claude-fable-5', input: 10, output: 50, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 1 },
  { model: 'claude-opus-5-5', input: 4, output: 20, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2 },
  { model: 'claude-opus-5', input: 5, output: 25, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5 },
  { model: 'claude-opus-4', input: 5, output: 25, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5 },
  { model: 'claude-sonnet-5-5', input: 2, output: 10, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.1 },
  { model: 'claude-sonnet-5', input: 2, output: 10, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2 },
  { model: 'claude-sonnet-4', input: 3, output: 15, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3 },
  { model: 'claude-haiku-5-5', input: 0.1, output: 0.5, cacheWrite5m: 0.125, cacheWrite1h: 0.2, cacheRead: 0.01 },
  { model: 'claude-haiku-4', input: 1, output: 5, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1 },
]

export function parsePricing(body: string): PriceRow[] {
  const t = parseTables(stripComments(body)).find((x) => /model/i.test(x.headers[0] ?? ''))
  if (!t) return []
  const col = (re: RegExp) => t.headers.findIndex((h) => re.test(h))
  const ci = { input: col(/^input/i), output: col(/^output/i), w5: col(/5m/i), w1: col(/1h/i), read: col(/read/i) }
  const num = (s?: string) => parseFloat((s ?? '').replace(/[^\d.]/g, '')) || 0
  return t.rows
    .filter((r) => r[0] && /claude|[a-z]/i.test(r[0]))
    .map((r) => {
      const input = num(r[ci.input])
      return {
        model: r[0].replace(/`/g, '').trim(),
        input,
        output: num(r[ci.output]),
        cacheWrite5m: ci.w5 >= 0 ? num(r[ci.w5]) : input * 1.25,
        cacheWrite1h: ci.w1 >= 0 ? num(r[ci.w1]) : input * 2,
        cacheRead: ci.read >= 0 ? num(r[ci.read]) : input * 0.1,
      }
    })
}

export const zero = (): Tokens => ({ input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, requests: 0, peak: 0, window: 0 })
export function sumTokens(list: Tokens[]): Tokens {
  const t = zero()
  for (const x of list) {
    t.input += x.input
    t.output += x.output
    t.cacheWrite5m += x.cacheWrite5m
    t.cacheWrite1h += x.cacheWrite1h
    t.cacheRead += x.cacheRead
    t.requests = (t.requests ?? 0) + (x.requests ?? 0)
    t.peak = Math.max(t.peak ?? 0, x.peak ?? 0)
    t.window = Math.max(t.window ?? 0, x.window ?? 0)
  }
  return t
}
export const totalOf = (t: Tokens) => t.input + t.output + t.cacheWrite5m + t.cacheWrite1h + t.cacheRead

function priceFor(model: string, pricing: PriceRow[]) {
  const m = model.toLowerCase()
  let best: PriceRow | undefined
  for (const p of pricing) if (m.startsWith(p.model.toLowerCase()) && (!best || p.model.length > best.model.length)) best = p
  return best
}

/** Cost of the tokens; models without a price (e.g. a new OpenAI model) are counted as unpriced, never guessed. */
export function costOf(byModel: ByModel, pricing: PriceRow[]) {
  return priceUsage(byModel, pricing).cost
}
export function priceUsage(byModel: ByModel, pricing: PriceRow[]) {
  let c = 0
  let unpriced = false
  for (const [model, t] of Object.entries(byModel)) {
    const p = priceFor(model, pricing) ?? (/^claude/i.test(model) ? priceFor('claude-opus-5-5', DEFAULT_PRICING) : undefined)
    if (!p) {
      if (totalOf(t) > 0) unpriced = true
      continue
    }
    c += (t.input * p.input + t.output * p.output + t.cacheWrite5m * p.cacheWrite5m + t.cacheWrite1h * p.cacheWrite1h + t.cacheRead * p.cacheRead) / 1e6
  }
  return { cost: c, unpriced }
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function findEntity(m: Model, text: string) {
  const n = '-' + norm(text) + '-'
  const hit = m.entities.find((e) => n.includes('-' + e.slug + '-') || n.includes('-' + norm(e.name) + '-'))
  if (hit) return hit
  // personal projects: "personal", "perso", "personnel"
  return /-(personal|personnel|perso)-/.test(n) ? m.personalEntity : undefined
}
function findProject(m: Model, entity: string | undefined, text: string) {
  const n = '-' + norm(text) + '-'
  const list = entity ? m.projects.filter((p) => p.entitySlug === entity) : m.projects
  // longest name first so "brand-book" wins over "brand"
  const exact = [...list]
    .sort((a, b) => b.slug.length - a.slug.length)
    .find((p) => n.includes('-' + p.slug + '-') || n.includes('-' + norm(p.name) + '-'))
  if (exact) return exact
  // "FleetIQ project" → fleetiq-mockup: first distinctive word of the slug, only when it points to a single project
  const byWord = list.filter((p) => {
    const w = p.slug.split('-')[0]
    return w.length >= 5 && n.includes('-' + w + '-')
  })
  return byWord.length === 1 ? byWord[0] : undefined
}

function matchTaskByCard(tasks: Task[], card: string) {
  const c = norm(card)
  if (!c) return undefined
  return tasks.find((t) => {
    const tt = norm(t.title)
    return tt && (tt.includes(c) || c.includes(tt) || (c.length > 6 && tt.startsWith(c.split('-').slice(0, 2).join('-'))))
  })
}

export function attributeRun(m: Model, prompt: string): Attribution {
  const line = prompt.match(/TASK:\s*([\w.-]+)\/([\w.-]+)\/(T-\d+)/i)
  if (line) {
    const key = `${line[1]}/${line[2]}/${line[3].toUpperCase()}`
    const t = m.tasks.find((x) => x.key.toLowerCase() === key.toLowerCase())
    return { entity: line[1], project: line[2] === 'none' ? undefined : line[2], taskKey: t?.key ?? key, how: 'task-line' }
  }
  const trello = prompt.match(/https?:\/\/trello\.com\/c\/([A-Za-z0-9]+)/)
  if (trello) {
    const t = m.tasks.find((x) => x.trello.includes(`/c/${trello[1]}`))
    if (t) return { entity: t.entitySlug, project: t.projectSlug, taskKey: t.key, how: 'trello' }
  }
  const client = prompt.match(/client:\s*([\w.-]+)/i)?.[1]?.replace(/\.+$/, '')
  const entity = client
    ? client.toLowerCase() === 'personal'
      ? 'personal'
      : m.entities.find((e) => e.slug.toLowerCase() === client.toLowerCase())?.slug
    : findEntity(m, prompt.slice(0, 400))?.slug
  const projRaw = prompt.match(/project:\s*([\w.-]+)/i)?.[1]?.replace(/\.+$/, '')
  const project = projRaw ? m.projects.find((p) => p.slug.toLowerCase() === projRaw.toLowerCase() && (!entity || p.entitySlug === entity))?.slug : undefined
  const card = prompt.match(/card[^:\n]{0,20}:\s*([^\n(]+?)(?:\s*\(|\.\s|\n|$)/i)?.[1]?.trim()
  if (card) {
    const pool = m.tasks.filter((t) => (!entity || t.entitySlug === entity) && (!project || t.projectSlug === project))
    const t = matchTaskByCard(pool, card)
    if (t) return { entity: t.entitySlug, project: t.projectSlug, taskKey: t.key, card, how: 'card-title' }
  }
  return entity || project ? { entity, project, card, how: 'client-project' } : { card, how: 'none' }
}

export function buildUsage(m: Model, raw: UsageRaw): UsageView {
  const pricing = m.pricing
  const runs: Run[] = raw.runs.map((r) => {
    const tokens = sumTokens(Object.values(r.byModel))
    const pr = priceUsage(r.byModel, pricing)
    return { ...r, tool: r.tool ?? 'claude', kind: 'agent', tokens, total: totalOf(tokens), cost: pr.cost, unpriced: pr.unpriced, attr: attributeRun(m, r.prompt), at: r.start ?? '' }
  })
  const turns: Turn[] = []
  const sessions = raw.sessions.map((s) => {
    let focus: Attribution | null = null
    for (const t of s.turns) {
      const tokens = sumTokens(Object.values(t.byModel))
      let attr: Attribution = { how: 'none' }
      const text = t.command ? t.args : t.prompt
      const e = findEntity(m, text)
      if (/TASK:\s*[\w.-]+\/[\w.-]+\/T-\d+/i.test(t.prompt)) attr = attributeRun(m, t.prompt)
      else if (e) {
        const p = findProject(m, e.slug, text)
        attr = { entity: e.slug, project: p?.slug, how: 'command' }
        if (t.command === 'wakil.focus') focus = { ...attr, how: 'focus' }
      } else if (focus) attr = focus
      const pr = priceUsage(t.byModel, pricing)
      turns.push({ ...t, kind: 'turn', tool: s.tool ?? 'claude', sessionId: s.id, sessionTitle: s.title, tokens, total: totalOf(tokens), cost: pr.cost, unpriced: pr.unpriced, attr })
    }
    const own = turns.filter((x) => x.sessionId === s.id)
    const sr = runs.filter((r) => r.sessionId === s.id)
    return {
      ...s,
      tokens: sumTokens([...own.map((x) => x.tokens), ...sr.map((r) => r.tokens)]),
      cost: own.reduce((a, x) => a + x.cost, 0) + sr.reduce((a, r) => a + r.cost, 0),
      runs: sr.length,
    }
  })
  runs.sort((a, b) => b.at.localeCompare(a.at))
  return { raw, runs, turns, sessions: sessions.sort((a, b) => (b.end ?? '').localeCompare(a.end ?? '')) }
}

// ---------- formatting ----------
export function fmtTokens(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' G'
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + ' M'
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + ' k'
  return String(n)
}
export const fmtCost = (c: number) => (c >= 100 ? `$${c.toFixed(0)}` : c >= 1 ? `$${c.toFixed(2)}` : c > 0 ? `$${c.toFixed(3)}` : '$0')

export type Agg = { key: string; label: string; runs: number; tokens: Tokens; total: number; cost: number }
export function aggregate<T extends { tokens: Tokens; cost: number }>(items: T[], keyOf: (x: T) => string | undefined, labelOf?: (k: string) => string): Agg[] {
  const map = new Map<string, { items: T[] }>()
  for (const it of items) {
    const k = keyOf(it) ?? '—'
    map.set(k, { items: [...(map.get(k)?.items ?? []), it] })
  }
  return [...map.entries()]
    .map(([key, v]) => {
      const tokens = sumTokens(v.items.map((x) => x.tokens))
      return { key, label: labelOf ? labelOf(key) : key, runs: v.items.length, tokens, total: totalOf(tokens), cost: v.items.reduce((a, x) => a + x.cost, 0) }
    })
    .sort((a, b) => b.cost - a.cost)
}
