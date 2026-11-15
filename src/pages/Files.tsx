import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Code2, Folder, FolderOpen } from 'lucide-react'
import { AssetPreview, Card, Chip, DocView, Empty, FileActions, FileList, fileIcon, formatSize, Page, Pill, SearchInput, timeAgo } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { api, useApp, useModel } from '../lib/store'
import type { RawFile, Repo } from '../lib/types'

type Node = { name: string; path: string; dirs: Map<string, Node>; files: RawFile[]; repo?: Repo }

const TEXT_EXT = ['.json', '.yaml', '.yml', '.txt', '.csv', '.ps1', '.sh', '.html', '.css', '.js', '.ts', '.tsx', '.xml', '.toml', '.ini', '.svg', '.gitignore', '.cs', '.dart', '.py']
const IMG_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico']

function buildTree(files: RawFile[], repos: Repo[]): Node {
  const root: Node = { name: '', path: '', dirs: new Map(), files: [] }
  const dirFor = (p: string) => {
    let n = root
    if (!p) return n
    let acc = ''
    for (const part of p.split('/')) {
      acc = acc ? `${acc}/${part}` : part
      if (!n.dirs.has(part)) n.dirs.set(part, { name: part, path: acc, dirs: new Map(), files: [] })
      n = n.dirs.get(part)!
    }
    return n
  }
  for (const f of files) {
    const i = f.path.lastIndexOf('/')
    dirFor(i === -1 ? '' : f.path.slice(0, i)).files.push(f)
  }
  for (const r of repos) dirFor(r.path).repo = r
  return root
}

function filterTree(n: Node, keep: (f: RawFile) => boolean): Node | null {
  const dirs = new Map<string, Node>()
  for (const [k, d] of n.dirs) {
    const f = filterTree(d, keep)
    if (f) dirs.set(k, f)
  }
  const files = n.files.filter(keep)
  if (!dirs.size && !files.length && !n.repo && n.path) return null
  return { ...n, dirs, files }
}

export function FilesPage({ path }: { path?: string }) {
  const m = useModel()
  const { go, recentlyChanged } = useApp()
  const [q, setQ] = useState('')
  const [mdOnly, setMdOnly] = useState(true)
  // folders unfolded in normal mode (remembered between sessions) / folders folded while searching
  const [open, setOpenState] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('wakil.files.open')
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch {
      /* storage unavailable */
    }
    return new Set(['entities', 'ecosystem', '.claude'])
  })
  const [searchClosed, setSearchClosed] = useState<Set<string>>(new Set())
  const setOpen = (fn: (s: Set<string>) => Set<string>) =>
    setOpenState((s) => {
      const n = fn(s)
      try {
        localStorage.setItem('wakil.files.open', JSON.stringify([...n]))
      } catch {
        /* ignore */
      }
      return n
    })

  useEffect(() => {
    if (!path) return
    setOpen((s) => {
      const n = new Set(s)
      const parts = path.split('/')
      for (let i = 1; i < parts.length; i++) n.add(parts.slice(0, i).join('/'))
      n.add(path)
      return n
    })
  }, [path])

  const tree = useMemo(() => {
    const t = q.trim().toLowerCase()
    const keep = (f: RawFile) => (!mdOnly || f.content !== undefined) && (!t || f.path.toLowerCase().includes(t) || (f.content ?? '').toLowerCase().includes(t))
    return filterTree(buildTree(m.files, t ? [] : m.repos), keep) ?? buildTree([], [])
  }, [m.files, m.repos, mdOnly, q])

  const searching = !!q.trim()
  const isOpenPath = (p: string) => (searching ? !searchClosed.has(p) : open.has(p))
  /** every folder path under a node (the node included) */
  const subtree = (n: Node, out: string[] = []): string[] => {
    if (n.path && !n.repo) out.push(n.path)
    for (const d of n.dirs.values()) subtree(d, out)
    return out
  }
  const setPaths = (paths: string[], openIt: boolean) => {
    if (searching)
      setSearchClosed((s) => {
        const n = new Set(s)
        for (const p of paths) openIt ? n.delete(p) : n.add(p)
        return n
      })
    else
      setOpen((s) => {
        const n = new Set(s)
        for (const p of paths) openIt ? n.add(p) : n.delete(p)
        return n
      })
  }
  const expandAll = () => setPaths(subtree(tree), true)
  const collapseAll = () => (searching ? setSearchClosed(new Set(subtree(tree))) : setOpen(() => new Set()))
  const firstLevel = () => {
    if (searching) setSearchClosed(new Set(subtree(tree).filter((p) => p.includes('/'))))
    else setOpen(() => new Set([...tree.dirs.values()].map((d) => d.path)))
  }

  const renderNode = (n: Node, depth: number): React.ReactNode => {
    const dirs = [...n.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))
    const files = [...n.files].sort((a, b) => a.name.localeCompare(b.name))
    return (
      <>
        {dirs.map((d) => {
          const isOpen = isOpenPath(d.path)
          return (
            <div key={d.path}>
              <div
                className={`group flex w-full items-center gap-1 rounded py-0.5 pr-1 text-[13px] hover:bg-ivory ${path === d.path ? 'bg-terra-soft font-semibold' : ''}`}
                style={{ paddingLeft: depth * 14 + 2 }}
              >
                {d.repo ? (
                  <span className="grid size-5 place-items-center">
                    <Code2 className="size-3.5 shrink-0 text-sky" />
                  </span>
                ) : (
                  <button
                    onClick={(e) => setPaths(e.shiftKey || e.altKey ? subtree(d) : [d.path], !isOpen)}
                    title={`${isOpen ? 'Replier' : 'Déplier'} (Maj+clic : tout le sous-dossier)`}
                    className="grid size-5 shrink-0 place-items-center rounded text-muted hover:bg-line hover:text-ink"
                  >
                    {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  </button>
                )}
                <button
                  onClick={() => {
                    if (!d.repo && !isOpen) setPaths([d.path], true)
                    go({ page: 'files', path: d.path })
                  }}
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left"
                >
                  {!d.repo && (isOpen ? <FolderOpen className="size-3.5 shrink-0 text-terra-strong" /> : <Folder className="size-3.5 shrink-0 text-terra-strong" />)}
                  <span className="truncate">{d.name}</span>
                  {d.repo && <span className="ml-auto shrink-0 text-[10px] text-sky">code</span>}
                </button>
                {!d.repo && d.dirs.size > 0 && (
                  <button
                    onClick={() => setPaths(subtree(d), !isOpen)}
                    title={isOpen ? 'Replier tout ce dossier' : 'Déplier tout ce dossier'}
                    className="hidden shrink-0 rounded px-1 text-muted group-hover:inline hover:bg-line hover:text-ink"
                  >
                    {isOpen ? <ChevronsDownUp className="size-3.5" /> : <ChevronsUpDown className="size-3.5" />}
                  </button>
                )}
              </div>
              {isOpen && !d.repo && renderNode(d, depth + 1)}
            </div>
          )
        })}
        {files.map((f) => {
          const Icon = fileIcon(f.ext)
          return (
            <button
              key={f.path}
              onClick={() => go({ page: 'files', path: f.path })}
              className={`flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-[13px] hover:bg-ivory ${path === f.path ? 'bg-terra-soft font-semibold' : ''}`}
              style={{ paddingLeft: depth * 14 + 26 }}
              title={f.path}
            >
              <Icon className="size-3.5 shrink-0 text-slate" />
              <span className="truncate">{f.name}</span>
              {recentlyChanged.has(f.path) && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-sky" />}
            </button>
          )
        })}
      </>
    )
  }

  return (
    <Page wide>
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="self-start lg:sticky lg:top-0">
          <div className="space-y-2 border-b border-line p-3">
            <SearchInput value={q} onChange={setQ} placeholder="Nom ou contenu…" />
            <div className="flex gap-1.5">
              <Chip active={mdOnly} onClick={() => setMdOnly(true)}>Markdown</Chip>
              <Chip active={!mdOnly} onClick={() => setMdOnly(false)}>Tous les fichiers</Chip>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate">
              <button onClick={expandAll} className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-ivory hover:text-ink" title="Déplier tous les dossiers">
                <ChevronsUpDown className="size-3.5" /> Tout déplier
              </button>
              <button onClick={collapseAll} className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-ivory hover:text-ink" title="Replier tous les dossiers">
                <ChevronsDownUp className="size-3.5" /> Tout replier
              </button>
              <button onClick={firstLevel} className="rounded-md px-1.5 py-1 hover:bg-ivory hover:text-ink" title="N’afficher que le premier niveau">
                Niveau 1
              </button>
            </div>
          </div>
          <div className="max-h-[calc(100vh-260px)] overflow-y-auto p-2">{renderNode(tree, 0)}</div>
        </Card>
        <div className="min-w-0">
          <Preview path={path} />
        </div>
      </div>
    </Page>
  )
}

function Preview({ path }: { path?: string }) {
  const m = useModel()
  if (!path) return <Empty title="Sélectionnez un fichier" icon={<FolderOpen className="size-5" />}>Tous les fichiers sont en lecture seule. Ouvrez-les avec votre éditeur ou modifiez-les via Claude Code.</Empty>
  const file = m.byPath.get(path)
  const doc = m.docs.get(path)
  if (doc) return <DocView key={path} doc={doc} />
  const repo = m.repos.find((r) => r.path === path)
  if (repo)
    return (
      <div className="space-y-4">
        <Card className="flex flex-wrap items-center gap-3 p-5">
          <Code2 className="size-5 text-sky" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{repo.name}</p>
            <p className="font-mono text-[11px] text-muted">{repo.path}</p>
          </div>
          <Pill tone="sky">{repo.kind}</Pill>
          <FileActions path={repo.path} compact />
        </Card>
        <p className="text-sm text-slate">Dépôt de code : non indexé fichier par fichier ({repo.entries} éléments à la racine).</p>
        {repo.readme && <Card className="p-5"><Markdown source={repo.readme} /></Card>}
      </div>
    )
  if (!file) {
    const children = m.files.filter((f) => f.path.startsWith(path + '/') && !f.path.slice(path.length + 1).includes('/'))
    const sub = new Set(m.files.filter((f) => f.path.startsWith(path + '/')).map((f) => f.path.slice(path.length + 1).split('/')[0]).filter((s, _, arr) => arr.length && s))
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-sm font-semibold">{path}/</p>
          <FileActions path={path} compact />
        </div>
        <Card>
          <FileList files={children} base={path} empty={`${sub.size} sous-dossier(s), aucun fichier direct.`} />
        </Card>
      </div>
    )
  }
  return <BinaryOrText file={file} />
}

function BinaryOrText({ file }: { file: RawFile }) {
  const [text, setText] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'large' | 'error'>('idle')
  const isImg = IMG_EXT.includes(file.ext)
  const isText = TEXT_EXT.includes(file.ext) || file.name.startsWith('.')
  useEffect(() => {
    setText(null)
    if (!isText || isImg) return
    setState('loading')
    api()
      .readText(file.path)
      .then((r) => {
        if (r.tooLarge) setState('large')
        else {
          setText(r.text ?? '')
          setState('idle')
        }
      })
      .catch(() => setState('error'))
  }, [file.path, isText, isImg])
  let pretty = text
  if (text && file.ext === '.json') {
    try {
      pretty = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      /* keep raw */
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold">{file.name}</p>
          <p className="text-[11px] text-muted">{file.path} · {formatSize(file.size)} · modifié {timeAgo(file.mtime)}</p>
        </div>
        <FileActions path={file.path} />
      </div>
      {isImg ? (
        <Card className="overflow-hidden"><AssetPreview path={file.path} className="max-h-[70vh] w-full bg-[repeating-conic-gradient(#f1f3f7_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-6" /></Card>
      ) : isText ? (
        state === 'large' ? (
          <Empty title="Fichier trop volumineux pour l’aperçu">Ouvrez-le avec l’application par défaut.</Empty>
        ) : (
          <Card className="p-0">
            <pre className="max-h-[75vh] overflow-auto p-5 font-mono text-xs leading-relaxed whitespace-pre text-ink">{state === 'loading' ? 'Chargement…' : pretty}</pre>
          </Card>
        )
      ) : (
        <Empty title="Aperçu non disponible pour ce format">Utilisez « Ouvrir avec l’application par défaut » (PowerPoint, PDF, APK…).</Empty>
      )}
    </div>
  )
}
