// Reads Claude Code's local session logs (~/.claude/projects/<encoded workspace>/) – READ-ONLY – and returns
// token usage per main-session turn and per sub-agent run. Cost is computed in the renderer from usage/PRICING.md.
const path = require('path')
const os = require('os')
const fs = require('fs')
const fsp = fs.promises

const cache = new Map() // file -> { key, data }

function projectsDir() {
  return path.join(os.homedir(), '.claude', 'projects')
}

/** Claude Code names a project's log folder after its path with every non-alphanumeric char replaced by "-". */
async function logDirsFor(root) {
  const enc = path.resolve(root).replace(/[^A-Za-z0-9]/g, '-').toLowerCase()
  let names = []
  try { names = await fsp.readdir(projectsDir()) } catch { return [] }
  return names.filter((n) => n.toLowerCase() === enc).map((n) => path.join(projectsDir(), n))
}

function emptyTokens() {
  // requests = model responses; peak = largest context of one request (input + cache), window = context size when known
  return { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, requests: 0, peak: 0, window: 0 }
}
function addUsage(byModel, model, u) {
  if (!u || model === '<synthetic>') return // local messages written by Claude Code, not API calls
  const m = model || 'unknown'
  const t = byModel[m] || (byModel[m] = emptyTokens())
  t.input += u.input_tokens || 0
  t.output += u.output_tokens || 0
  t.cacheRead += u.cache_read_input_tokens || 0
  const cc = u.cache_creation
  if (cc && (cc.ephemeral_5m_input_tokens || cc.ephemeral_1h_input_tokens)) {
    t.cacheWrite5m += cc.ephemeral_5m_input_tokens || 0
    t.cacheWrite1h += cc.ephemeral_1h_input_tokens || 0
  } else {
    t.cacheWrite5m += u.cache_creation_input_tokens || 0
  }
  t.requests += 1
  t.peak = Math.max(t.peak, (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0))
}

function textOf(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\n')
  return ''
}

async function readLines(file) {
  const txt = await fsp.readFile(file, 'utf8')
  const out = []
  for (const line of txt.split('\n')) {
    if (!line) continue
    try { out.push(JSON.parse(line)) } catch {}
  }
  return out
}

/** Parses one sub-agent log file (subagents/agent-<id>.jsonl). */
async function parseAgentFile(file) {
  const recs = await readLines(file)
  const byModel = {}
  const seen = new Set()
  let prompt = ''
  let start = null
  let end = null
  for (const r of recs) {
    if (r.timestamp) {
      if (!start) start = r.timestamp
      end = r.timestamp
    }
    if (r.type === 'user' && !prompt) prompt = textOf(r.message && r.message.content)
    if (r.type === 'assistant' && r.message && r.message.usage) {
      const id = r.message.id || r.requestId || r.uuid
      if (seen.has(id)) continue
      seen.add(id)
      addUsage(byModel, r.message.model, r.message.usage)
    }
  }
  let meta = {}
  try { meta = JSON.parse(await fsp.readFile(file.replace(/\.jsonl$/, '.meta.json'), 'utf8')) } catch {}
  return { prompt, start, end, byModel, meta }
}

/** Parses one main session log (<session>.jsonl) and its sub-agent folder. */
async function parseSession(file) {
  const sessionId = path.basename(file, '.jsonl')
  const recs = await readLines(file)
  let title = ''
  const toolUses = {} // tool_use id -> { subagentType, description, prompt }
  const agentToTool = {} // agentId -> tool_use id
  const inline = {} // agentId -> { byModel, start, end } (older logs keep sub-agents inline)
  const turns = []
  let turn = null
  const seen = new Set()
  let start = null
  let end = null

  for (const r of recs) {
    if (r.type === 'custom-title' && r.customTitle) title = r.customTitle
    if (r.timestamp) {
      if (!start) start = r.timestamp
      end = r.timestamp
    }
    if (r.type === 'user' && r.message && !r.isSidechain) {
      const content = r.message.content
      const isToolResult = Array.isArray(content) && content.some((c) => c && c.type === 'tool_result')
      if (isToolResult) {
        const res = r.toolUseResult
        if (res && res.agentId) {
          const tr = content.find((c) => c && c.type === 'tool_result')
          if (tr) agentToTool[res.agentId] = tr.tool_use_id
        }
      } else if (!r.isMeta) {
        const text = textOf(content)
        if (text && !text.startsWith('<local-command') && !text.startsWith('<system-reminder')) {
          const cmd = text.match(/<command-name>\/?([^<]+)<\/command-name>/)
          const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/)
          turn = {
            at: r.timestamp,
            prompt: (cmd ? `/${cmd[1]} ${args ? args[1] : ''}` : text).replace(/\s+/g, ' ').trim().slice(0, 300),
            command: cmd ? cmd[1].trim() : null,
            args: args ? args[1].trim() : '',
            byModel: {},
          }
          turns.push(turn)
        }
      }
    }
    if (r.type === 'assistant' && r.message) {
      for (const c of r.message.content || []) {
        if (c && c.type === 'tool_use' && (c.name === 'Agent' || c.name === 'Task') && c.input) {
          toolUses[c.id] = {
            subagentType: c.input.subagent_type || 'general-purpose',
            description: c.input.description || '',
            prompt: String(c.input.prompt || ''),
          }
        }
      }
      if (!r.message.usage) continue
      const id = r.message.id || r.requestId || r.uuid
      const key = (r.isSidechain ? 'S' : 'M') + (r.agentId || '') + id
      if (seen.has(key)) continue
      seen.add(key)
      if (r.isSidechain && r.agentId) {
        const a = inline[r.agentId] || (inline[r.agentId] = { byModel: {}, start: r.timestamp, end: r.timestamp })
        a.end = r.timestamp
        addUsage(a.byModel, r.message.model, r.message.usage)
      } else if (!r.isSidechain) {
        if (!turn) {
          turn = { at: r.timestamp, prompt: '(début de session)', command: null, args: '', byModel: {} }
          turns.push(turn)
        }
        addUsage(turn.byModel, r.message.model, r.message.usage)
      }
    }
  }

  // sub-agent runs
  const runs = []
  const subDir = path.join(path.dirname(file), sessionId, 'subagents')
  let subFiles = []
  try { subFiles = (await fsp.readdir(subDir)).filter((n) => /^agent-.+\.jsonl$/.test(n)) } catch {}
  const done = new Set()
  for (const n of subFiles) {
    const agentId = n.replace(/^agent-/, '').replace(/\.jsonl$/, '')
    const a = await parseAgentFile(path.join(subDir, n))
    const tu = toolUses[a.meta.toolUseId || agentToTool[agentId]] || {}
    runs.push({
      id: agentId,
      sessionId,
      tool: 'claude',
      agentType: a.meta.agentType || tu.subagentType || 'agent',
      description: a.meta.description || tu.description || '',
      prompt: (tu.prompt || a.prompt || '').slice(0, 4000),
      start: a.start,
      end: a.end,
      byModel: a.byModel,
    })
    done.add(agentId)
  }
  for (const [agentId, a] of Object.entries(inline)) {
    if (done.has(agentId)) continue
    const tu = toolUses[agentToTool[agentId]] || {}
    runs.push({
      id: agentId, sessionId, tool: 'claude', agentType: tu.subagentType || 'agent', description: tu.description || '',
      prompt: (tu.prompt || '').slice(0, 4000), start: a.start, end: a.end, byModel: a.byModel,
    })
  }
  return { session: { id: sessionId, tool: 'claude', title, start, end, turns }, runs }
}

// ---------- OpenAI Codex (~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl) ----------
const codexHome = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex')

async function listRollouts(dir, out = []) {
  let entries = []
  try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) await listRollouts(abs, out)
    else if (/^rollout-.+\.jsonl$/.test(e.name)) out.push(abs)
  }
  return out
}

const inside = (cwd, root) => {
  if (!cwd) return false
  const a = path.resolve(cwd).toLowerCase()
  const b = path.resolve(root).toLowerCase()
  return a === b || a.startsWith(b + path.sep)
}

/** Reads only the first line (session_meta) to know the folder the session ran in. */
async function codexMeta(file) {
  const fh = await fsp.open(file, 'r')
  try {
    const buf = Buffer.alloc(64 * 1024)
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
    const first = buf.subarray(0, bytesRead).toString('utf8').split('\n')[0]
    const o = JSON.parse(first)
    return o.type === 'session_meta' ? o.payload || {} : null
  } catch {
    return null
  } finally {
    await fh.close()
  }
}

function codexTokens(byModel, model, u, win = 0) {
  if (!u) return
  const t = byModel[model] || (byModel[model] = emptyTokens())
  const cached = u.cached_input_tokens || 0
  t.input += Math.max(0, (u.input_tokens || 0) - cached) // OpenAI input_tokens include the cached part
  t.cacheRead += cached
  t.cacheWrite5m += u.cache_write_input_tokens || 0
  t.output += u.output_tokens || 0 // includes reasoning tokens
  t.requests += 1
  t.peak = Math.max(t.peak, u.input_tokens || 0)
  if (win) t.window = win
}

const CODEX_NOISE = /^(<environment_context>|<user_instructions>|<permissions|<turn_aborted>|<external_|# AGENTS\.md|<INSTRUCTIONS>)/

async function parseCodex(file, meta) {
  const recs = await readLines(file)
  const sessionId = meta.id || meta.session_id || path.basename(file, '.jsonl')
  let model = meta.model || 'codex'
  let turn = null
  const turns = []
  const byTurn = new Map()
  const seen = new Set()
  let start = meta.timestamp || null
  let end = null
  let title = ''
  let win = 0
  for (const r of recs) {
    if (r.timestamp) end = r.timestamp
    const p = r.payload || {}
    if (r.type === 'turn_context') {
      if (p.model) model = p.model
      if (p.turn_id && !byTurn.has(p.turn_id)) {
        turn = { at: r.timestamp, prompt: '', command: null, args: '', byModel: {} }
        byTurn.set(p.turn_id, turn)
        turns.push(turn)
      } else if (p.turn_id) turn = byTurn.get(p.turn_id)
    }
    if (r.type === 'response_item' && p.type === 'message' && p.role === 'user') {
      const text = (p.content || []).filter((c) => c && (c.type === 'input_text' || c.type === 'text')).map((c) => c.text).join('\n').trim()
      if (text && !CODEX_NOISE.test(text)) {
        if (!turn) {
          turn = { at: r.timestamp, prompt: '', command: null, args: '', byModel: {} }
          turns.push(turn)
        }
        if (!turn.prompt) {
          turn.prompt = text.replace(/\s+/g, ' ').slice(0, 300)
          // "$wakil-news args", "/wakil.news args", "/wakil-news args"
          const cmd = text.match(/^[\/$](wakil[.-][\w-]+)\s*([\s\S]*)$/)
          if (cmd) {
            turn.command = cmd[1].replace(/^wakil-/, 'wakil.')
            turn.args = cmd[2].trim().slice(0, 300)
          }
          if (!title) title = turn.prompt.slice(0, 80)
        }
      }
    }
    if (p.type === 'token_count' && p.info && p.info.model_context_window) win = p.info.model_context_window
    if (r.type === 'token_usage_record' && p.usage) {
      const id = p.response_id || `${p.turn_id}:${r.ordinal}`
      if (seen.has(id)) continue
      seen.add(id)
      const t = (p.turn_id && byTurn.get(p.turn_id)) || turn || (turns.push({ at: r.timestamp, prompt: '(début de session)', command: null, args: '', byModel: {} }), (turn = turns[turns.length - 1]))
      codexTokens(t.byModel, model, p.usage, win)
    }
  }
  // Fallback for older logs without token_usage_record: last cumulative token_count of the session.
  if (!seen.size) {
    const last = [...recs].reverse().find((r) => r.payload && r.payload.type === 'token_count' && r.payload.info)
    if (last) {
      const t = turns[turns.length - 1] || (turns.push({ at: last.timestamp, prompt: '(session)', command: null, args: '', byModel: {} }), turns[0])
      codexTokens(t.byModel, model, last.payload.info.total_token_usage, last.payload.info.model_context_window || 0)
      // cumulative total: the real request count is unknown → mark it, ACU overhead uses 1 request
      t.byModel[model].requestsUnknown = true
    }
  }
  const kept = turns.filter((t) => Object.keys(t.byModel).length || t.prompt)
  // Sub-agent threads (spawned by another thread) become "runs", like Claude Code sub-agents.
  const isChild = meta.thread_source && meta.thread_source !== 'user'
  if (isChild) {
    const byModel = {}
    for (const t of kept) for (const [m, tok] of Object.entries(t.byModel)) {
      const d = byModel[m] || (byModel[m] = emptyTokens())
      for (const k of Object.keys(d)) d[k] = k === 'peak' || k === 'window' ? Math.max(d[k], tok[k] || 0) : d[k] + (tok[k] || 0)
    }
    return {
      session: null,
      runs: [{
        id: sessionId,
        sessionId: meta.parent_thread_id || meta.parent_session_id || sessionId,
        tool: 'codex',
        agentType: meta.agent_name || meta.agent_role || meta.agent_type || meta.nickname || 'codex-subagent',
        description: title,
        prompt: kept.map((t) => t.prompt).filter(Boolean).join('\n\n').slice(0, 4000),
        start, end, byModel,
      }],
    }
  }
  return { session: { id: sessionId, tool: 'codex', title: meta.title || title, start, end, turns: kept }, runs: [] }
}

async function getCodexUsage(root) {
  const files = await listRollouts(path.join(codexHome(), 'sessions'))
  const sessions = []
  const runs = []
  for (const file of files) {
    let key = ''
    try {
      const st = await fsp.stat(file)
      key = `${st.size}:${st.mtimeMs}`
    } catch { continue }
    let entry = cache.get(file)
    if (!entry || entry.key !== key) {
      const meta = await codexMeta(file)
      const relevant = meta && inside(meta.cwd, root)
      entry = { key, data: relevant ? await parseCodex(file, meta).catch(() => null) : null }
      cache.set(file, entry)
    }
    if (!entry.data) continue
    if (entry.data.session) sessions.push(entry.data.session)
    runs.push(...entry.data.runs)
  }
  return { sessions, runs, dir: path.join(codexHome(), 'sessions'), files: files.length }
}

// ---------- Wakil credit log (usage/credits.jsonl, written by tools/credit-log.cjs after every prompt) ----------
async function readCreditLog(root) {
  const rel = 'usage/credits.jsonl'
  const file = path.join(root, 'usage', 'credits.jsonl')
  let st
  try { st = await fsp.stat(file) } catch { return { present: false, path: rel, lines: [], rawLines: 0, bad: 0, modifiedAt: null } }
  const hit = cache.get(file)
  if (hit && hit.key === `${st.size}:${st.mtimeMs}`) return hit.data
  const byId = new Map()
  let raw = 0
  let bad = 0
  for (const line of (await fsp.readFile(file, 'utf8')).split('\n')) {
    if (!line.trim()) continue
    raw++
    try {
      const o = JSON.parse(line)
      if (o && o.id && o.at) byId.set(o.id, o) // append-only: the last line of an id wins (corrections use rev + 1)
      else bad++
    } catch { bad++ }
  }
  const data = { present: true, path: rel, lines: [...byId.values()], rawLines: raw, bad, modifiedAt: st.mtimeMs }
  cache.set(file, { key: `${st.size}:${st.mtimeMs}`, data })
  return data
}

async function getUsage(root) {
  const creditLog = await readCreditLog(root).catch((e) => ({ present: false, path: 'usage/credits.jsonl', lines: [], rawLines: 0, bad: 0, modifiedAt: null, error: String(e) }))
  const dirs = await logDirsFor(root)
  const sessions = []
  const runs = []
  const codex = await getCodexUsage(root).catch(() => ({ sessions: [], runs: [], dir: null, files: 0 }))
  sessions.push(...codex.sessions)
  runs.push(...codex.runs)
  for (const dir of dirs) {
    let names = []
    try { names = (await fsp.readdir(dir)).filter((n) => n.endsWith('.jsonl')) } catch { continue }
    for (const n of names) {
      const file = path.join(dir, n)
      let key = ''
      try {
        const st = await fsp.stat(file)
        let subKey = ''
        try { subKey = String((await fsp.stat(path.join(dir, n.replace(/\.jsonl$/, ''), 'subagents'))).mtimeMs) } catch {}
        key = `${st.size}:${st.mtimeMs}:${subKey}`
      } catch { continue }
      let entry = cache.get(file)
      if (!entry || entry.key !== key) {
        try {
          entry = { key, data: await parseSession(file) }
          cache.set(file, entry)
        } catch (e) {
          console.error('usage parse failed', file, e)
          continue
        }
      }
      sessions.push(entry.data.session)
      runs.push(...entry.data.runs)
    }
  }
  return {
    logDirs: dirs,
    sources: [
      { tool: 'claude', dir: dirs[0] || null, found: dirs.length > 0 },
      { tool: 'codex', dir: codex.dir, found: codex.sessions.length + codex.runs.length > 0 },
      { tool: 'cursor', dir: null, found: false },
    ],
    sessions,
    runs,
    creditLog,
    readAt: Date.now(),
  }
}

module.exports = { getUsage }
