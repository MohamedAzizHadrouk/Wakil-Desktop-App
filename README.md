# Wakil Desktop

Application de bureau (Electron + React) qui **visualise en lecture seule** un écosystème Wakil :
organisations, individus, projets, agents, skills, commandes, profil, connaissances, actualités et marque personnelle.

L’application ne modifie **jamais** le dossier ouvert. Les fichiers se modifient avec Claude Code
(`claude --agent manager` puis les commandes `/wakil.*`) ; Wakil détecte chaque changement et se met à jour tout seul.

## Lancer

```bash
npm install
npm run dev        # mode développement (Vite + Electron, rechargement à chaud)
npm run build      # vérifie les types et construit dist/
npm start          # lance la version construite
```

### Installateur Windows

```bash
npm run dist       # → release/Wakil-Desktop-Setup-<version>.exe
```

Installateur NSIS (x64, installation par utilisateur, dossier d’installation au choix, raccourcis Bureau + menu Démarrer).
L’icône vient de `build/icon.png` (régénérable avec `npx electron scripts/make-icon.cjs`).
L’exécutable n’est pas signé : Windows SmartScreen peut afficher « Windows a protégé votre ordinateur » → « Informations complémentaires » → « Exécuter quand même ».
Pour une nouvelle version, augmentez `version` dans `package.json` puis relancez `npm run dist`.

Au premier lancement, choisissez le dossier de l’écosystème (ex. `C:\Users\…\Documents\AZIZ\my-ecosystem`).
Le chemin est mémorisé. Variable d’environnement possible : `WAKIL_WORKSPACE=<chemin>`.

## Nouveautés v0.10 – Projets personnels, filtre de période, explorateur

- **Projets personnels** : `/wakil.personal-project add <nom> [objectif]` crée `ecosystem/projects/<slug>/` (PROJECT.md,
  plans/, tasks/, assets/ – privé). Planification avec `/wakil.plan personal <slug> …`. Dans l’app : entrée
  « Projets personnels », filtre Tous / Clients / Personnels, Kanban, usage et dépenses comme un projet client.
- **Filtre de période** (Aujourd’hui · Cette semaine · Ce mois · Mois dernier · Cette année · Tout · Période…) dans
  Usage & crédits (défaut : ce mois ; les frais mensuels sont proratisés pour une période plus courte), dépenses
  allouées d’un projet, Kanban (selon dernière activité, création ou échéance) et historiques de décisions.
- **Explorateur** : chevron pour replier/déplier, Maj+clic ou bouton au survol pour tout un sous-dossier,
  « Tout déplier », « Tout replier », « Niveau 1 » ; l’état est mémorisé.

## Nouveautés v0.9 – Trois modes d’exécution

- **Demande directe** (sans commande) : l’agent exécute tout de suite – ni plan, ni fichier tâche, ni carte Trello,
  même si l’entité a un tableau Trello.
- **`/wakil.plan`** : plan structuré en markdown (`plans/PLAN-*.md` + `tasks/T-NNN-*.md`, `sync: local`) – phases, ordre,
  dépendances, estimation – visible dans le Kanban, jamais sur Trello ; `approve` puis `run` pour l’exécuter.
- **`/wakil.plan.trello`** : le même plan + une carte Trello par tâche (après accord), `--from <plan>` pour publier un
  plan local.
- Kanban : filtre par plan, vue par statut ou par phase, badge local / Trello, ordre, « attend T-00x », en-tête du plan
  avec progression ; onglet « Tâches (Kanban) » sur chaque agent (toutes ses tâches, tous projets).

## Nouveautés v0.8 – Abonnements, ACU et répartition des dépenses

- **Configuration depuis les chats** (Claude Code, Cursor, Codex) : `/wakil.provider`, `/wakil.subscription`,
  `/wakil.usage` → `node tools/ai-registry.cjs` (validation, `--yes` pour les changements financiers, historique
  versionné, journal avec chat d’origine + agent) → registre privé `usage/registry.json` (git-ignoré) → affiché ici.
  L’application reste en lecture seule (aucun formulaire).
- **ACU** = (I×Wi + O×Wo + C×Wc) × M + R par requête (défauts 1 / 2 / 0,25 / 0,5, M = 1), versions de formule
  conservées ; affichage « en vigueur à la date » ou « recalcul ». Moteur : `src/lib/acu.ts`.
- **Pools indépendants par abonnement**, mois par mois : part du projet = ACU projet / ACU abonnement ; dépense allouée =
  part × dépense réelle (fixe : prix en vigueur ou facture ; variable : facture / chiffre fournisseur, sinon estimation
  provisoire). Non alloué + alloué = dépense. Budget ≠ dépense. Moteur : `src/lib/allocation.ts`.
- **Modes de mesure** : mesuré (journaux Claude Code / Codex), estimé (requêtes déclarées × ACU/requête configuré),
  niveau abonnement (indicateurs fournisseur, non convertis).
- Page Usage & crédits : filtre multi-abonnements, KPI, cartes d’abonnement, projets, historique, ACU, registre,
  export CSV ; part allouée sur chaque projet et sur le tableau de bord.
- Tests : `npm test` (36 tests : formule, cache, télémétrie manquante, fixe / à l’usage / hybride, pools, filtres,
  devises, historique des prix, CLI).

## Nouveautés v0.7 – Claude Code, Cursor et Codex

- L’écosystème fonctionne avec **Claude Code, Cursor et OpenAI Codex**. `.claude/` reste la seule source ;
  `node tools/sync-ai-tools.cjs` (ou `/wakil.sync-tools`) génère `AGENTS.md`, `.agents/skills/` (une skill par
  commande + les skills des agents), `.cursor/agents/` et `.codex/agents/*.toml`.
- Commandes : Claude Code `/wakil.news` · Cursor `/wakil-news` · Codex `$wakil-news`. La page Commandes compose la
  commande pour l’outil choisi.
- Agents : chaque fiche indique s’il est disponible dans Claude Code, Cursor et Codex.
- Usage : l’app lit aussi l’historique local de Codex (`%USERPROFILE%\.codex\sessions\…`, sessions lancées dans le
  dossier de l’écosystème) ; filtre et répartition par outil. Les modèles sans tarif dans `usage/PRICING.md` (ex. les
  modèles OpenAI) comptent leurs tokens mais sont marqués « tarif ? » au lieu d’un prix inventé. Cursor ne garde pas
  d’historique de tokens lisible en local (seulement sur cursor.com/dashboard).
- Espace de travail : carte « Outils IA » (état de synchronisation pour chaque outil).

## Nouveautés v0.6

- **Initialiser un dossier** : « Créer un nouvel écosystème » (écran d’accueil ou Espace de travail) copie toute la
  structure Wakil (agents, skills, commandes, modèles d’entités / tâches / profil, `usage/PRICING.md`…) dans un dossier
  vide. « Compléter la structure » ajoute seulement les fichiers manquants au dossier ouvert. Rien n’est jamais écrasé,
  une confirmation est demandée. Le modèle est dans `template/` ; pour le régénérer depuis votre écosystème :
  `npm run sync-template -- "C:\…\my-ecosystem"` (seuls les fichiers partageables, suivis par git, sont copiés).
- **Kanban par projet** : lit `projects/<projet>/tasks/T-NNN-*.md` (format `entities/_templates/task.md`, commande
  `/wakil.task`), 9 colonnes = les listes du Command Center Trello, agent / assigné, priorité, critères, historique.
- **Usage & crédits** : lit (en lecture seule) l’historique local de Claude Code
  `%USERPROFILE%\.claude\projects\<dossier>\` – tokens par message, par sous-agent et par session – et calcule un crédit
  estimé (équivalent API) avec `usage/PRICING.md`. Vue globale, par agent, par projet, par tâche, par jour, par session.
  Une exécution est liée à une tâche par la ligne `TASK: <entité>/<projet>/<T-NNN>` du brief (sinon par le lien
  Trello, le titre de la carte, ou les lignes Client / Project du brief).

## Écrans

| Écran | Source lue |
|---|---|
| Tableau de bord | focus (`entities/.focus.md`), points de reprise, to-do du jour, décisions, fichiers récents |
| Organisations & individus | `entities/<slug>/` : ENTITY, POSITION, RULES, BRAND, ORG, PEOPLE (masqué par défaut), documents, `.resume.md` |
| Projets | `entities/<slug>/projects/<projet>/` : PROJECT.md, décisions, autres documents, assets/livrables (aperçu des images), dépôts de code |
| Agents | `.claude/agents/<agent>/<agent>.md` (frontmatter `name`, `description`, `model`) + `skills/INDEX.md` |
| Skills | `.claude/agents/<agent>/skills/<catégorie>/<skill>/SKILL.md` (frontmatter `skill`, `category`, `use-when`, `inputs`, `output`, `last-checked`) |
| Commandes | `.claude/commands/*.md` (frontmatter `description`, `argument-hint`, sections Purpose, Arguments, Steps, Rules, Output, Schedulable, Examples) + catégories de `COMMANDS.md` |
| Profil / Connaissances / Actualités / Marque | `ecosystem/` : PROFILE, SETUP-STATUS, knowledge/, news/AAAA/MM/JJ/, brand/ |
| Explorateur | tous les fichiers indexés : Markdown rendu, JSON/YAML/texte, images ; le reste s’ouvre avec l’application par défaut |
| Espace de travail | contrôle de structure (fichiers attendus, liens d’INDEX cassés, commandes citées sans fichier), dépôts de code, statistiques |

**Commandes** : recherche instantanée (nom, description, arguments, contenu), filtres par catégorie et « programmables »,
raccourcis `/` et `↑ ↓`, tableau des arguments, exemples copiables, et un champ pour composer la commande complète à coller dans Claude Code.

**Partout** : `Ctrl+K` recherche globale, `Alt+←` retour, champs `TODO` affichés en « à compléter ».

## Formats reconnus

- **Markdown** (`.md`) : titre `# KICKER: Nom`, lignes `Clé: valeur` sous le titre (métadonnées), frontmatter YAML simple,
  sections `##`. Chaque section est affichée au mieux : grille clé/valeur (`- Clé: valeur`), frise chronologique
  (`- AAAA-MM-JJ – texte – auteur`), checklist (`- [ ]`) ou Markdown.
- **Images** (png, jpg, svg, gif, webp) : aperçu. **JSON / YAML / texte** : aperçu. **PDF, PPTX, APK…** : ouverture externe.
- Un dossier qui contient `package.json`, `pubspec.yaml`, `*.sln`, `*.csproj`… est vu comme un **dépôt de code** :
  listé (avec son README) mais pas indexé fichier par fichier. `node_modules`, `.git`, `bin`, `obj`, `build`, `dist`… sont ignorés.

## Conventions recommandées pour l’écosystème

Rien n’est obligatoire, mais ces conventions rendent l’affichage plus riche :

1. Garder les métadonnées sous le titre (`Type:`, `Status:`, `Created:`) dans ENTITY.md, PROJECT.md, CHANNEL.md.
2. Garder le format `- AAAA-MM-JJ – texte – auteur` dans les « Decisions log » et `.resume.md` (frise chronologique).
3. Toujours un `description` et un `argument-hint` dans le frontmatter des commandes, et une section `## Examples` avec des exemples entre backticks.
4. Toujours mettre à jour `skills/INDEX.md` quand un skill est ajouté (le contrôle de structure signale les liens cassés).
5. Écrire les chemins entre backticks (`projects/x/PROJECT.md`) : ils deviennent cliquables dans l’application.

## Sécurité

- `contextIsolation`, `sandbox`, pas de `nodeIntegration` ; le preload n’expose que des appels de lecture
  (`readText`, `dataUrl`, ouvrir/afficher dans l’Explorateur) — aucune écriture ni suppression.
- Tous les chemins sont vérifiés pour rester dans le dossier ouvert. CSP stricte dans la version construite.
#   W a k i l - D e s k t o p - A p p  
 