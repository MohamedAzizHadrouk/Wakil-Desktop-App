import { useEffect, useMemo, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { Card, Chip, DocView, Empty, Page, PageTitle, Pill, SearchInput } from '../components/ui'
import { useApp, useModel } from '../lib/store'
import type { Skill } from '../lib/types'

export function SkillsPage({ initial }: { initial?: string }) {
  const m = useModel()
  const { go } = useApp()
  const [q, setQ] = useState('')
  const [agent, setAgent] = useState('all')
  const [cat, setCat] = useState('all')
  const [sel, setSel] = useState<Skill | null>(null)

  useEffect(() => {
    if (initial) setSel(m.skills.find((s) => s.id === initial) ?? null)
  }, [initial, m.skills])

  const cats = useMemo(() => [...new Set(m.skills.filter((s) => agent === 'all' || s.agent === agent).map((s) => s.category))].sort(), [m.skills, agent])
  const list = m.skills.filter((s) => {
    if (agent !== 'all' && s.agent !== agent) return false
    if (cat !== 'all' && s.category !== cat) return false
    const t = q.trim().toLowerCase()
    return !t || [s.name, s.category, s.agent, s.useWhen.join(' '), s.inputs, s.output, s.doc.body].join(' ').toLowerCase().includes(t)
  })

  return (
    <Page wide>
      <PageTitle
        title="Skills"
        sub={`${m.skills.length} méthodes réparties sur ${m.agents.filter((a) => a.skills.length).length} agents`}
        right={<SearchInput value={q} onChange={setQ} placeholder="Rechercher (nom, « use when », contenu)…" className="w-80" />}
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Chip active={agent === 'all'} onClick={() => { setAgent('all'); setCat('all') }} count={m.skills.length}>Tous les agents</Chip>
        {m.agents.filter((a) => a.skills.length).map((a) => (
          <Chip key={a.id} active={agent === a.id} onClick={() => { setAgent(a.id); setCat('all') }} count={a.skills.length}>{a.name}</Chip>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        <Chip active={cat === 'all'} onClick={() => setCat('all')}>Toutes catégories</Chip>
        {cats.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}
      </div>

      <div className={`grid gap-6 ${sel ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]' : ''}`}>
        <div className="min-w-0">
          {list.length === 0 ? (
            <Empty title="Aucun skill ne correspond" icon={<Sparkles className="size-5" />} />
          ) : (
            <div className={`grid gap-3 ${sel ? '' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
              {list.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSel(s)}
                  className={`rounded-xl border bg-paper p-4 text-left transition-colors hover:border-slate ${sel?.id === s.id ? 'border-terra ring-1 ring-terra' : 'border-line'}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{s.name}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate">
                    <span className="font-semibold text-ink">{s.agent}</span> · {s.category}
                    {s.lastChecked && <> · vérifié {s.lastChecked}</>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.useWhen.slice(0, 5).map((u) => <Pill key={u}>{u}</Pill>)}
                    {s.useWhen.length > 5 && <Pill>+{s.useWhen.length - 5}</Pill>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {sel && (
          <div className="min-w-0 lg:sticky lg:top-0 lg:self-start">
            <Card className="mb-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-terra-strong uppercase">Skill · {sel.category}</p>
                  <h2 className="mt-1 text-lg font-bold">{sel.name}</h2>
                  <button onClick={() => go({ page: 'agent', id: sel.agent })} className="mt-0.5 text-xs font-semibold text-slate hover:underline">Agent : {sel.agent}</button>
                </div>
                <button onClick={() => setSel(null)} className="rounded-md p-1 text-slate hover:bg-ivory" aria-label="Fermer"><X className="size-4" /></button>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                {sel.inputs && <div><dt className="text-[11px] font-semibold text-muted uppercase">Entrées</dt><dd>{sel.inputs}</dd></div>}
                {sel.output && <div><dt className="text-[11px] font-semibold text-muted uppercase">Sortie</dt><dd>{sel.output}</dd></div>}
              </dl>
              <div className="mt-3 flex flex-wrap gap-1">{sel.useWhen.map((u) => <Pill key={u} tone="sky">{u}</Pill>)}</div>
            </Card>
            <DocView key={sel.path} doc={sel.doc} />
          </div>
        )}
      </div>
    </Page>
  )
}
