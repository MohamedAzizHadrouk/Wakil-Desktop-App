// Usage & crédits › Coûts par crédit – cost of every prompt, session, project, task, entity and agent, from the credit
// log (usage/credits.jsonl) and the subscription billing periods (see src/lib/credits.ts for the rule).
import React, { useMemo, useState } from 'react'
import { Bot, Calculator, CircleDollarSign, Cpu, FileText, Sigma } from 'lucide-react'
import { Kpi, ToolBadge } from '../components/usage'
import { Card, CardHeader, Chip, CommandHint, Empty, Pill, fmtDate, timeAgo } from '../components/ui'
import { useApp, useModel } from '../lib/store'
import { breakdown, buildCostModel, DIMENSIONS, pendingLines, type CostPeriod, type CostRow, type Dimension } from '../lib/credits'
import type { useAllocation } from '../lib/useAllocation'
import type { UsageRecord } from '../lib/allocation'
import { entityOf } from '../lib/model'
import type { Registry } from '../lib/registry'
import type { Model } from '../lib/types'
import { Certainty, fmtAcu, fmtMoney, projectLabel } from './Usage'

type Alloc = ReturnType<typeof useAllocation>

const dayLabel = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const pctFmt = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)} %`
/** Money with enough digits for the tiny cost of one credit. */
function fmtUnit(v: number | null, cur: string) {
  if (v === null) return '—'
  if (v === 0 || v >= 0.01) return fmtMoney(v, cur)
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur, maximumSignificantDigits: 3 }).format(v)
  } catch {
    return `${v.toPrecision(3)} ${cur}`
  }
}
const providerName = (reg: Registry, id: string | null) => (id ? reg.providers.find((p) => p.id === id)?.name ?? id : '—')

function rowLabel(m: Model, dim: Dimension, row: CostRow): { title: string; sub?: string } {
  const r = row.sample
  switch (dim) {
    case 'prompt':
      return { title: r.label || '—', sub: `${fmtDate(r.date)} · ${r.agent}${r.models[0] ? ' · ' + r.models[0] : ''}` }
    case 'session':
      return { title: row.key === '—' ? 'Sans session' : r.sessionTitle || (r.kind === 'turn' ? r.label : '') || row.key.slice(0, 8), sub: row.key === '—' ? undefined : `${row.lines} ligne(s) · ${fmtDate(row.first)} → ${fmtDate(row.last)}` }
    case 'project':
      return { title: row.key === '—' ? 'Non attribué' : projectLabel(m, row.key) }
    case 'task': {
      if (row.key === '—') return { title: 'Hors tâche' }
      const t = m.tasks.find((x) => x.key.toLowerCase() === row.key.toLowerCase())
      return { title: t ? `${t.id} · ${t.title}` : row.key, sub: projectLabel(m, row.key.split('/').slice(0, 2).join('/')) }
    }
    case 'entity':
      return { title: row.key === '—' ? 'Non attribué' : row.key === 'personal' ? 'Personnel' : entityOf(m, row.key)?.name ?? row.key }
    case 'provider':
      return { title: providerName(m.registry, row.key) }
    case 'day':
      return { title: dayLabel(row.key) }
    default:
      return { title: row.key }
  }
}

export function CostsTab({ a, base }: { a: Alloc; base: string }) {
  const m = useModel()
  const { usage } = useApp()
  const reg = m.registry
  const log = usage?.raw.creditLog
  const [provider, setProvider] = useState<string>('all')
  const [dim, setDim] = useState<Dimension>('project')
  const [limit, setLimit] = useState(50)
  const [journalLimit, setJournalLimit] = useState(100)

  const cm = useMemo(() => buildCostModel(reg, a.records), [reg, a.records])
  const providers = useMemo(() => [...new Set(a.filteredRecords.map((r) => r.providerId ?? r.tool))].sort(), [a.filteredRecords])
  const records = useMemo(() => (provider === 'all' ? a.filteredRecords : a.filteredRecords.filter((r) => (r.providerId ?? r.tool) === provider)), [a.filteredRecords, provider])
  const pctBy: 'credits' | 'cost' = provider === 'all' && providers.length > 1 ? 'cost' : 'credits'
  const rows = useMemo(() => breakdown(records, dim, cm, pctBy), [records, dim, cm, pctBy])

  const subIds = new Set(a.results.map((r) => r.sub.id))
  const periods = cm.periods.filter(
    (p) =>
      p.status !== 'future' &&
      subIds.has(p.sub.id) &&
      (provider === 'all' || p.sub.provider === provider) &&
      (!a.range.from || p.end >= a.range.from) &&
      (!a.range.to || p.start <= a.range.to) &&
      (p.records.length > 0 || p.status === 'running'),
  )
  const credits = records.reduce((s, r) => s + (r.acu ?? 0), 0)
  const cost = records.reduce((s, r) => s + (cm.costOf.get(r.id) ?? 0), 0)
  const uncosted = records.filter((r) => !r.subscriptionId).length
  const prompts = records.filter((r) => r.kind === 'turn').length

  const pending = useMemo(() => {
    if (!usage || !log?.present) return 0
    return pendingLines(new Set(log.lines.map((l) => l.id)), usage.turns, usage.runs)
  }, [usage, log])

  return (
    <div className="space-y-6">
      <LogStatus present={!!log?.present} lines={log?.lines.length ?? 0} bad={log?.bad ?? 0} modifiedAt={log?.modifiedAt ?? null} pending={pending} />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-slate">Fournisseur</span>
        <Chip active={provider === 'all'} onClick={() => setProvider('all')}>
          Tous
        </Chip>
        {providers.map((p) => (
          <Chip key={p} active={provider === p} onClick={() => setProvider(p)} count={a.filteredRecords.filter((r) => (r.providerId ?? r.tool) === p).length}>
            {providerName(reg, p)}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={<Sigma className="size-3.5" />} label="Crédits consommés" value={fmtAcu(credits)} sub={`${records.length} ligne(s) · ${prompts} prompt(s)`} />
        <Kpi icon={<CircleDollarSign className="size-3.5" />} label="Coût de la sélection" value={fmtMoney(cost, base)} sub={uncosted ? `${uncosted} ligne(s) sans abonnement (coût 0)` : 'crédits × coût d’un crédit'} />
        <Kpi icon={<Calculator className="size-3.5" />} label="Coût moyen d’un prompt" value={prompts ? fmtUnit(cost / Math.max(1, records.length), base) : '—'} sub="par ligne du journal" />
        <Kpi icon={<FileText className="size-3.5" />} label="Périodes de facturation" value={periods.length} sub={periods.some((p) => p.source === 'declared') ? 'saisies et déduites' : 'déduites de la date de début'} />
      </div>

      {periods.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {periods.map((p) => (
            <PeriodCard key={p.key} p={p} reg={reg} />
          ))}
        </div>
      ) : (
        <Card className="border-dashed p-4 text-sm text-slate">
          Aucune période de facturation dans cette sélection. Ajoutez un abonnement avec son prix (<span className="font-mono">/wakil.subscription add</span>) et, si ses dates ne suivent pas sa date de début, ses
          périodes (<span className="font-mono">/wakil.billing-period</span>).
        </Card>
      )}
      {cm.fxMissing && <p className="text-xs text-warn">Taux de change manquant pour au moins un abonnement : son coût n’est pas converti en {base} (/wakil.usage settings --fx …).</p>}

      <Card>
        <CardHeader
          title="Coût par élément"
          sub={pctBy === 'credits' ? 'Part = crédits de l’élément ÷ crédits de la sélection' : 'Plusieurs fournisseurs : part = coût de l’élément ÷ coût de la sélection (les crédits de fournisseurs différents ne sont pas comparables)'}
        />
        <div className="flex flex-wrap gap-1.5 border-b border-line px-5 pb-3">
          {DIMENSIONS.map((d) => (
            <Chip key={d.id} active={dim === d.id} onClick={() => setDim(d.id)}>
              {d.label}
            </Chip>
          ))}
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted uppercase">
                  <th className="px-5 py-2 font-semibold">{DIMENSIONS.find((d) => d.id === dim)?.label}</th>
                  <th className="px-3 py-2 text-right font-semibold">Lignes</th>
                  <th className="px-3 py-2 text-right font-semibold">Crédits</th>
                  <th className="w-40 px-3 py-2 font-semibold">Part</th>
                  <th className="px-5 py-2 text-right font-semibold">Coût</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((row) => {
                  const l = rowLabel(m, dim, row)
                  return (
                    <tr key={row.key} className="border-t border-line align-top">
                      <td className="max-w-[520px] px-5 py-2">
                        <p className="line-clamp-2 font-medium">{l.title}</p>
                        {l.sub && <p className="text-[11px] text-muted">{l.sub}</p>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{row.lines}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-semibold">
                        {fmtAcu(row.credits)} {row.estimated && <Certainty estimated title="Contient des crédits estimés ou indisponibles" />}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                            <div className="h-full rounded-full bg-terra" style={{ width: `${Math.max(1, row.pct * 100)}%` }} />
                          </div>
                          <span className="w-12 text-right font-mono text-[11px]">{pctFmt(row.pct)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-2 text-right font-mono text-xs font-semibold">{fmtUnit(row.cost, base)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length > limit && (
              <button className="w-full border-t border-line py-2 text-xs font-semibold text-slate hover:text-ink" onClick={() => setLimit((x) => x + 100)}>
                Afficher plus ({rows.length - limit} restants)
              </button>
            )}
          </div>
        ) : (
          <p className="px-5 py-4 text-sm text-slate">Aucune ligne pour ces filtres.</p>
        )}
      </Card>

      <Card>
        <CardHeader title="Journal des crédits" sub={`${log?.path ?? 'usage/credits.jsonl'} – une ligne par prompt et par exécution d’agent`} />
        {records.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted uppercase">
                  <th className="px-5 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Fournisseur · modèle</th>
                  <th className="px-3 py-2 font-semibold">Prompt</th>
                  <th className="px-3 py-2 font-semibold">Projet · agent</th>
                  <th className="px-3 py-2 text-right font-semibold">Crédits</th>
                  <th className="px-5 py-2 text-right font-semibold">Coût</th>
                </tr>
              </thead>
              <tbody>
                {records.slice(0, journalLimit).map((r) => (
                  <JournalRow key={r.id} r={r} m={m} cost={cm.costOf.get(r.id) ?? null} base={base} />
                ))}
              </tbody>
            </table>
            {records.length > journalLimit && (
              <button className="w-full border-t border-line py-2 text-xs font-semibold text-slate hover:text-ink" onClick={() => setJournalLimit((x) => x + 200)}>
                Afficher plus ({records.length - journalLimit} restantes)
              </button>
            )}
          </div>
        ) : (
          <p className="px-5 py-4 text-sm text-slate">Aucune ligne pour ces filtres.</p>
        )}
      </Card>
    </div>
  )
}

function LogStatus({ present, lines, bad, modifiedAt, pending }: { present: boolean; lines: number; bad: number; modifiedAt: number | null; pending: number }) {
  if (!present)
    return (
      <Card className="border-terra/40 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 text-sm">
            <p className="font-semibold">Journal de crédits absent</p>
            <p className="text-xs text-slate">
              Les chiffres viennent directement des journaux Claude Code / Codex. Pour un journal fiable (une ligne par prompt, avec fournisseur, modèle et crédits, aussi pour Cursor), lancez une fois la
              synchronisation : les hooks l’alimentent ensuite après chaque prompt.
            </p>
          </div>
          <CommandHint command="/wakil.credits sync" />
        </div>
      </Card>
    )
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-paper px-4 py-2.5 text-xs">
      <Pill tone="ok">journal de crédits</Pill>
      <span className="font-mono">usage/credits.jsonl</span>
      <span className="text-slate">
        {lines.toLocaleString('fr-FR')} ligne(s){modifiedAt ? ` · écrit ${timeAgo(modifiedAt)}` : ''}
        {bad ? ` · ${bad} ligne(s) illisible(s) ignorée(s)` : ''}
      </span>
      {pending > 0 && (
        <span className="ml-auto flex items-center gap-2 text-warn" title="Prompts des journaux locaux absents du fichier : prompt en cours, ou hook qui n’a pas tourné">
          {pending} prompt(s) pas encore dans le journal <CommandHint command="/wakil.credits sync" />
        </span>
      )}
    </div>
  )
}

function PeriodCard({ p, reg }: { p: CostPeriod; reg: Registry }) {
  const cur = p.currency
  const unitName = p.unit === 'credits' ? 'crédit' : 'requête'
  const amountTotal = (p.amount ?? 0) + p.variable
  const step = (n: number, label: React.ReactNode, formula: React.ReactNode, value: React.ReactNode, strong = false) => (
    <li className="grid grid-cols-[20px_1fr_auto] items-baseline gap-2 py-1.5">
      <span className="flex size-5 items-center justify-center rounded-full bg-ivory font-mono text-[10px] font-bold text-slate">{n}</span>
      <span>
        <span className="text-slate">{label}</span>
        <span className="ml-2 font-mono text-[11px] text-muted">{formula}</span>
      </span>
      <span className={`font-mono text-sm ${strong ? 'font-bold text-ink' : 'font-semibold'}`}>{value}</span>
    </li>
  )
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-slate uppercase">{providerName(reg, p.sub.provider)}</p>
          <p className="font-semibold">{p.sub.name}</p>
          <p className="text-xs text-slate">
            {dayLabel(p.start)} → {dayLabel(p.end)} · {p.days} jours
          </p>
        </div>
        <Pill tone={p.status === 'running' ? 'sky' : 'neutral'}>{p.status === 'running' ? 'en cours' : 'terminée'}</Pill>
        <Pill tone={p.source === 'declared' ? 'ok' : 'neutral'}>{p.source === 'declared' ? 'période saisie' : 'période déduite'}</Pill>
      </div>
      {p.amount === null ? (
        <p className="mt-3 text-xs text-warn">Aucun prix en vigueur pour cette période : coût inconnu (/wakil.subscription price ou /wakil.billing-period … --amount).</p>
      ) : (
        <ol className="mt-3 divide-y divide-line text-xs">
          {step(1, 'Coût d’une journée', `${fmtMoney(amountTotal, cur)} ÷ ${p.days} j${p.variable ? ' (fixe + variable)' : ''}`, fmtUnit(p.daily, cur))}
          {step(2, `Coût des ${p.elapsed} jour(s) ${p.status === 'running' ? 'écoulés' : 'de la période'}`, `${fmtUnit(p.daily, cur)} × ${p.elapsed}`, fmtMoney(p.costToDate, cur))}
          {step(
            3,
            p.unit === 'credits' ? 'Crédits consommés sur la période' : 'Requêtes (aucun crédit mesuré)',
            `${p.records.length} ligne(s)`,
            <>
              {p.unit === 'credits' ? fmtAcu(p.credits) : p.requests.toLocaleString('fr-FR')} {p.unit === 'requests' && <Certainty estimated title="Aucun crédit : chaque requête compte pour une unité" />}
            </>,
          )}
          {step(4, `Coût d’un ${unitName}`, `${fmtMoney(p.costToDate, cur)} ÷ ${p.unit === 'credits' ? fmtAcu(p.credits) : p.requests}`, fmtUnit(p.perUnit, cur), true)}
        </ol>
      )}
      {p.missingCredits > 0 && <p className="mt-2 text-[11px] text-warn">{p.missingCredits} ligne(s) sans crédits comptées 0 (ajoutez une estimation : /wakil.usage acu estimate cursor=N).</p>}
      {p.status === 'running' && p.amount !== null && (
        <p className="mt-2 text-[11px] text-muted">
          Période en cours : le coût d’un {unitName} change chaque jour (coût à date ÷ crédits à date). Fin de période : {fmtMoney(amountTotal, cur)}.
        </p>
      )}
    </Card>
  )
}

function JournalRow({ r, m, cost, base }: { r: UsageRecord; m: Model; cost: number | null; base: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr className="cursor-pointer border-t border-line align-top hover:bg-ivory" onClick={() => setOpen((o) => !o)}>
        <td className="px-5 py-2 font-mono text-[11px] whitespace-nowrap text-slate">{fmtDate(r.date)}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <ToolBadge tool={r.tool} />
            <span className="text-xs font-semibold">{providerName(m.registry, r.providerId)}</span>
          </div>
          <p className="font-mono text-[11px] text-muted">{r.models[0] ?? '—'}</p>
        </td>
        <td className="max-w-[380px] px-3 py-2">
          <p className="line-clamp-2 text-xs">{r.label || '—'}</p>
        </td>
        <td className="px-3 py-2 text-xs">
          <p className="truncate">{projectLabel(m, r.projectKey)}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted">
            {r.kind === 'run' ? <Bot className="size-3" /> : <Cpu className="size-3" />} {r.agent}
            {r.taskKey ? ` · ${r.taskKey.split('/')[2]}` : ''}
          </p>
        </td>
        <td className="px-3 py-2 text-right font-mono text-xs font-semibold whitespace-nowrap">
          {r.acu === null ? '—' : fmtAcu(r.acu)} {r.method !== 'exact' && <Certainty estimated />}
        </td>
        <td className="px-5 py-2 text-right font-mono text-xs whitespace-nowrap">{r.subscriptionId ? fmtUnit(cost, base) : <span className="text-muted">sans abonnement</span>}</td>
      </tr>
      {open && (
        <tr className="bg-ivory/60">
          <td colSpan={6} className="px-5 py-3 text-xs">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
              <Fact k="Session" v={r.sessionTitle || r.sessionId || '—'} />
              <Fact k="Abonnement" v={m.registry.subscriptions.find((s) => s.id === r.subscriptionId)?.name ?? '—'} />
              <Fact k="Requêtes" v={String(r.requests)} />
              <Fact k="Tokens" v={r.tokens ? (r.tokens.input + r.tokens.output + r.tokens.cacheWrite5m + r.tokens.cacheWrite1h + r.tokens.cacheRead).toLocaleString('fr-FR') : '—'} />
              <Fact k="Méthode" v={`${r.method} · formule v${r.acuVersion}`} />
              <Fact k="Source" v={r.source} />
              <Fact k="Tâche" v={r.taskKey ?? '—'} />
              <Fact k="Équivalent API" v={r.unpriced ? '—' : fmtMoney(r.apiCost, 'USD')} />
            </dl>
          </td>
        </tr>
      )}
    </>
  )
}

const Fact = ({ k, v }: { k: string; v: string }) => (
  <div className="min-w-0">
    <dt className="text-[10px] text-muted uppercase">{k}</dt>
    <dd className="truncate font-medium" title={v}>
      {v}
    </dd>
  </div>
)

export function CostsEmpty() {
  return <Empty title="Aucune donnée d’usage" />
}
