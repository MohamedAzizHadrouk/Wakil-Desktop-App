import { Bot, Building2, Eye, FolderOpen, FolderPlus, Loader2, SquareTerminal } from 'lucide-react'
import { WakilMark, WakilWordmark } from '../components/Logo'
import { useApp } from '../lib/store'

export function Welcome({ loading, error }: { loading: boolean; error: string | null }) {
  const { choose, init } = useApp()
  return (
    <div className="flex h-screen flex-col bg-ink text-ivory">
      <div className="drag flex h-8 shrink-0 items-center pl-3 text-[11px] text-muted">
        <WakilMark className="mr-2 h-3 w-auto" /> Wakil — Personal & Business OS
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-xl">
          <WakilWordmark />
          <h1 className="mt-8 text-3xl font-bold tracking-tight">Visualisez votre écosystème</h1>
          <p className="mt-3 text-sm leading-relaxed text-ivory/70">
            Wakil lit un dossier local (organisations, projets, agents, skills, commandes, actualités…) et l’affiche
            de façon structurée. L’application est en <span className="font-semibold text-terra">lecture seule</span> :
            les fichiers se modifient avec Claude Code, Wakil se met à jour automatiquement.
          </p>

          <button
            onClick={choose}
            disabled={loading}
            className="mt-8 flex h-12 items-center gap-2 rounded-xl bg-terra px-5 text-sm font-semibold text-ink transition-colors hover:bg-terra-strong disabled:opacity-60"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
            {loading ? 'Indexation…' : 'Choisir le dossier de l’écosystème'}
          </button>
          <button
            onClick={() => init('new')}
            disabled={loading}
            className="mt-3 flex h-12 items-center gap-2 rounded-xl border border-ink-line px-5 text-sm font-semibold text-ivory transition-colors hover:bg-ink-2 disabled:opacity-60"
          >
            <FolderPlus className="size-4" /> Créer un nouvel écosystème
          </button>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            « Créer » initialise un dossier vide avec toute la structure Wakil (agents, skills, commandes, modèles d’entités, de tâches, de profil…).
            Aucun fichier existant n’est jamais écrasé. Ensuite : <span className="font-mono text-ivory/80">claude --agent manager</span> puis <span className="font-mono text-ivory/80">/wakil.setup</span>.
          </p>
          {error && <p className="mt-4 rounded-lg bg-danger/15 px-3 py-2 text-xs text-[#fca5a5]">{error}</p>}

          <ul className="mt-10 grid gap-4 text-xs text-ivory/70 sm:grid-cols-2">
            {[
              { i: Building2, t: 'entities/', d: 'Organisations, individus, projets, décisions' },
              { i: Bot, t: '.claude/agents/', d: 'Agents et leurs skills' },
              { i: SquareTerminal, t: '.claude/commands/', d: 'Toutes les commandes, avec recherche' },
              { i: Eye, t: 'ecosystem/', d: 'Profil, connaissances, actualités, marque' },
            ].map(({ i: Icon, t, d }) => (
              <li key={t} className="flex gap-3 rounded-xl bg-ink-2 p-3">
                <Icon className="size-4 shrink-0 text-terra" />
                <span>
                  <span className="block font-mono text-ivory">{t}</span>
                  {d}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
