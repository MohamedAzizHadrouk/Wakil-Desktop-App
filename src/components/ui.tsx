import React, { useEffect, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  ExternalLink,
  FileCode2,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Lock,
  Terminal,
} from 'lucide-react'
import { Markdown } from './Markdown'
import { isDatedList, isKVList, parseChecks, parseDated, parseKV, stripMd } from '../lib/markdown'
import { api, useApp } from '../lib/store'
import type { Check as CheckItem, Dated, MdDoc, RawFile, Section } from '../lib/types'

// ---------- basics ----------
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-paper ${className}`}>{children}</section>
}

export function CardHeader({ title, right, sub }: { title: React.ReactNode; right?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-slate">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function Page({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={`mx-auto px-4 py-6 sm:px-6 lg:py-8 ${wide ? 'max-w-[1400px]' : 'max-w-[1180px]'}`}>{children}</div>
}

export function PageTitle({
  kicker,
  title,
  sub,
  right,
  path,
}: {
  kicker?: React.ReactNode
  title: React.ReactNode
  sub?: React.ReactNode
  right?: React.ReactNode
  path?: string
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {kicker && <p className="text-xs font-semibold tracking-wider text-terra-strong uppercase">{kicker}</p>}
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
        {sub && <div className="mt-1 text-sm text-slate">{sub}</div>}
        {path && <p className="mt-1 font-mono text-[11px] text-muted">{path}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  )
}

const PILL_TONES = {
  neutral: 'bg-ivory text-slate border-line',
  ok: 'bg-ok-soft text-ok border-transparent',
  warn: 'bg-warn-soft text-warn border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  sky: 'bg-sky-soft text-[#0284a8] border-transparent',
  terra: 'bg-terra-soft text-terra-strong border-transparent',
  ink: 'bg-ink text-ivory border-transparent',
}
export type Tone = keyof typeof PILL_TONES

export function Pill({ children, tone = 'neutral', className = '' }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${PILL_TONES[tone]} ${className}`}>
      {children}
    </span>
  )
}

export function statusTone(status: string): Tone {
  const s = status.toLowerCase()
  if (/^(active|actif|done|ok|live|published)/.test(s)) return 'ok'
  if (/(planned|planifi|draft|todo|pending|paused|en attente)/.test(s)) return 'warn'
  if (/(blocked|archiv|stopped|closed|failed)/.test(s)) return 'danger'
  return 'neutral'
}

export function StatusPill({ status }: { status: string }) {
  if (!status) return null
  const short = status.split(/\s+[–—-]\s+/)[0]
  return <Pill tone={statusTone(short)}>{short}</Pill>
}

export function TodoBadge({ n }: { n: number }) {
  if (!n) return null
  return (
    <Pill tone="warn">
      {n} à compléter
    </Pill>
  )
}

export function CopyButton({ text, label = 'Copier', className = '', small = false }: { text: string; label?: string; className?: string; small?: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1300)
      }}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-paper font-semibold text-ink transition-colors hover:border-slate ${
        small ? 'h-7 px-2 text-[11px]' : 'h-9 px-3 text-sm'
      } ${className}`}
      title={text}
    >
      {done ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
      {done ? 'Copié' : label}
    </button>
  )
}

export function Button({
  children,
  onClick,
  primary = false,
  className = '',
  title,
}: {
  children: React.ReactNode
  onClick?: () => void
  primary?: boolean
  className?: string
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap transition-colors duration-150 ${
        primary ? 'bg-terra text-ink hover:bg-terra-strong' : 'border border-line bg-paper text-ink hover:border-slate'
      } ${className}`}
    >
      {children}
    </button>
  )
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number; disabled?: boolean }[]
  active: T
  onChange: (t: T) => void
}) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => (
        <button
          key={t.id}
          disabled={t.disabled}
          onClick={() => onChange(t.id)}
          className={`relative shrink-0 px-3 py-2.5 text-sm whitespace-nowrap transition-colors ${
            active === t.id ? 'font-semibold text-ink' : 'text-slate hover:text-ink'
          } ${t.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 font-mono text-[11px] text-muted">{t.count}</span>}
          {active === t.id && <span className="absolute right-2 bottom-0 left-2 h-0.5 rounded-full bg-terra" />}
        </button>
      ))}
    </div>
  )
}

export function Empty({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-paper px-6 py-10 text-center">
      {icon && <div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-ivory text-slate">{icon}</div>}
      <p className="text-sm font-semibold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-slate">{children}</div>}
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className = '',
  autoFocus,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  className?: string
  autoFocus?: boolean
  inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <label className={`flex h-9 items-center gap-2 rounded-lg border border-line bg-paper px-3 text-sm text-slate focus-within:border-slate ${className}`}>
      <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted"
      />
      {value && (
        <button onClick={() => onChange('')} className="text-xs text-muted hover:text-ink">
          Effacer
        </button>
      )}
    </label>
  )
}

export function Chip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors duration-150 ${
        active ? 'bg-ink text-ivory' : 'border border-line bg-paper text-slate hover:border-slate hover:text-ink'
      }`}
    >
      {children}
      {count !== undefined && <span className="ml-1.5 font-mono text-muted">{count}</span>}
    </button>
  )
}

// ---------- dates ----------
export function fmtDate(d: string | number) {
  const date = typeof d === 'number' ? new Date(d) : new Date(d + (d.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(date.getTime())) return String(d)
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
export function timeAgo(ms: number) {
  const s = (Date.now() - ms) / 1000
  if (s < 60) return 'à l’instant'
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`
  if (s < 86400 * 7) return `il y a ${Math.floor(s / 86400)} j`
  return fmtDate(ms)
}

// ---------- read-only note ----------
export function ReadOnlyNote({ command, children }: { command?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-sm">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink text-ivory">
        <Lock className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Lecture seule</p>
        <p className="text-xs text-slate">
          {children ?? 'Pour modifier ces informations, utilisez Claude Code dans le dossier de l’écosystème.'}
        </p>
      </div>
      {command && (
        <span className="flex items-center gap-2">
          <code className="hidden rounded-md border border-line bg-ivory px-2 py-1 font-mono text-xs md:inline">{command}</code>
          <CopyButton text={command} small />
        </span>
      )}
    </div>
  )
}

// ---------- file actions ----------
export function FileActions({ path, compact = false }: { path: string; compact?: boolean }) {
  const { go } = useApp()
  return (
    <span className="flex items-center gap-1">
      <IconBtn title="Voir dans l’explorateur Wakil" onClick={() => go({ page: 'files', path })}>
        <Eye className="size-4" />
      </IconBtn>
      <IconBtn title="Ouvrir avec l’application par défaut" onClick={() => api().openFile(path)}>
        <ExternalLink className="size-4" />
      </IconBtn>
      <IconBtn title="Afficher dans l’Explorateur Windows" onClick={() => api().revealFile(path)}>
        <FolderOpen className="size-4" />
      </IconBtn>
      {!compact && <CopyButton text={path} label="Chemin" small />}
    </span>
  )
}

export function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title={title}
      aria-label={title}
      className="grid size-8 place-items-center rounded-md text-slate transition-colors hover:bg-ivory hover:text-ink"
    >
      {children}
    </button>
  )
}

export function fileIcon(ext: string) {
  if (['.md', '.markdown', '.txt'].includes(ext)) return FileText
  if (['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'].includes(ext)) return ImageIcon
  return FileCode2
}

export function formatSize(n: number) {
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`
  return `${(n / 1024 / 1024).toFixed(1)} Mo`
}

export function FileList({ files, base, empty = 'Aucun fichier.' }: { files: RawFile[]; base?: string; empty?: string }) {
  const { go, recentlyChanged } = useApp()
  if (!files.length) return <p className="px-5 py-4 text-sm text-slate">{empty}</p>
  return (
    <ul className="divide-y divide-line">
      {files.map((f) => {
        const Icon = fileIcon(f.ext)
        const rel = base && f.path.startsWith(base + '/') ? f.path.slice(base.length + 1) : f.path
        return (
          <li key={f.path}>
            <div
              onClick={() => go({ page: 'files', path: f.path })}
              className="flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-ivory"
            >
              <Icon className="size-4 shrink-0 text-slate" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{rel}</span>
              {recentlyChanged.has(f.path) && <Pill tone="sky">modifié</Pill>}
              <span className="hidden text-xs text-muted sm:inline">{formatSize(f.size)}</span>
              <span className="hidden w-24 text-right text-xs text-muted md:inline">{timeAgo(f.mtime)}</span>
              <FileActions path={f.path} compact />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ---------- structured renderers ----------
export function Timeline({ items, showScope = false, limit }: { items: Dated[]; showScope?: boolean; limit?: number }) {
  const [all, setAll] = useState(false)
  const list = limit && !all ? items.slice(0, limit) : items
  if (!items.length) return <p className="text-sm text-slate">Aucune entrée.</p>
  return (
    <>
      <ol className="space-y-3 border-l border-line pl-4">
        {list.map((d, i) => (
          <li key={i} className="relative text-sm">
            <span className="absolute top-1.5 -left-[20.5px] size-2 rounded-full border-2 border-paper bg-terra" />
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate">
              <span className="font-mono font-semibold text-ink">{d.date}</span>
              {showScope && d.scope && <span>· {d.scope}</span>}
              {d.author && <Pill>{d.author}</Pill>}
            </p>
            <div className="mt-0.5">
              <Markdown source={d.text} docPath={d.source} className="!text-[13px] [&_p]:!my-0" />
            </div>
          </li>
        ))}
      </ol>
      {limit && items.length > limit && (
        <button onClick={() => setAll((a) => !a)} className="mt-3 text-xs font-semibold text-terra-strong hover:underline">
          {all ? 'Réduire' : `Tout afficher (${items.length})`}
        </button>
      )}
    </>
  )
}

export function KVGrid({ content, docPath }: { content: string; docPath?: string }) {
  const items = parseKV(content)
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(140px,220px)_1fr]">
      {items.map((kv, i) => (
        <React.Fragment key={i}>
          <dt className="text-xs font-semibold text-slate sm:pt-0.5">{stripMd(kv.key)}</dt>
          <dd className="min-w-0 text-sm">
            {kv.todo ? (
              <span className="todo-chip-inline inline-block rounded-full bg-warn-soft px-2 text-[11px] leading-[18px] font-semibold text-warn">
                à compléter
              </span>
            ) : (
              <Markdown source={kv.value} docPath={docPath} className="[&_p]:!my-0" />
            )}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

export function Checklist({ items, groupBySection = true }: { items: CheckItem[]; groupBySection?: boolean }) {
  if (!items.length) return <p className="text-sm text-slate">Aucune tâche.</p>
  const groups = new Map<string, CheckItem[]>()
  for (const it of items) {
    const k = groupBySection ? it.section : ''
    groups.set(k, [...(groups.get(k) ?? []), it])
  }
  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([section, list]) => (
        <div key={section}>
          {section && <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate uppercase">{section}</p>}
          <ul className="space-y-1.5">
            {list.map((c, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span
                  className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${
                    c.done ? 'border-ok bg-ok text-white' : 'border-muted bg-paper'
                  }`}
                >
                  {c.done && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className={c.done ? 'text-slate line-through decoration-muted' : ''}>
                  <Markdown source={c.text} className="!text-sm [&_p]:!my-0" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function Progress({ done, total, tone = 'ok' }: { done: number; total: number; tone?: 'ok' | 'terra' | 'sky' }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  const color = { ok: 'bg-ok', terra: 'bg-terra', sky: 'bg-sky' }[tone]
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-slate">
        {done}/{total}
      </span>
    </div>
  )
}

/** Picks the most readable rendering for a section: timeline, key/value grid, checklist or markdown. */
export function SmartSection({ section, docPath }: { section: Section; docPath?: string }) {
  const c = section.content
  if (!c.replace(/<!--[\s\S]*?-->/g, '').trim()) return <p className="text-sm text-muted italic">Section vide.</p>
  if (isDatedList(c)) return <Timeline items={parseDated(c, docPath ?? '')} limit={12} />
  if (isKVList(c)) return <KVGrid content={c} docPath={docPath} />
  const checks = parseChecks(c)
  const lines = c.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('<!--'))
  if (checks.length >= 2 && checks.length >= lines.length * 0.7) return <Checklist items={checks} groupBySection={false} />
  return <Markdown source={c} docPath={docPath} />
}

/** A whole markdown document, section by section, collapsible, with a "raw" toggle. */
export function DocView({
  doc,
  hideSections = [],
  showHeader = true,
  defaultCollapsed = false,
}: {
  doc: MdDoc
  hideSections?: string[]
  showHeader?: boolean
  defaultCollapsed?: boolean
}) {
  const [raw, setRaw] = useState(false)
  const hidden = hideSections.map((h) => h.toLowerCase())
  const sections = doc.sections.filter((s) => !hidden.some((h) => s.heading.toLowerCase().startsWith(h)))
  const metaEntries = Object.entries(doc.meta)
  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {doc.kicker && <Pill tone="ink">{doc.kicker}</Pill>}
            <span className="truncate font-mono text-[11px] text-muted">{doc.path}</span>
            <span className="text-[11px] text-muted">· modifié {timeAgo(doc.mtime)}</span>
            <TodoBadge n={doc.todo} />
          </div>
          <span className="flex items-center gap-1">
            <button
              onClick={() => setRaw((r) => !r)}
              className={`h-7 rounded-md px-2 text-[11px] font-semibold ${raw ? 'bg-ink text-ivory' : 'text-slate hover:bg-ivory hover:text-ink'}`}
            >
              {raw ? 'Vue structurée' : 'Markdown brut'}
            </button>
            <FileActions path={doc.path} compact />
          </span>
        </div>
      )}
      {raw ? (
        <Card className="p-5">
          <pre className="overflow-x-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink">{doc.body}</pre>
        </Card>
      ) : (
        <>
          {(metaEntries.length > 0 || Object.keys(doc.frontmatter).length > 0) && (
            <Card className="px-5 py-4">
              <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {[...Object.entries(doc.frontmatter), ...metaEntries].map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{k}</dt>
                    <dd className="mt-0.5 text-sm break-words">
                      {/^TODO/.test(v) ? <span className="text-warn">à compléter</span> : <Markdown source={v} docPath={doc.path} className="[&_p]:!my-0" />}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
          {doc.intro && (
            <Card className="px-5 py-4">
              <Markdown source={doc.intro} docPath={doc.path} />
            </Card>
          )}
          {sections.map((s, i) => (
            <Collapsible key={s.heading + i} title={s.heading} level={s.level} defaultOpen={!defaultCollapsed} docPath={doc.path} section={s} />
          ))}
          {!sections.length && !doc.intro && <Empty title="Document vide" />}
        </>
      )}
    </div>
  )
}

function Collapsible({ title, section, docPath, defaultOpen, level }: { title: string; section: Section; docPath: string; defaultOpen: boolean; level: number }) {
  const [open, setOpen] = useState(defaultOpen)
  const todo = (section.content.replace(/<!--[\s\S]*?-->/g, '').match(/\bTODO\b/g) || []).length
  return (
    <Card className={level === 3 ? 'ml-4' : ''}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-5 py-3 text-left">
        {open ? <ChevronDown className="size-4 text-slate" /> : <ChevronRight className="size-4 text-slate" />}
        <span className="flex-1 text-sm font-semibold">
          <Markdown source={title} className="[&_p]:!my-0 !text-sm !font-semibold" />
        </span>
        <TodoBadge n={todo} />
      </button>
      {open && (
        <div className="border-t border-line px-5 py-4">
          <SmartSection section={section} docPath={docPath} />
        </div>
      )}
    </Card>
  )
}

// ---------- assets ----------
export function AssetPreview({ path, className = '' }: { path: string; className?: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    api()
      .dataUrl(path)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null))
    return () => {
      alive = false
    }
  }, [path])
  if (url === undefined) return <div className={`animate-pulse bg-line ${className}`} />
  if (!url || url.startsWith('data:application/pdf')) return <div className={`grid place-items-center bg-ivory text-xs text-muted ${className}`}>Aperçu indisponible</div>
  return <img src={url} alt="" className={`object-contain ${className}`} />
}

export function CommandHint({ command }: { command: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-ivory py-1 pr-1 pl-2.5">
      <Terminal className="size-3.5 text-slate" />
      <code className="font-mono text-xs">{command}</code>
      <CopyButton text={command} small label="Copier" />
    </span>
  )
}
