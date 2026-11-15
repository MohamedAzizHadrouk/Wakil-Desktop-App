import type { Check, Dated, MdDoc, RawFile, Section } from './types'

export const stripComments = (md: string) => md.replace(/<!--[\s\S]*?-->/g, '')

export function parseFrontmatter(src: string): { fm: Record<string, string>; body: string } {
  const fm: Record<string, string> = {}
  const m = src.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { fm, body: src.replace(/^﻿/, '') }
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (kv) fm[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  return { fm, body: src.slice(m[0].length) }
}

/** Splits the markdown into "##"/"###" sections, ignoring headings inside code fences. */
export function splitSections(body: string): { before: string; sections: Section[] } {
  const lines = body.split(/\r?\n/)
  const sections: Section[] = []
  const before: string[] = []
  let current: Section | null = null
  let buf: string[] = []
  let fence = false
  const flush = () => {
    if (current) {
      current.content = buf.join('\n').trim()
      sections.push(current)
    }
  }
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    const h = !fence && line.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/)
    if (h) {
      flush()
      current = { heading: h[2].trim(), level: h[1].length, content: '' }
      buf = []
      continue
    }
    if (current) buf.push(line)
    else before.push(line)
  }
  flush()
  return { before: before.join('\n'), sections }
}

const META_RE = /^([A-Z][\w &/().'-]{0,48}?)\s*:\s+(.+)$/

export function parseDoc(file: RawFile): MdDoc {
  const src = file.content ?? ''
  const { fm, body } = parseFrontmatter(src)
  const { before, sections } = splitSections(body)
  let title = ''
  let kicker: string | null = null
  const meta: Record<string, string> = {}
  const intro: string[] = []
  let inMeta = true
  for (const line of stripComments(before).split(/\r?\n/)) {
    const h1 = !title && line.match(/^#\s+(.+?)\s*$/)
    if (h1) {
      title = h1[1]
      continue
    }
    if (!title && !line.trim()) continue
    const kv = inMeta && line.match(META_RE)
    if (kv) {
      meta[kv[1].trim()] = kv[2].trim()
      continue
    }
    if (line.trim()) inMeta = false
    intro.push(line)
  }
  const prefix = title.match(/^([A-Z][A-Z &/-]{1,30}):\s*(.+)$/)
  if (prefix) {
    kicker = prefix[1]
    title = prefix[2]
  }
  if (!title) title = fm.name || fm.skill || prettyName(file.name.replace(/\.[^.]+$/, ''))
  const todo = (stripComments(body).match(/\bTODO\b/g) || []).length
  return {
    path: file.path,
    name: file.name,
    title,
    kicker,
    frontmatter: fm,
    meta,
    intro: intro.join('\n').trim(),
    sections,
    body,
    todo,
    mtime: file.mtime,
    size: file.size,
  }
}

export function prettyName(slug: string) {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function findSection(doc: MdDoc | null | undefined, ...names: string[]): Section | undefined {
  if (!doc) return undefined
  const wanted = names.map((n) => n.toLowerCase())
  return doc.sections.find((s) => wanted.some((w) => s.heading.toLowerCase().startsWith(w)))
}

// ---------- structured content ----------
const DATED_RE = /^\s*[-*]\s+(\d{4}-\d{2}-\d{2})(?:[ T]\d{1,2}:\d{2})?\s*[–—:-]\s*(.+)$/

export function parseDated(content: string, source: string, scope?: string): Dated[] {
  const out: Dated[] = []
  for (const line of stripComments(content).split(/\r?\n/)) {
    const m = line.match(DATED_RE)
    if (!m) {
      // continuation line of the previous item
      if (out.length && /^\s{2,}\S/.test(line)) out[out.length - 1].text += ' ' + line.trim()
      continue
    }
    let text = m[2].trim()
    let author: string | undefined
    const tail = text.match(/^(.*\S)\s+[–—]\s+([^–—]{1,40})$/)
    if (tail && tail[2].split(/\s+/).length <= 5) {
      text = tail[1]
      author = tail[2].trim()
    }
    out.push({ date: m[1], text, author, source, scope })
  }
  return out
}

export function isDatedList(content: string) {
  const lines = stripComments(content).split(/\r?\n/).filter((l) => /^\s*[-*]\s+/.test(l))
  if (lines.length < 1) return false
  const dated = lines.filter((l) => DATED_RE.test(l)).length
  return dated >= Math.max(1, lines.length * 0.6)
}

export type KV = { key: string; value: string; todo: boolean }

const KV_RE = /^\s*[-*]\s+(?:\*\*)?([^:*\n]{2,60}?)(?:\*\*)?\s*:\s+(.*)$/

export function parseKV(content: string): KV[] {
  const out: KV[] = []
  for (const line of stripComments(content).split(/\r?\n/)) {
    const m = line.match(KV_RE)
    if (m) {
      const value = m[2].trim()
      out.push({ key: m[1].trim(), value, todo: /^TODO\b/.test(value) || value === '' })
    } else if (out.length && /^\s{2,}\S/.test(line)) {
      out[out.length - 1].value += '\n' + line.trim()
    }
  }
  return out
}

export function isKVList(content: string) {
  const clean = stripComments(content)
  if (/\|.*\|/.test(clean) || /```/.test(clean)) return false
  const bullets = clean.split(/\r?\n/).filter((l) => /^\s*[-*]\s+/.test(l))
  if (bullets.length < 2) return false
  const kv = bullets.filter((l) => KV_RE.test(l)).length
  return kv >= bullets.length * 0.7
}

export function parseChecks(body: string): Check[] {
  const out: Check[] = []
  let section = ''
  for (const line of stripComments(body).split(/\r?\n/)) {
    const h = line.match(/^#{2,3}\s+(.+)$/)
    if (h) section = h[1].trim()
    // several "- [ ] a   - [ ] b" on one line are split
    const parts = line.split(/(?=-\s\[[ xX]\]\s)/)
    for (const p of parts) {
      const m = p.match(/^\s*-\s\[([ xX])\]\s+(.+?)\s*$/)
      if (m) out.push({ done: m[1].toLowerCase() === 'x', text: m[2], section })
    }
  }
  return out
}

export type Table = { headers: string[]; rows: string[][]; heading: string }

export function parseTables(body: string): Table[] {
  const out: Table[] = []
  const lines = body.split(/\r?\n/)
  let heading = ''
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^#{1,4}\s+(.+)$/)
    if (h) heading = h[1].trim()
    if (/^\s*\|.*\|\s*$/.test(lines[i]) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const headers = splitRow(lines[i])
      const rows: string[][] = []
      i += 2
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(splitRow(lines[i]))
        i++
      }
      i--
      out.push({ headers, rows, heading })
    }
  }
  return out
}

function splitRow(line: string) {
  // split on "|" but not on escaped "\|"
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/)
  return cells.map((c) => c.trim().replace(/\\\|/g, '|'))
}

export const stripMd = (s: string) =>
  s
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()

export function firstParagraph(md: string, max = 220) {
  const text = stripComments(md)
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#') && !p.startsWith('|') && !p.startsWith('```'))
  if (!text) return ''
  const clean = stripMd(text.replace(/\s+/g, ' '))
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean
}

export function dirOf(p: string) {
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}

export function joinPath(base: string, rel: string) {
  const parts = (base ? base.split('/') : []).concat(rel.split('/'))
  const out: string[] = []
  for (const p of parts) {
    if (!p || p === '.') continue
    if (p === '..') out.pop()
    else out.push(p)
  }
  return out.join('/')
}
