import { Bot, Building2, Crosshair, FileWarning, FolderKanban, History, Sparkles, SquareTerminal, User } from 'lucide-react'
import { ownerName } from '../components/AppShell'
import { Card, CardHeader, Checklist, Empty, fmtDate, Page, Pill, Progress, ReadOnlyNote, StatusPill, Timeline, timeAgo, TodoBadge } from '../components/ui'
import { parseChecks } from '../lib/markdown'
import { useApp, useModel } from '../lib/store'
import { aggregate, fmtCost, fmtTokens } from '../lib/usage'
import { Bars } from '../components/usage'
import { useAllocation } from '../lib/useAllocation'
import type { Period } from '../lib/period'
import { Certainty, fmtAcu, fmtMoney, projectLabel } from './Usage'
import type { Agg } from '../lib/usage'
import { CommandHint } from '../components/ui'

export function Dashboard() {
  const m = useModel()
  const { go, usage } = useApp()
  const monthAgo = Date.now() - 30 * 86400000
  const recentUsage = usage ? [...usage.runs, ...usage.turns].filter((x) => x.at && new Date(x.at).getTime() >= monthAgo) : []
  const usageCost = recentUsage.reduce((a, x) => a + x.cost, 0)
  const usageTok = recentUsage.reduce((a, x) => a + x.total, 0)
  const owner = ownerName(m)
  const today = new Date()
  const hour = today.getHours()
  const hello = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const day = m.personal.news[0]
  const todos = day?.todo ? parseChecks(day.todo.body) : []
  const setup = m.personal.setup ? parseChecks(m.personal.setup.body) : []
  const focusEntity = m.focus ? m.entities.find((e) => e.slug === m.focus?.client) : undefined
  const focusProject = focusEntity?.projects.find((p) => p.slug === m.focus?.project)
  const lastCheckpoint = focusEntity?.checkpoints[focusEntity.checkpoints.length - 1]
  const recent = m.files
    .filter((f) => f.content !== undefined && !f.path.includes('/_templates/'))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 8)

  const stats = [
    { label: 'Entités', n: m.entities.length, icon: Building2, page: 'entities' as const },
    { label: 'Projets', n: m.projects.length, icon: FolderKanban, page: 'projects' as const },
    { label: 'Agents', n: m.agents.length, icon: Bot, page: 'agents' as const },
    { label: 'Skills', n: m.skills.length, icon: Sparkles, page: 'skills' as const },
    { label: 'Commandes', n: m.commands.length, icon: SquareTerminal, page: 'commands' as const },
  ]

  return (
    <Page>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate first-letter:uppercase">
            {today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
            {hello}
            {owner ? `, ${owner.split(' ')[0]}` : ''}
          </h1>
        </div>
        <p className="text-sm text-slate">
          <span className="font-semibold text-ink">{m.stats.mdFiles}</span> documents indexés ·{' '}
          <span className="font-semibold text-warn">{m.todo}</span> champs à compléter
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <button key={s.label} onClick={() => go({ page: s.page })} className="rounded-xl border border-line bg-paper p-4 text-left transition-colors hover:border-slate">
            <s.icon className="size-4 text-terra-strong" />
            <p className="mt-3 text-2xl font-bold tracking-tight">{s.n}</p>
            <p className="text-xs text-slate">{s.label}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {m.focus && (
            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><Crosshair className="size-4 text-terra-strong" /> Focus actuel</span>} sub={m.focus.set ? `défini le ${m.focus.set}` : undefined} />
              <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
                {focusEntity ? (
                  <button onClick={() => go({ page: 'entity', slug: focusEntity.slug })} className="rounded-lg border border-line p-3 text-left hover:border-slate">
                    <p className="text-[11px] font-semibold text-muted uppercase">Client</p>
                    <p className="mt-0.5 font-semibold">{focusEntity.name}</p>
                    <p className="text-xs text-slate">{focusEntity.type}</p>
                  </button>
                ) : (
                  <div className="rounded-lg border border-dashed border-line p-3 text-sm text-slate">Aucun client en focus</div>
                )}
                {focusProject ? (
                  <button onClick={() => go({ page: 'project', key: focusProject.key })} className="rounded-lg border border-line p-3 text-left hover:border-slate">
                    <p className="text-[11px] font-semibold text-muted uppercase">Projet</p>
                    <p className="mt-0.5 font-semibold">{focusProject.name}</p>
                    <p className="truncate text-xs text-slate">{focusProject.status}</p>
                  </button>
                ) : (
                  <div className="rounded-lg border border-dashed border-line p-3 text-sm text-slate">Aucun projet en focus</div>
                )}
              </div>
              {lastCheckpoint && (
                <div className="border-t border-line px-5 py-3 text-sm">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate">
                    <History className="size-3.5" /> Dernier point de reprise · {lastCheckpoint.date}
                  </p>
                  <p className="mt-1">{lastCheckpoint.text}</p>
                </div>
              )}
            </Card>
          )}

          <Card>
            <CardHeader
              title="Organisations & projets"
              right={<button onClick={() => go({ page: 'entities' })} className="text-xs font-semibold text-slate hover:text-ink">Tout voir</button>}
            />
            {m.entities.length === 0 ? (
              <div className="px-5 pb-5"><Empty title="Aucune entité">Ajoutez-en une avec <code className="font-mono">/wakil.add-entity</code>.</Empty></div>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {m.entities.map((e) => (
                  <li key={e.slug}>
                    <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <button onClick={() => go({ page: 'entity', slug: e.slug })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink text-ivory">
                          {e.type === 'individual' ? <User className="size-4" /> : <Building2 className="size-4" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{e.name}</span>
                          <span className="block text-xs text-slate">{e.type} · {e.projects.length} projet(s)</span>
                        </span>
                      </button>
                      <StatusPill status={e.status} />
                      <TodoBadge n={e.todo} />
                    </div>
                    {e.projects.length > 0 && (
                      <div className="flex flex-wrap gap-2 px-5 pb-3 pl-[68px]">
                        {e.projects.map((p) => (
                          <button key={p.key} onClick={() => go({ page: 'project', key: p.key })} className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:border-slate">
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Dernières décisions" sub="Extraites des « Decisions log » des entités et projets" />
            <div className="px-5 pb-5">
              <Timeline items={m.decisions} showScope limit={6} />
            </div>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader
              title="To-do du jour"
              sub={day ? fmtDate(day.date) : undefined}
              right={day && <button onClick={() => go({ page: 'news', date: day.date })} className="text-xs font-semibold text-slate hover:text-ink">Ouvrir</button>}
            />
            <div className="px-5 pb-5">
              {todos.length ? (
                <>
                  <Progress done={todos.filter((t) => t.done).length} total={todos.length} />
                  <div className="mt-4"><Checklist items={todos} /></div>
                </>
              ) : (
                <p className="text-sm text-slate">Pas de TODO.md récent. Générez-le avec <code className="font-mono text-xs">/wakil.news</code>.</p>
              )}
            </div>
          </Card>

          {setup.length > 0 && (
            <Card>
              <CardHeader title="Mise en place" right={<button onClick={() => go({ page: 'profile' })} className="text-xs font-semibold text-slate hover:text-ink">Détails</button>} />
              <div className="px-5 pb-5">
                <Progress done={setup.filter((t) => t.done).length} total={setup.length} tone="terra" />
                <ul className="mt-3 space-y-1 text-xs text-slate">
                  {setup.filter((s) => !s.done).slice(0, 4).map((s, i) => (
                    <li key={i} className="truncate">○ {s.text.replace(/`/g, '')}</li>
                  ))}
                </ul>
              </div>
            </Card>
          )}

          {!m.personal.profile && (
            <Card className="border-terra/40 p-5">
              <p className="text-sm font-semibold">Démarrer cet écosystème</p>
              <p className="mt-1 text-xs text-slate">Ouvrez un terminal dans ce dossier, lancez Claude Code puis la configuration guidée :</p>
              <div className="mt-3 space-y-2">
                <CommandHint command="claude --agent manager" />
                <CommandHint command="/wakil.setup" />
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Dépenses IA · ce mois"
              right={<button onClick={() => go({ page: 'usage' })} className="text-xs font-semibold text-slate hover:text-ink">Détails</button>}
            />
            <div className="px-5 pb-5">
              {usage ? (
                <DashboardSpend fallbackTokens={usageTok} fallbackCost={usageCost} agents={aggregate(recentUsage, (x) => (x.kind === 'agent' ? x.agentType : 'manager')).slice(0, 4)} />
              ) : (
                <p className="text-sm text-slate">Lecture de l’historique Claude Code…</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Fichiers modifiés récemment" />
            <ul className="pb-2">
              {recent.map((f) => (
                <li key={f.path}>
                  <button onClick={() => go({ page: 'files', path: f.path })} className="flex w-full items-center gap-2 px-5 py-1.5 text-left hover:bg-ivory">
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{f.path}</span>
                    <span className="shrink-0 text-[11px] text-muted">{timeAgo(f.mtime)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {m.aiTools.stale && (
            <button onClick={() => go({ page: 'workspace' })} className="flex items-center gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4 text-left">
              <FileWarning className="size-5 shrink-0 text-warn" />
              <span className="text-sm">
                <span className="font-semibold text-warn">Cursor / Codex pas à jour</span>
                <span className="block text-xs text-slate">Lancez /wakil.sync-tools après vos changements d’agents, skills ou commandes</span>
              </span>
            </button>
          )}

          {m.health.filter((h) => h.level === 'warn').length > 0 && (
            <button onClick={() => go({ page: 'workspace' })} className="flex items-center gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4 text-left">
              <FileWarning className="size-5 shrink-0 text-warn" />
              <span className="text-sm">
                <span className="font-semibold text-warn">{m.health.filter((h) => h.level === 'warn').length} point(s) de structure</span>
                <span className="block text-xs text-slate">à vérifier dans Espace de travail</span>
              </span>
            </button>
          )}

          <ReadOnlyNote command="claude --agent manager" />
          {m.last?.scope && <Pill className="self-start">Dernière activité : {m.last.scope} · {m.last.when}</Pill>}
        </aside>
      </div>
    </Page>
  )
}

const MONTH: Period = { preset: 'month' }

function DashboardSpend({ fallbackTokens, fallbackCost, agents }: { fallbackTokens: number; fallbackCost: number; agents: Agg[] }) {
  const m = useModel()
  const a = useAllocation(MONTH, null, 'historical')
  const base = m.registry.settings.baseCurrency
  if (!m.registry.subscriptions.length)
    return (
      <>
        <p className="text-3xl font-bold tracking-tight">{fmtTokens(fallbackTokens)}</p>
        <p className="text-xs text-slate">tokens sur 30 jours · valeur API équivalente {fmtCost(fallbackCost)} (indicatif)</p>
        <p className="mt-2 text-xs text-warn">Aucun abonnement enregistré : /wakil.subscription add … pour répartir vos dépenses.</p>
        <div className="mt-4"><Bars rows={agents} /></div>
      </>
    )
  const top = new Map<string, number>()
  for (const r of a.results) for (const p of r.projects) top.set(p.projectKey, (top.get(p.projectKey) ?? 0) + p.allocated)
  const best = [...top.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4)
  return (
    <>
      <p className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight">{fmtMoney(a.totals.expense, base)}</span>
        <Certainty estimated={a.totals.expenseEstimated} />
      </p>
      <p className="text-xs text-slate">{a.results.length} abonnement(s) · {fmtAcu(a.totals.acu)} ACU · non alloué {fmtMoney(a.totals.unallocated, base)}</p>
      <ul className="mt-4 space-y-1.5 text-sm">
        {best.map(([k, v]) => (
          <li key={k} className="flex justify-between gap-3">
            <span className="truncate">{projectLabel(m, k)}</span>
            <span className="font-mono text-xs font-semibold">{fmtMoney(v, base)}</span>
          </li>
        ))}
        {!best.length && <li className="text-xs text-slate">Aucune dépense allouée à un projet ce mois-ci.</li>}
      </ul>
    </>
  )
}
