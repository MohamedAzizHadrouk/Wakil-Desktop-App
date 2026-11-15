import React, { useState } from 'react'
import { Bot, ChevronDown, ChevronRight, Coins, Cpu } from 'lucide-react'
import { Markdown } from './Markdown'
import { Card, Pill, timeAgo } from './ui'
import { useApp, useModel } from '../lib/store'
import { fmtCost, fmtTokens, type Agg } from '../lib/usage'
import type { Run, Tokens, Turn } from '../lib/types'

export const TOOL_META: Record<string, { label: string; cls: string }> = {
  claude: { label: 'Claude Code', cls: 'bg-terra-soft text-terra-strong' },
  codex: { label: 'Codex', cls: 'bg-ink text-ivory' },
  cursor: { label: 'Cursor', cls: 'bg-sky-soft text-[#0284a8]' },
}

export function ToolBadge({ tool }: { tool?: string }) {
  const t = TOOL_META[tool ?? 'claude'] ?? { label: tool ?? '?', cls: 'bg-ivory text-slate' }
  return <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${t.cls}`}>{t.label}</span>
}

/** "12.4 M tok · $3.20" */
export function UsageBadge({ tokens, cost, className = '' }: { tokens: number; cost: number; className?: string }) {
  if (!tokens) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-sky-soft px-2 py-0.5 font-mono text-[10.5px] font-semibold whitespace-nowrap text-[#0284a8] ${className}`} title="Tokens (cache compris) · crédit estimé (équivalent API)">
      <Coins className="size-3" /> {fmtTokens(tokens)} · {fmtCost(cost)}
    </span>
  )
}

export function Kpi({ label, value, sub, icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="flex items-center gap-2 text-xs text-slate">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate">{sub}</p>}
    </div>
  )
}

/** Horizontal bars, by cost. */
export function Bars({ rows, onClick, empty = 'Aucune donnée.' }: { rows: Agg[]; onClick?: (key: string) => void; empty?: string }) {
  if (!rows.length) return <p className="text-sm text-slate">{empty}</p>
  const max = Math.max(...rows.map((r) => r.cost), 0.0001)
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <button disabled={!onClick} onClick={() => onClick?.(r.key)} className="block w-full text-left disabled:cursor-default">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">{r.label}</span>
              <span className="shrink-0 font-mono text-xs text-slate">
                {fmtTokens(r.total)} · <span className="font-semibold text-ink">{fmtCost(r.cost)}</span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-terra" style={{ width: `${Math.max(2, (r.cost / max) * 100)}%` }} />
            </div>
            <p className="mt-0.5 text-[11px] text-muted">{r.runs} exécution(s)</p>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function TokenSplit({ t }: { t: Tokens }) {
  const parts: [string, number, string][] = [
    ['Entrée', t.input, 'bg-ink'],
    ['Sortie', t.output, 'bg-terra'],
    ['Écriture cache', t.cacheWrite5m + t.cacheWrite1h, 'bg-sky'],
    ['Lecture cache', t.cacheRead, 'bg-muted'],
  ]
  const total = parts.reduce((a, p) => a + p[1], 0) || 1
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-line">
        {parts.map(([l, v, c]) => (
          <div key={l} className={c} style={{ width: `${(v / total) * 100}%` }} title={`${l}: ${fmtTokens(v)}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate">
        {parts.map(([l, v, c]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${c}`} /> {l} <span className="font-mono text-ink">{fmtTokens(v)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function agentLabel(id: string) {
  return id === 'manager' ? 'manager (session principale)' : id
}

/** Table of sub-agent runs (and optionally main-session turns), expandable to show the brief. */
export function RunsTable({ items, showTask = true, limit = 50 }: { items: (Run | Turn)[]; showTask?: boolean; limit?: number }) {
  const m = useModel()
  const { go } = useApp()
  const [open, setOpen] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  if (!items.length) return <p className="px-5 py-4 text-sm text-slate">Aucune exécution enregistrée.</p>
  const list = all ? items : items.slice(0, limit)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate">
          <tr className="border-y border-line bg-ivory">
            <th className="w-6 py-2 pl-4" />
            <th className="px-3 py-2 font-medium">Agent</th>
            <th className="px-3 py-2 font-medium">Travail</th>
            {showTask && <th className="px-3 py-2 font-medium">Tâche / projet</th>}
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 text-right font-medium">Sortie</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            <th className="px-4 py-2 text-right font-medium">Crédit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {list.map((r) => {
            const id = r.kind === 'agent' ? r.id : r.sessionId + r.at
            const task = r.attr.taskKey ? m.tasks.find((t) => t.key === r.attr.taskKey) : undefined
            const project = r.attr.project ? m.projects.find((p) => p.slug === r.attr.project && (!r.attr.entity || p.entitySlug === r.attr.entity)) : undefined
            const isOpen = open === id
            return (
              <React.Fragment key={id}>
                <tr className="cursor-pointer hover:bg-ivory" onClick={() => setOpen(isOpen ? null : id)}>
                  <td className="py-2.5 pl-4 text-slate">{isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5 font-medium whitespace-nowrap">
                      {r.kind === 'agent' ? <Bot className="size-3.5 text-terra-strong" /> : <Cpu className="size-3.5 text-slate" />}
                      {r.kind === 'agent' ? r.agentType : 'manager'}
                      <ToolBadge tool={r.tool} />
                    </span>
                  </td>
                  <td className="max-w-[320px] px-3 py-2.5">
                    <span className="line-clamp-1">{r.kind === 'agent' ? r.description || r.prompt.slice(0, 80) : r.prompt}</span>
                  </td>
                  {showTask && (
                    <td className="max-w-[240px] px-3 py-2.5 text-xs">
                      {task ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            go({ page: 'project', key: `${task.entitySlug}/${task.projectSlug}`, tab: 'kanban' })
                          }}
                          className="line-clamp-1 text-left font-semibold text-terra-strong hover:underline"
                        >
                          {task.id} · {task.title}
                        </button>
                      ) : project ? (
                        <span className="line-clamp-1 text-slate">
                          {project.name}
                          {r.attr.card ? ` · ${r.attr.card}` : ''}
                        </span>
                      ) : (
                        <span className="text-muted">non attribué</span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-slate">{r.at ? timeAgo(new Date(r.at).getTime()) : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{fmtTokens(r.tokens.output)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{fmtTokens(r.total)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold" title={r.unpriced ? 'Modèle sans tarif dans usage/PRICING.md' : undefined}>
                    {r.unpriced && !r.cost ? <span className="text-muted">tarif ?</span> : fmtCost(r.cost)}
                    {r.unpriced && r.cost > 0 ? <span className="text-muted">+?</span> : null}
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td />
                    <td colSpan={showTask ? 7 : 6} className="px-3 pt-1 pb-4">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                        <Card className="max-h-72 overflow-y-auto p-4">
                          <p className="mb-2 text-[11px] font-semibold text-muted uppercase">{r.kind === 'agent' ? 'Brief envoyé à l’agent' : 'Demande'}</p>
                          <Markdown source={(r.kind === 'agent' ? r.prompt : r.prompt) || '—'} className="!text-xs" />
                        </Card>
                        <div className="space-y-3">
                          <TokenSplit t={r.tokens} />
                          <ul className="space-y-1 text-xs">
                            {Object.entries(r.byModel).map(([model, t]) => (
                              <li key={model} className="flex justify-between gap-2 font-mono">
                                <span className="truncate">{model}</span>
                                <span>{fmtTokens(t.input + t.output + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h)}</span>
                              </li>
                            ))}
                          </ul>
                          <p className="text-[11px] text-muted">
                            Session {r.sessionId.slice(0, 8)} · attribution : <Pill>{howLabel(r.attr.how)}</Pill>
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
      {items.length > limit && (
        <button onClick={() => setAll((a) => !a)} className="m-4 text-xs font-semibold text-terra-strong hover:underline">
          {all ? 'Réduire' : `Tout afficher (${items.length})`}
        </button>
      )}
    </div>
  )
}

export function howLabel(h: string) {
  return (
    {
      'task-line': 'ligne TASK du brief',
      trello: 'lien Trello',
      'card-title': 'titre de carte',
      'client-project': 'client / projet du brief',
      command: 'arguments de commande',
      focus: 'focus de session',
      none: 'non attribué',
    } as Record<string, string>
  )[h] ?? h
}
