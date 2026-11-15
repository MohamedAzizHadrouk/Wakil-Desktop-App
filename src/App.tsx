import React from 'react'
import { AppShell } from './components/AppShell'
import { useApp } from './lib/store'
import { Welcome } from './pages/Welcome'
import { Dashboard } from './pages/Dashboard'
import { EntitiesPage, EntityPage } from './pages/Entities'
import { ProjectPage, ProjectsPage } from './pages/Projects'
import { AgentPage, AgentsPage } from './pages/Agents'
import { SkillsPage } from './pages/Skills'
import { CommandsPage } from './pages/Commands'
import { BrandPage, KnowledgePage, NewsPage, ProfilePage } from './pages/Personal'
import { FilesPage } from './pages/Files'
import { WorkspacePage } from './pages/Workspace'
import { UsagePage } from './pages/Usage'

class Boundary extends React.Component<{ children: React.ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (this.state.error)
      return (
        <div className="m-8 rounded-xl border border-danger/30 bg-danger-soft p-6 text-sm">
          <p className="font-semibold text-danger">Cet écran n’a pas pu s’afficher.</p>
          <pre className="mt-2 font-mono text-xs whitespace-pre-wrap text-ink">{this.state.error.message}</pre>
        </div>
      )
    return this.props.children
  }
}

export function App() {
  const { model, loading, route, error } = useApp()
  if (!model) return <Welcome loading={loading} error={error} />

  let crumbs: string[] = []
  let body: React.ReactNode
  switch (route.page) {
    case 'dashboard':
      crumbs = ['Espace', 'Tableau de bord']
      body = <Dashboard />
      break
    case 'entities':
      crumbs = ['Organisations & individus']
      body = <EntitiesPage />
      break
    case 'entity': {
      const e = model.entities.find((x) => x.slug === route.slug)
      crumbs = ['Organisations & individus', e?.name ?? route.slug]
      body = <EntityPage slug={route.slug} tab={route.tab} />
      break
    }
    case 'projects':
      crumbs = ['Projets']
      body = <ProjectsPage />
      break
    case 'personal-projects':
      crumbs = ['Personnel', 'Projets personnels']
      body = <ProjectsPage scope="personal" />
      break
    case 'project': {
      const p = model.projects.find((x) => x.key === route.key)
      crumbs = ['Projets', p?.entityName ?? '', p?.name ?? route.key]
      body = <ProjectPage projectKey={route.key} tab={route.tab} />
      break
    }
    case 'agents':
      crumbs = ['Écosystème IA', 'Agents']
      body = <AgentsPage />
      break
    case 'agent':
      crumbs = ['Écosystème IA', 'Agents', route.id]
      body = <AgentPage id={route.id} />
      break
    case 'skills':
      crumbs = ['Écosystème IA', 'Skills']
      body = <SkillsPage initial={route.id} />
      break
    case 'commands':
      crumbs = ['Écosystème IA', 'Commandes']
      body = <CommandsPage initial={route.name} />
      break
    case 'profile':
      crumbs = ['Personnel', 'Profil']
      body = <ProfilePage />
      break
    case 'knowledge':
      crumbs = ['Personnel', 'Connaissances']
      body = <KnowledgePage slug={route.slug} />
      break
    case 'news':
      crumbs = ['Personnel', 'Actualités & to-do']
      body = <NewsPage date={route.date} tab={route.tab} />
      break
    case 'brand':
      crumbs = ['Personnel', 'Marque personnelle']
      body = <BrandPage channel={route.channel} />
      break
    case 'files':
      crumbs = ['Système', 'Explorateur']
      body = <FilesPage path={route.path} />
      break
    case 'usage':
      crumbs = ['Écosystème IA', 'Usage & crédits']
      body = <UsagePage tab={route.tab} />
      break
    case 'workspace':
      crumbs = ['Système', 'Espace de travail']
      body = <WorkspacePage />
      break
  }
  return (
    <AppShell breadcrumb={crumbs.filter(Boolean)}>
      <Boundary resetKey={JSON.stringify(route)}>{body}</Boundary>
    </AppShell>
  )
}
