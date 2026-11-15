import { useMemo } from 'react'
import { Coins } from 'lucide-react'
import { ProjectAllocation } from '../components/ProjectAllocation'
import { Bars, Kpi, RunsTable, TokenSplit, agentLabel } from '../components/usage'
import { Card, CardHeader, Empty } from '../components/ui'
import { useApp } from '../lib/store'
import { aggregate, fmtCost, fmtTokens, sumTokens, totalOf } from '../lib/usage'
import type { Project, Run, Turn } from '../lib/types'

export function ProjectUsage({ p }: { p: Project }) {
  const { usage, usageLoading } = useApp()
  const items = useMemo<(Run | Turn)[]>(() => {
    if (!usage) return []
    const mine = (x: Run | Turn) => x.attr.entity === p.entitySlug && x.attr.project === p.slug
    return [...usage.runs.filter(mine), ...usage.turns.filter(mine)].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  }, [usage, p])
  const alloc = <ProjectAllocation projectKey={`${p.entitySlug}/${p.slug}`} />
  if (!usage) return <Empty title={usageLoading ? 'Lecture de l’historique Claude Code…' : 'Historique indisponible'} />
  if (!items.length)
    return (
      <div className="space-y-6">
      {alloc}
      <Empty title="Aucune consommation attribuée à ce projet" icon={<Coins className="size-5" />}>
        Les exécutions sont attribuées par la ligne <code className="font-mono">TASK: {p.entitySlug}/{p.slug}/T-NNN</code> du brief, les lignes Client/Project, ou les arguments des commandes.
      </Empty>
      </div>
    )
  const runs = items.filter((x): x is Run => x.kind === 'agent')
  const tokens = sumTokens(items.map((x) => x.tokens))
  const cost = items.reduce((a, x) => a + x.cost, 0)
  const byAgent = aggregate<Run | Turn>(items, (x) => (x.kind === 'agent' ? x.agentType : 'manager'), agentLabel)
  const unlinked = aggregate(runs.filter((r) => !r.attr.taskKey), (r) => r.attr.card || r.description || 'Sans carte')
  return (
    <div className="space-y-6">
      {alloc}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Valeur API équivalente" value={fmtCost(cost)} sub="indicatif – pas une dépense" />
        <Kpi label="Tokens" value={fmtTokens(totalOf(tokens))} sub={`${fmtTokens(tokens.output)} en sortie`} />
        <Kpi label="Exécutions d’agents" value={runs.length} />
        <Kpi label="Demandes au manager" value={items.length - runs.length} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Par agent" />
          <div className="px-5 pb-5"><Bars rows={byAgent} /></div>
        </Card>
        <Card>
          <CardHeader title="Répartition des tokens" />
          <div className="px-5 pb-5"><TokenSplit t={tokens} /></div>
          {unlinked.length > 0 && (
            <>
              <CardHeader title="Exécutions sans fichier tâche" sub="Groupées par carte Trello citée dans le brief – importez-les avec /wakil.task --import" />
              <div className="px-5 pb-5"><Bars rows={unlinked} /></div>
            </>
          )}
        </Card>
      </div>
      <Card>
        <RunsTable items={items} />
      </Card>
    </div>
  )
}
