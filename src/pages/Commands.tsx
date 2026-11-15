import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, SquareTerminal, Terminal } from 'lucide-react'
import { Card, Chip, CopyButton, Empty, FileActions, Page, PageTitle, Pill, SearchInput } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { findSection, stripComments } from '../lib/markdown'
import { useModel } from '../lib/store'
import type { Command } from '../lib/types'

const isSchedulable = (c: Command) => /✅|^yes|^oui|^show|^--/i.test(c.schedulable.trim())

function rank(c: Command, t: string) {
  if (!t) return 0
  const n = c.name.toLowerCase()
  const bare = n.replace(/^wakil\./, '')
  if (n === t || bare === t || c.slash === t) return 0
  if (bare.startsWith(t) || n.startsWith(t) || c.slash.startsWith(t)) return 1
  if (n.includes(t)) return 2
  if (c.description.toLowerCase().includes(t)) return 3
  if (c.argumentHint.toLowerCase().includes(t) || c.catalogArgs.toLowerCase().includes(t)) return 4
  if (c.search.includes(t)) return 5
  return 99
}

function snippet(c: Command, t: string) {
  const body = stripComments(c.doc.body).replace(/\s+/g, ' ')
  const i = body.toLowerCase().indexOf(t)
  if (i === -1) return null
  const start = Math.max(0, i - 50)
  return { before: (start > 0 ? '…' : '') + body.slice(start, i), match: body.slice(i, i + t.length), after: body.slice(i + t.length, i + t.length + 70) + '…' }
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const i = text.toLowerCase().indexOf(q)
  if (i === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-terra-soft px-0.5 text-ink">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

export function CommandsPage({ initial }: { initial?: string }) {
  const m = useModel()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [schedOnly, setSchedOnly] = useState(false)
  const [selName, setSelName] = useState<string | undefined>(initial)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initial) setSelName(initial)
  }, [initial])

  const t = q.trim().toLowerCase().replace(/^\//, '')
  const list = useMemo(
    () =>
      m.commands
        .filter((c) => (cat === 'all' || c.category === cat) && (!schedOnly || isSchedulable(c)))
        .map((c) => ({ c, r: rank(c, t) }))
        .filter((x) => x.r < 99)
        .sort((a, b) => a.r - b.r || m.commandCategories.indexOf(a.c.category) - m.commandCategories.indexOf(b.c.category) || a.c.name.localeCompare(b.c.name))
        .map((x) => x.c),
    [m.commands, m.commandCategories, cat, schedOnly, t],
  )
  const sel = list.find((c) => c.name === selName) ?? list[0]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = document.activeElement instanceof HTMLInputElement
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (typing ? document.activeElement === searchRef.current : true)) {
        e.preventDefault()
        const i = list.findIndex((c) => c.name === sel?.name)
        const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]
        if (next) setSelName(next.name)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [list, sel])

  useEffect(() => {
    listRef.current?.querySelector(`[data-cmd="${CSS.escape(sel?.name ?? '')}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const countFor = (c: string) => m.commands.filter((x) => x.category === c).length

  return (
    <Page wide>
      <PageTitle
        title="Commandes"
        sub={
          <>
            {m.commands.length} commandes slash · à taper dans Claude Code ·{' '}
            <span className="text-xs">raccourcis : <kbd className="rounded border border-line bg-paper px-1 font-mono">/</kbd> rechercher, <kbd className="rounded border border-line bg-paper px-1 font-mono">↑ ↓</kbd> naviguer</span>
          </>
        }
        path={`${m.root}\\.claude\\commands\\`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput inputRef={searchRef} value={q} onChange={setQ} placeholder="Quelle commande ? ex. news, tâche, trello, brand…" className="w-full max-w-xl flex-1" autoFocus />
        <Chip active={schedOnly} onClick={() => setSchedOnly((s) => !s)}>
          <CalendarClock className="mr-1 inline size-3.5" /> Programmables
        </Chip>
      </div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        <Chip active={cat === 'all'} onClick={() => setCat('all')} count={m.commands.length}>Toutes</Chip>
        {m.commandCategories.filter(countFor).map((c) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(c)} count={countFor(c)}>{c}</Chip>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty title={`Aucune commande pour « ${q} »`} icon={<SquareTerminal className="size-5" />}>Essayez un autre mot, ou retirez les filtres.</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div ref={listRef} className="min-w-0 space-y-1.5 lg:sticky lg:top-0 lg:max-h-[calc(100vh-220px)] lg:self-start lg:overflow-y-auto lg:pr-1">
            {list.map((c) => {
              const sn = t && rank(c, t) === 5 ? snippet(c, t) : null
              const active = c.name === sel?.name
              return (
                <button
                  key={c.name}
                  data-cmd={c.name}
                  onClick={() => setSelName(c.name)}
                  className={`block w-full rounded-lg border px-3.5 py-2.5 text-left transition-colors ${active ? 'border-ink bg-ink text-ivory' : 'border-line bg-paper hover:border-slate'}`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`font-mono text-[13px] font-semibold ${active ? 'text-terra' : ''}`}>
                      <Highlight text={c.slash} q={t} />
                    </span>
                    {isSchedulable(c) && <CalendarClock className={`size-3.5 ${active ? 'text-ivory/60' : 'text-muted'}`} />}
                    <span className={`ml-auto text-[10px] ${active ? 'text-ivory/50' : 'text-muted'}`}>{c.category}</span>
                  </span>
                  <span className={`mt-0.5 line-clamp-2 block text-xs ${active ? 'text-ivory/75' : 'text-slate'}`}>
                    <Highlight text={c.description} q={t} />
                  </span>
                  {sn && (
                    <span className={`mt-1 block truncate text-[11px] ${active ? 'text-ivory/60' : 'text-muted'}`}>
                      {sn.before}
                      <mark className="rounded bg-terra-soft px-0.5 text-ink">{sn.match}</mark>
                      {sn.after}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {sel && <CommandDetail key={sel.name} c={sel} />}
        </div>
      )}
    </Page>
  )
}

type ToolId = 'claude' | 'cursor' | 'codex'
const TOOLS: { id: ToolId; label: string }[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'codex', label: 'Codex' },
]
/** /wakil.news → Claude "/wakil.news", Cursor "/wakil-news", Codex "$wakil-news" (skills generated by /wakil.sync-tools). */
export function invocation(c: Command, tool: ToolId) {
  const skill = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return tool === 'claude' ? c.slash : tool === 'cursor' ? '/' + skill : '$' + skill
}
let lastTool: ToolId = 'claude'

function CommandDetail({ c }: { c: Command }) {
  const m = useModel()
  const [args, setArgs] = useState('')
  const [tool, setToolState] = useState<ToolId>(lastTool)
  const setTool = (t: ToolId) => {
    lastTool = t
    setToolState(t)
  }
  const skillName = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const hasSkill = m.byPath.has(`.agents/skills/${skillName}/SKILL.md`)
  const prefix = invocation(c, tool)
  const full = `${prefix}${args.trim() ? ' ' + args.trim() : ''}`
  const sections: [string, string[]][] = [
    ['Objectif', ['purpose']],
    ['Prérequis', ['preconditions']],
    ['Étapes', ['steps']],
    ['Règles', ['rules']],
    ['Résultat', ['output']],
    ['Programmable', ['schedulable']],
  ]
  const shown = new Set(['purpose', 'preconditions', 'steps', 'rules', 'output', 'schedulable', 'arguments', 'examples', 'example'])
  const extra = c.doc.sections.filter((s) => !shown.has(s.heading.toLowerCase().split(/\s/)[0]))
  return (
    <div className="min-w-0 space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wider text-terra-strong uppercase">{c.category}</p>
            <h2 className="mt-1 font-mono text-xl font-bold">{c.slash}</h2>
            <p className="mt-1 text-sm text-slate">{c.description}</p>
          </div>
          <span className="flex items-center gap-1">
            <CopyButton text={c.slash} label="Copier" />
            <FileActions path={c.path} compact />
          </span>
        </div>
        {(c.argumentHint || c.catalogArgs) && (
          <div className="mt-4 rounded-lg bg-ivory px-3 py-2 font-mono text-xs">
            <span className="text-slate">Syntaxe : </span>
            <span className="font-semibold">{c.slash}</span> <span className="text-terra-strong">{c.argumentHint || c.catalogArgs.replace(/`/g, '')}</span>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {TOOLS.map((t) => (
            <Chip key={t.id} active={tool === t.id} onClick={() => setTool(t.id)}>
              {t.label} <span className="ml-1 font-mono text-[10px] opacity-70">{invocation(c, t.id)}</span>
            </Chip>
          ))}
        </div>
        {tool !== 'claude' && !hasSkill && (
          <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
            Skill <code className="font-mono">.agents/skills/{skillName}</code> absent : lancez <code className="font-mono">/wakil.sync-tools</code> (ou <code className="font-mono">node tools/sync-ai-tools.cjs</code>) pour rendre cette commande disponible dans {TOOLS.find((t) => t.id === tool)?.label}.
          </p>
        )}
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-ink p-1.5 pl-3">
          <Terminal className="size-4 shrink-0 text-muted" />
          <span className="font-mono text-sm text-terra">{prefix}</span>
          <input
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            placeholder={c.argumentHint || 'arguments…'}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-ivory outline-none placeholder:text-ivory/30"
          />
          <CopyButton text={full} label="Copier la commande" small className="!border-ink-line !bg-ink-3 !text-ivory" />
        </div>
        <p className="mt-2 text-[11px] text-muted">Composez la commande puis collez-la dans {TOOLS.find((t) => t.id === tool)?.label} (l’application ne l’exécute pas).</p>
      </Card>

      {c.args.length > 0 && (
        <Card>
          <p className="px-5 pt-4 pb-2 text-sm font-semibold">Arguments</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate">
                <tr className="border-y border-line bg-ivory">
                  <th className="px-5 py-2 font-medium">Argument</th>
                  <th className="px-3 py-2 font-medium">Requis</th>
                  <th className="px-3 py-2 font-medium">Valeurs</th>
                  <th className="px-5 py-2 font-medium">Par défaut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {c.args.map((a, i) => (
                  <tr key={i}>
                    <td className="px-5 py-2.5 align-top"><Markdown source={a.name} className="[&_p]:!my-0" /></td>
                    <td className="px-3 py-2.5 align-top text-xs">{/^yes|oui/i.test(a.required) ? <Pill tone="terra">oui</Pill> : <Pill>{a.required || 'non'}</Pill>}</td>
                    <td className="px-3 py-2.5 align-top text-xs"><Markdown source={a.values} className="!text-xs [&_p]:!my-0" /></td>
                    <td className="px-5 py-2.5 align-top text-xs text-slate"><Markdown source={a.def} className="!text-xs [&_p]:!my-0" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {c.examples.length > 0 && (
        <Card className="p-5">
          <p className="mb-3 text-sm font-semibold">Exemples</p>
          <ul className="space-y-1.5">
            {c.examples.map((ex) => (
              <li key={ex} className="flex items-center gap-2 rounded-lg border border-line bg-ivory py-1 pr-1 pl-3">
                <code className="min-w-0 flex-1 truncate font-mono text-xs" title={ex}>{ex}</code>
                <CopyButton text={ex} small />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {sections.map(([label, keys]) => {
        const s = findSection(c.doc, ...keys)
        if (!s || !s.content.trim()) return null
        return (
          <Section key={label} title={label}>
            <Markdown source={s.content} docPath={c.path} />
          </Section>
        )
      })}
      {extra.map((s) => (
        <Section key={s.heading} title={s.heading}>
          <Markdown source={s.content} docPath={c.path} />
        </Section>
      ))}
      {c.doc.sections.length === 0 && (
        <Card className="p-5"><Markdown source={c.doc.body} docPath={c.path} /></Card>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-3 text-left">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted">{open ? 'Réduire' : 'Afficher'}</span>
      </button>
      {open && <div className="border-t border-line px-5 py-4">{children}</div>}
    </Card>
  )
}
