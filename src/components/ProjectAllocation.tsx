import { useState } from 'react'
import { Card, CardHeader, CommandHint } from './ui'
import { PeriodFilter } from './PeriodFilter'
import type { Period } from '../lib/period'
import { useApp, useModel } from '../lib/store'
import { useAllocation } from '../lib/useAllocation'
import { Certainty, fmtAcu, fmtMoney } from '../pages/Usage'

/** AI expense allocated to one project, subscription by subscription (independent pools). */
export function ProjectAllocation({ projectKey }: { projectKey: string }) {
  const m = useModel()
  const { go } = useApp()
  const [period, setPeriod] = useState<Period>({ preset: 'all' })
  const a = useAllocation(period, null, 'historical')
  const base = m.registry.settings.baseCurrency
  const rows = a.results
    .map((r) => ({ r, p: r.projects.find((x) => x.projectKey === projectKey) }))
    .filter((x) => x.p)
  const total = rows.reduce((s, x) => s + (x.p?.allocated ?? 0), 0)
  return (
    <Card>
      <CardHeader
        title="Dépenses IA allouées à ce projet"
        sub="Part de chaque abonnement = ACU du projet / ACU de l’abonnement × dépense réelle de l’abonnement"
        right={
          <PeriodFilter value={period} onChange={setPeriod} presets={['today', 'week', 'month', 'last-month', 'year', 'all', 'custom']} compact />
        }
      />
      <div className="px-5 pb-5">
        {!m.registry.subscriptions.length ? (
          <div className="space-y-2 text-sm text-slate">
            <p>Aucun abonnement enregistré : la consommation est mesurée mais aucune dépense ne peut être répartie.</p>
            <CommandHint command="/wakil.subscription add Claude Pro $20/month, Anthropic, usage from Claude Code" />
          </div>
        ) : !rows.length ? (
          <p className="text-sm text-slate">Aucune consommation de ce projet rattachée à un abonnement sur la période.</p>
        ) : (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight">{fmtMoney(total, base)}</span>
              <Certainty estimated={rows.some((x) => x.r.provisional)} />
            </p>
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-xs text-slate">
                <tr className="border-b border-line">
                  <th className="py-2 font-medium">Abonnement</th>
                  <th className="py-2 text-right font-medium">ACU</th>
                  <th className="py-2 text-right font-medium">Part</th>
                  <th className="py-2 text-right font-medium">Dépense de l’abonnement</th>
                  <th className="py-2 text-right font-medium">Alloué</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ r, p }) => (
                  <tr key={r.sub.id}>
                    <td className="py-2">{r.sub.name}</td>
                    <td className="py-2 text-right font-mono text-xs">{fmtAcu(p!.acu)}</td>
                    <td className="py-2 text-right font-mono text-xs">{(p!.pct * 100).toFixed(1)} %</td>
                    <td className="py-2 text-right font-mono text-xs">{fmtMoney(r.expense, base)}</td>
                    <td className="py-2 text-right font-mono text-xs font-semibold">{fmtMoney(p!.allocated, base)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => go({ page: 'usage', tab: 'projects' })} className="mt-3 text-xs font-semibold text-terra-strong hover:underline">
              Comparer avec les autres projets
            </button>
          </>
        )}
      </div>
    </Card>
  )
}
