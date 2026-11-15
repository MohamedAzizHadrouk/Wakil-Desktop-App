import React, { useMemo, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'
import { dirOf, joinPath, stripComments } from '../lib/markdown'
import { api, useApp } from '../lib/store'

/** Turns bare TODO words into inline code so they can be drawn as "à compléter" chips. */
function markTodos(md: string) {
  let fence = false
  return md
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fence = !fence
        return line
      }
      if (fence) return line
      return line
        .split('`')
        .map((seg, i) => (i % 2 === 0 ? seg.replace(/\bTODO\b/g, '`TODO`') : seg))
        .join('`')
    })
    .join('\n')
}

export function useResolvePath(docPath?: string) {
  const { model } = useApp()
  return (target: string): string | null => {
    if (!model) return null
    const clean = target.replace(/^<|>$/g, '').split('#')[0].replace(/\\/g, '/').replace(/\/$/, '')
    if (!clean || /^[a-z]+:/i.test(clean)) return null
    const base = docPath ? dirOf(docPath) : ''
    const candidates = [joinPath(base, clean), joinPath('', clean)]
    // paths written from the entity root (e.g. "projects/x/PROJECT.md" inside entities/<slug>/…)
    const ent = docPath?.match(/^(entities\/[^/]+)\//)?.[1]
    if (ent) candidates.push(joinPath(ent, clean))
    const eco = docPath?.startsWith('ecosystem/') ? 'ecosystem' : null
    if (eco) candidates.push(joinPath(eco, clean))
    for (const c of candidates) {
      if (model.byPath.has(c)) return c
      if (model.files.some((f) => f.path.startsWith(c + '/'))) return c + '/'
    }
    return null
  }
}

export function Markdown({ source, docPath, className = '' }: { source: string; docPath?: string; className?: string }) {
  const { go } = useApp()
  const resolve = useResolvePath(docPath)
  const text = useMemo(() => markTodos(stripComments(source)), [source])

  const components: Components = useMemo(
    () => ({
      a: ({ href, children }) => (
        <a
          onClick={(e) => {
            e.preventDefault()
            if (!href) return
            if (/^(https?|mailto):/i.test(href)) {
              api().openExternal(href)
              return
            }
            const p = resolve(href)
            if (p) go({ page: 'files', path: p.replace(/\/$/, '') })
          }}
          title={href}
        >
          {children}
        </a>
      ),
      code: ({ className: cls, children }) => {
        const value = String(children ?? '')
        if (cls) return <code className={cls}>{children}</code>
        if (value === 'TODO') return <span className="todo-chip">à compléter</span>
        if (/[/.]/.test(value) && !/\s/.test(value) && value.length < 200) {
          const p = resolve(value)
          if (p)
            return (
              <code
                onClick={() => go({ page: 'files', path: p.replace(/\/$/, '') })}
                className="cursor-pointer !border-terra/30 !bg-terra-soft/60 hover:!bg-terra-soft"
                title="Ouvrir dans l’explorateur"
              >
                {children}
              </code>
            )
        }
        return <code>{children}</code>
      },
      pre: ({ children }) => <PreBlock>{children}</PreBlock>,
      input: (props) => <input {...props} disabled readOnly />,
    }),
    [go, resolve],
  )

  return (
    <div className={`md ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

function PreBlock({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  return (
    <pre ref={ref} className="group">
      <button
        onClick={() => {
          navigator.clipboard.writeText(ref.current?.querySelector('code')?.innerText ?? '')
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
        className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-ink-3 px-2 py-1 font-sans text-[11px] text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-ivory"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? 'Copié' : 'Copier'}
      </button>
      {children}
    </pre>
  )
}
