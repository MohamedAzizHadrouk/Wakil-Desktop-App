import { useMemo } from 'react'
import type { AcuMode } from './acu'
import { allocate, buildRecords, periodMonths, totalsOf, type UsageRecord } from './allocation'
import { inRange, monthsOfRange, rangeOf, type Period } from './period'
import { useApp, useModel } from './store'

export const UNASSIGNED = '__none__' // pseudo-subscription: measured usage not linked to any subscription

/** One place to compute records, pools and allocations for the current filters (shared by all usage views). */
export function useAllocation(period: Period, selected: string[] | null, mode: AcuMode) {
  const m = useModel()
  const { usage } = useApp()
  const records = useMemo(() => buildRecords(m, usage, mode), [m, usage, mode])
  const range = useMemo(() => rangeOf(period), [period])
  const closed = !!(range.from && range.to)
  // months to compute: those touched by the range, or everything since the first subscription / record
  const months = useMemo(() => (closed ? monthsOfRange(range) : periodMonths(m.registry, records, 'all')), [closed, range, m.registry, records])
  const subSet = useMemo(() => (selected ? new Set(selected.filter((s) => s !== UNASSIGNED)) : null), [selected])
  const includeUnassigned = !selected || selected.includes(UNASSIGNED)
  const results = useMemo(() => allocate(m.registry, records, months, subSet, range.from || range.to ? range : undefined), [m.registry, records, months, subSet, range])
  const unassigned = useMemo<UsageRecord[]>(
    () => (includeUnassigned ? records.filter((r) => !r.subscriptionId && months.includes(r.month) && inRange(r.date, range)) : []),
    [records, months, includeUnassigned, range],
  )
  const filteredRecords = useMemo(() => [...results.flatMap((r) => r.records), ...unassigned].sort((a, b) => b.date.localeCompare(a.date)), [results, unassigned])
  const totals = useMemo(() => totalsOf(results), [results])
  const prorated = results.some((r) => r.months.some((x) => x.prorated !== undefined && x.prorated < 1))
  return { records, range, months, results, unassigned, filteredRecords, totals, prorated, registry: m.registry }
}
