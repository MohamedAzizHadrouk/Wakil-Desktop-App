import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { inRange, PRESETS, rangeOf, type Period, type PeriodPreset } from '../lib/period'
import { Timeline } from './ui'
import type { Dated } from '../lib/types'

/** Today · This week · This month · Last month · This year · All · Custom range. */
export function PeriodFilter({ value, onChange, presets, compact = false }: { value: Period; onChange: (p: Period) => void; presets?: PeriodPreset[]; compact?: boolean }) {
  const list = PRESETS.filter((p) => !presets || presets.includes(p.id))
  const r = rangeOf(value)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!compact && <CalendarDays className="size-4 text-slate" />}
      <span className="flex overflow-hidden rounded-lg border border-line text-xs font-semibold">
        {list.map((p) => (
          <button
            key={p.id}
            onClick={() => onChange(p.id === 'custom' ? { preset: 'custom', from: value.from ?? r.from ?? undefined, to: value.to ?? r.to ?? undefined } : { preset: p.id })}
            className={`h-8 px-2.5 whitespace-nowrap ${value.preset === p.id ? 'bg-ink text-ivory' : 'bg-paper text-slate hover:text-ink'}`}
          >
            {p.label}
          </button>
        ))}
      </span>
      {value.preset === 'custom' && (
        <span className="flex items-center gap-1 text-xs">
          <input
            type="date"
            value={value.from ?? ''}
            max={value.to}
            onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
            className="h-8 rounded-lg border border-line bg-paper px-2"
            aria-label="Du"
          />
          <span className="text-muted">→</span>
          <input
            type="date"
            value={value.to ?? ''}
            min={value.from}
            onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
            className="h-8 rounded-lg border border-line bg-paper px-2"
            aria-label="Au"
          />
        </span>
      )}
      {value.preset !== 'all' && value.preset !== 'custom' && r.from && (
        <span className="font-mono text-[10.5px] text-muted">
          {r.from === r.to ? r.from : `${r.from} → ${r.to}`}
        </span>
      )}
    </div>
  )
}

/** Decisions / checkpoints timeline with a period filter (default: everything). */
export function FilteredTimeline({ items, initial = 'all' }: { items: Dated[]; initial?: PeriodPreset }) {
  const [period, setPeriod] = useState<Period>({ preset: initial })
  const r = rangeOf(period)
  const shown = items.filter((d) => inRange(d.date, r))
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <PeriodFilter value={period} onChange={setPeriod} />
        <span className="text-xs text-slate">
          {shown.length} / {items.length}
        </span>
      </div>
      {shown.length ? <Timeline items={shown} /> : <p className="text-sm text-slate">Aucune entrée sur cette période.</p>}
    </div>
  )
}
