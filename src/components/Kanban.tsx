import { useMemo, useState } from 'react'
import { Bot, CalendarDays, ExternalLink, FileText, GitBranch, KanbanSquare, Link2, Lock, User, X } from 'lucide-react'
import { Card, Checklist, CommandHint, DocView, Empty, FileActions, Pill, Progress, Timeline } from './ui'
import { RunsTable, TokenSplit, UsageBadge } from './usage'
import { api, useApp, useModel } from '../lib/store'
import { STATUSES } from '../lib/tasks'
import { inRange, rangeOf, type Period } from '../lib/period'
import { PeriodFilter } from './PeriodFilter'
import { entityOf } from '../lib/model'
import { findSection, parseDated } from '../lib/markdown'
import { sumTokens, totalOf, fmtCost, fmtTokens } from '../lib/usage'
import type { PlanDoc, Run, Task, TaskStatus } from '../lib/types'

const PRIORITY_TONE: Record<string, 'danger' | 'warn' | 'neutral' | 'sky'> = { urgent: 'danger', high: 'warn', normal: 'neutral', low: 'sky' }
const NO_PLAN = '__none__'

export function useTaskRuns(): (t: Task) => Run[] {
  const { usage } = useApp()
  const byTask = useMemo(() => {
    const map = new Map<string, Run[]>()
    for (const r of usage?.runs ?? []) if (r.attr.taskKey) map.set(r.attr.taskKey, [...(map.get(r.attr.taskKey) ?? []), r])
    return map
  }, [usage])
  return (t) => byTask.get(t.key) ?? []
}

/** Latest date known for a task: newest Status log line, else updated, else created. */
export function lastActivity(t: Task): string {
  const log = findSection(t.doc, 'status log', 'journal')
  const dates = [t.updated, t.created, ...(log ? parseDated(log.content, t.path).map((d) => d.date) : [])].filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d))
  return dates.sort().pop() ?? ''
}

const byOrder = (a: Task, b: Task) => (a.order ?? 9999) - (b.order ?? 9999) || a.id.localeCompare(b.id, undefined, { numeric: true })

/** Tasks that block this one: listed in `depends` and not done yet. */
function blockersOf(t: Task, all: Task[]) {
  return t.depends.filter((d) => {
    const dep = all.find((x) => x.id === d && x.entitySlug === t.entitySlug && x.projectSlug === t.projectSlug)
    return !dep || dep.status !== 'done'
  })
}

export function Kanban({ tasks, plans = [], createCommand, showProject = false }: { tasks: Task[]; plans?: PlanDoc[]; createCommand: string; showProject?: boolean }) {
  const m = useModel()
  const runsOf = useTaskRuns()
  const [sel, setSel] = useState<Task | null>(null)
  const [hideEmpty, setHideEmpty] = useState(false)
  const [agent, setAgent] = useState('all')
  const [plan, setPlan] = useState<string>(plans[0] && tasks.some((t) => t.plan === plans[0].id) ? plans[0].id : 'all')
  const [view, setView] = useState<'status' | 'phase'>('status')
  const [sync, setSync] = useState<'all' | 'local' | 'trello'>('all')
  const [period, setPeriod] = useState<Period>({ preset: 'all' })
  const [dateField, setDateField] = useState<'activity' | 'created' | 'due'>('activity')
  const range = rangeOf(period)
  const dateOf = (t: Task) => (dateField === 'created' ? t.created : dateField === 'due' ? t.due : lastActivity(t))
  const agents = [...new Set(tasks.map((t) => t.agent || (t.executor === 'human' ? 'humain' : '')).filter(Boolean))]
  const planIds = [...new Set([...plans.map((p) => p.id), ...tasks.map((t) => t.plan).filter(Boolean)])]

  if (!tasks.length)
    return (
      <Empty title="Aucune tâche planifiée" icon={<KanbanSquare className="size-5" />}>
        <p>
          Planifiez sans Trello avec <code className="font-mono">/wakil.plan</code>, avec Trello avec <code className="font-mono">/wakil.plan.trello</code>, ou importez les cartes existantes. Une demande
          directe (sans commande) est exécutée sans plan et n’apparaît pas ici.
        </p>
        <div className="mt-3 flex flex-col items-center gap-2">
          <CommandHint command={createCommand} />
        </div>
      </Empty>
    )

  const shown = tasks
    .filter((t) => agent === 'all' || (t.agent || (t.executor === 'human' ? 'humain' : '')) === agent)
    .filter((t) => plan === 'all' || (plan === NO_PLAN ? !t.plan : t.plan === plan))
    .filter((t) => sync === 'all' || t.sync === sync)
    .filter((t) => period.preset === 'all' || (!!dateOf(t) && inRange(dateOf(t), range)))
  const totals = sumTokens(shown.flatMap((t) => runsOf(t).map((r) => r.tokens)))
  const cost = shown.reduce((a, t) => a + runsOf(t).reduce((b, r) => b + r.cost, 0), 0)
  const currentPlan = plans.find((p) => p.id === plan)
  const done = shown.filter((t) => t.status === 'done').length

  // columns: by status (Trello lists) or by plan phase (in execution order)
  const columns: { id: string; label: string; icon?: string; tasks: Task[] }[] =
    view === 'status'
      ? STATUSES.map((s) => ({ id: s.id, label: s.label, icon: s.icon, tasks: shown.filter((t) => t.status === s.id).sort(byOrder) }))
      : (() => {
          const phases: string[] = []
          for (const t of [...shown].sort(byOrder)) {
            const p = t.phase || 'Sans phase'
            if (!phases.includes(p)) phases.push(p)
          }
          return phases.map((p) => ({ id: p, label: p, tasks: shown.filter((t) => (t.phase || 'Sans phase') === p).sort(byOrder) }))
        })()
  const cols = columns.filter((c) => !hideEmpty || c.tasks.length)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {planIds.length > 0 && (
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className="h-8 max-w-[280px] rounded-lg border border-line bg-paper px-2 text-xs font-semibold">
            <option value="all">Tous les plans</option>
            {planIds.map((id) => (
              <option key={id} value={id}>
                {plans.find((p) => p.id === id)?.title ?? id}
              </option>
            ))}
            <option value={NO_PLAN}>Tâches hors plan</option>
          </select>
        )}
        <select value={agent} onChange={(e) => setAgent(e.target.value)} className="h-8 rounded-lg border border-line bg-paper px-2 text-xs font-semibold">
          <option value="all">Tous les exécutants</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select value={sync} onChange={(e) => setSync(e.target.value as typeof sync)} className="h-8 rounded-lg border border-line bg-paper px-2 text-xs font-semibold">
          <option value="all">Local + Trello</option>
          <option value="local">Plans locaux (/wakil.plan)</option>
          <option value="trello">Sur Trello</option>
        </select>
        <span className="flex overflow-hidden rounded-lg border border-line text-xs font-semibold">
          <button onClick={() => setView('status')} className={`h-8 px-2.5 ${view === 'status' ? 'bg-ink text-ivory' : 'bg-paper text-slate'}`}>
            Par statut
          </button>
          <button onClick={() => setView('phase')} className={`h-8 px-2.5 ${view === 'phase' ? 'bg-ink text-ivory' : 'bg-paper text-slate'}`}>
            Par phase
          </button>
        </span>
        <div className="flex w-full flex-wrap items-center gap-2">
          <PeriodFilter value={period} onChange={setPeriod} />
          <select value={dateField} onChange={(e) => setDateField(e.target.value as typeof dateField)} className="h-8 rounded-lg border border-line bg-paper px-2 text-xs font-semibold" title="Date utilisée pour le filtre de période">
            <option value="activity">selon la dernière activité</option>
            <option value="created">selon la création</option>
            <option value="due">selon l’échéance</option>
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} /> Masquer les colonnes vides
        </label>
        <span className="ml-auto flex items-center gap-2 text-xs text-slate">
          {shown.length} tâche(s) · {done} terminée(s) <UsageBadge tokens={totalOf(totals)} cost={cost} />
        </span>
      </div>

      {currentPlan && <PlanHeader plan={currentPlan} tasks={shown} />}

      <div className="flex gap-3 overflow-x-auto pb-3">
        {cols.map((col) => (
          <div key={col.id} className="flex w-[264px] shrink-0 flex-col rounded-xl bg-[#eef0f4] p-2">
            <div className="flex items-center gap-2 px-1.5 pt-1 pb-2 text-xs font-semibold">
              {col.icon ? <span>{col.icon}</span> : <GitBranch className="size-3.5 text-slate" />}
              <span className="flex-1 truncate">{col.label}</span>
              <span className="font-mono text-muted">{col.tasks.length}</span>
            </div>
            <div className="flex min-h-16 flex-col gap-2">
              {col.tasks.map((t) => (
                <TaskCard key={t.key} t={t} runs={runsOf(t)} blockers={blockersOf(t, tasks)} showStatus={view === 'phase'} projectLabel={showProject ? projectName(m, t) : undefined} onOpen={() => setSel(t)} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {sel && <TaskDrawer t={sel} runs={runsOf(sel)} blockers={blockersOf(sel, tasks)} plan={plans.find((p) => p.id === sel.plan)} onClose={() => setSel(null)} />}
    </div>
  )
}

function projectName(m: ReturnType<typeof useModel>, t: Task) {
  const p = m.projects.find((x) => x.entitySlug === t.entitySlug && x.slug === t.projectSlug)
  return p ? p.name : `${entityOf(m, t.entitySlug)?.name ?? t.entitySlug} (hors projet)`
}

function PlanHeader({ plan, tasks }: { plan: PlanDoc; tasks: Task[] }) {
  const { go } = useApp()
  const done = tasks.filter((t) => t.status === 'done').length
  const goal = findSection(plan.doc, 'goal', 'objectif')?.content.replace(/<!--[\s\S]*?-->/g, '').trim()
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-4 px-5 py-3">
      <FileText className="size-5 shrink-0 text-terra-strong" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {plan.title}
          <Pill tone={plan.status === 'approved' || plan.status === 'in-progress' ? 'ok' : plan.status === 'done' ? 'sky' : 'warn'}>{plan.status}</Pill>
          <SyncBadge sync={plan.sync} />
        </p>
        {goal && <p className="mt-0.5 line-clamp-1 text-xs text-slate">{goal}</p>}
      </div>
      <div className="w-48">
        <Progress done={done} total={tasks.length} />
      </div>
      <button onClick={() => go({ page: 'files', path: plan.path })} className="text-xs font-semibold text-terra-strong hover:underline">
        Ouvrir le plan
      </button>
    </Card>
  )
}

export function SyncBadge({ sync }: { sync: 'local' | 'trello' }) {
  return sync === 'trello' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-soft px-1.5 py-0.5 text-[10px] font-semibold text-[#0284a8]" title="Carte Trello liée">
      <Link2 className="size-2.5" /> Trello
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-ivory px-1.5 py-0.5 text-[10px] font-semibold text-slate" title="Plan local (/wakil.plan) – jamais sur Trello">
      <Lock className="size-2.5" /> local
    </span>
  )
}

function TaskCard({ t, runs, blockers, showStatus, projectLabel, onOpen }: { t: Task; runs: Run[]; blockers: string[]; showStatus: boolean; projectLabel?: string; onOpen: () => void }) {
  const tok = runs.reduce((a, r) => a + r.total, 0)
  const cost = runs.reduce((a, r) => a + r.cost, 0)
  const done = t.checks.filter((c) => c.done).length
  const status = STATUSES.find((s) => s.id === t.status)
  return (
    <button onClick={onOpen} className="rounded-lg border border-line bg-paper p-3 text-left shadow-[0_1px_0_rgba(11,19,43,0.04)] transition-colors hover:border-slate">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10.5px] font-semibold text-muted">
          {t.order !== null ? `#${t.order} · ` : ''}
          {t.id}
        </span>
        <SyncBadge sync={t.sync} />
        {t.priority !== 'normal' && <Pill tone={PRIORITY_TONE[t.priority] ?? 'neutral'}>{t.priority}</Pill>}
        {showStatus && status && <Pill tone="ink">{status.icon} {status.label}</Pill>}
      </div>
      {projectLabel && <p className="mt-1 truncate text-[10.5px] font-semibold text-terra-strong">{projectLabel}</p>}
      <p className="mt-1 line-clamp-3 text-[13px] leading-snug font-medium">{t.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {t.agent ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-semibold text-ivory">
            <Bot className="size-3" /> {t.agent}
          </span>
        ) : t.assignee ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-ivory px-2 py-0.5 text-[10.5px] font-semibold text-slate">
            <User className="size-3" /> {t.assignee}
          </span>
        ) : null}
        {t.phase && !showStatus && <span className="truncate text-[10.5px] text-slate">{t.phase}</span>}
        {t.estimate && <span className="rounded bg-ivory px-1 font-mono text-[10px] text-slate">{t.estimate}</span>}
        {t.due && (
          <span className="inline-flex items-center gap-1 text-[10.5px] text-slate">
            <CalendarDays className="size-3" /> {t.due}
          </span>
        )}
      </div>
      {blockers.length > 0 && t.status !== 'done' && (
        <p className="mt-2 text-[10.5px] font-semibold text-warn" title="Dépendances non terminées">
          ⏳ attend {blockers.join(', ')}
        </p>
      )}
      {(t.checks.length > 0 || tok > 0) && (
        <div className="mt-2 flex items-center gap-2">
          {t.checks.length > 0 && (
            <span className="font-mono text-[10.5px] text-slate">
              ☑ {done}/{t.checks.length}
            </span>
          )}
          <span className="ml-auto">
            <UsageBadge tokens={tok} cost={cost} />
          </span>
        </div>
      )}
    </button>
  )
}

export function TaskDrawer({ t, runs, blockers = [], plan, onClose }: { t: Task; runs: Run[]; blockers?: string[]; plan?: PlanDoc; onClose: () => void }) {
  const { go } = useApp()
  const status = STATUSES.find((s) => s.id === t.status)
  const log = findSection(t.doc, 'status log', 'journal')
  const tokens = sumTokens(runs.map((r) => r.tokens))
  const cost = runs.reduce((a, r) => a + r.cost, 0)
  const agents = [...new Set(runs.map((r) => r.agentType))]
  const project = t.projectSlug === 'none' ? 'none' : t.projectSlug
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/30" onMouseDown={onClose}>
      <div className="h-full w-[760px] max-w-[95vw] overflow-y-auto bg-ivory shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-line bg-paper px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs font-semibold text-muted">
              {t.id} · {t.entitySlug}/{t.projectSlug}
            </p>
            <h2 className="mt-1 text-lg leading-snug font-bold">{t.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Pill tone="ink">
                {status?.icon} {status?.label}
              </Pill>
              <SyncBadge sync={t.sync} />
              {t.priority && <Pill tone={PRIORITY_TONE[t.priority] ?? 'neutral'}>priorité {t.priority}</Pill>}
              {t.agent && (
                <Pill>
                  <Bot className="size-3" /> {t.agent}
                </Pill>
              )}
              {t.assignee && (
                <Pill>
                  <User className="size-3" /> {t.assignee}
                </Pill>
              )}
            </div>
          </div>
          <span className="flex items-center gap-1">
            {t.trello && (
              <button onClick={() => api().openExternal(t.trello)} title="Ouvrir la carte Trello" className="grid size-8 place-items-center rounded-md text-slate hover:bg-ivory hover:text-ink">
                <ExternalLink className="size-4" />
              </button>
            )}
            <FileActions path={t.path} compact />
            <button onClick={onClose} className="grid size-8 place-items-center rounded-md text-slate hover:bg-ivory" aria-label="Fermer">
              <X className="size-4" />
            </button>
          </span>
        </div>
        <div className="space-y-5 p-6">
          {(t.plan || t.phase || t.order !== null || t.depends.length > 0) && (
            <Card className="p-5">
              <p className="text-sm font-semibold">Plan</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-[10.5px] font-semibold text-muted uppercase">Plan</dt>
                  <dd className="truncate">
                    {plan ? (
                      <button onClick={() => go({ page: 'files', path: plan.path })} className="text-left text-terra-strong hover:underline">
                        {plan.title}
                      </button>
                    ) : (
                      t.plan || '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10.5px] font-semibold text-muted uppercase">Phase</dt>
                  <dd>{t.phase || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10.5px] font-semibold text-muted uppercase">Ordre</dt>
                  <dd>{t.order ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10.5px] font-semibold text-muted uppercase">Dépend de</dt>
                  <dd>
                    {t.depends.length ? t.depends.join(', ') : '—'}
                    {blockers.length > 0 && t.status !== 'done' && <span className="block text-xs text-warn">⏳ en attente : {blockers.join(', ')}</span>}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-slate">
                {t.sync === 'local' ? 'Plan local : jamais envoyé sur Trello. Exécution avec /wakil.plan run.' : 'Synchronisé avec la carte Trello (/wakil.process, /wakil.task).'}
              </p>
            </Card>
          )}
          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">Consommation des agents</p>
              <p className="font-mono text-sm">
                {fmtTokens(totalOf(tokens))} tokens · <span className="font-bold">{fmtCost(cost)}</span>
              </p>
            </div>
            {runs.length ? (
              <>
                <p className="mt-1 text-xs text-slate">
                  {runs.length} exécution(s) · {agents.join(', ')}
                </p>
                <div className="mt-3">
                  <TokenSplit t={tokens} />
                </div>
              </>
            ) : (
              <p className="mt-1 text-xs text-slate">
                Aucune exécution liée. Les exécutions sont liées par la ligne <code className="font-mono">TASK: {t.key}</code> au début du brief de l’agent.
              </p>
            )}
          </Card>
          {runs.length > 0 && (
            <Card>
              <RunsTable items={runs} showTask={false} />
            </Card>
          )}
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ['Exécutant', t.executor || '—'],
              ['Relecteurs', t.reviewers || '—'],
              ['Créée', t.created || '—'],
              ['Mise à jour', t.updated || '—'],
              ['Échéance', t.due || '—'],
              ['Estimation', t.estimate || '—'],
              ['Équipe', t.doc.frontmatter.team && t.doc.frontmatter.team !== '-' ? t.doc.frontmatter.team : '—'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line bg-paper px-3 py-2">
                <dt className="text-[10.5px] font-semibold text-muted uppercase">{k}</dt>
                <dd className="truncate">{v}</dd>
              </div>
            ))}
          </dl>
          {t.checks.length > 0 && (
            <Card className="p-5">
              <p className="mb-3 text-sm font-semibold">Critères d’acceptation</p>
              <Progress done={t.checks.filter((c) => c.done).length} total={t.checks.length} />
              <div className="mt-3">
                <Checklist items={t.checks} groupBySection={false} />
              </div>
            </Card>
          )}
          {log && (
            <Card className="p-5">
              <p className="mb-3 text-sm font-semibold">Historique des statuts</p>
              <Timeline items={parseDated(log.content, t.path).reverse()} />
            </Card>
          )}
          <DocView doc={t.doc} hideSections={['acceptance', 'status log']} />
          <div className="flex flex-wrap gap-2">
            {t.sync === 'local' && t.status === 'approved' && <CommandHint command={`/wakil.plan run ${t.id}`} />}
            {t.sync === 'local' && t.status === 'proposed' && <CommandHint command={`/wakil.plan approve ${t.id}`} />}
            <CommandHint command={`/wakil.task ${t.entitySlug} ${project} ${t.id} status `} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function statusOrder(s: TaskStatus) {
  return STATUSES.findIndex((x) => x.id === s)
}
