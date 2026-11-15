import { AlertTriangle, Code2, FolderOpen, FolderPlus, Info, LogOut, RefreshCw, Wand2 } from 'lucide-react'
import { Button, Card, CardHeader, CommandHint, FileActions, Page, PageTitle, Pill, ReadOnlyNote, timeAgo } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { api, useApp, useModel } from '../lib/store'

export function AiToolsCard() {
  const m = useModel()
  const t = m.aiTools
  const rows: { tool: string; reads: string; ok: boolean; detail: string }[] = [
    { tool: 'Claude Code', reads: 'CLAUDE.md · .claude/', ok: !!m.claudeMd, detail: `${m.agents.length} agents · ${m.commands.length} commandes` },
    { tool: 'Cursor', reads: 'AGENTS.md · .agents/skills · .cursor/agents', ok: t.agentsMd && t.cursorAgents.length > 0, detail: `${t.cursorAgents.length} sous-agents · ${t.skills} skills` },
    { tool: 'Codex', reads: 'AGENTS.md · .agents/skills · .codex/agents', ok: t.agentsMd && t.codexAgents.length > 0, detail: `${t.codexAgents.length} agents · ${t.skills} skills` },
  ]
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold">Outils IA</p>
      <p className="mt-1 text-xs text-slate">Les agents, skills et commandes de <code className="font-mono">.claude/</code> sont générés pour Cursor et Codex par <code className="font-mono">/wakil.sync-tools</code>.</p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.tool} className="flex items-start gap-2 text-sm">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${r.ok ? 'bg-ok' : 'bg-warn'}`} />
            <span className="min-w-0">
              <span className="font-semibold">{r.tool}</span> <span className="text-xs text-slate">· {r.ok ? r.detail : 'non configuré'}</span>
              <span className="block font-mono text-[10.5px] text-muted">{r.reads}</span>
            </span>
          </li>
        ))}
      </ul>
      {t.manifest ? (
        <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${t.stale ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-ok'}`}>
          {t.stale ? 'Des agents, skills ou commandes ont changé depuis la dernière synchronisation.' : 'Synchronisé'} · {timeAgo(new Date(t.manifest.generatedAt).getTime())}
        </p>
      ) : (
        <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">Jamais synchronisé pour Cursor / Codex.</p>
      )}
      {(t.stale || !t.manifest) && <div className="mt-3"><CommandHint command="/wakil.sync-tools" /></div>}
    </Card>
  )
}

export function WorkspacePage() {
  const m = useModel()
  const { choose, close, refresh, go, init } = useApp()
  const warn = m.health.filter((h) => h.level === 'warn')
  const info = m.health.filter((h) => h.level === 'info')
  const stats = [
    ['Fichiers indexés', m.stats.files],
    ['Documents markdown', m.stats.mdFiles],
    ['Dépôts de code', m.stats.repos],
    ['Dossiers ignorés', m.stats.skippedDirs],
    ['Durée de l’indexation', `${m.stats.durationMs} ms`],
  ] as const
  return (
    <Page>
      <PageTitle
        title="Espace de travail"
        sub={<span className="font-mono text-xs">{m.root}</span>}
        right={
          <>
            <Button onClick={() => api().revealFile('')}><FolderOpen className="size-4" /> Ouvrir le dossier</Button>
            <Button onClick={refresh}><RefreshCw className="size-4" /> Ré-indexer</Button>
            <Button primary onClick={choose}>Changer de dossier</Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Contrôle de structure" sub="Fichiers attendus par la structure Wakil, liens cassés, commandes manquantes" />
            <ul className="divide-y divide-line border-t border-line">
              {m.health.length === 0 && <li className="px-5 py-4 text-sm text-ok">Tout est en ordre ✓</li>}
              {[...warn, ...info].map((h, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  {h.level === 'warn' ? <AlertTriangle className="size-4 shrink-0 text-warn" /> : <Info className="size-4 shrink-0 text-muted" />}
                  <span className="flex-1">{h.text}</span>
                  {h.path && m.byPath.has(h.path) && (
                    <button onClick={() => go({ page: 'files', path: h.path })} className="text-xs font-semibold text-slate hover:text-ink">Voir</button>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          {m.repos.length > 0 && (
            <Card>
              <CardHeader title="Dépôts de code détectés" sub="Listés mais pas indexés fichier par fichier" />
              <ul className="divide-y divide-line border-t border-line">
                {m.repos.map((r) => (
                  <li key={r.path} className="flex items-center gap-3 px-5 py-2.5">
                    <Code2 className="size-4 shrink-0 text-sky" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{r.path}</span>
                    <Pill tone="sky">{r.kind}</Pill>
                    <FileActions path={r.path} compact />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {m.claudeMd && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-slate hover:text-ink">Règles partagées (CLAUDE.md)</summary>
              <Card className="mt-4 p-5"><Markdown source={m.claudeMd.body} docPath="CLAUDE.md" /></Card>
            </details>
          )}
        </div>
        <aside className="space-y-6">
          <Card className="p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span className="size-2 rounded-full bg-ok" /> Surveillance active
            </p>
            <p className="mt-1 text-xs text-slate">Chaque modification faite par Claude Code (ou un éditeur) est détectée et l’affichage se met à jour automatiquement.</p>
            <p className="mt-2 text-xs text-muted">Dernière indexation : {timeAgo(m.scannedAt)}</p>
            <dl className="mt-4 space-y-2">
              {stats.map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <dt className="text-slate">{k}</dt>
                  <dd className="font-mono">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="p-5 text-xs text-slate">
            <p className="text-sm font-semibold text-ink">Ignorés à l’indexation</p>
            <p className="mt-2 font-mono leading-relaxed">node_modules · .git · bin · obj · build · dist · .dart_tool · .gradle · .vs · .idea · uploads …</p>
            <p className="mt-2">Un dossier contenant package.json, pubspec.yaml, *.sln, *.csproj… est traité comme un dépôt de code.</p>
          </Card>
          <AiToolsCard />
          <Card className="p-5">
            <p className="text-sm font-semibold">Structure Wakil</p>
            <p className="mt-1 text-xs text-slate">Ajoute les fichiers de structure manquants (agents, commandes, modèles…) depuis le modèle intégré à l’application. Rien n’est écrasé : une confirmation est demandée avant.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => init('complete')}><Wand2 className="size-4" /> Compléter la structure</Button>
              <Button onClick={() => init('new')}><FolderPlus className="size-4" /> Nouvel écosystème</Button>
            </div>
          </Card>
          <ReadOnlyNote>Wakil ne modifie jamais vos fichiers. Seules les actions « Compléter la structure » et « Nouvel écosystème » créent des fichiers manquants, après confirmation.</ReadOnlyNote>
          <button onClick={close} className="flex items-center gap-2 text-xs font-semibold text-slate hover:text-danger">
            <LogOut className="size-3.5" /> Fermer cet espace de travail
          </button>
        </aside>
      </div>
    </Page>
  )
}
