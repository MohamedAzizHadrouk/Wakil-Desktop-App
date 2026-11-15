import { useState } from 'react'
import { Bot, Cpu, Sparkles } from 'lucide-react'
import { Card, CardHeader, CommandHint, DocView, Empty, Page, PageTitle, Pill, SearchInput, Tabs } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { useApp, useModel } from '../lib/store'
import { Kanban } from '../components/Kanban'
import { Bars, Kpi, RunsTable, UsageBadge } from '../components/usage'
import { aggregate, fmtCost, fmtTokens, sumTokens, totalOf } from '../lib/usage'

const initials = (s: string) =>
  s
    .split(/[-_\s]+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export function AgentsPage() {
  const m = useModel()
  const { go, usage } = useApp()
  const usageOf = (id: string) => {
    const items = id === 'manager' ? usage?.turns ?? [] : (usage?.runs ?? []).filter((r) => r.agentType === id)
    return { tok: items.reduce((s, x) => s + x.total, 0), cost: items.reduce((s, x) => s + x.cost, 0) }
  }
  const [q, setQ] = useState('')
  const list = m.agents.filter((a) => !q || (a.name + a.description + a.skills.map((s) => s.name).join(' ')).toLowerCase().includes(q.toLowerCase()))
  return (
    <Page>
      <PageTitle
        title="Agents"
        sub={`${m.agents.length} agents · ${m.skills.length} skills`}
        path={`${m.root}\\.claude\\agents\\`}
        right={<SearchInput value={q} onChange={setQ} placeholder="Rechercher un agent…" className="w-64" />}
      />
      {list.length === 0 ? (
        <Empty title="Aucun agent" icon={<Bot className="size-5" />}>Les agents sont lus depuis <code className="font-mono">.claude/agents/&lt;agent&gt;/&lt;agent&gt;.md</code>.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((a) => {
            const cats = [...new Set(a.skills.map((s) => s.category))]
            return (
              <button key={a.id} onClick={() => go({ page: 'agent', id: a.id })} className="flex flex-col rounded-xl border border-line bg-paper p-5 text-left transition-colors hover:border-slate">
                <div className="flex items-start gap-3">
                  <span className={`grid size-11 shrink-0 place-items-center rounded-xl text-sm font-bold ${a.id === 'manager' ? 'bg-terra text-ink' : 'bg-ink text-ivory'}`}>
                    {initials(a.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{a.name}</span>
                      {a.id === 'manager' && <Pill tone="terra">principal</Pill>}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-slate">
                      <Cpu className="size-3" /> model: {a.model}
                    </span>
                  </span>
                </div>
                <p className="mt-3 line-clamp-4 text-sm text-slate">{a.description}</p>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                  <Pill tone="sky"><Sparkles className="size-3" /> {a.skills.length} skills</Pill>
                  <UsageBadge tokens={usageOf(a.id).tok} cost={usageOf(a.id).cost} />
                  {cats.slice(0, 4).map((c) => <Pill key={c}>{c}</Pill>)}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </Page>
  )
}

export function AgentPage({ id }: { id: string }) {
  const m = useModel()
  const { go } = useApp()
  const a = m.agents.find((x) => x.id === id)
  const { usage } = useApp()
  const [tab, setTab] = useState<'role' | 'skills' | 'index' | 'usage' | 'tasks'>('role')
  const agentTasks = m.tasks.filter((t) => t.agent === id)
  const runs = (usage?.runs ?? []).filter((r) => r.agentType === id)
  const turns = id === 'manager' ? usage?.turns ?? [] : []
  const items = [...runs, ...turns].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  const tok = sumTokens(items.map((x) => x.tokens))
  const cost = items.reduce((s, x) => s + x.cost, 0)
  if (!a) return <Page><Empty title="Agent introuvable" /></Page>
  const byCat = new Map<string, typeof a.skills>()
  for (const s of a.skills) byCat.set(s.category, [...(byCat.get(s.category) ?? []), s])
  return (
    <Page>
      <PageTitle
        kicker="Agent"
        title={a.name}
        sub={<span className="font-mono text-xs">model: {a.model}</span>}
        path={a.path}
        right={<CommandHint command={a.id === 'manager' ? 'claude --agent manager' : `claude --agent ${a.id}`} />}
      />
      <Card className="mb-6 px-5 py-4">
        <p className="text-sm leading-relaxed">{a.description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
          <span className="font-semibold text-slate">Disponible dans :</span>
          <Pill tone="ok">Claude Code · {a.path}</Pill>
          {a.id === 'manager' ? (
            <Pill tone={m.aiTools.agentsMd ? 'ok' : 'warn'}>Cursor & Codex · agent principal via AGENTS.md</Pill>
          ) : (
            <>
              <Pill tone={m.aiTools.cursorAgents.includes(a.id) ? 'ok' : 'warn'}>Cursor · {m.aiTools.cursorAgents.includes(a.id) ? `.cursor/agents/${a.id}.md` : 'non synchronisé'}</Pill>
              <Pill tone={m.aiTools.codexAgents.includes(a.id) ? 'ok' : 'warn'}>Codex · {m.aiTools.codexAgents.includes(a.id) ? `.codex/agents/${a.id}.toml` : 'non synchronisé'}</Pill>
            </>
          )}
        </div>
      </Card>
      <Tabs
        tabs={[
          { id: 'role', label: 'Rôle & règles' },
          { id: 'skills', label: 'Skills', count: a.skills.length },
          { id: 'index', label: 'INDEX.md', count: undefined },
          { id: 'tasks', label: 'Tâches (Kanban)', count: agentTasks.length },
          { id: 'usage', label: 'Usage & crédits', count: items.length },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'role' && <DocView doc={a.doc} />}
      {tab === 'tasks' && <Kanban tasks={agentTasks} plans={m.projects.flatMap((p) => p.plans).concat(m.entities.flatMap((e) => e.plans))} showProject createCommand="/wakil.plan <entité> <projet> <objectif>" />}
      {tab === 'usage' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Crédit estimé" value={fmtCost(cost)} />
            <Kpi label="Tokens" value={fmtTokens(totalOf(tok))} sub={`${fmtTokens(tok.output)} en sortie`} />
            <Kpi label={id === 'manager' ? 'Demandes' : 'Exécutions'} value={items.length} />
            <Kpi label="Tâches liées" value={new Set(runs.map((r) => r.attr.taskKey).filter(Boolean)).size} />
          </div>
          {items.length > 0 && (
            <Card>
              <CardHeader title="Par projet" />
              <div className="px-5 pb-5">
                <Bars rows={aggregate(items, (x) => (x.attr.entity ? `${x.attr.entity}/${x.attr.project ?? ''}` : undefined), (k) => (k === '—' ? 'Non attribué' : m.projects.find((p) => p.key === k)?.name ?? k))} />
              </div>
            </Card>
          )}
          <Card><RunsTable items={items} /></Card>
        </div>
      )}
      {tab === 'skills' &&
        (a.skills.length ? (
          <div className="space-y-6">
            {[...byCat.entries()].map(([cat, list]) => (
              <Card key={cat}>
                <CardHeader title={<span className="capitalize">{cat}</span>} sub={`${list.length} skill(s)`} />
                <ul className="divide-y divide-line border-t border-line">
                  {list.map((s) => (
                    <li key={s.id}>
                      <button onClick={() => go({ page: 'skills', id: s.id })} className="flex w-full flex-col gap-1 px-5 py-3 text-left hover:bg-ivory">
                        <span className="text-sm font-semibold">{s.name}</span>
                        <span className="flex flex-wrap gap-1">{s.useWhen.slice(0, 6).map((u) => <Pill key={u}>{u}</Pill>)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        ) : (
          <Empty title="Aucun skill pour cet agent" />
        ))}
      {tab === 'index' && (a.index ? <Card className="p-5"><Markdown source={a.index.body} docPath={a.index.path} /></Card> : <Empty title="skills/INDEX.md absent" />)}
    </Page>
  )
}
