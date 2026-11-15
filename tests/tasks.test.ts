import { describe, expect, it } from 'vitest'
import { parseDoc } from '../src/lib/markdown'
import { normalizeStatus, parsePlan, parseTask } from '../src/lib/tasks'

const doc = (name: string, content: string) => parseDoc({ path: `entities/acme/projects/site/tasks/${name}`, name, ext: '.md', size: content.length, mtime: 0, content })

describe('task files', () => {
  it('reads a local plan task: plan, phase, order, dependencies, never Trello', () => {
    const t = parseTask(
      doc('T-003-x.md', `---\nid: T-003\ntitle: "[Dev] Build page"\nstatus: approved\nagent: fullstack-devops\nsync: local\ntrello: -\nplan: PLAN-2026-11-15-home\nphase: 2 · Build\norder: 3\ndepends: T-001, t-002\nestimate: M\n---\n# TASK T-003: Build page\n\n## Acceptance criteria\n- [x] a\n- [ ] b\n`),
      'acme',
      'site',
    )
    expect(t).toMatchObject({ key: 'acme/site/T-003', sync: 'local', trello: '', plan: 'PLAN-2026-11-15-home', phase: '2 · Build', order: 3, depends: ['T-001', 'T-002'], estimate: 'M', status: 'approved' })
    expect(t.checks).toHaveLength(2)
  })
  it('a task with a card URL and no sync field is a Trello task (older files)', () => {
    const t = parseTask(doc('T-001.md', `---\nid: T-001\ntitle: x\nstatus: In Progress\ntrello: https://trello.com/c/abc\n---\n# x\n`), 'acme', 'site')
    expect(t.sync).toBe('trello')
    expect(t.status).toBe('in-progress')
    expect(t.order).toBeNull()
    expect(t.depends).toEqual([])
  })
  it('maps Trello list names and French labels to statuses', () => {
    expect(normalizeStatus('👀 Peer Review')).toBe('peer-review')
    expect(normalizeStatus('🛑 Awaiting Final Approval')).toBe('awaiting-approval')
    expect(normalizeStatus('✅ Approved – Ready')).toBe('approved')
    expect(normalizeStatus('Terminé')).toBe('done')
  })
  it('reads a plan file', () => {
    const p = parsePlan(doc('PLAN-2026-11-15-home.md', `---\nid: PLAN-2026-11-15-home\ntitle: "Home redesign"\nstatus: approved\nsync: local\ncreated: 2026-11-15\n---\n# PLAN: Home redesign\n\n## Goal\nNew home.\n`))
    expect(p).toMatchObject({ id: 'PLAN-2026-11-15-home', title: 'Home redesign', status: 'approved', sync: 'local' })
  })
})
