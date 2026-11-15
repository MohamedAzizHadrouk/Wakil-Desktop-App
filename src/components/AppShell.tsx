import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Coins,
  Bot,
  Building2,
  FolderKanban,
  FolderTree,
  HardDrive,
  LayoutDashboard,
  Lock,
  Megaphone,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Sparkles,
  SquareTerminal,
  UserRound,
} from 'lucide-react'
import { WakilMark, WakilWordmark } from './Logo'
import { useApp, useModel, type Route } from '../lib/store'
import { timeAgo } from './ui'

type NavItem = { page: Route['page']; label: string; icon: React.ComponentType<{ className?: string }>; count?: (m: ReturnType<typeof useModel>) => number }

const SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Espace',
    items: [
      { page: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { page: 'entities', label: 'Organisations & individus', icon: Building2, count: (m) => m.entities.length },
      { page: 'projects', label: 'Projets', icon: FolderKanban, count: (m) => m.projects.length },
    ],
  },
  {
    label: 'Écosystème IA',
    items: [
      { page: 'agents', label: 'Agents', icon: Bot, count: (m) => m.agents.length },
      { page: 'skills', label: 'Skills', icon: Sparkles, count: (m) => m.skills.length },
      { page: 'commands', label: 'Commandes', icon: SquareTerminal, count: (m) => m.commands.length },
      { page: 'usage', label: 'Usage & crédits', icon: Coins },
    ],
  },
  {
    label: 'Personnel',
    items: [
      { page: 'profile', label: 'Profil', icon: UserRound },
      { page: 'personal-projects', label: 'Projets personnels', icon: FolderKanban, count: (m) => m.personalEntity.projects.length },
      { page: 'knowledge', label: 'Connaissances', icon: BookOpen },
      { page: 'news', label: 'Actualités & to-do', icon: Newspaper, count: (m) => m.personal.news.length },
      { page: 'brand', label: 'Marque personnelle', icon: Megaphone },
    ],
  },
  {
    label: 'Système',
    items: [
      { page: 'files', label: 'Explorateur de fichiers', icon: FolderTree },
      { page: 'workspace', label: 'Espace de travail', icon: HardDrive },
    ],
  },
]

const ACTIVE_OF: Partial<Record<Route['page'], Route['page']>> = { entity: 'entities', project: 'projects', agent: 'agents' }

export function AppShell({ breadcrumb, children }: { breadcrumb: string[]; children: React.ReactNode }) {
  const { route, go, back, canBack, refresh, loading } = useApp()
  const model = useModel()
  const [collapsed, setCollapsed] = useState(false)
  const [palette, setPalette] = useState(false)
  const active = ACTIVE_OF[route.page] ?? route.page
  const owner = ownerName(model)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(true)
      }
      if (e.key === 'Escape') setPalette(false)
      if (e.altKey && e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [back])

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-ivory font-sans text-ink">
      {/* title bar (window controls are drawn by Windows on the right) */}
      <div className="drag flex h-8 shrink-0 items-center bg-ink pl-3 text-[11px] text-muted">
        <span className="flex items-center gap-2">
          <WakilMark className="h-3 w-auto" />
          Wakil — Personal & Business OS
        </span>
        <span className="ml-3 flex items-center gap-1 rounded bg-ink-3 px-1.5 py-0.5 text-[10px] text-ivory/70">
          <Lock className="size-2.5" /> lecture seule
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className={`flex shrink-0 flex-col bg-ink text-ivory transition-[width] ${collapsed ? 'w-[68px]' : 'w-64'}`}>
          <div className={`flex h-14 items-center ${collapsed ? 'justify-center' : 'justify-between px-4'}`}>
            {collapsed ? <WakilMark className="h-6 w-auto" /> : <WakilWordmark />}
            {!collapsed && (
              <button onClick={() => setCollapsed(true)} className="rounded-md p-1 text-muted hover:bg-ink-3 hover:text-ivory" aria-label="Réduire">
                <PanelLeftClose className="size-4" />
              </button>
            )}
          </div>

          {!collapsed && (
            <button
              onClick={() => go({ page: 'workspace' })}
              className="mx-3 mb-3 flex items-center gap-2.5 rounded-lg bg-ink-2 px-3 py-2 text-left transition-colors hover:bg-ink-3"
              title={model.root}
            >
              <span className="relative flex size-2 shrink-0">
                <span className="absolute inset-0 animate-ping rounded-full bg-ok/60" />
                <span className="absolute inset-0 rounded-full bg-ok" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold">Dossier surveillé</span>
                <span className="block truncate font-mono text-[10px] text-muted">{model.root}</span>
              </span>
            </button>
          )}

          <nav className="flex-1 overflow-y-auto px-3 pb-3">
            {SECTIONS.map((section) => (
              <div key={section.label} className="mt-3 first:mt-0">
                {!collapsed && <p className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-muted/70 uppercase">{section.label}</p>}
                {section.items.map((item) => {
                  const isActive = item.page === active
                  const Icon = item.icon
                  const count = item.count?.(model)
                  return (
                    <button
                      key={item.page}
                      onClick={() => go({ page: item.page } as Route)}
                      title={collapsed ? item.label : undefined}
                      className={`group relative flex w-full items-center gap-2.5 rounded-md py-1.5 text-[13px] whitespace-nowrap transition-colors ${
                        collapsed ? 'justify-center px-0' : 'px-2'
                      } ${isActive ? 'bg-ink-3 font-semibold text-ivory' : 'text-ivory/65 hover:bg-ink-2 hover:text-ivory'}`}
                    >
                      {isActive && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-terra" />}
                      <Icon className={`size-4 shrink-0 ${isActive ? 'text-terra' : ''}`} />
                      {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
                      {!collapsed && count !== undefined && <span className="font-mono text-[10px] text-muted">{count}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>

          <div className={`flex items-center gap-2.5 border-t border-ink-line p-3 ${collapsed ? 'flex-col' : ''}`}>
            <button
              onClick={() => go({ page: 'profile' })}
              className="grid size-8 shrink-0 place-items-center rounded-full bg-terra text-xs font-bold text-ink"
              aria-label="Profil"
            >
              {initials(owner)}
            </button>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{owner || 'Propriétaire'}</span>
                <span className="block truncate text-[10px] text-muted">Indexé {timeAgo(model.scannedAt)} · v0.10</span>
              </span>
            )}
            {collapsed && (
              <button onClick={() => setCollapsed(false)} className="rounded-md p-1 text-muted hover:text-ivory" aria-label="Déplier">
                <PanelLeftOpen className="size-4" />
              </button>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-paper px-4 sm:px-6">
            {canBack && (
              <button onClick={back} className="grid size-8 place-items-center rounded-lg text-slate hover:bg-ivory hover:text-ink" title="Retour (Alt+←)">
                <ArrowLeft className="size-4" />
              </button>
            )}
            <div className="flex min-w-0 items-center gap-1.5 text-sm">
              {breadcrumb.map((b, i) => (
                <React.Fragment key={b + i}>
                  {i > 0 && <span className="text-muted">/</span>}
                  <span className={`truncate ${i === breadcrumb.length - 1 ? 'font-semibold text-ink' : 'text-slate'}`}>{b}</span>
                </React.Fragment>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setPalette(true)}
                className="flex h-9 w-72 items-center gap-2 rounded-lg border border-line bg-ivory px-3 text-sm text-muted hover:border-slate"
              >
                <Search className="size-4" />
                <span className="flex-1 text-left">Rechercher partout…</span>
                <kbd className="rounded border border-line bg-paper px-1.5 font-mono text-[10px]">Ctrl K</kbd>
              </button>
              <button
                onClick={refresh}
                title="Ré-indexer le dossier"
                className="grid size-9 place-items-center rounded-lg text-slate hover:bg-ivory hover:text-ink"
              >
                <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
      {palette && <Palette onClose={() => setPalette(false)} />}
      <ChangeToast />
    </div>
  )
}

export function ownerName(m: ReturnType<typeof useModel>) {
  const p = m.personal.profile
  const sec = p?.sections.find((s) => /identity/i.test(s.heading))
  const line = sec?.content.match(/Name I want to be called:\s*(.+)/i)?.[1]?.trim()
  return line && !/^TODO/.test(line) ? line : ''
}
const initials = (n: string) => (n ? n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : 'W')

// ---------- Ctrl+K palette ----------
type Hit = { label: string; kind: string; sub?: string; route: Route }

function Palette({ onClose }: { onClose: () => void }) {
  const model = useModel()
  const { go } = useApp()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const all = useMemo<Hit[]>(() => {
    const out: Hit[] = []
    for (const c of model.commands) out.push({ label: c.slash, kind: 'Commande', sub: c.description, route: { page: 'commands', name: c.name } })
    for (const e of model.entities) out.push({ label: e.name, kind: 'Entité', sub: e.type, route: { page: 'entity', slug: e.slug } })
    for (const p of model.projects) out.push({ label: p.name, kind: 'Projet', sub: p.entityName, route: { page: 'project', key: p.key } })
    for (const a of model.agents) out.push({ label: a.name, kind: 'Agent', sub: a.description.slice(0, 90), route: { page: 'agent', id: a.id } })
    for (const t of model.tasks) out.push({ label: `${t.id} · ${t.title}`, kind: 'Tâche', sub: `${t.entitySlug}/${t.projectSlug} · ${t.status}`, route: t.projectSlug === 'none' ? { page: 'entity', slug: t.entitySlug } : { page: 'project', key: `${t.entitySlug}/${t.projectSlug}`, tab: 'kanban' } })
    for (const s of model.skills) out.push({ label: s.name, kind: 'Skill', sub: `${s.agent} · ${s.category}`, route: { page: 'skills', id: s.id } })
    for (const d of model.personal.news) out.push({ label: d.date, kind: 'Journée', sub: 'Actualités & to-do', route: { page: 'news', date: d.date } })
    for (const f of model.files) if (f.content !== undefined) out.push({ label: f.name, kind: 'Fichier', sub: f.path, route: { page: 'files', path: f.path } })
    return out
  }, [model])

  const hits = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return all.filter((h) => h.kind !== 'Fichier').slice(0, 12)
    const score = (h: Hit) => {
      const l = h.label.toLowerCase()
      if (l === t) return 0
      if (l.startsWith(t) || l.startsWith('/' + t)) return 1
      if (l.includes(t)) return 2
      if ((h.sub ?? '').toLowerCase().includes(t)) return 3
      return 9
    }
    return all
      .map((h) => ({ h, s: score(h) }))
      .filter((x) => x.s < 9)
      .sort((a, b) => a.s - b.s)
      .slice(0, 40)
      .map((x) => x.h)
  }, [q, all])

  useEffect(() => setSel(0), [q])
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const pick = (h?: Hit) => {
    if (!h) return
    go(h.route)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 pt-[12vh]" onMouseDown={onClose}>
      <div className="w-[640px] max-w-[92vw] overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 text-slate" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSel((s) => Math.min(s + 1, hits.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSel((s) => Math.max(s - 1, 0))
              } else if (e.key === 'Enter') pick(hits[sel])
            }}
            placeholder="Commandes, entités, projets, agents, skills, fichiers…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <kbd className="rounded border border-line px-1.5 font-mono text-[10px] text-muted">Échap</kbd>
        </div>
        <ul ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {hits.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate">Rien ne correspond à « {q} ».</li>}
          {hits.map((h, i) => (
            <li key={h.kind + h.label + i} data-i={i}>
              <button
                onMouseEnter={() => setSel(i)}
                onClick={() => pick(h)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left ${i === sel ? 'bg-ivory' : ''}`}
              >
                <span className="w-20 shrink-0 text-[11px] font-semibold text-slate">{h.kind}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${h.kind === 'Commande' ? 'font-mono' : 'font-medium'}`}>{h.label}</span>
                  {h.sub && <span className="block truncate text-xs text-slate">{h.sub}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ---------- live update toast ----------
function ChangeToast() {
  const { lastChange, go } = useApp()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!lastChange) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 6000)
    return () => clearTimeout(t)
  }, [lastChange])
  if (!visible || !lastChange) return null
  const list = [...lastChange.added, ...lastChange.changed]
  return (
    <div className="fixed right-5 bottom-5 z-40 w-80 rounded-xl border border-line bg-paper p-4 shadow-xl">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span className="size-2 rounded-full bg-sky" /> Dossier mis à jour
      </p>
      <p className="mt-1 text-xs text-slate">
        {lastChange.changed.length} modifié(s) · {lastChange.added.length} ajouté(s) · {lastChange.removed.length} supprimé(s)
      </p>
      <ul className="mt-2 space-y-1">
        {list.slice(0, 4).map((p) => (
          <li key={p}>
            <button onClick={() => go({ page: 'files', path: p })} className="block w-full truncate text-left font-mono text-[11px] text-terra-strong hover:underline">
              {p}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
