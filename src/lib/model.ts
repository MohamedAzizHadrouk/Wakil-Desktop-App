import {
  dirOf,
  findSection,
  parseDated,
  parseDoc,
  parseTables,
  prettyName,
  stripComments,
  stripMd,
} from './markdown'
import type {
  AiToolsState,
  Agent,
  Channel,
  Command,
  CommandArg,
  Dated,
  Entity,
  Focus,
  HealthIssue,
  LearningSkill,
  MdDoc,
  Model,
  NewsDay,
  Personal,
  Project,
  RawFile,
  ScanResult,
  Skill,
} from './types'
import { isTaskPath, parsePlan, parseTask } from './tasks'
import { DEFAULT_PRICING, parsePricing } from './usage'
import { parseRegistry } from './registry'

const isTemplate = (p: string) => p.split('/').some((s) => s === '_templates')

export function buildModel(scan: ScanResult): Model {
  const files = scan.files
  const byPath = new Map(files.map((f) => [f.path, f]))
  const docs = new Map<string, MdDoc>()
  for (const f of files) if (f.content !== undefined && f.ext !== '.json') docs.set(f.path, parseDoc(f))
  const doc = (p: string) => docs.get(p)
  const under = (dir: string) => files.filter((f) => f.path.startsWith(dir + '/'))
  const reposUnder = (dir: string) => scan.repos.filter((r) => r.path.startsWith(dir + '/'))
  const plansIn = (dir: string) =>
    files
      .filter((f) => f.path.startsWith(dir + '/') && !f.path.slice(dir.length + 1).includes('/') && /\.md$/i.test(f.name) &&!/^readme/i.test(f.name) && docs.has(f.path))
      .map((f) => parsePlan(docs.get(f.path)!))
      .sort((a, b) => b.id.localeCompare(a.id))
  const tasksIn = (dir: string, entity: string, project: string) =>
    files
      .filter((f) => f.path.startsWith(dir + '/') && !f.path.slice(dir.length + 1).includes('/') && isTaskPath(f.path) && docs.has(f.path))
      .map((f) => parseTask(docs.get(f.path)!, entity, project))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))

  // ---------- entities & projects ----------
  const projectSlugsUnder = (base: string) => {
    const set = new Set<string>()
    const re = /^projects\/([^/]+)\//
    for (const f of under(`${base}/projects`)) {
      const m = f.path.slice(base.length + 1).match(re)
      if (m && !m[1].startsWith('_')) set.add(m[1])
    }
    for (const r of reposUnder(`${base}/projects`)) {
      const m = r.path.slice(base.length + 1).match(re)
      if (m && !m[1].startsWith('_')) set.add(m[1])
    }
    return [...set].sort()
  }
  const buildProject = (base: string, slug: string, name: string, ps: string, personal = false): Project => {
    const pbase = `${base}/projects/${ps}`
    const pd = doc(`${pbase}/PROJECT.md`) ?? null
    const pfiles = under(pbase)
    const decisions = parseDated(findSection(pd, 'decisions')?.content ?? '', `${pbase}/PROJECT.md`, pd?.title || ps)
    return {
      key: `${slug}/${ps}`,
      slug: ps,
      entitySlug: slug,
      entityName: name,
      personal,
      name: pd?.title || prettyName(ps),
      status: pd?.meta['Status'] || pd?.frontmatter.status || '',
      type: pd?.meta['Type of project'] || pd?.meta['Type'] || pd?.frontmatter.type || '',
      path: pbase,
      doc: pd,
      decisions,
      docs: pfiles
        .filter((f) => f.path !== `${pbase}/PROJECT.md` && docs.has(f.path) && !f.path.startsWith(`${pbase}/tasks/`) && !f.path.startsWith(`${pbase}/plans/`))
        .map((f) => docs.get(f.path)!)
        .sort((a, b) => a.path.localeCompare(b.path)),
      files: pfiles,
      repos: reposUnder(pbase),
      tasks: tasksIn(`${pbase}/tasks`, slug, ps),
      plans: plansIn(`${pbase}/plans`),
    }
  }
  const entitySlugs = new Set<string>()
  for (const f of files) {
    const m = f.path.match(/^entities\/([^/]+)\//)
    if (m && !m[1].startsWith('_') && !m[1].startsWith('.')) entitySlugs.add(m[1])
  }
  const entities: Entity[] = []
  for (const slug of [...entitySlugs].sort()) {
    const base = `entities/${slug}`
    const d = doc(`${base}/ENTITY.md`) ?? null
    const parts: Entity['parts'] = {}
    const partFiles = {
      position: 'POSITION.md', rules: 'RULES.md', brand: 'BRAND.md', org: 'ORG.md', people: 'PEOPLE.md',
      resume: '.resume.md', documents: 'documents/INDEX.md',
    } as const
    for (const [k, f] of Object.entries(partFiles)) {
      const pd = doc(`${base}/${f}`)
      if (pd) parts[k as keyof typeof partFiles] = pd
    }
    const name = d?.title || prettyName(slug)
    const projects: Project[] = projectSlugsUnder(base).map((ps) => buildProject(base, slug, name, ps))
    const decisions = parseDated(findSection(d, 'decisions')?.content ?? '', `${base}/ENTITY.md`, name)
    const checkpoints = parts.resume ? parseDated(parts.resume.body, parts.resume.path, name) : []
    const departments = files
      .filter((f) => /^departments\/[^/]+\/DEPARTMENT\.md$/.test(f.path.slice(base.length + 1)))
      .map((f) => docs.get(f.path)!)
      .filter(Boolean)
    const teams = files
      .filter((f) => /\/teams\/[^/]+\/TEAM\.md$/.test(f.path) && f.path.startsWith(base + '/'))
      .map((f) => docs.get(f.path)!)
      .filter(Boolean)
    const allDocs = [d, ...Object.values(parts), ...departments, ...teams, ...projects.map((p) => p.doc)]
    entities.push({
      slug,
      name,
      type: (d?.meta['Type'] || d?.frontmatter.type || 'unknown').toLowerCase(),
      status: d?.meta['Status'] || d?.frontmatter.status || '',
      created: d?.meta['Created'] || '',
      path: base,
      doc: d,
      parts,
      departments,
      teams,
      projects,
      decisions,
      checkpoints,
      files: under(base),
      todo: allDocs.reduce((n, x) => n + (x?.todo ?? 0), 0),
      tasks: tasksIn(`${base}/tasks`, slug, 'none'),
      plans: plansIn(`${base}/plans`),
    })
  }
  // personal projects (ecosystem/projects/<slug>/) – a pseudo-entity "personal", never listed with the clients
  const personalProjects = projectSlugsUnder('ecosystem').map((ps) => buildProject('ecosystem', 'personal', 'Personnel', ps, true))
  const personalEntity: Entity = {
    slug: 'personal', name: 'Personnel', type: 'personal', status: 'active', created: '', path: 'ecosystem', doc: null, parts: {},
    departments: [], teams: [], projects: personalProjects, decisions: [], checkpoints: [], files: [], todo: 0,
    tasks: tasksIn('ecosystem/tasks', 'personal', 'none'), plans: plansIn('ecosystem/plans'),
  }
  const projects = [...entities.flatMap((e) => e.projects), ...personalProjects]
  const reg = parseRegistry(byPath.get('usage/registry.json')?.content)
  const pricingDoc = doc('usage/PRICING.md')
  const pricingRows = pricingDoc ? parsePricing(pricingDoc.body) : []

  // ---------- agents & skills ----------
  const agentIds = new Set<string>()
  for (const f of files) {
    const m = f.path.match(/^\.claude\/agents\/([^/]+)\/\1\.md$/)
    if (m && !m[1].startsWith('_')) agentIds.add(m[1])
    const flat = f.path.match(/^\.claude\/agents\/([^/_][^/]*)\.md$/)
    if (flat && flat[1].toLowerCase() !== 'readme') agentIds.add(flat[1])
  }
  const skills: Skill[] = []
  const agents: Agent[] = [...agentIds].sort().map((id) => {
    const path = doc(`.claude/agents/${id}/${id}.md`) ? `.claude/agents/${id}/${id}.md` : `.claude/agents/${id}.md`
    const d = doc(path)!
    const agentSkills: Skill[] = files
      .filter((f) => f.path.startsWith(`.claude/agents/${id}/skills/`) && /\/SKILL\.md$/i.test(f.path))
      .map((f) => {
        const sd = docs.get(f.path)!
        const rel = f.path.slice(`.claude/agents/${id}/skills/`.length).split('/')
        const fm = sd.frontmatter
        const slug = fm.skill || rel[rel.length - 2]
        return {
          id: `${id}/${rel.slice(0, -1).join('/')}`,
          slug,
          name: sd.title || prettyName(slug),
          agent: id,
          category: fm.category || (rel.length > 2 ? rel[0] : 'general'),
          useWhen: (fm['use-when'] || '').split(/\s*,\s*/).filter(Boolean),
          inputs: fm.inputs || '',
          output: fm.output || '',
          lastChecked: fm['last-checked'] || '',
          path: f.path,
          doc: sd,
        }
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    skills.push(...agentSkills)
    return {
      id,
      name: d.frontmatter.name || id,
      description: d.frontmatter.description || stripMd(d.intro).slice(0, 300),
      model: d.frontmatter.model || 'inherit',
      path,
      doc: d,
      skills: agentSkills,
      index: doc(`.claude/agents/${id}/skills/INDEX.md`) ?? null,
    }
  })

  // ---------- commands ----------
  const commandsMd = doc('COMMANDS.md')
  const catalog = new Map<string, { category: string; args: string; what: string; schedulable: string }>()
  const commandCategories: string[] = []
  if (commandsMd) {
    for (const t of parseTables(stripComments(commandsMd.body))) {
      const ci = t.headers.findIndex((h) => /command/i.test(h))
      if (ci === -1) continue
      const ai = t.headers.findIndex((h) => /argument/i.test(h))
      const wi = t.headers.findIndex((h) => /what/i.test(h))
      const si = t.headers.findIndex((h) => /schedul/i.test(h))
      const category = t.heading.replace(/\s*\(.*\)\s*$/, '').trim()
      for (const row of t.rows) {
        const m = (row[ci] || '').match(/\/([\w.-]+)/)
        if (!m) continue
        if (catalog.has(m[1]) && /see /i.test(row[wi] || '')) continue // duplicate "see …" rows
        if (!catalog.has(m[1])) {
          catalog.set(m[1], {
            category,
            args: ai >= 0 ? row[ai] : '',
            what: wi >= 0 ? row[wi] : '',
            schedulable: si >= 0 ? row[si] : '',
          })
          if (!commandCategories.includes(category)) commandCategories.push(category)
        }
      }
    }
  }
  const commands: Command[] = files
    .filter((f) => /^\.claude\/commands\/.+\.md$/.test(f.path) && docs.has(f.path))
    .map((f) => {
      const d = docs.get(f.path)!
      const name = f.path.slice('.claude/commands/'.length).replace(/\.md$/, '').replace(/\//g, ':')
      const cat = catalog.get(name)
      const argTable = parseTables(findSection(d, 'arguments')?.content ?? '')[0]
      const args: CommandArg[] = argTable
        ? argTable.rows.map((r) => ({ name: r[0] ?? '', required: r[1] ?? '', values: r[2] ?? '', def: r[3] ?? '' }))
        : []
      const exSection = findSection(d, 'examples', 'example')?.content ?? ''
      const examples = [...exSection.matchAll(/`(\/[^`]+)`/g)].map((m) => m[1])
      const sched = findSection(d, 'schedulable')?.content ?? ''
      const description = d.frontmatter.description || cat?.what || firstLine(findSection(d, 'purpose')?.content ?? '')
      if (!commandCategories.includes(cat?.category ?? 'Autres') && !cat) commandCategories.push('Autres')
      return {
        name,
        slash: '/' + name,
        description,
        argumentHint: d.frontmatter['argument-hint'] || '',
        path: f.path,
        doc: d,
        category: cat?.category ?? 'Autres',
        schedulable: cat?.schedulable || firstLine(sched),
        catalogArgs: cat?.args ?? '',
        catalogWhat: cat?.what ?? '',
        args,
        examples,
        search: [name, description, d.frontmatter['argument-hint'], cat?.what, cat?.category, d.body]
          .join(' \n ')
          .toLowerCase(),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  // ---------- personal ecosystem ----------
  const personal = buildPersonal(files, docs)

  // ---------- focus / last ----------
  const kvFile = (p: string): Focus | null => {
    const d = doc(p)
    if (!d) return null
    const out: Focus = {}
    for (const line of stripComments(d.body).split(/\r?\n/)) {
      const m = line.match(/^\s*([\w -]+):\s*(.+)$/)
      if (m) out[m[1].trim().toLowerCase()] = m[2].trim()
    }
    return out
  }

  // ---------- global timeline ----------
  const decisions: Dated[] = [...entities.flatMap((e) => e.decisions), ...projects.flatMap((p) => p.decisions)]
    .sort((a, b) => b.date.localeCompare(a.date))

  const model: Model = {
    root: scan.root,
    scannedAt: scan.scannedAt,
    stats: scan.stats,
    files,
    byPath,
    docs,
    repos: scan.repos,
    readme: doc('README.md'),
    claudeMd: doc('CLAUDE.md'),
    commandsMd,
    entities,
    projects,
    agents,
    skills,
    commands,
    commandCategories,
    personal,
    focus: kvFile('entities/.focus.md'),
    last: kvFile('entities/.last.md'),
    decisions: [...decisions, ...personalProjects.flatMap((p) => p.decisions)].sort((a, b) => b.date.localeCompare(a.date)),
    todo: [...docs.values()].filter((d) => !isTemplate(d.path)).reduce((n, d) => n + d.todo, 0),
    health: [],
    tasks: [...entities.flatMap((e) => e.tasks), ...personalEntity.tasks, ...projects.flatMap((p) => p.tasks)],
    pricing: pricingRows.length ? pricingRows : DEFAULT_PRICING,
    pricingFromFile: pricingRows.length > 0,
    aiTools: aiToolsState(files, byPath),
    personalEntity,
    registry: reg.registry,
    registryError: reg.error,
  }
  model.health = checkHealth(model)
  return model
}

function aiToolsState(files: RawFile[], byPath: Map<string, RawFile>): AiToolsState {
  let manifest: AiToolsState['manifest'] = null
  try {
    const raw = byPath.get('.wakil/tools.json')?.content
    if (raw) manifest = JSON.parse(raw)
  } catch {
    manifest = null
  }
  const isSource = (p: string) => p === 'CLAUDE.md' || /^\.claude\/(agents|commands)\/.+\.md$/.test(p)
  const newestSource = Math.max(0, ...files.filter((f) => isSource(f.path)).map((f) => f.mtime))
  const generated = manifest ? new Date(manifest.generatedAt).getTime() : 0
  return {
    manifest,
    // 2 s tolerance: the generator writes right after reading the sources
    stale: !!manifest && newestSource > generated + 2000,
    agentsMd: byPath.has('AGENTS.md'),
    skills: files.filter((f) => /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(f.path)).length,
    cursorAgents: files.filter((f) => /^\.cursor\/agents\/[^/]+\.md$/.test(f.path)).map((f) => f.name.replace(/\.md$/, '')),
    codexAgents: files.filter((f) => /^\.codex\/agents\/[^/]+\.toml$/.test(f.path)).map((f) => f.name.replace(/\.toml$/, '')),
  }
}

function firstLine(s: string) {
  return stripMd(stripComments(s).split(/\r?\n/).find((l) => l.trim()) ?? '')
}

function buildPersonal(files: RawFile[], docs: Map<string, MdDoc>): Personal {
  const doc = (p: string) => docs.get(p)
  const E = 'ecosystem'
  // news days
  const dayMap = new Map<string, NewsDay>()
  for (const f of files) {
    const m = f.path.match(/^ecosystem\/news\/(\d{4})\/(\d{2})\/(\d{2})\/([^/]+)$/)
    if (!m) continue
    const date = `${m[1]}-${m[2]}-${m[3]}`
    const day = dayMap.get(date) ?? { date, path: dirOf(f.path), others: [] }
    const d = docs.get(f.path)
    if (d) {
      const n = m[4].toUpperCase()
      if (n === 'TODO.MD') day.todo = d
      else if (n === 'NEWS.MD') day.news = d
      else if (n === 'TRENDS.MD') day.trends = d
      else day.others.push(d)
    }
    dayMap.set(date, day)
  }
  // learning skills
  const learnSlugs = new Set<string>()
  for (const f of files) {
    const m = f.path.match(/^ecosystem\/knowledge\/skills\/([^/]+)\//)
    if (m) learnSlugs.add(m[1])
  }
  const learning: LearningSkill[] = [...learnSlugs].sort().map((slug) => {
    const base = `${E}/knowledge/skills/${slug}`
    return {
      slug,
      path: base,
      doc: doc(`${base}/SKILL.md`),
      files: files.filter((f) => f.path.startsWith(base + '/')),
      projects: files
        .filter((f) => new RegExp(`^${escapeRe(base)}/projects/[^/]+/PROJECT\\.md$`).test(f.path))
        .map((f) => docs.get(f.path)!)
        .filter(Boolean),
    }
  })
  // brand channels
  const chanSlugs = new Set<string>()
  for (const f of files) {
    const m = f.path.match(/^ecosystem\/brand\/channels\/([^/]+)\//)
    if (m) chanSlugs.add(m[1])
  }
  const channels: Channel[] = [...chanSlugs].sort().map((slug) => {
    const base = `${E}/brand/channels/${slug}`
    const channel = doc(`${base}/CHANNEL.md`)
    return {
      slug,
      name: channel?.title || prettyName(slug),
      status: channel?.meta['Status'] || '',
      path: base,
      channel,
      content: doc(`${base}/CONTENT.md`),
      files: files.filter((f) => f.path.startsWith(base + '/')),
    }
  })
  return {
    profile: doc(`${E}/PROFILE.md`),
    setup: doc(`${E}/SETUP-STATUS.md`),
    skills: doc(`${E}/knowledge/SKILLS.md`),
    learning,
    newsPrefs: doc(`${E}/news/PREFERENCES.md`),
    news: [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date)),
    brand: doc(`${E}/brand/BRAND.md`),
    strategy: doc(`${E}/brand/strategy/STRATEGY.md`),
    channelsIndex: doc(`${E}/brand/channels/INDEX.md`),
    channels,
    assets: doc(`${E}/brand/assets/INDEX.md`),
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function checkHealth(m: Model): HealthIssue[] {
  const out: HealthIssue[] = []
  const need = (p: string, text: string) => {
    if (!m.byPath.has(p)) out.push({ level: 'warn', text, path: p })
  }
  need('CLAUDE.md', 'CLAUDE.md manquant à la racine (règles partagées des agents)')
  need('COMMANDS.md', 'COMMANDS.md manquant : les commandes n’auront pas de catégorie')
  if (!m.agents.length) out.push({ level: 'warn', text: 'Aucun agent trouvé dans .claude/agents/' })
  if (!m.commands.length) out.push({ level: 'warn', text: 'Aucune commande trouvée dans .claude/commands/' })
  for (const e of m.entities) {
    if (!e.doc) out.push({ level: 'warn', text: `${e.slug} : ENTITY.md manquant`, path: e.path })
    const org = ['company', 'association', 'club'].includes(e.type)
    if (!e.parts.position) out.push({ level: 'info', text: `${e.name} : POSITION.md absent`, path: e.path })
    if (!e.parts.rules) out.push({ level: 'info', text: `${e.name} : RULES.md absent`, path: e.path })
    if (org && !e.parts.org) out.push({ level: 'info', text: `${e.name} : ORG.md absent`, path: e.path })
    for (const p of e.projects)
      if (!p.doc) out.push({ level: 'warn', text: `${e.name} › ${p.slug} : PROJECT.md manquant`, path: p.path })
  }
  for (const a of m.agents) {
    if (!a.index) out.push({ level: 'info', text: `Agent ${a.name} : skills/INDEX.md absent`, path: a.path })
    const listed = a.index ? parseTables(a.index.body).flatMap((t) => t.rows.map((r) => r[r.length - 1])) : []
    for (const file of listed) {
      if (!/SKILL\.md$/i.test(file)) continue
      const p = `.claude/agents/${a.id}/skills/${file.replace(/`/g, '')}`
      if (!m.byPath.has(p)) out.push({ level: 'warn', text: `Agent ${a.name} : INDEX.md référence ${file} introuvable`, path: p })
    }
  }
  const listedCommands = new Set(m.commands.map((c) => c.name))
  if (m.commandsMd) {
    for (const t of parseTables(m.commandsMd.body))
      for (const r of t.rows) {
        const mm = (r[0] || '').match(/\/([\w.-]+)/)
        if (mm && mm[1].includes('.') && !listedCommands.has(mm[1]))
          out.push({ level: 'warn', text: `COMMANDS.md cite /${mm[1]} mais le fichier .claude/commands/${mm[1]}.md n’existe pas` })
      }
  }
  if (m.stats.truncated) out.push({ level: 'warn', text: 'Indexation tronquée : trop de fichiers (limite 25 000).' })
  return out
}

/** Entity by slug, including the "personal" pseudo-entity of the owner's personal projects. */
export function entityOf(m: Model, slug: string): Entity | undefined {
  return slug === 'personal' ? m.personalEntity : m.entities.find((e) => e.slug === slug)
}
