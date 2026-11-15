// Date periods shared by every filter of the app (usage, Kanban, decisions…). Days are LOCAL calendar days.

export type PeriodPreset = 'today' | 'week' | 'month' | 'last-month' | 'year' | 'all' | 'custom'
export type Period = { preset: PeriodPreset; from?: string; to?: string } // custom: YYYY-MM-DD, inclusive
export type Range = { from: string | null; to: string | null } // null = open

export const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'today', label: 'Aujourd’hui' },
  { id: 'week', label: 'Cette semaine' },
  { id: 'month', label: 'Ce mois' },
  { id: 'last-month', label: 'Mois dernier' },
  { id: 'year', label: 'Cette année' },
  { id: 'all', label: 'Tout' },
  { id: 'custom', label: 'Période…' },
]

const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Local calendar day of a timestamp ("2026-11-15T23:30:00Z" → local day); plain dates are kept as-is. */
export function localDay(iso: string): string {
  if (!iso) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso.slice(0, 10) : ymd(d)
}

export function rangeOf(p: Period, now = new Date()): Range {
  const y = now.getFullYear()
  const mo = now.getMonth()
  switch (p.preset) {
    case 'today':
      return { from: ymd(now), to: ymd(now) }
    case 'week': {
      const day = (now.getDay() + 6) % 7 // Monday = 0 (French week)
      const start = new Date(y, mo, now.getDate() - day)
      const end = new Date(y, mo, now.getDate() - day + 6)
      return { from: ymd(start), to: ymd(end) }
    }
    case 'month':
      return { from: ymd(new Date(y, mo, 1)), to: ymd(new Date(y, mo + 1, 0)) }
    case 'last-month':
      return { from: ymd(new Date(y, mo - 1, 1)), to: ymd(new Date(y, mo, 0)) }
    case 'year':
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    case 'custom':
      return { from: p.from || null, to: p.to || null }
    default:
      return { from: null, to: null }
  }
}

export function inRange(dateOrIso: string, r: Range): boolean {
  if (!r.from && !r.to) return true
  const d = localDay(dateOrIso)
  if (!d) return false
  return (!r.from || d >= r.from) && (!r.to || d <= r.to)
}

const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** Months (YYYY-MM) touched by a closed range. */
export function monthsOfRange(r: Range): string[] {
  if (!r.from || !r.to) return []
  const out: string[] = []
  let [y, m] = r.from.slice(0, 7).split('-').map(Number)
  const [ye, me] = r.to.slice(0, 7).split('-').map(Number)
  while (y < ye || (y === ye && m <= me)) {
    out.push(`${y}-${pad(m)}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

/** Share of a month covered by the range (1 = whole month) – used to prorate monthly fees. */
export function monthFraction(month: string, r: Range): number {
  if (!r.from && !r.to) return 1
  const first = `${month}-01`
  const last = `${month}-${pad(daysInMonth(month))}`
  const from = r.from && r.from > first ? r.from : first
  const to = r.to && r.to < last ? r.to : last
  if (from > to) return 0
  const days = (Date.parse(to + 'T12:00:00') - Date.parse(from + 'T12:00:00')) / 86400000 + 1
  return Math.min(1, Math.round(days) / daysInMonth(month))
}

export function periodLabel(p: Period, now = new Date()): string {
  if (p.preset === 'custom') {
    const r = rangeOf(p, now)
    return `${r.from ?? '…'} → ${r.to ?? '…'}`
  }
  if (p.preset === 'month') return now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return PRESETS.find((x) => x.id === p.preset)?.label ?? ''
}
