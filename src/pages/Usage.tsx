import React, { useEffect, useRef, useState } from 'react'
import { Bot, Building2, ChevronDown, ChevronRight, CircleDollarSign, Download, Gauge, History, Info, Layers, PieChart, RefreshCw, Sigma, Users } from 'lucide-react'
import { Kpi, TokenSplit, ToolBadge, TOOL_META } from '../components/usage'
import { Button, Card, CardHeader, Chip, CommandHint, Empty, Page, PageTitle, Pill, Tabs, fmtDate, timeAgo } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { api, useApp, useModel } from '../lib/store'
import { ACU_FORMULA, acuFromTokens, configAt, type AcuMode } from '../lib/acu'
import type { SubResult, UsageRecord } from '../lib/allocation'
import { inEffect, monthlyAmount, type Registry, type Subscription } from '../lib/registry'
import { UNASSIGNED, useAllocation } from '../lib/useAllocation'
import { fmtTokens } from '../lib/usage'
import { periodLabel, type Period } from '../lib/period'
import { PeriodFilter } from '../components/PeriodFilter'
import { entityOf } from '../lib/model'
import type { ByModel, Model } from '../lib/types'
import { CostsTab } from './UsageCosts'

// ---------- formatting ----------
export function fmtMoney(v: number | null | undefined, cur = 'USD') {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur, maximumFractionDigits: v !== 0 && Math.abs(v) < 1 ? 3 : 2 }).format(v)
  } catch {
    return `${v.toFixed(2)} ${cur}`
  }
}
export const fmtAcu = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v >= 1e6 ? `${(v / 1e6).toFixed(2)} M` : v >= 1e4 ? `${(v / 1e3).toFixed(1)} k` : v.toFixed(v < 10 ? 2 : 0)
const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)} %`
const monthLabel = (m: string) => new Date(m + '-15').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
const BILLING_LABEL: Record<string, string> = { fixed: 'Abonnement fixe', payg: 'À l’usage', hybrid: 'Hybride' }
const METHOD_LABEL: Record<string, string> = { exact: 'Mesuré', estimated: 'Estimé', plan: 'Niveau abonnement' }

export function projectLabel(m: Model, key: string | null) {
  if (!key) return 'Non attribué'
  const [e, p] = key.split('/')
  const proj = m.projects.find((x) => x.entitySlug === e && x.slug === p)
  const ent = entityOf(m, e)
  return proj ? `${proj.name} · ${ent?.name ?? e}` : `${ent?.name ?? e}${p && p !== 'none' ? ` / ${p}` : ' (hors projet)'}`
}
const providerName = (reg: Registry, id: string | null) => (id ? reg.providers.find((p) => p.id === id)?.name ?? id : '—')

/** "Réel" vs "Estimé" – the visual distinction required everywhere money or consumption is shown. */
export function Certainty({ estimated, title }: { estimated: boolean; title?: string }) {
  return estimated ? (
    <span
      title={title ?? 'Valeur estimée ou provisoire (pas une charge réelle constatée)'}
      className="inline-flex items-center rounded-full border border-dashed border-warn/60 bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold text-warn"
    >
      estimé
    </span>
  ) : (
    <span title={title ?? 'Montant réel (prix configuré ou dépense enregistrée)'} className="inline-flex items-center rounded-full bg-ok-soft px-1.5 py-0.5 text-[10px] font-semibold text-ok">
      réel
    </span>
  )
}

function Tip({ text }: { text: string }) {
  return (
    <span title={text} className="inline-flex cursor-help text-muted hover:text-ink">
      <Info className="size-3.5" />
    </span>
  )
}

// ---------- filters ----------
function SubscriptionFilter({ reg, selected, onChange, unassignedCount }: { reg: Registry; selected: string[] | null; onChange: (s: string[] | null) => void; unassignedCount: number }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const all = [...reg.subscriptions.map((s) => s.id), UNASSIGNED]
  const isOn = (id: string) => !selected || selected.includes(id)
  const toggle = (ids: string[], on: boolean) => {
    const cur = new Set(selected ?? all)
    for (const id of ids) {
      if (on) cur.add(id)
      else cur.delete(id)
    }
    onChange(cur.size === all.length ? null : [...cur])
  }
  const label = !selected
    ? 'Tous les abonnements'
    : selected.length === 0
      ? 'Aucun abonnement'
      : selected.map((id) => (id === UNASSIGNED ? 'Non rattaché' : reg.subscriptions.find((s) => s.id === id)?.name ?? id)).join(' + ')
  const byProvider = new Map<string, Subscription[]>()
  for (const s of reg.subscriptions) byProvider.set(s.provider, [...(byProvider.get(s.provider) ?? []), s])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex h-9 max-w-[420px] items-center gap-2 rounded-lg border border-line bg-paper px-3 text-sm font-semibold hover:border-slate">
        <Layers className="size-4 text-slate" />
        <span className="truncate">{label}</span>
        <ChevronDown className="size-4 text-slate" />
      </button>
      {open && (
        <div className="absolute top-11 left-0 z-30 w-80 rounded-xl border border-line bg-paper p-2 shadow-xl">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold hover:bg-ivory">
            <input type="checkbox" checked={!selected} onChange={(e) => onChange(e.target.checked ? null : [])} /> Tous les abonnements
          </label>
          {[...byProvider.entries()].map(([pid, subs]) => (
            <div key={pid} className="mt-1 border-t border-line pt-1">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs font-semibold text-slate uppercase hover:bg-ivory">
                <input type="checkbox" checked={subs.every((s) => isOn(s.id))} onChange={(e) => toggle(subs.map((s) => s.id), e.target.checked)} />
                {providerName(reg, pid)}
              </label>
              {subs.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg py-1 pr-2 pl-7 text-sm hover:bg-ivory">
                  <input type="checkbox" checked={isOn(s.id)} onChange={(e) => toggle([s.id], e.target.checked)} />
                  <span className="flex-1 truncate">{s.name}</span>
                  {s.status !== 'active' && <Pill>{s.status}</Pill>}
                </label>
              ))}
            </div>
          ))}
          <div className="mt-1 border-t border-line pt-1">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ivory" title="Usage mesuré (Claude Code, Codex) qui ne correspond à aucun abonnement enregistré">
              <input type="checkbox" checked={isOn(UNASSIGNED)} onChange={(e) => toggle([UNASSIGNED], e.target.checked)} />
              <span className="flex-1">Usage non rattaché</span>
              <span className="font-mono text-[11px] text-muted">{unassignedCount}</span>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- page ----------
type Tab = 'costs' | 'overview' | 'subscriptions' | 'projects' | 'history' | 'acu' | 'registry' | 'pricing'

export function UsagePage({ tab }: { tab?: string }) {
  const m = useModel()
  const { usage, usageLoading, refreshUsage, go } = useApp()
  const [active, setActive] = useState<Tab>(((tab === 'runs' ? 'history' : tab) as Tab) || 'costs')
  const [period, setPeriod] = useState<Period>({ preset: 'month' })
  const [selected, setSelected] = useState<string[] | null>(null)
  const [mode, setMode] = useState<AcuMode>('historical')
  const a = useAllocation(period, selected, mode)
  const reg = m.registry
  const base = reg.settings.baseCurrency
  const currentAcu = reg.acu[reg.acu.length - 1]

  const projectsActive = new Set(a.filteredRecords.map((r) => r.projectKey).filter(Boolean)).size
  const activeProviders = reg.providers.filter((p) => p.status === 'active').length
  const activeSubs = reg.subscriptions.filter((s) => s.status === 'active').length
  const unassignedAcu = a.unassigned.reduce((s, r) => s + (r.acu ?? 0), 0)

  const exportCsv = async () => {
    const rows: string[][] = [['Période', 'Abonnement', 'Fournisseur', 'Projet', 'ACU', 'Part du pool', 'Dépense allouée', 'Devise', 'Requêtes', 'Méthodes', 'Confiance']]
    for (const r of a.results) {
      for (const p of r.projects)
        rows.push([a.months.join(' '), r.sub.name, providerName(reg, r.sub.provider), projectLabel(m, p.projectKey), p.acu.toFixed(2), (p.pct * 100).toFixed(2) + '%', p.allocated.toFixed(2), base, String(p.requests), p.methods.join('+'), p.confidence])
      rows.push([a.months.join(' '), r.sub.name, providerName(reg, r.sub.provider), 'NON ALLOUÉ', r.unallocatedAcu.toFixed(2), '', r.unallocated.toFixed(2), base, '', '', ''])
    }
    rows.push([])
    rows.push(['Historique', 'Date', 'Outil', 'Abonnement', 'Modèles', 'Agent', 'Projet', 'Entrée', 'Sortie', 'Cache', 'Requêtes', 'ACU', 'Formule', 'Méthode', 'Confiance'])
    for (const r of a.filteredRecords)
      rows.push([
        '',
        r.date,
        r.tool,
        r.subscriptionId ?? '',
        r.models.join(' '),
        r.agent,
        r.projectKey ?? '',
        r.tokens ? String(r.tokens.input + r.tokens.cacheWrite5m + r.tokens.cacheWrite1h) : '',
        r.tokens ? String(r.tokens.output) : '',
        r.tokens ? String(r.tokens.cacheRead) : '',
        String(r.requests),
        r.acu === null ? 'indisponible' : r.acu.toFixed(2),
        `v${r.acuVersion}`,
        r.method,
        r.confidence,
      ])
    const csv = rows.map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
    await api().saveReport(`wakil-usage-${a.range.from ?? 'debut'}_${a.range.to ?? 'aujourdhui'}.csv`, csv)
  }

  return (
    <Page wide>
      <PageTitle
        kicker="Écosystème IA"
        title="Usage & crédits"
        sub="Consommation IA (ACU) par abonnement et par projet, et répartition des dépenses réelles de chaque abonnement"
        right={
          <>
            <Button onClick={exportCsv} title="Exporter le rapport (CSV)">
              <Download className="size-4" /> Exporter
            </Button>
            <Button onClick={refreshUsage}>
              <RefreshCw className={`size-4 ${usageLoading ? 'animate-spin' : ''}`} /> Actualiser
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-paper p-2.5">
        <PeriodFilter value={period} onChange={setPeriod} />
        <SubscriptionFilter reg={reg} selected={selected} onChange={setSelected} unassignedCount={a.records.filter((r) => !r.subscriptionId && a.months.includes(r.month)).length} />
        <div className="ml-auto flex items-center gap-1.5 text-xs">
          <span className="text-slate">Formule ACU</span>
          <Chip active={mode === 'historical'} onClick={() => setMode('historical')}>
            en vigueur à la date
          </Chip>
          <Chip active={mode === 'current'} onClick={() => setMode('current')}>
            recalcul v{currentAcu.version}
          </Chip>
          <Tip text="« En vigueur à la date » utilise la version de la formule active au moment de chaque requête. « Recalcul » applique la version actuelle à tout l’historique. Les données brutes ne sont jamais modifiées." />
        </div>
      </div>

      {m.registryError && <p className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{m.registryError}</p>}
      {!reg.subscriptions.length && <RegistryOnboarding />}

      <Tabs
        tabs={[
          { id: 'costs', label: 'Coûts par crédit' },
          { id: 'overview', label: 'Vue d’ensemble' },
          { id: 'subscriptions', label: 'Abonnements', count: a.results.length },
          { id: 'projects', label: 'Projets' },
          { id: 'history', label: 'Historique', count: a.filteredRecords.length },
          { id: 'acu', label: 'ACU & méthode' },
          { id: 'registry', label: 'Registre', count: reg.log.length },
          { id: 'pricing', label: 'Tarifs API' },
        ]}
        active={active}
        onChange={setActive}
      />

      {!usage && usageLoading && <Empty title="Lecture des historiques Claude Code et Codex…" />}

      {active === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Kpi
              icon={<CircleDollarSign className="size-3.5" />}
              label="Dépenses des abonnements"
              value={fmtMoney(a.totals.expense, base)}
              sub={
                <span className="flex items-center gap-1.5">
                  <Certainty estimated={a.totals.expenseEstimated} />
                  {a.totals.fxMissing && <span className="text-warn">taux de change manquant</span>}
                </span>
              }
            />
            <Kpi icon={<Sigma className="size-3.5" />} label="Consommation (ACU)" value={fmtAcu(a.totals.acu + unassignedAcu)} sub={unassignedAcu ? `dont ${fmtAcu(unassignedAcu)} non rattachés` : 'unités de consommation IA'} />
            <Kpi icon={<Gauge className="size-3.5" />} label="Requêtes IA" value={(a.totals.requests + a.unassigned.reduce((s, r) => s + r.requests, 0)).toLocaleString('fr-FR')} />
            <Kpi icon={<PieChart className="size-3.5" />} label="Dépenses allouées" value={fmtMoney(a.totals.allocated, base)} sub={`non allouées : ${fmtMoney(a.totals.unallocated, base)}`} />
            <Kpi
              icon={<CircleDollarSign className="size-3.5" />}
              label="Frais variables réels"
              value={a.totals.variableActual === null ? '—' : fmtMoney(a.totals.variableActual, base)}
              sub={
                a.totals.variableEstimated ? (
                  <span>
                    + {fmtMoney(a.totals.variableEstimated, base)} <Certainty estimated />
                  </span>
                ) : (
                  'aucune estimation'
                )
              }
            />
            <Kpi icon={<Building2 className="size-3.5" />} label="Fournisseurs actifs" value={activeProviders} />
            <Kpi icon={<Layers className="size-3.5" />} label="Abonnements actifs" value={activeSubs} />
            <Kpi icon={<Users className="size-3.5" />} label="Projets actifs" value={projectsActive} />
            <Kpi
              icon={<History className="size-3.5" />}
              label="Période"
              value={<span className="text-lg first-letter:uppercase">{periodLabel(period)}</span>}
              sub={`${a.months.length} mois · formule ${mode === 'current' ? `v${currentAcu.version} (recalcul)` : 'historique'}`}
            />
          </div>

          {a.prorated && (
            <p className="text-xs text-slate">
              Période plus courte qu’un mois : les frais mensuels (abonnement fixe, factures) sont comptés au prorata des jours couverts ; la consommation (ACU) est celle de la période.
            </p>
          )}
          {a.results.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {a.results.map((r) => (
                <SubscriptionCard key={r.sub.id} r={r} base={base} onOpen={() => setActive('subscriptions')} />
              ))}
            </div>
          )}
          {a.unassigned.length > 0 && <UnassignedCard records={a.unassigned} />}

          <Analytics a={a} base={base} />
        </div>
      )}
      {active === 'costs' && <CostsTab a={a} base={base} />}
      {active === 'subscriptions' && <SubscriptionsTab results={a.results} base={base} months={a.months} />}
      {active === 'projects' && <ProjectsTab results={a.results} unassigned={a.unassigned} base={base} />}
      {active === 'history' && <HistoryTab records={a.filteredRecords} />}
      {active === 'acu' && <AcuTab mode={mode} />}
      {active === 'registry' && <RegistryTab />}
      {active === 'pricing' && <PricingTab />}

      {usage && (
        <p className="mt-6 text-xs text-slate">
          Sources mesurées :{' '}
          {(usage.raw.sources ?? []).map((s) => (
            <span key={s.tool} className="mr-3">
              {TOOL_META[s.tool]?.label}{' '}
              {s.found ? '✓' : s.tool === 'cursor' ? '— pas d’historique local (usage via /wakil.usage record ou plan-usage)' : '— aucune session dans ce dossier'}
            </span>
          ))}
          · lu {timeAgo(usage.raw.readAt)}
        </p>
      )}
      <p className="mt-1 text-xs text-muted">
        Configuration depuis les chats :{' '}
        <button className="underline" onClick={() => go({ page: 'commands', name: 'wakil.subscription' })}>
          /wakil.subscription
        </button>{' '}
        ·{' '}
        <button className="underline" onClick={() => go({ page: 'commands', name: 'wakil.provider' })}>
          /wakil.provider
        </button>{' '}
        ·{' '}
        <button className="underline" onClick={() => go({ page: 'commands', name: 'wakil.billing-period' })}>
          /wakil.billing-period
        </button>{' '}
        ·{' '}
        <button className="underline" onClick={() => go({ page: 'commands', name: 'wakil.credits' })}>
          /wakil.credits
        </button>{' '}
        ·{' '}
        <button className="underline" onClick={() => go({ page: 'commands', name: 'wakil.usage' })}>
          /wakil.usage
        </button>
      </p>
    </Page>
  )
}

function RegistryOnboarding() {
  return (
    <Card className="mb-5 border-terra/40 p-5">
      <p className="text-sm font-semibold">Aucun abonnement enregistré</p>
      <p className="mt-1 text-sm text-slate">
        Les fournisseurs et abonnements se configurent depuis vos chats (Claude Code, Cursor ou Codex), pas dans l’application. Tant qu’aucun abonnement n’existe, l’usage mesuré
        apparaît comme « non rattaché » et aucune dépense n’est répartie.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <CommandHint command="/wakil.subscription add Claude Pro $20/month, Anthropic, usage from Claude Code" />
        <CommandHint command="/wakil.subscription add Codex, OpenAI, $20/month, usage from Codex" />
        <CommandHint command="/wakil.subscription add Cursor Pro, Cursor, $20/month, budget $50, usage reported manually" />
      </div>
      <p className="mt-2 text-xs text-muted">Dans Cursor : /wakil-subscription … · dans Codex : $wakil-subscription …</p>
    </Card>
  )
}

// ---------- cards ----------
function SubscriptionCard({ r, base, onOpen }: { r: SubResult; base: string; onOpen: () => void }) {
  const m = useModel()
  const reg = m.registry
  const last = r.months[r.months.length - 1]
  const trend = r.months.map((mm) => r.records.filter((x) => x.month === mm.month).reduce((s, x) => s + (x.acu ?? 0), 0))
  const maxT = Math.max(...trend, 0.0001)
  const conf = r.records.some((x) => x.confidence === 'low') ? 'faible' : r.records.some((x) => x.confidence === 'medium') ? 'moyenne' : r.records.length ? 'élevée' : '—'
  const statusText = { ok: 'Répartition complète', provisional: 'Répartition provisoire', 'no-consumption': 'Aucune consommation mesurée', unavailable: 'Télémétrie indisponible' }[r.allocationStatus]
  const used = r.budget !== null ? r.budget - (r.remainingBudget ?? r.budget) : 0
  return (
    <button onClick={onOpen} className="flex flex-col rounded-xl border border-line bg-paper p-4 text-left transition-colors hover:border-slate">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-slate uppercase">{providerName(reg, r.sub.provider)}</p>
          <p className="truncate font-semibold">{r.sub.name}</p>
        </div>
        <Pill tone={r.sub.status === 'active' ? 'ok' : 'neutral'}>{r.sub.status}</Pill>
      </div>
      <p className="mt-1 text-xs text-slate">{BILLING_LABEL[last?.billing ?? 'fixed']}</p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight">{fmtMoney(r.expense, base)}</span>
        <Certainty estimated={r.expenseEstimated} />
      </div>
      <p className="text-[11px] text-muted">
        {r.fixed ? `fixe ${fmtMoney(r.fixed, r.sub.currency)}` : ''}
        {r.variableActual !== null ? ` · variable réel ${fmtMoney(r.variableActual, r.sub.currency)}` : ''}
        {r.variableEstimated ? ` · variable estimé ${fmtMoney(r.variableEstimated, r.sub.currency)}` : ''}
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted">ACU</dt>
          <dd className="font-mono font-semibold">{fmtAcu(r.acu)}</dd>
        </div>
        <div>
          <dt className="text-muted">Requêtes</dt>
          <dd className="font-mono font-semibold">{r.requests.toLocaleString('fr-FR')}</dd>
        </div>
        <div>
          <dt className="text-muted">Projets</dt>
          <dd className="font-mono font-semibold">{r.projects.length}</dd>
        </div>
        <div>
          <dt className="text-muted">Alloué</dt>
          <dd className="font-mono font-semibold">{fmtMoney(r.allocated, base)}</dd>
        </div>
        <div>
          <dt className="text-muted">Non alloué</dt>
          <dd className="font-mono font-semibold">{fmtMoney(r.unallocated, base)}</dd>
        </div>
        <div>
          <dt className="text-muted">Confiance</dt>
          <dd className="font-semibold">{conf}</dd>
        </div>
      </dl>
      {r.budget !== null && (
        <div className="mt-3">
          <div className="flex justify-between gap-2 text-[11px]">
            <span className="text-slate">
              Budget {fmtMoney(r.budget, r.sub.currency)}/mois {last?.budgetIsEstimate && <Certainty estimated title="Dépenses variables estimées : le reste du budget est indicatif" />}
            </span>
            <span className="font-mono">reste {fmtMoney(r.remainingBudget, r.sub.currency)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
            <div className={`h-full rounded-full ${r.remainingBudget !== null && r.remainingBudget < 0 ? 'bg-danger' : 'bg-terra'}`} style={{ width: `${Math.min(100, (used / Math.max(r.budget, 0.0001)) * 100)}%` }} />
          </div>
        </div>
      )}
      {trend.length > 1 && (
        <div className="mt-3 flex h-8 items-end gap-0.5" title="Tendance ACU par mois">
          {trend.map((v, i) => (
            <span key={i} className="flex-1 rounded-sm bg-ink/20" style={{ height: `${Math.max(v ? 8 : 0, (v / maxT) * 100)}%` }} />
          ))}
        </div>
      )}
      <p className={`mt-3 text-[11px] font-semibold ${r.allocationStatus === 'ok' ? 'text-ok' : 'text-warn'}`}>
        {statusText}
        {r.unmeasuredRecords ? ` · ${r.unmeasuredRecords} enregistrement(s) sans télémétrie` : ''}
      </p>
    </button>
  )
}

function UnassignedCard({ records }: { records: UsageRecord[] }) {
  const acu = records.reduce((s, r) => s + (r.acu ?? 0), 0)
  const tools = [...new Set(records.map((r) => r.tool))]
  return (
    <Card className="border-dashed p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold">Usage non rattaché à un abonnement</p>
          <p className="text-xs text-slate">
            {records.length} interactions · {fmtAcu(acu)} ACU ·{' '}
            {tools.map((t) => (
              <ToolBadge key={t} tool={t} />
            ))}{' '}
            – aucun abonnement enregistré ne couvre cet outil ou ce modèle, donc aucune dépense ne lui est répartie.
          </p>
        </div>
        <CommandHint command="/wakil.subscription add …" />
      </div>
    </Card>
  )
}

// ---------- analytics ----------
type Bar = { key: string; label: string; value: number; sub?: string; estimated?: boolean }
function BarList({ rows, fmt, empty = 'Aucune donnée pour ces filtres.' }: { rows: Bar[]; fmt: (v: number) => string; empty?: string }) {
  if (!rows.length) return <p className="text-sm text-slate">{empty}</p>
  const max = Math.max(...rows.map((r) => r.value), 0.0001)
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{r.label}</span>
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs font-semibold">
              {fmt(r.value)}
              {r.estimated && <Certainty estimated />}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
            <div className={`h-full rounded-full ${r.estimated ? 'bg-terra/50' : 'bg-terra'}`} style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
          {r.sub && <p className="mt-0.5 text-[11px] text-muted">{r.sub}</p>}
        </li>
      ))}
    </ul>
  )
}

function group<T>(items: T[], key: (x: T) => string, val: (x: T) => number) {
  const map = new Map<string, number>()
  for (const it of items) map.set(key(it), (map.get(key(it)) ?? 0) + val(it))
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}

function Analytics({ a, base }: { a: ReturnType<typeof useAllocation>; base: string }) {
  const m = useModel()
  const reg = m.registry
  const recs = a.filteredRecords
  const byProject = group(recs, (r) => r.projectKey ?? '—', (r) => r.acu ?? 0).map(([k, v]) => ({ key: k, label: k === '—' ? 'Non attribué' : projectLabel(m, k), value: v }))
  const byProvider = group(recs, (r) => r.providerId ?? `tool:${r.tool}`, (r) => r.acu ?? 0).map(([k, v]) => ({
    key: k,
    label: k.startsWith('tool:') ? `${TOOL_META[k.slice(5)]?.label ?? k.slice(5)} (fournisseur non enregistré)` : providerName(reg, k),
    value: v,
  }))
  const bySub = a.results
    .map((r) => ({ key: r.sub.id, label: r.sub.name, value: r.acu }))
    .concat(a.unassigned.length ? [{ key: UNASSIGNED, label: 'Non rattaché', value: a.unassigned.reduce((s, r) => s + (r.acu ?? 0), 0) }] : [])
    .sort((x, y) => y.value - x.value)
  const expenseDist = a.results.map((r) => ({ key: r.sub.id, label: `${r.sub.name} · ${providerName(reg, r.sub.provider)}`, value: r.expense, estimated: r.expenseEstimated })).sort((x, y) => y.value - x.value)
  const projectExpense = new Map<string, { total: number; parts: string[]; est: boolean }>()
  for (const r of a.results)
    for (const p of r.projects) {
      const cur = projectExpense.get(p.projectKey) ?? { total: 0, parts: [], est: false }
      cur.total += p.allocated
      cur.parts.push(`${r.sub.name} ${pct(p.pct)} → ${fmtMoney(p.allocated, base)}`)
      cur.est = cur.est || r.provisional
      projectExpense.set(p.projectKey, cur)
    }
  const projAlloc = [...projectExpense.entries()].map(([k, v]) => ({ key: k, label: projectLabel(m, k), value: v.total, sub: v.parts.join(' · '), estimated: v.est })).sort((x, y) => y.value - x.value)
  const trend = a.months.slice(-12).map((mm) => ({
    month: mm,
    acu: recs.filter((r) => r.month === mm).reduce((s, r) => s + (r.acu ?? 0), 0),
    expense: a.results.reduce((s, r) => s + (r.months.find((x) => x.month === mm)?.expense ?? 0), 0),
  }))
  const maxAcu = Math.max(...trend.map((t) => t.acu), 0.0001)
  const providers = [...new Set(a.results.map((r) => r.sub.provider))]
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Consommation par projet (ACU)" />
        <div className="px-5 pb-5">
          <BarList rows={byProject} fmt={fmtAcu} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Répartition des dépenses par projet" sub="Part de chaque abonnement allouée au projet (pools indépendants)" />
        <div className="px-5 pb-5">
          <BarList rows={projAlloc} fmt={(v) => fmtMoney(v, base)} empty="Aucune dépense allouée (aucun abonnement ou aucune consommation rattachée)." />
        </div>
      </Card>
      <Card>
        <CardHeader title="Consommation par abonnement (ACU)" />
        <div className="px-5 pb-5">
          <BarList rows={bySub} fmt={fmtAcu} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Répartition des dépenses d’abonnement" />
        <div className="px-5 pb-5">
          <BarList rows={expenseDist} fmt={(v) => fmtMoney(v, base)} empty="Aucun abonnement dans la sélection." />
        </div>
      </Card>
      <Card>
        <CardHeader title="Consommation par fournisseur (ACU)" />
        <div className="px-5 pb-5">
          <BarList rows={byProvider} fmt={fmtAcu} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Tendance mensuelle" sub="ACU (barres) et dépenses d’abonnement (survol)" />
        <div className="px-5 pb-5">
          {trend.length < 2 ? (
            <p className="text-sm text-slate">Choisissez « Toute la période » pour voir l’évolution mois par mois.</p>
          ) : (
            <div className="flex h-40 items-end gap-2">
              {trend.map((t) => (
                <div key={t.month} className="group relative flex flex-1 flex-col items-center justify-end">
                  <div className="w-full rounded-t-sm bg-terra/80" style={{ height: `${Math.max(t.acu ? 3 : 0, (t.acu / maxAcu) * 120)}px` }} />
                  <span className="mt-1 text-[10px] text-muted">
                    {t.month.slice(5)}/{t.month.slice(2, 4)}
                  </span>
                  <span className="pointer-events-none absolute bottom-full mb-1 hidden rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-ivory group-hover:block">
                    {fmtAcu(t.acu)} ACU · {fmtMoney(t.expense, base)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
      {providers.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader title="Comparaison des fournisseurs" />
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate">
              <tr className="border-y border-line bg-ivory">
                <th className="px-5 py-2 font-medium">Fournisseur</th>
                <th className="px-3 py-2 font-medium">Abonnements</th>
                <th className="px-3 py-2 text-right font-medium">ACU</th>
                <th className="px-3 py-2 text-right font-medium">Requêtes</th>
                <th className="px-3 py-2 text-right font-medium">Dépenses</th>
                <th className="px-5 py-2 text-right font-medium">Coût / 1 000 ACU</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {providers.map((pid) => {
                const rs = a.results.filter((r) => r.sub.provider === pid)
                const acu = rs.reduce((s, r) => s + r.acu, 0)
                const exp = rs.reduce((s, r) => s + r.expense, 0)
                return (
                  <tr key={pid}>
                    <td className="px-5 py-2.5 font-semibold">{providerName(reg, pid)}</td>
                    <td className="px-3 py-2.5 text-slate">{rs.map((r) => r.sub.name).join(', ')}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtAcu(acu)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{rs.reduce((s, r) => s + r.requests, 0).toLocaleString('fr-FR')}</td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {fmtMoney(exp, base)} {rs.some((r) => r.expenseEstimated) && <Certainty estimated />}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono">{acu ? fmtMoney((exp / acu) * 1000, base) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ---------- subscriptions tab ----------
function SubscriptionsTab({ results, base, months }: { results: SubResult[]; base: string; months: string[] }) {
  const m = useModel()
  if (!results.length) return <Empty title="Aucun abonnement dans la sélection" />
  return (
    <div className="space-y-6">
      {results.map((r) => (
        <Card key={r.sub.id}>
          <CardHeader
            title={`${r.sub.name} · ${providerName(m.registry, r.sub.provider)}`}
            sub={`${BILLING_LABEL[r.months.at(-1)?.billing ?? 'fixed']} · ${r.sub.usageSources.map((s) => `${s.tool}${s.models.length ? ` (${s.models.join(', ')})` : ''}`).join(', ') || 'aucune source d’usage'} · mesure : ${METHOD_LABEL[r.sub.measurement] ?? r.sub.measurement}`}
            right={<Pill tone={r.sub.status === 'active' ? 'ok' : 'neutral'}>{r.sub.status}</Pill>}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate">
                <tr className="border-y border-line bg-ivory">
                  <th className="px-5 py-2 font-medium">Mois</th>
                  <th className="px-3 py-2 font-medium">Facturation</th>
                  <th className="px-3 py-2 text-right font-medium">Fixe</th>
                  <th className="px-3 py-2 text-right font-medium">Variable réel</th>
                  <th className="px-3 py-2 text-right font-medium">Variable estimé</th>
                  <th className="px-3 py-2 text-right font-medium">Dépense</th>
                  <th className="px-3 py-2 text-right font-medium">Budget / reste</th>
                  <th className="px-5 py-2 text-right font-medium">ACU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.months.map((x) => (
                  <tr key={x.month}>
                    <td className="px-5 py-2">{monthLabel(x.month)}</td>
                    <td className="px-3 py-2 text-xs text-slate">{BILLING_LABEL[x.billing]}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {x.fixed ? fmtMoney(x.fixed, x.currency) : '—'}{' '}
                      {x.fixedSource === 'configured' && (
                        <span className="text-[10px] text-muted" title="Prix configuré en vigueur ce mois-là">
                          prix
                        </span>
                      )}
                      {x.fixedSource === 'recorded' && (
                        <span className="text-[10px] text-muted" title="Dépense enregistrée (facture)">
                          facture
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{x.variableActual === null ? '—' : fmtMoney(x.variableActual, x.currency)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {x.variableActual === null && x.variableEstimated ? (
                        <>
                          {fmtMoney(x.variableEstimated, x.currency)} <Certainty estimated />
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold">
                      {fmtMoney(x.expense, x.currency)} <Certainty estimated={x.status === 'provisional'} />
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{x.budget === null ? '—' : `${fmtMoney(x.budget, x.currency)} / ${fmtMoney(x.remainingBudget, x.currency)}`}</td>
                    <td className="px-5 py-2 text-right font-mono text-xs">{fmtAcu(r.records.filter((y) => y.month === x.month).reduce((s, y) => s + (y.acu ?? 0), 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold text-slate uppercase">Pool ACU de cet abonnement – {months.length > 1 ? 'période' : monthLabel(months[0])}</p>
              <BarList
                rows={[
                  ...r.projects.map((p) => ({ key: p.projectKey, label: projectLabel(m, p.projectKey), value: p.allocated, sub: `${fmtAcu(p.acu)} ACU · ${pct(p.pct)} du pool · ${p.requests} requêtes` })),
                  ...(r.unallocated ? [{ key: '—', label: 'Non alloué', value: r.unallocated, sub: `${fmtAcu(r.unallocatedAcu)} ACU sans projet, ou mois sans consommation mesurée` }] : []),
                ]}
                fmt={(v) => fmtMoney(v, base)}
                empty="Aucune consommation mesurée pour cet abonnement."
              />
              <p className="mt-3 text-[11px] text-muted">
                Contrôle : alloué {fmtMoney(r.allocated, base)} + non alloué {fmtMoney(r.unallocated, base)} = {fmtMoney(r.allocated + r.unallocated, base)} (dépense {fmtMoney(r.expense, base)})
              </p>
            </div>
            <div className="space-y-3 text-sm">
              <SubFacts s={r.sub} />
              {r.planUsage.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate uppercase">Usage au niveau de l’abonnement (mode 3)</p>
                  <ul className="space-y-1 text-xs">
                    {r.planUsage.map((p, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span>
                          {p.date} · {p.metric}
                        </span>
                        <span className="font-mono">
                          {p.value}
                          {p.limit !== null ? ` / ${p.limit}` : ''}{' '}
                          <span className="text-muted">
                            ({p.source}, confiance {p.confidence})
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] text-muted">Indicateur du fournisseur, non converti en ACU (métrique différente, non comparable).</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

function SubFacts({ s }: { s: Subscription }) {
  const today = new Date().toISOString().slice(0, 10)
  const price = inEffect(s.prices, today)
  const per = (f: string, months?: number) => (f === 'custom' ? `${months} mois` : f === 'yearly' ? 'an' : 'mois')
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
      <div>
        <dt className="text-muted">Prix actuel</dt>
        <dd className="font-semibold">
          {price ? `${fmtMoney(price.amount, price.currency)} / ${per(price.frequency, price.months)}` : '—'}
          {price && price.frequency !== 'monthly' ? ` (≈ ${fmtMoney(monthlyAmount(price), price.currency)}/mois)` : ''}
        </dd>
      </div>
      <div>
        <dt className="text-muted">Devise</dt>
        <dd>{s.currency}</dd>
      </div>
      <div>
        <dt className="text-muted">Début</dt>
        <dd>{s.startDate || '—'}</dd>
      </div>
      <div>
        <dt className="text-muted">Renouvellement</dt>
        <dd>{s.renewalDate || '—'}</dd>
      </div>
      <div className="col-span-2">
        <dt className="text-muted">Historique des prix</dt>
        <dd>{s.prices.map((p) => `${p.from} : ${fmtMoney(p.amount, p.currency)}/${per(p.frequency, p.months)}`).join(' → ') || '—'}</dd>
      </div>
      <div className="col-span-2">
        <dt className="text-muted">Historique du modèle de facturation</dt>
        <dd>{s.billing.map((b) => `${b.from} : ${BILLING_LABEL[b.model]}`).join(' → ')}</dd>
      </div>
      {s.budgets.length > 0 && (
        <div className="col-span-2">
          <dt className="text-muted">Budgets (limites, pas des dépenses)</dt>
          <dd>{s.budgets.map((b) => `${b.from} : ${b.monthly === null ? 'aucun' : fmtMoney(b.monthly, b.currency)}`).join(' → ')}</dd>
        </div>
      )}
      {s.expenses.length > 0 && (
        <div className="col-span-2">
          <dt className="text-muted">Dépenses enregistrées</dt>
          <dd>{s.expenses.map((e) => `${e.period} ${e.kind} ${fmtMoney(e.amount, e.currency)} (${e.status}, ${e.source})`).join(' · ')}</dd>
        </div>
      )}
      {s.notes && (
        <div className="col-span-2">
          <dt className="text-muted">Notes</dt>
          <dd>{s.notes}</dd>
        </div>
      )}
    </dl>
  )
}

// ---------- projects tab ----------
function ProjectsTab({ results, unassigned, base }: { results: SubResult[]; unassigned: UsageRecord[]; base: string }) {
  const m = useModel()
  const [by, setBy] = useState<'project' | 'subscription'>('project')
  const rows = results.flatMap((r) => r.projects.map((p) => ({ ...p, r })))
  if (!rows.length && !unassigned.length) return <Empty title="Aucune consommation de projet pour ces filtres" />
  const keyOf = (x: (typeof rows)[number]) => (by === 'project' ? x.projectKey : x.subscriptionId)
  const groups = new Map<string, typeof rows>()
  for (const x of rows) groups.set(keyOf(x), [...(groups.get(keyOf(x)) ?? []), x])
  const ordered = [...groups.entries()].sort((a, b) => b[1].reduce((s, x) => s + x.allocated, 0) - a[1].reduce((s, x) => s + x.allocated, 0))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate">Grouper par</span>
        <Chip active={by === 'project'} onClick={() => setBy('project')}>
          Projet
        </Chip>
        <Chip active={by === 'subscription'} onClick={() => setBy('subscription')}>
          Abonnement
        </Chip>
        <span className="ml-auto flex items-center gap-1 text-xs text-slate">
          <Tip text="Part = ACU du projet / ACU total de l’abonnement (pool indépendant). Dépense allouée = part × dépense réelle de l’abonnement, mois par mois." /> Part calculée dans chaque abonnement séparément
        </span>
      </div>
      {rows.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate">
                <tr className="border-b border-line bg-ivory">
                  <th className="px-5 py-2 font-medium">{by === 'project' ? 'Projet' : 'Abonnement'}</th>
                  <th className="px-3 py-2 font-medium">{by === 'project' ? 'Abonnement' : 'Projet'}</th>
                  <th className="px-3 py-2 font-medium">Fournisseur</th>
                  <th className="px-3 py-2 text-right font-medium">ACU</th>
                  <th className="px-3 py-2 text-right font-medium">Part</th>
                  <th className="px-3 py-2 text-right font-medium">Dépense allouée</th>
                  <th className="px-3 py-2 text-right font-medium">Requêtes</th>
                  <th className="px-3 py-2 font-medium">Mesure</th>
                  <th className="px-5 py-2 font-medium">Confiance</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map(([k, list]) => (
                  <React.Fragment key={k}>
                    <tr className="border-t border-line">
                      <td className="px-5 py-2.5 font-semibold" colSpan={3}>
                        {by === 'project' ? projectLabel(m, k) : list[0].r.sub.name}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmtAcu(list.reduce((s, x) => s + x.acu, 0))}</td>
                      <td />
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmtMoney(list.reduce((s, x) => s + x.allocated, 0), base)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{list.reduce((s, x) => s + x.requests, 0)}</td>
                      <td colSpan={2} />
                    </tr>
                    {list.map((x) => (
                      <tr key={x.subscriptionId + x.projectKey} className="text-slate">
                        <td className="px-5 py-1.5" />
                        <td className="px-3 py-1.5">{by === 'project' ? x.r.sub.name : projectLabel(m, x.projectKey)}</td>
                        <td className="px-3 py-1.5">{providerName(m.registry, x.r.sub.provider)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs">{fmtAcu(x.acu)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs">{pct(x.pct)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs">
                          {fmtMoney(x.allocated, base)} {x.r.provisional && <Certainty estimated title="Répartition provisoire : dépense ou consommation estimée" />}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs">{x.requests}</td>
                        <td className="px-3 py-1.5 text-xs">{x.methods.map((mm) => METHOD_LABEL[mm]).join(' + ')}</td>
                        <td className="px-5 py-1.5 text-xs">{x.confidence}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {unassigned.length > 0 && (
        <p className="text-xs text-slate">
          + {unassigned.length} interactions ({fmtAcu(unassigned.reduce((s, r) => s + (r.acu ?? 0), 0))} ACU) non rattachées à un abonnement : leur consommation est visible dans l’historique mais aucune
          dépense ne leur est allouée.
        </p>
      )}
    </div>
  )
}

// ---------- history tab ----------
function HistoryTab({ records }: { records: UsageRecord[] }) {
  const m = useModel()
  const [open, setOpen] = useState<string | null>(null)
  const [limit, setLimit] = useState(100)
  if (!records.length) return <Empty title="Aucune interaction pour ces filtres" />
  const list = records.slice(0, limit)
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-slate">
            <tr className="border-b border-line bg-ivory">
              <th className="w-5 py-2 pl-3" />
              <th className="px-2 py-2 font-medium">Date</th>
              <th className="px-2 py-2 font-medium">Outil / abonnement</th>
              <th className="px-2 py-2 font-medium">Modèle</th>
              <th className="px-2 py-2 font-medium">Agent</th>
              <th className="px-2 py-2 font-medium">Projet / tâche</th>
              <th className="px-2 py-2 text-right font-medium">Entrée</th>
              <th className="px-2 py-2 text-right font-medium">Sortie</th>
              <th className="px-2 py-2 text-right font-medium">Cache</th>
              <th className="px-2 py-2 text-right font-medium" title="Contexte maximal d’une requête / fenêtre de contexte (si connue)">
                Contexte
              </th>
              <th className="px-2 py-2 text-right font-medium">Durée</th>
              <th className="px-2 py-2 text-right font-medium">Req.</th>
              <th className="px-2 py-2 text-right font-medium">ACU</th>
              <th className="px-3 py-2 font-medium">Mesure</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((r) => {
              const t = r.tokens
              const isOpen = open === r.id
              const sub = m.registry.subscriptions.find((s) => s.id === r.subscriptionId)
              return (
                <React.Fragment key={r.id}>
                  <tr className="cursor-pointer hover:bg-ivory" onClick={() => setOpen(isOpen ? null : r.id)}>
                    <td className="py-2 pl-3 text-slate">{isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-1">
                        <ToolBadge tool={r.tool} /> <span className="truncate">{sub?.name ?? 'non rattaché'}</span>
                      </span>
                    </td>
                    <td className="max-w-[120px] truncate px-2 py-2 font-mono">{r.models.join(', ') || '—'}</td>
                    <td className="px-2 py-2">
                      {r.kind === 'run' ? (
                        <span className="flex items-center gap-1">
                          <Bot className="size-3 text-terra-strong" />
                          {r.agent}
                        </span>
                      ) : (
                        r.agent
                      )}
                    </td>
                    <td className="max-w-[200px] truncate px-2 py-2">
                      {r.projectKey ? projectLabel(m, r.projectKey) : <span className="text-muted">non attribué</span>}
                      {r.taskKey ? ` · ${r.taskKey.split('/').pop()}` : ''}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{t ? fmtTokens(t.input + t.cacheWrite5m + t.cacheWrite1h) : '—'}</td>
                    <td className="px-2 py-2 text-right font-mono">{t ? fmtTokens(t.output) : '—'}</td>
                    <td className="px-2 py-2 text-right font-mono">{t ? fmtTokens(t.cacheRead) : '—'}</td>
                    <td className="px-2 py-2 text-right font-mono">{r.contextPct !== null ? pct(r.contextPct) : t?.peak ? fmtTokens(t.peak) : '—'}</td>
                    <td className="px-2 py-2 text-right font-mono">{r.durationMs !== null ? `${Math.max(1, Math.round(r.durationMs / 60000))} min` : '—'}</td>
                    <td className="px-2 py-2 text-right font-mono">{r.requests}</td>
                    <td className="px-2 py-2 text-right font-mono font-semibold">
                      {r.acu === null ? (
                        <span className="text-muted" title="Télémétrie indisponible – non comptée comme 0">
                          indispo.
                        </span>
                      ) : (
                        fmtAcu(r.acu)
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Pill tone={r.method === 'exact' ? 'ok' : 'warn'}>{METHOD_LABEL[r.method]}</Pill>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td />
                      <td colSpan={13} className="px-2 pt-1 pb-4">
                        <RecordDetail r={r} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {records.length > limit && (
        <button onClick={() => setLimit((l) => l + 200)} className="m-4 text-xs font-semibold text-terra-strong hover:underline">
          Afficher plus ({records.length - limit} restantes)
        </button>
      )}
    </Card>
  )
}

function RecordDetail({ r }: { r: UsageRecord }) {
  const m = useModel()
  const cfg = m.registry.acu.find((v) => v.version === r.acuVersion) ?? m.registry.acu[0]
  const byModel = r.kind !== 'manual' ? ((r.ref as { byModel: ByModel }).byModel ?? null) : null
  const calc = byModel ? acuFromTokens(byModel, cfg) : null
  const text = r.kind === 'manual' ? JSON.stringify(r.ref, null, 2) : String((r.ref as { prompt?: string }).prompt ?? '')
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="max-h-64 overflow-y-auto p-4">
        <p className="mb-2 text-[11px] font-semibold text-muted uppercase">{r.kind === 'run' ? 'Brief envoyé à l’agent' : r.kind === 'turn' ? 'Demande' : 'Enregistrement déclaré en chat'}</p>
        {r.kind === 'manual' ? <pre className="font-mono text-[11px] whitespace-pre-wrap">{text}</pre> : <Markdown source={text || '—'} className="!text-xs" />}
      </Card>
      <div className="space-y-3 text-xs">
        {r.tokens && <TokenSplit t={r.tokens} />}
        <p className="text-slate">
          {r.id} · source : {r.source} · confiance {r.confidence} · formule v{r.acuVersion}
        </p>
        {calc && (
          <table className="w-full font-mono text-[11px]">
            <thead className="text-left text-muted">
              <tr>
                <th>Modèle</th>
                <th>I</th>
                <th>O</th>
                <th>C</th>
                <th>M</th>
                <th>Req</th>
                <th className="text-right">ACU</th>
              </tr>
            </thead>
            <tbody>
              {calc.breakdown.map((b) => (
                <tr key={b.model}>
                  <td className="max-w-[90px] truncate">{b.model}</td>
                  <td>{b.I.toFixed(1)}</td>
                  <td>{b.O.toFixed(1)}</td>
                  <td>{b.C.toFixed(1)}</td>
                  <td>{b.M}</td>
                  <td>{b.requests}</td>
                  <td className="text-right">{fmtAcu(b.acu)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-muted">Valeur API équivalente (indicative, usage/PRICING.md) : {r.unpriced ? 'tarif inconnu' : fmtMoney(r.apiCost)}</p>
      </div>
    </div>
  )
}

// ---------- ACU tab ----------
function AcuTab({ mode }: { mode: AcuMode }) {
  const m = useModel()
  const versions = [...m.registry.acu].sort((a, b) => b.version - a.version)
  const cur = configAt(m.registry, new Date().toISOString(), 'current')
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <Card className="p-5">
          <p className="text-sm font-semibold">AI Consumption Units (ACU)</p>
          <p className="mt-1 text-sm text-slate">Unité de consommation relative, pour comparer les projets entre agents, modèles et fournisseurs. Ce n’est ni un montant facturé, ni un solde de crédits fournisseur.</p>
          <p className="mt-4 rounded-lg bg-ink px-4 py-3 font-mono text-sm text-ivory">{ACU_FORMULA}</p>
          <ul className="mt-3 space-y-1 text-xs text-slate">
            <li>
              <b>I</b> = tokens d’entrée non mis en cache / 1 000 (les écritures de cache sont de l’entrée traitée, comptées une seule fois)
            </li>
            <li>
              <b>O</b> = tokens de sortie / 1 000 (raisonnement inclus) · <b>C</b> = tokens d’entrée lus depuis le cache / 1 000
            </li>
            <li>
              <b>M</b> = multiplicateur du modèle (préfixe le plus long, sinon le défaut) · <b>R</b> = surcoût par requête, ajouté pour chaque réponse du modèle
            </li>
            <li>Les tokens en cache ne sont jamais comptés deux fois : Claude Code les exclut déjà de l’entrée, Codex les inclut et Wakil les retire.</li>
            <li>L’utilisation du contexte est affichée à part dans l’historique et n’entre pas dans la formule.</li>
            <li>Sans télémétrie, l’ACU est « indisponible » (jamais 0) et n’entre pas dans les pools.</li>
          </ul>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-semibold">Trois modes de mesure</p>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="font-semibold">
                1 · Mesuré <Pill tone="ok">exact</Pill>
              </dt>
              <dd className="text-slate">Tokens, modèle et nombre de requêtes lus dans les journaux locaux de Claude Code et Codex.</dd>
            </div>
            <div>
              <dt className="font-semibold">
                2 · Estimé <Pill tone="warn">estimé</Pill>
              </dt>
              <dd className="text-slate">
                Requêtes déclarées en chat (<code className="font-mono">/wakil.usage record</code>, ex. Cursor) × ACU par requête configuré. Sans règle d’estimation, la valeur reste indisponible.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">
                3 · Niveau abonnement <Pill tone="warn">plan</Pill>
              </dt>
              <dd className="text-slate">
                Indicateurs du fournisseur (requêtes premium, crédits, % d’usage) via <code className="font-mono">/wakil.subscription plan-usage</code>. Affichés tels quels, jamais convertis en ACU.
              </dd>
            </div>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Versions de la formule" sub={`Affichage actuel : ${mode === 'current' ? `recalcul avec v${cur.version}` : 'version en vigueur à la date de chaque requête'}`} />
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate">
              <tr className="border-y border-line bg-ivory">
                <th className="px-5 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Depuis</th>
                <th className="px-3 py-2 font-medium">Wi · Wo · Wc · R</th>
                <th className="px-3 py-2 font-medium">Multiplicateurs</th>
                <th className="px-5 py-2 font-medium">Estimations (ACU/req.)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {versions.map((v) => (
                <tr key={v.version}>
                  <td className="px-5 py-2 font-mono font-semibold">v{v.version}</td>
                  <td className="px-3 py-2">{v.from === '2000-01-01' ? 'origine' : v.from}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {v.weights.input} · {v.weights.output} · {v.weights.cached} · {v.weights.overhead}
                  </td>
                  <td className="px-3 py-2 text-xs">{v.multipliers.map((x) => `${x.match} ×${x.value}`).join(', ') || `tous ×${v.defaultMultiplier}`}</td>
                  <td className="px-5 py-2 text-xs">{v.estimation.map((x) => `${x.match} = ${x.acuPerRequest}`).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <aside className="space-y-4">
        <Card className="p-5">
          <p className="text-sm font-semibold">Répartition des dépenses</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs text-slate">
            <li>Chaque abonnement a son propre pool d’ACU, calculé mois par mois.</li>
            <li>Part du projet = ACU du projet / ACU total de l’abonnement.</li>
            <li>Dépense allouée = part × dépense réelle de l’abonnement ce mois-là (fixe : prix en vigueur ou facture ; variable : facture ou chiffre fournisseur, sinon estimation provisoire).</li>
            <li>La consommation sans projet reste « non allouée » ; un mois sans consommation mesurée reste entièrement non alloué.</li>
            <li>Un budget n’est jamais une dépense.</li>
          </ol>
        </Card>
        <Card className="p-5 text-xs">
          <p className="text-sm font-semibold">Modifier la configuration</p>
          <p className="mt-1 text-slate">Depuis Claude Code, Cursor ou Codex (une nouvelle version est créée, l’ancienne est conservée) :</p>
          <div className="mt-3 space-y-2">
            <CommandHint command="/wakil.usage acu output weight 3" />
            <CommandHint command="/wakil.usage acu multiplier claude-opus=1.5" />
            <CommandHint command="/wakil.usage acu estimate cursor=4" />
          </div>
        </Card>
      </aside>
    </div>
  )
}

// ---------- registry tab ----------
const INTEGRATION_LABEL: Record<string, string> = { 'claude-code-logs': 'journaux Claude Code', 'codex-logs': 'journaux Codex', manual: 'déclaratif (chat)', none: 'aucune télémétrie' }

function RegistryTab() {
  const m = useModel()
  const reg = m.registry
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Fournisseurs" sub="Enregistrés depuis les chats (/wakil.provider)" />
        {reg.providers.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {reg.providers.map((p) => (
              <li key={p.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <Pill tone={p.status === 'active' ? 'ok' : 'neutral'}>{p.status}</Pill>
                  <Pill tone={p.integration === 'none' ? 'neutral' : 'sky'}>{INTEGRATION_LABEL[p.integration] ?? p.integration}</Pill>
                </div>
                <p className="mt-0.5 text-xs text-slate">{[p.category, p.website, p.description].filter(Boolean).join(' · ')}</p>
                <p className="mt-0.5 text-xs text-muted">
                  Abonnements :{' '}
                  {reg.subscriptions
                    .filter((s) => s.provider === p.id)
                    .map((s) => s.name)
                    .join(', ') || 'aucun'}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-5 text-sm text-slate">
            Aucun fournisseur. <code className="font-mono">/wakil.provider add Anthropic</code>
          </p>
        )}
      </Card>
      <Card>
        <CardHeader title="Paramètres" />
        <dl className="space-y-2 px-5 pb-5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate">Devise de référence</dt>
            <dd className="font-semibold">{reg.settings.baseCurrency}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate">Taux de change</dt>
            <dd className="text-right font-mono text-xs">
              {Object.entries(reg.settings.fx)
                .map(([c, v]) => `1 ${c} = ${v} ${reg.settings.baseCurrency}`)
                .join(' · ') || '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate">Usages déclarés (mode 2)</dt>
            <dd className="font-semibold">{reg.usage.length}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate">Fichier</dt>
            <dd className="font-mono text-xs">{reg.present ? 'usage/registry.json' : 'pas encore créé'}</dd>
          </div>
        </dl>
        <div className="px-5 pb-5">
          <CommandHint command="/wakil.usage settings base EUR, USD=0.92" />
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader title="Journal des commandes" sub="Chaque changement validé, avec le chat d’origine et l’agent" />
        {reg.log.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-slate">
                <tr className="border-y border-line bg-ivory">
                  <th className="px-5 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Commande</th>
                  <th className="px-3 py-2 font-medium">Changement</th>
                  <th className="px-3 py-2 font-medium">Chat</th>
                  <th className="px-5 py-2 font-medium">Demande d’origine</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...reg.log].reverse().map((l, i) => (
                  <tr key={i}>
                    <td className="px-5 py-2 whitespace-nowrap">{fmtDate(l.at)}</td>
                    <td className="px-3 py-2 font-mono">{l.action}</td>
                    <td className="px-3 py-2">{l.summary}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <ToolBadge tool={l.sourceTool} /> <span className="text-muted">{l.agent}</span>
                    </td>
                    <td className="max-w-[260px] truncate px-5 py-2 text-slate" title={l.command}>
                      {l.command || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 pb-5 text-sm text-slate">Aucune commande exécutée pour l’instant.</p>
        )}
      </Card>
    </div>
  )
}

// ---------- API pricing (indicative) ----------
function PricingTab() {
  const m = useModel()
  return (
    <Card className="p-5">
      <p className="text-sm">
        Valeur « équivalent API » indicative, utilisée seulement pour estimer les frais variables d’un abonnement à l’usage quand aucune facture n’est enregistrée.
        {m.pricingFromFile ? (
          <>
            {' '}
            Lue dans <code className="font-mono">usage/PRICING.md</code>.
          </>
        ) : (
          <> Tarifs par défaut de l’application.</>
        )}{' '}
        USD par million de tokens.
      </p>
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs text-slate">
          <tr className="border-b border-line">
            {['Modèle', 'Entrée', 'Sortie', 'Cache 5 min', 'Cache 1 h', 'Lecture cache'].map((h) => (
              <th key={h} className="py-2 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line font-mono text-xs">
          {m.pricing.map((p) => (
            <tr key={p.model}>
              <td className="py-2 pr-3">{p.model}</td>
              <td>{p.input}</td>
              <td>{p.output}</td>
              <td>{p.cacheWrite5m}</td>
              <td>{p.cacheWrite1h}</td>
              <td>{p.cacheRead}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
