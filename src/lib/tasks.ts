import { parseChecks } from './markdown'
import type { MdDoc, PlanDoc, Task, TaskStatus } from './types'

export const STATUSES: { id: TaskStatus; label: string; icon: string; tone: string }[] = [
  { id: 'proposed', label: 'Proposé', icon: '📥', tone: 'bg-muted' },
  { id: 'approved', label: 'Approuvé', icon: '✅', tone: 'bg-ok' },
  { id: 'in-progress', label: 'En cours', icon: '🔄', tone: 'bg-sky' },
  { id: 'in-review', label: 'En revue', icon: '🔍', tone: 'bg-terra' },
  { id: 'peer-review', label: 'Revue des pairs', icon: '👀', tone: 'bg-terra' },
  { id: 'needs-changes', label: 'À corriger', icon: '🔁', tone: 'bg-warn' },
  { id: 'awaiting-approval', label: 'Validation finale', icon: '🛑', tone: 'bg-terra-strong' },
  { id: 'blocked', label: 'Bloqué', icon: '❓', tone: 'bg-danger' },
  { id: 'done', label: 'Terminé', icon: '🏁', tone: 'bg-ok' },
]

/** Accepts the slug, the Trello list name or a French label. */
export function normalizeStatus(raw: string): TaskStatus {
  const s = raw.toLowerCase().replace(/[^a-zà-ü ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (/peer|pairs/.test(s)) return 'peer-review'
  if (/awaiting|final|validation/.test(s)) return 'awaiting-approval'
  if (/needs? changes?|corriger|changes/.test(s)) return 'needs-changes'
  if (/review|revue/.test(s)) return 'in-review'
  if (/progress|cours|doing/.test(s)) return 'in-progress'
  if (/approved|ready|approuv/.test(s)) return 'approved'
  if (/block|needs info|bloqu/.test(s)) return 'blocked'
  if (/done|termin|closed/.test(s)) return 'done'
  return 'proposed'
}

const clean = (v?: string) => (!v || v === '-' || /^TODO\b/.test(v) ? '' : v)

export function parseTask(doc: MdDoc, entitySlug: string, projectSlug: string): Task {
  const fm = doc.frontmatter
  const id = clean(fm.id) || doc.name.match(/^(T-\d+)/i)?.[1]?.toUpperCase() || doc.name.replace(/\.md$/, '')
  const title = clean(fm.title) || doc.title.replace(/^T-\d+\s*[:–-]\s*/i, '')
  return {
    key: `${entitySlug}/${projectSlug}/${id}`,
    id,
    title,
    status: normalizeStatus(fm.status || 'proposed'),
    rawStatus: fm.status || '',
    executor: clean(fm.executor),
    agent: clean(fm.agent),
    assignee: clean(fm.assignee),
    reviewers: clean(fm.reviewers),
    priority: clean(fm.priority) || 'normal',
    created: clean(fm.created),
    updated: clean(fm.updated),
    due: clean(fm.due),
    trello: clean(fm.trello),
    sync: fm.sync === 'trello' || (!fm.sync && !!clean(fm.trello)) ? 'trello' : 'local',
    plan: clean(fm.plan),
    phase: clean(fm.phase),
    order: clean(fm.order) && !isNaN(Number(fm.order)) ? Number(fm.order) : null,
    depends: clean(fm.depends)
      .split(/[,\s]+/)
      .map((d) => d.trim().toUpperCase())
      .filter((d) => /^T-\d+$/.test(d)),
    estimate: clean(fm.estimate),
    entitySlug,
    projectSlug,
    path: doc.path,
    doc,
    checks: parseChecks(doc.sections.find((s) => /acceptance|crit/i.test(s.heading))?.content ?? ''),
  }
}

/** plans/PLAN-*.md → PlanDoc */
export function parsePlan(doc: MdDoc): PlanDoc {
  const fm = doc.frontmatter
  return {
    id: clean(fm.id) || doc.name.replace(/\.md$/, ''),
    title: clean(fm.title) || doc.title,
    status: clean(fm.status) || 'proposed',
    sync: fm.sync === 'trello' ? 'trello' : 'local',
    created: clean(fm.created),
    path: doc.path,
    doc,
  }
}

export const isTaskPath = (p: string) => /\/tasks\/[^/]+\.md$/i.test(p) && !/\/README\.md$/i.test(p)
