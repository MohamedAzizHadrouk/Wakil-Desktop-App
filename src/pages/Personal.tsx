import { useState } from 'react'
import { BookOpen, CalendarDays, Megaphone, Newspaper, UserRound } from 'lucide-react'
import { Card, CardHeader, Checklist, CommandHint, DocView, Empty, FileList, fmtDate, Page, PageTitle, Pill, Progress, StatusPill, Tabs, TodoBadge } from '../components/ui'
import { parseChecks } from '../lib/markdown'
import { useApp, useModel } from '../lib/store'

export function ProfilePage() {
  const { personal } = useModel()
  const setup = personal.setup ? parseChecks(personal.setup.body) : []
  return (
    <Page>
      <PageTitle kicker="Personnel" title="Profil" sub="Qui vous êtes, vos objectifs et comment Claude doit travailler avec vous" right={<CommandHint command="/wakil.profile" />} />
      {!personal.profile ? (
        <Empty title="PROFILE.md introuvable" icon={<UserRound className="size-5" />}>Lancez <code className="font-mono">/wakil.setup</code> dans Claude Code.</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0"><DocView doc={personal.profile} /></div>
          <aside className="space-y-6">
            {personal.setup && (
              <Card>
                <CardHeader title="Mise en place (/wakil.setup)" sub={Object.entries(personal.setup.meta).map(([k, v]) => `${k}: ${v}`).join(' · ')} />
                <div className="space-y-4 px-5 pb-5">
                  <Progress done={setup.filter((s) => s.done).length} total={setup.length} tone="terra" />
                  <Checklist items={setup} />
                  <CommandHint command="/wakil.setup --resume" />
                </div>
              </Card>
            )}
          </aside>
        </div>
      )}
    </Page>
  )
}

export function KnowledgePage({ slug }: { slug?: string }) {
  const { personal } = useModel()
  const { go } = useApp()
  const sel = personal.learning.find((l) => l.slug === slug)
  return (
    <Page>
      <PageTitle kicker="Personnel" title="Connaissances" sub="Compétences acquises, apprentissages en cours et backlog" right={<CommandHint command='/wakil.learn "<skill>"' />} />
      {sel ? (
        <div className="space-y-6">
          <button onClick={() => go({ page: 'knowledge' })} className="text-sm font-semibold text-slate hover:text-ink">← Toutes les compétences</button>
          {sel.doc ? <DocView doc={sel.doc} /> : <Empty title="SKILL.md absent" />}
          {sel.projects.map((p) => <DocView key={p.path} doc={p} defaultCollapsed />)}
          <Card><CardHeader title="Fichiers" /><FileList files={sel.files} base={sel.path} /></Card>
        </div>
      ) : (
        <div className="space-y-6">
          {personal.learning.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {personal.learning.map((l) => (
                <button key={l.slug} onClick={() => go({ page: 'knowledge', slug: l.slug })} className="rounded-xl border border-line bg-paper p-5 text-left hover:border-slate">
                  <BookOpen className="size-4 text-terra-strong" />
                  <p className="mt-2 font-semibold">{l.doc?.title ?? l.slug}</p>
                  <p className="mt-1 text-xs text-slate">{l.projects.length} projet(s) · {l.files.length} fichiers</p>
                </button>
              ))}
            </div>
          )}
          {personal.skills ? <DocView doc={personal.skills} /> : <Empty title="knowledge/SKILLS.md introuvable" icon={<BookOpen className="size-5" />}>Lancez <code className="font-mono">/wakil.skills</code>.</Empty>}
        </div>
      )}
    </Page>
  )
}

type NewsTab = 'todo' | 'news' | 'trends' | 'prefs'

export function NewsPage({ date, tab }: { date?: string; tab?: string }) {
  const { personal } = useModel()
  const [selDate, setSelDate] = useState(date ?? personal.news[0]?.date)
  const [active, setActive] = useState<NewsTab>((tab as NewsTab) || 'todo')
  const day = personal.news.find((d) => d.date === selDate) ?? personal.news[0]
  const todos = day?.todo ? parseChecks(day.todo.body) : []
  const current = active === 'prefs' ? personal.newsPrefs : active === 'todo' ? day?.todo : active === 'news' ? day?.news : day?.trends
  return (
    <Page wide>
      <PageTitle kicker="Personnel" title="Actualités & to-do" sub="Un dossier par jour : TODO.md, NEWS.md, TRENDS.md" right={<CommandHint command="/wakil.news" />} />
      {!personal.news.length && !personal.newsPrefs ? (
        <Empty title="Aucune journée" icon={<Newspaper className="size-5" />}>Générez la première avec <code className="font-mono">/wakil.news</code>.</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <Card className="self-start py-2">
            <p className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">Journées</p>
            {personal.news.map((d) => {
              const c = d.todo ? parseChecks(d.todo.body) : []
              return (
                <button key={d.date} onClick={() => setSelDate(d.date)} className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-ivory ${d.date === day?.date ? 'bg-ivory font-semibold' : ''}`}>
                  <CalendarDays className="size-4 text-slate" />
                  <span className="flex-1">{fmtDate(d.date)}</span>
                  {c.length > 0 && <span className="font-mono text-[10px] text-muted">{c.filter((x) => x.done).length}/{c.length}</span>}
                </button>
              )
            })}
          </Card>
          <div className="min-w-0">
            <Tabs
              tabs={[
                { id: 'todo', label: 'To-do', count: todos.length, disabled: !day?.todo },
                { id: 'news', label: 'Actualités', disabled: !day?.news },
                { id: 'trends', label: 'Tendances', disabled: !day?.trends },
                { id: 'prefs', label: 'Préférences', disabled: !personal.newsPrefs },
              ]}
              active={active}
              onChange={setActive}
            />
            {active === 'todo' && day?.todo ? (
              <Card className="p-5">
                <Progress done={todos.filter((t) => t.done).length} total={todos.length} />
                <div className="mt-5"><Checklist items={todos} /></div>
                <div className="mt-5"><CommandHint command="/wakil.todo done 1" /></div>
              </Card>
            ) : current ? (
              <DocView key={current.path} doc={current} />
            ) : (
              <Empty title="Fichier absent pour cette journée">
                <CommandHint command={`/wakil.news ${day?.date ?? 'today'}`} />
              </Empty>
            )}
          </div>
        </div>
      )}
    </Page>
  )
}

export function BrandPage({ channel }: { channel?: string }) {
  const { personal } = useModel()
  const { go } = useApp()
  const [tab, setTab] = useState<'brand' | 'strategy' | 'channels' | 'assets'>(channel ? 'channels' : 'brand')
  const ch = personal.channels.find((c) => c.slug === channel)
  return (
    <Page>
      <PageTitle kicker="Personnel" title="Marque personnelle" sub="Positionnement, stratégie, canaux et contenus" right={<CommandHint command="/wakil.brand --show" />} />
      {!personal.brand && !personal.channels.length ? (
        <Empty title="Aucune marque personnelle" icon={<Megaphone className="size-5" />}>Lancez <code className="font-mono">/wakil.brand --setup</code>.</Empty>
      ) : (
        <>
          <Tabs
            tabs={[
              { id: 'brand', label: 'Marque', disabled: !personal.brand },
              { id: 'strategy', label: 'Stratégie', disabled: !personal.strategy },
              { id: 'channels', label: 'Canaux', count: personal.channels.length },
              { id: 'assets', label: 'Assets', disabled: !personal.assets },
            ]}
            active={tab}
            onChange={(t) => {
              setTab(t)
              if (t === 'channels' && channel) go({ page: 'brand' })
            }}
          />
          {tab === 'brand' && personal.brand && <DocView doc={personal.brand} />}
          {tab === 'strategy' && personal.strategy && <DocView doc={personal.strategy} />}
          {tab === 'assets' && personal.assets && <DocView doc={personal.assets} />}
          {tab === 'channels' &&
            (ch ? (
              <div className="space-y-6">
                <button onClick={() => go({ page: 'brand', channel: undefined })} className="text-sm font-semibold text-slate hover:text-ink">← Tous les canaux</button>
                {ch.channel && <DocView doc={ch.channel} />}
                {ch.content && <DocView doc={ch.content} />}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  {personal.channels.map((c) => (
                    <button key={c.slug} onClick={() => go({ page: 'brand', channel: c.slug })} className="rounded-xl border border-line bg-paper p-5 text-left hover:border-slate">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{c.name}</span>
                        <StatusPill status={c.status} />
                      </div>
                      <p className="mt-2 text-xs text-slate">{c.files.length} fichiers</p>
                      <div className="mt-3 flex gap-2">
                        <TodoBadge n={(c.channel?.todo ?? 0) + (c.content?.todo ?? 0)} />
                        {c.content && <Pill>CONTENT.md</Pill>}
                      </div>
                    </button>
                  ))}
                </div>
                {personal.channelsIndex && <DocView doc={personal.channelsIndex} />}
              </div>
            ))}
        </>
      )}
    </Page>
  )
}
