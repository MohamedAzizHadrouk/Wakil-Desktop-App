// ---------- data coming from the main process ----------
export type RawFile = {
  path: string // relative to the workspace root, with "/"
  name: string
  ext: string
  size: number
  mtime: number
  content?: string // markdown files only
}

export type Repo = {
  path: string
  name: string
  kind: string
  readme: string | null
  mtime: number
  entries: number
}

export type ScanResult = {
  root: string
  scannedAt: number
  files: RawFile[]
  repos: Repo[]
  stats: { files: number; mdFiles: number; repos: number; skippedDirs: number; truncated: boolean; durationMs: number }
}

export type WakilApi = {
  getWorkspace(): Promise<ScanResult | null>
  chooseWorkspace(): Promise<ScanResult | null>
  closeWorkspace(): Promise<boolean>
  initWorkspace(mode: "new" | "complete"): Promise<{ created: string[]; kept: number; root: string; scan: ScanResult } | null>
  getUsage(): Promise<UsageRaw | null>
  saveReport(defaultName: string, content: string): Promise<string | null>
  readText(rel: string): Promise<{ text?: string; tooLarge?: boolean; size?: number }>
  dataUrl(rel: string): Promise<string | null>
  openFile(rel: string): Promise<string>
  revealFile(rel: string): Promise<boolean>
  openExternal(url: string): Promise<boolean>
  onChanged(cb: (data: ScanResult) => void): () => void
  platform: string
}

declare global {
  interface Window {
    wakil?: WakilApi
  }
}

// ---------- parsed model ----------
export type Section = { heading: string; level: number; content: string }

export type MdDoc = {
  path: string
  name: string
  title: string // cleaned H1 ("ENTITY: Acme" -> "Acme")
  kicker: string | null // prefix of the H1 ("ENTITY")
  frontmatter: Record<string, string>
  meta: Record<string, string> // "Key: value" lines right under the H1
  intro: string // text between H1/meta and the first "##"
  sections: Section[]
  body: string // markdown without frontmatter
  todo: number // number of TODO placeholders (outside comments)
  mtime: number
  size: number
}

export type Dated = { date: string; text: string; author?: string; source: string; scope?: string }

export type Check = { done: boolean; text: string; section: string }

export type Project = {
  key: string // "<entity>/<slug>"
  slug: string
  entitySlug: string // 'personal' for the owner's personal projects
  entityName: string
  personal: boolean
  name: string
  status: string
  type: string
  path: string // folder
  doc: MdDoc | null
  decisions: Dated[]
  docs: MdDoc[] // other markdown files of the project
  files: RawFile[] // every indexed file of the project folder
  repos: Repo[]
  tasks: Task[]
  plans: PlanDoc[]
}

/** A plan written by /wakil.plan or /wakil.plan.trello (plans/PLAN-*.md). */
export type PlanDoc = {
  id: string
  title: string
  status: string
  sync: 'local' | 'trello'
  created: string
  path: string
  doc: MdDoc
}

export type EntityKind = 'company' | 'association' | 'club' | 'individual' | string

export type Entity = {
  slug: string
  name: string
  type: EntityKind
  status: string
  created: string
  path: string
  doc: MdDoc | null
  parts: Partial<Record<'position' | 'rules' | 'brand' | 'org' | 'people' | 'resume' | 'documents', MdDoc>>
  departments: MdDoc[]
  teams: MdDoc[]
  projects: Project[]
  decisions: Dated[]
  checkpoints: Dated[]
  files: RawFile[]
  todo: number
  tasks: Task[] // tasks without project (entities/<slug>/tasks/)
  plans: PlanDoc[] // plans without project (entities/<slug>/plans/)
}

export type Skill = {
  id: string
  slug: string
  name: string
  agent: string
  category: string
  useWhen: string[]
  inputs: string
  output: string
  lastChecked: string
  path: string
  doc: MdDoc
}

export type Agent = {
  id: string
  name: string
  description: string
  model: string
  path: string
  doc: MdDoc
  skills: Skill[]
  index: MdDoc | null
}

export type CommandArg = { name: string; required: string; values: string; def: string }

export type Command = {
  name: string // "wakil.news"
  slash: string // "/wakil.news"
  description: string
  argumentHint: string
  path: string
  doc: MdDoc
  category: string
  schedulable: string
  catalogArgs: string
  catalogWhat: string
  args: CommandArg[]
  examples: string[]
  search: string // lower-cased haystack
}

export type NewsDay = { date: string; path: string; todo?: MdDoc; news?: MdDoc; trends?: MdDoc; others: MdDoc[] }

export type Channel = { slug: string; name: string; status: string; path: string; channel?: MdDoc; content?: MdDoc; files: RawFile[] }

export type LearningSkill = { slug: string; path: string; doc?: MdDoc; files: RawFile[]; projects: MdDoc[] }

export type Personal = {
  profile?: MdDoc
  setup?: MdDoc
  skills?: MdDoc
  learning: LearningSkill[]
  newsPrefs?: MdDoc
  news: NewsDay[]
  brand?: MdDoc
  strategy?: MdDoc
  channelsIndex?: MdDoc
  channels: Channel[]
  assets?: MdDoc
}

export type Focus = Record<string, string>

export type Model = {
  root: string
  scannedAt: number
  stats: ScanResult['stats']
  files: RawFile[]
  byPath: Map<string, RawFile>
  docs: Map<string, MdDoc>
  repos: Repo[]
  readme?: MdDoc
  claudeMd?: MdDoc
  commandsMd?: MdDoc
  entities: Entity[]
  projects: Project[]
  agents: Agent[]
  skills: Skill[]
  commands: Command[]
  commandCategories: string[]
  personal: Personal
  focus: Focus | null
  last: Focus | null
  decisions: Dated[]
  todo: number
  health: HealthIssue[]
  tasks: Task[]
  pricing: PriceRow[]
  pricingFromFile: boolean
  personalEntity: Entity // pseudo-entity holding the personal projects (not in `entities`)
  registry: import('./registry').Registry
  registryError: string | null
  aiTools: AiToolsState
}

export type AiToolsState = {
  manifest: { generatedAt: string; counts?: Record<string, number>; files?: string[] } | null
  stale: boolean // sources changed after the last sync
  agentsMd: boolean
  skills: number // .agents/skills/*/SKILL.md
  cursorAgents: string[]
  codexAgents: string[]
}

export type HealthIssue = { level: 'warn' | 'info'; text: string; path?: string }

// ---------- tasks ----------
export type TaskStatus =
  | 'proposed' | 'approved' | 'in-progress' | 'in-review' | 'peer-review'
  | 'needs-changes' | 'awaiting-approval' | 'blocked' | 'done'

export type Task = {
  key: string // "<entity>/<project|none>/<id>"
  id: string
  title: string
  status: TaskStatus
  rawStatus: string
  executor: string
  agent: string
  assignee: string
  reviewers: string
  priority: string
  created: string
  updated: string
  due: string
  trello: string
  sync: 'local' | 'trello' // local = /wakil.plan (never on Trello), trello = mirrors a card
  plan: string // plan id or ''
  phase: string
  order: number | null
  depends: string[]
  estimate: string
  entitySlug: string
  projectSlug: string // "none" when the task has no project
  path: string
  doc: MdDoc
  checks: Check[]
}

// ---------- usage (Claude Code session logs) ----------
export type Tokens = {
  input: number // uncached input (Claude: input_tokens; Codex: input − cached)
  output: number
  cacheWrite5m: number
  cacheWrite1h: number
  cacheRead: number // cached input read
  requests?: number // model responses
  peak?: number // largest context of one request (tokens)
  window?: number // context window when the provider reports it
  requestsUnknown?: boolean
}
export type ByModel = Record<string, Tokens>
export type AiTool = 'claude' | 'codex' | 'cursor'
export type RunRaw = { id: string; sessionId: string; tool: AiTool; agentType: string; description: string; prompt: string; start: string | null; end: string | null; byModel: ByModel }
export type TurnRaw = { at: string; prompt: string; command: string | null; args: string; byModel: ByModel }
export type SessionRaw = { id: string; tool: AiTool; title: string; start: string | null; end: string | null; turns: TurnRaw[] }
export type UsageRaw = { logDirs: string[]; sources?: { tool: AiTool; dir: string | null; found: boolean }[]; sessions: SessionRaw[]; runs: RunRaw[]; readAt: number }

export type PriceRow = { model: string; input: number; output: number; cacheWrite5m: number; cacheWrite1h: number; cacheRead: number }

export type Attribution = { entity?: string; project?: string; taskKey?: string; card?: string; how: 'task-line' | 'trello' | 'card-title' | 'client-project' | 'command' | 'focus' | 'none' }

export type Run = RunRaw & { kind: 'agent'; tokens: Tokens; total: number; cost: number; unpriced: boolean; attr: Attribution; at: string }
export type Turn = TurnRaw & { kind: 'turn'; tool: AiTool; sessionId: string; sessionTitle: string; tokens: Tokens; total: number; cost: number; unpriced: boolean; attr: Attribution }

export type UsageView = {
  raw: UsageRaw
  runs: Run[]
  turns: Turn[]
  sessions: (SessionRaw & { tokens: Tokens; cost: number; runs: number })[]
}
