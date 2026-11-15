import { useEffect, useMemo, useState } from 'react'
import { FilteredTimeline } from '../components/PeriodFilter'
import { Code2, FileText, FolderKanban, Package } from 'lucide-react'
import {
  AssetPreview,
  Card,
  CardHeader,
  Chip,
  CommandHint,
  DocView,
  Empty,
  FileActions,
  FileList,
  formatSize,
  Page,
  PageTitle,
  Pill,
  SearchInput,
  SmartSection,
  StatusPill,
  Tabs,
  Timeline,
  TodoBadge,
  timeAgo,
} from '../components/ui'
import { Markdown } from '../components/Markdown'
import { findSection, firstParagraph } from '../lib/markdown'
import { useApp, useModel } from '../lib/store'
import type { Project, RawFile } from '../lib/types'
import { EntityIcon, typeLabel } from './Entities'
import { entityOf } from '../lib/model'
import { Kanban } from '../components/Kanban'
import { ProjectUsage } from './ProjectUsage'

export function ProjectsPage({ scope: initialScope = 'all' }: { scope?: 'all' | 'clients' | 'personal' }) {
  const [scope, setScope] = useState<'all' | 'clients' | 'personal'>(initialScope)
  useEffect(() => setScope(initialScope), [initialScope])
  const m = useModel()
  const { go } = useApp()
  const [q, setQ] = useState('')
  const list = m.projects
    .filter((p) => scope === 'all' || (scope === 'personal' ? p.personal : !p.personal))
    .filter((p) => !q || (p.name + p.entityName + (p.doc?.body ?? '')).toLowerCase().includes(q.toLowerCase()))
  const nPersonal = m.projects.filter((p) => p.personal).length
  return (
    <Page>
      <PageTitle
        title={scope === 'personal' ? 'Projets personnels' : 'Projets'}
        sub={`${m.projects.length - nPersonal} projet(s) clients dans ${m.entities.length} entité(s) · ${nPersonal} projet(s) personnel(s)`}
        right={
          <>
            <CommandHint command="/wakil.personal-project add " />
            <SearchInput value={q} onChange={setQ} placeholder="Rechercher un projet…" className="w-64" />
          </>
        }
      />
      <div className="mb-4 flex gap-1.5">
        <Chip active={scope === 'all'} onClick={() => setScope('all')} count={m.projects.length}>Tous</Chip>
        <Chip active={scope === 'clients'} onClick={() => setScope('clients')} count={m.projects.length - nPersonal}>Clients</Chip>
        <Chip active={scope === 'personal'} onClick={() => setScope('personal')} count={nPersonal}>Personnels</Chip>
      </div>
      {list.length === 0 ? (
        <Empty title="Aucun projet" icon={<FolderKanban className="size-5" />}>
          Les projets sont lus depuis <code className="font-mono">entities/&lt;entité&gt;/projects/&lt;projet&gt;/PROJECT.md</code>.
        </Empty>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate">
              <tr className="border-b border-line">
                <th className="px-5 py-2.5 font-medium">Projet</th>
                <th className="px-3 py-2.5 font-medium">Entité</th>
                <th className="px-3 py-2.5 font-medium">Statut</th>
                <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Dernière décision</th>
                <th className="px-5 py-2.5 text-right font-medium">Fichiers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((p) => {
                const last = p.decisions[p.decisions.length - 1]
                return (
                  <tr key={p.key} onClick={() => go({ page: 'project', key: p.key })} className="cursor-pointer hover:bg-ivory">
                    <td className="px-5 py-3">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-slate">{p.type}</p>
                    </td>
                    <td className="px-3 py-3 text-slate">{p.entityName}</td>
                    <td className="px-3 py-3"><StatusPill status={p.status} /></td>
                    <td className="hidden max-w-[360px] px-3 py-3 text-xs text-slate lg:table-cell">
                      {last && <><span className="font-mono text-ink">{last.date}</span> · <span className="line-clamp-2">{last.text.replace(/`/g, '')}</span></>}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs">{p.files.length}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </Page>
  )
}

type Tab = 'overview' | 'kanban' | 'usage' | 'decisions' | 'docs' | 'assets' | 'code' | 'files'

const IMG = ['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp']

export function ProjectPage({ projectKey, tab }: { projectKey: string; tab?: string }) {
  const m = useModel()
  const { go } = useApp()
  const p = m.projects.find((x) => x.key === projectKey)
  const [active, setActive] = useState<Tab>((tab as Tab) || 'overview')
  const [docSel, setDocSel] = useState<string | null>(null)
  const assets = useMemo(
    () => (p ? p.files.filter((f) => !f.content && !f.name.startsWith('.') && f.ext !== '') : []),
    [p],
  )
  if (!p) return <Page><Empty title="Projet introuvable" /></Page>
  const entity = entityOf(m, p.entitySlug)!
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Vue d’ensemble' },
    { id: 'kanban', label: 'Kanban', count: p.tasks.length },
    { id: 'usage', label: 'Usage & crédits' },
    { id: 'decisions', label: 'Décisions', count: p.decisions.length },
    { id: 'docs', label: 'Documents', count: p.docs.length },
    { id: 'assets', label: 'Assets & livrables', count: assets.length },
    { id: 'code', label: 'Code', count: p.repos.length },
    { id: 'files', label: 'Fichiers', count: p.files.length },
  ]
  const current = p.docs.find((d) => d.path === docSel) ?? p.docs[0]

  return (
    <Page>
      <PageTitle
        kicker={
          <button onClick={() => go(p.personal ? { page: 'personal-projects' } : { page: 'entity', slug: entity.slug })} className="flex items-center gap-1.5 hover:underline">
            <EntityIcon type={entity.type} className="size-3" /> {entity.name} · {typeLabel(entity.type)}
          </button>
        }
        title={<span className="flex flex-wrap items-center gap-3">{p.name} <StatusPill status={p.status} /></span>}
        sub={<span className="flex flex-wrap items-center gap-3">{p.type && <span>{p.type}</span>}<TodoBadge n={p.doc?.todo ?? 0} /></span>}
        path={`${m.root}\\${p.path.replace(/\//g, '\\')}`}
        right={
          <span className="flex flex-col items-end gap-1.5">
            <CommandHint command={`/wakil.plan ${p.entitySlug} ${p.slug} `} />
            <CommandHint command={`/wakil.plan.trello ${p.entitySlug} ${p.slug} `} />
          </span>
        }
      />
      <Tabs tabs={tabs} active={active} onChange={setActive} />

      {active === 'overview' && <ProjectOverview p={p} onTab={setActive} />}
      {active === 'kanban' && <Kanban tasks={p.tasks} plans={p.plans} createCommand={`/wakil.plan ${p.entitySlug} ${p.slug} <objectif>`} />}
      {active === 'usage' && <ProjectUsage p={p} />}
      {active === 'decisions' && (
        <Card className="p-5">
          <FilteredTimeline items={[...p.decisions].reverse()} />
        </Card>
      )}
      {active === 'docs' &&
        (p.docs.length ? (
          <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <Card className="self-start py-2">
              {p.docs.map((d) => (
                <button
                  key={d.path}
                  onClick={() => setDocSel(d.path)}
                  className={`flex w-full items-start gap-2 px-4 py-2 text-left text-sm hover:bg-ivory ${current?.path === d.path ? 'bg-ivory font-semibold' : ''}`}
                >
                  <FileText className="mt-0.5 size-4 shrink-0 text-slate" />
                  <span className="min-w-0">
                    <span className="block truncate">{d.title}</span>
                    <span className="block truncate font-mono text-[10px] font-normal text-muted">{d.path.slice(p.path.length + 1)}</span>
                  </span>
                </button>
              ))}
            </Card>
            {current && <DocView key={current.path} doc={current} />}
          </div>
        ) : (
          <Empty title="Aucun autre document markdown" />
        ))}
      {active === 'assets' && <AssetsGrid files={assets} base={p.path} />}
      {active === 'code' &&
        (p.repos.length ? (
          <div className="space-y-4">
            {p.repos.map((r) => (
              <Card key={r.path}>
                <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="grid size-10 place-items-center rounded-lg bg-ink text-ivory"><Code2 className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{r.name}</p>
                    <p className="truncate font-mono text-[11px] text-muted">{r.path.slice(p.path.length + 1)}</p>
                  </div>
                  <Pill tone="sky">{r.kind}</Pill>
                  <span className="text-xs text-muted">{timeAgo(r.mtime)}</span>
                  <FileActions path={r.path} compact />
                </div>
                {r.readme && (
                  <details className="border-t border-line px-5 py-3">
                    <summary className="cursor-pointer text-xs font-semibold text-slate">README</summary>
                    <div className="mt-3"><Markdown source={r.readme} /></div>
                  </details>
                )}
              </Card>
            ))}
            <p className="text-xs text-slate">Les dépôts de code ne sont pas indexés fichier par fichier (node_modules, bin, obj… ignorés) : ouvrez-les dans votre éditeur.</p>
          </div>
        ) : (
          <Empty title="Aucun dépôt de code détecté" />
        ))}
      {active === 'files' && (
        <Card>
          <FileList files={p.files} base={p.path} />
        </Card>
      )}
    </Page>
  )
}

function ProjectOverview({ p, onTab }: { p: Project; onTab: (t: Tab) => void }) {
  const d = p.doc
  if (!d) return <Empty title="PROJECT.md manquant" />
  const goal = findSection(d, 'goal')
  const tech = findSection(d, 'technical')
  const design = findSection(d, 'design')
  const meta = Object.entries(d.meta)
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        {goal && (
          <Card>
            <CardHeader title={goal.heading} />
            <div className="px-5 pb-5"><SmartSection section={goal} docPath={d.path} /></div>
          </Card>
        )}
        {tech && (
          <Card>
            <CardHeader title={tech.heading} />
            <div className="px-5 pb-5"><SmartSection section={tech} docPath={d.path} /></div>
          </Card>
        )}
        {design && (
          <Card>
            <CardHeader title={design.heading} />
            <div className="px-5 pb-5"><SmartSection section={design} docPath={d.path} /></div>
          </Card>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-slate hover:text-ink">Document PROJECT.md complet</summary>
          <div className="mt-4"><DocView doc={d} hideSections={['goal', 'technical', 'design', 'decisions']} /></div>
        </details>
      </div>
      <aside className="space-y-6">
        {meta.length > 0 && (
          <Card className="p-5">
            <dl className="space-y-3">
              {meta.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{k}</dt>
                  <dd className="mt-0.5 text-sm"><Markdown source={v} docPath={d.path} className="[&_p]:!my-0" /></dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate uppercase">Décisions récentes</p>
            <button onClick={() => onTab('decisions')} className="text-xs font-semibold text-terra-strong hover:underline">Toutes ({p.decisions.length})</button>
          </div>
          <div className="mt-3"><Timeline items={[...p.decisions].reverse()} limit={5} /></div>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold text-slate uppercase">Contenu</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            <li><button onClick={() => onTab('docs')} className="hover:underline">{p.docs.length} documents markdown</button></li>
            <li><button onClick={() => onTab('code')} className="hover:underline">{p.repos.length} dépôt(s) de code</button></li>
            <li><button onClick={() => onTab('files')} className="hover:underline">{p.files.length} fichiers indexés</button></li>
          </ul>
          <p className="mt-3 text-xs text-slate">{firstParagraph(d.intro)}</p>
        </Card>
      </aside>
    </div>
  )
}

function AssetsGrid({ files, base }: { files: RawFile[]; base: string }) {
  if (!files.length) return <Empty title="Aucun asset" icon={<Package className="size-5" />} />
  const images = files.filter((f) => IMG.includes(f.ext))
  const others = files.filter((f) => !IMG.includes(f.ext))
  return (
    <div className="space-y-6">
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((f) => (
            <Card key={f.path} className="overflow-hidden">
              <AssetPreview path={f.path} className="h-36 w-full bg-[repeating-conic-gradient(#f1f3f7_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-3" />
              <div className="flex items-center gap-2 border-t border-line px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={f.path}>{f.name}</span>
                <FileActions path={f.path} compact />
              </div>
            </Card>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <Card>
          <CardHeader title="Livrables & autres fichiers" sub="Ouvrez-les avec l’application par défaut (PowerPoint, lecteur PDF…)" />
          <ul className="divide-y divide-line border-t border-line">
            {others.map((f) => (
              <li key={f.path} className="flex items-center gap-3 px-5 py-2.5">
                <Pill className="w-14 justify-center font-mono uppercase">{f.ext.slice(1) || '—'}</Pill>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.path.slice(base.length + 1)}</span>
                <span className="text-xs text-muted">{formatSize(f.size)}</span>
                <FileActions path={f.path} compact />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
