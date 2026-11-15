import { useMemo, useState } from 'react'
import { FilteredTimeline } from '../components/PeriodFilter'
import { Building2, EyeOff, FolderKanban, Shield, User, Users } from 'lucide-react'
import {
  Card,
  CardHeader,
  Chip,
  CommandHint,
  DocView,
  Empty,
  FileList,
  Page,
  PageTitle,
  Pill,
  ReadOnlyNote,
  SearchInput,
  SmartSection,
  StatusPill,
  Tabs,
  Timeline,
  TodoBadge,
  timeAgo,
} from '../components/ui'
import { findSection, firstParagraph } from '../lib/markdown'
import { useApp, useModel } from '../lib/store'
import { Kanban } from '../components/Kanban'
import type { Entity, MdDoc } from '../lib/types'

const TYPE_LABEL: Record<string, string> = { company: 'Entreprise', association: 'Association', club: 'Club', individual: 'Individu', personal: 'Projet personnel' }
export const typeLabel = (t: string) => TYPE_LABEL[t] ?? t

export function EntityIcon({ type, className = 'size-4' }: { type: string; className?: string }) {
  if (type === 'individual' || type === 'personal') return <User className={className} />
  if (type === 'association' || type === 'club') return <Users className={className} />
  return <Building2 className={className} />
}

export function EntitiesPage() {
  const m = useModel()
  const { go } = useApp()
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const types = [...new Set(m.entities.map((e) => e.type))]
  const list = m.entities.filter(
    (e) => (type === 'all' || e.type === type) && (!q || (e.name + e.slug + (e.doc?.body ?? '')).toLowerCase().includes(q.toLowerCase())),
  )
  return (
    <Page>
      <PageTitle
        title="Organisations & individus"
        sub={`${m.entities.length} entité(s) · ${m.projects.length} projet(s)`}
        path={`${m.root}\\entities\\`}
        right={<CommandHint command="/wakil.add-entity company" />}
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={type === 'all'} onClick={() => setType('all')} count={m.entities.length}>Toutes</Chip>
          {types.map((t) => (
            <Chip key={t} active={type === t} onClick={() => setType(t)} count={m.entities.filter((e) => e.type === t).length}>
              {typeLabel(t)}
            </Chip>
          ))}
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Rechercher une entité…" className="w-64" />
      </div>
      {list.length === 0 ? (
        <Empty title="Aucune entité" icon={<Building2 className="size-5" />}>
          Créez des dossiers dans <code className="font-mono">entities/</code> avec <code className="font-mono">/wakil.add-entity</code>.
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((e) => (
            <EntityCard key={e.slug} e={e} onOpen={() => go({ page: 'entity', slug: e.slug })} />
          ))}
        </div>
      )}
    </Page>
  )
}

function EntityCard({ e, onOpen }: { e: Entity; onOpen: () => void }) {
  const { go } = useApp()
  const sector = findSection(e.doc, 'identity')?.content.match(/Sector[^:]*:\s*(.+)/i)?.[1]
  const pos = e.parts.position ? firstParagraph(e.parts.position.sections.map((s) => s.content).join('\n\n'), 160) : ''
  return (
    <div onClick={onOpen} className="cursor-pointer rounded-xl border border-line bg-paper p-5 transition-colors hover:border-slate">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink text-ivory">
          <EntityIcon type={e.type} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{e.name}</span>
            <Pill>{typeLabel(e.type)}</Pill>
            <StatusPill status={e.status} />
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-slate">{sector && !/^TODO/.test(sector) ? sector : pos || 'Pas de description.'}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {e.projects.map((p) => (
          <button
            key={p.key}
            onClick={(ev) => {
              ev.stopPropagation()
              go({ page: 'project', key: p.key })
            }}
            className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium hover:border-slate"
          >
            <FolderKanban className="size-3" /> {p.name}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-slate">
        <span>{e.decisions.length} décisions</span>
        <span>{e.checkpoints.length} points de reprise</span>
        <span>{e.files.length} fichiers</span>
        {e.created && <span>créée le {e.created}</span>}
        <span className="ml-auto"><TodoBadge n={e.todo} /></span>
      </div>
    </div>
  )
}

type Tab = 'tasks' | 'overview' | 'position' | 'rules' | 'brand' | 'org' | 'people' | 'projects' | 'documents' | 'resume' | 'decisions' | 'files'

export function EntityPage({ slug, tab }: { slug: string; tab?: string }) {
  const m = useModel()
  const { go } = useApp()
  const e = m.entities.find((x) => x.slug === slug)
  const [active, setActive] = useState<Tab>((tab as Tab) || 'overview')
  const ownFiles = useMemo(() => (e ? e.files.filter((f) => !f.path.startsWith(e.path + '/projects/')) : []), [e])
  if (!e) return <Page><Empty title="Entité introuvable">Le dossier a peut-être été renommé.</Empty></Page>

  const tabs: { id: Tab; label: string; count?: number; disabled?: boolean }[] = [
    { id: 'overview', label: 'Vue d’ensemble' },
    { id: 'projects', label: 'Projets', count: e.projects.length },
    { id: 'tasks', label: 'Tâches hors projet', count: e.tasks.length },
    { id: 'decisions', label: 'Décisions', count: e.decisions.length },
    { id: 'resume', label: 'Points de reprise', count: e.checkpoints.length, disabled: !e.parts.resume },
    { id: 'position', label: 'Ma position', disabled: !e.parts.position },
    { id: 'rules', label: 'Règles', disabled: !e.parts.rules },
    { id: 'brand', label: 'Marque', disabled: !e.parts.brand },
    { id: 'org', label: 'Organisation', disabled: !e.parts.org && !e.departments.length },
    { id: 'people', label: 'Personnes', disabled: !e.parts.people },
    { id: 'documents', label: 'Documents', disabled: !e.parts.documents },
    { id: 'files', label: 'Fichiers', count: ownFiles.length },
  ]

  return (
    <Page>
      <PageTitle
        kicker={typeLabel(e.type)}
        title={
          <span className="flex items-center gap-3">
            {e.name} <StatusPill status={e.status} />
          </span>
        }
        sub={
          <span className="flex flex-wrap items-center gap-3">
            {e.created && <span>Créée le {e.created}</span>}
            <span>{e.projects.length} projet(s)</span>
            <TodoBadge n={e.todo} />
          </span>
        }
        path={`${m.root}\\${e.path.replace(/\//g, '\\')}`}
        right={<CommandHint command={`/wakil.update-context ${e.slug} `} />}
      />
      <Tabs tabs={tabs} active={active} onChange={setActive} />

      {active === 'overview' && <EntityOverview e={e} onTab={setActive} />}
      {active === 'tasks' && <Kanban tasks={e.tasks} plans={e.plans} createCommand={`/wakil.plan ${e.slug} none <objectif>`} />}
      {active === 'decisions' && (
        <Card className="p-5">
          <FilteredTimeline items={[...e.decisions].reverse()} />
        </Card>
      )}
      {active === 'resume' && e.parts.resume && (
        <div className="space-y-4">
          <Card className="p-5">
            <FilteredTimeline items={[...e.checkpoints].reverse()} />
          </Card>
          <ReadOnlyNote command={`/wakil.resume ${e.slug}`}>Reprenez là où vous vous êtes arrêté avec cette commande dans Claude Code.</ReadOnlyNote>
        </div>
      )}
      {active === 'position' && e.parts.position && <DocView doc={e.parts.position} />}
      {active === 'rules' && e.parts.rules && <DocView doc={e.parts.rules} />}
      {active === 'brand' && e.parts.brand && <DocView doc={e.parts.brand} />}
      {active === 'org' && (
        <div className="space-y-6">
          {e.parts.org && <DocView doc={e.parts.org} />}
          {e.departments.map((d) => <DocView key={d.path} doc={d} defaultCollapsed />)}
          {e.teams.map((d) => <DocView key={d.path} doc={d} defaultCollapsed />)}
        </div>
      )}
      {active === 'people' && e.parts.people && <PeopleView doc={e.parts.people} />}
      {active === 'documents' && e.parts.documents && <DocView doc={e.parts.documents} />}
      {active === 'projects' &&
        (e.projects.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {e.projects.map((p) => (
              <button key={p.key} onClick={() => go({ page: 'project', key: p.key })} className="rounded-xl border border-line bg-paper p-5 text-left hover:border-slate">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <StatusPill status={p.status} />
                </div>
                <p className="mt-1 text-xs text-slate">{p.type}</p>
                <p className="mt-2 line-clamp-3 text-sm text-slate">{firstParagraph(findSection(p.doc, 'goal')?.content ?? '', 240)}</p>
                <p className="mt-3 text-xs text-muted">{p.decisions.length} décisions · {p.files.length} fichiers · {p.repos.length} dépôt(s) de code</p>
              </button>
            ))}
          </div>
        ) : (
          <Empty title="Aucun projet">
            <CommandHint command={`/wakil.new-project ${e.slug} `} />
          </Empty>
        ))}
      {active === 'files' && (
        <Card>
          <FileList files={ownFiles} base={e.path} />
        </Card>
      )}
    </Page>
  )
}

function EntityOverview({ e, onTab }: { e: Entity; onTab: (t: Tab) => void }) {
  const d = e.doc
  if (!d) return <Empty title="ENTITY.md manquant" />
  const identity = findSection(d, 'identity')
  const business = findSection(d, 'business')
  const trello = findSection(d, 'trello')
  const lastCp = e.checkpoints[e.checkpoints.length - 1]
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        {identity && (
          <Card>
            <CardHeader title="Identité" />
            <div className="px-5 pb-5"><SmartSection section={identity} docPath={d.path} /></div>
          </Card>
        )}
        {business && (
          <Card>
            <CardHeader title="Contexte business" />
            <div className="px-5 pb-5"><SmartSection section={business} docPath={d.path} /></div>
          </Card>
        )}
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-slate hover:text-ink">Document ENTITY.md complet</summary>
          <div className="mt-4"><DocView doc={d} hideSections={['identity', 'business', 'decisions']} /></div>
        </details>
      </div>
      <aside className="space-y-6">
        {lastCp && (
          <Card className="p-5">
            <p className="text-xs font-semibold text-slate uppercase">Dernier point de reprise</p>
            <p className="mt-1 font-mono text-xs text-muted">{lastCp.date}</p>
            <p className="mt-1 text-sm">{lastCp.text}</p>
            <button onClick={() => onTab('resume')} className="mt-3 text-xs font-semibold text-terra-strong hover:underline">Historique</button>
          </Card>
        )}
        <Card>
          <CardHeader title="Fichiers de contexte" />
          <ul className="px-2 pb-3">
            {(
              [
                ['position', 'Ma position', Shield],
                ['rules', 'Règles', Shield],
                ['brand', 'Marque', Shield],
                ['org', 'Organisation', Building2],
                ['people', 'Personnes', Users],
                ['documents', 'Documents', Shield],
              ] as const
            ).map(([k, label]) => {
              const doc = e.parts[k as keyof Entity['parts']]
              return (
                <li key={k}>
                  <button
                    disabled={!doc}
                    onClick={() => onTab(k as Tab)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-ivory disabled:opacity-40"
                  >
                    <span>{label}</span>
                    {doc ? <span className="flex items-center gap-2"><TodoBadge n={doc.todo} /><span className="text-[11px] text-muted">{timeAgo(doc.mtime)}</span></span> : <span className="text-[11px] text-muted">absent</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
        {trello && (
          <Card>
            <CardHeader title="Trello" />
            <div className="px-5 pb-5"><SmartSection section={trello} docPath={d.path} /></div>
          </Card>
        )}
        <Card className="p-5">
          <p className="text-xs font-semibold text-slate uppercase">Décisions récentes</p>
          <div className="mt-3"><Timeline items={[...e.decisions].reverse()} limit={4} /></div>
        </Card>
      </aside>
    </div>
  )
}

function PeopleView({ doc }: { doc: MdDoc }) {
  const [shown, setShown] = useState(false)
  if (!shown)
    return (
      <Empty title="Contacts masqués" icon={<EyeOff className="size-5" />}>
        <p>PEOPLE.md contient des contacts professionnels. Il est masqué par défaut pour éviter de l’afficher par accident (partage d’écran…).</p>
        <button onClick={() => setShown(true)} className="mt-4 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink hover:border-slate">
          Afficher les contacts
        </button>
      </Empty>
    )
  return <DocView doc={doc} />
}
