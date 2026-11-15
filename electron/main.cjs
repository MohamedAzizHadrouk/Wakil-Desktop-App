// Wakil Desktop – main process.
// The app is a READ-ONLY viewer. The single exception is "workspace:init": after an explicit confirmation it
// copies the missing structure files (never overwriting anything). The app's own config (last opened folder) is
// saved in Electron's userData directory.
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const fsp = fs.promises
const { getUsage } = require('./usage.cjs')

const DEV_URL = process.env.WAKIL_DEV_URL
const CONFIG_FILE = () => path.join(app.getPath('userData'), 'config.json')

// Folders never indexed (build output, dependencies, VCS…)
const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'bin', 'obj', '.dart_tool', 'build', 'dist', 'out', '.gradle', '.idea',
  '.vs', '.vscode', '.next', '.nuxt', '.cache', 'coverage', '__pycache__', '.venv', 'venv', 'Pods', '.expo',
  '.turbo', '.svelte-kit', 'target', '.pub-cache', '.terraform', 'uploads',
])
// A folder holding one of these is a code repository: it is listed, not indexed file by file.
const REPO_MARKERS = [
  ['package.json', 'Node / JavaScript'], ['pubspec.yaml', 'Flutter / Dart'], ['Cargo.toml', 'Rust'],
  ['go.mod', 'Go'], ['pom.xml', 'Java (Maven)'], ['build.gradle', 'Gradle'], ['pyproject.toml', 'Python'],
  ['requirements.txt', 'Python'], ['composer.json', 'PHP'], ['Gemfile', 'Ruby'],
]
const REPO_EXT_MARKERS = [['.sln', '.NET'], ['.csproj', '.NET'], ['.xcodeproj', 'Xcode']]
const MD_EXT = new Set(['.md', '.markdown', '.mdx'])
const MAX_MD_BYTES = 1.5 * 1024 * 1024
const MAX_FILES = 25000
const MAX_ASSET_BYTES = 15 * 1024 * 1024

let win = null
let root = null
let watcher = null
let debounce = null

// ---------- config ----------
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE(), 'utf8')) } catch { return {} }
}
function saveConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true })
    fs.writeFileSync(CONFIG_FILE(), JSON.stringify(cfg, null, 2))
  } catch (e) { console.error('config save failed', e) }
}
function isDir(p) { try { return fs.statSync(p).isDirectory() } catch { return false } }

// ---------- path safety ----------
function resolveInRoot(rel) {
  if (!root || typeof rel !== 'string') throw new Error('No workspace')
  const abs = path.resolve(root, rel)
  const base = path.resolve(root)
  if (abs !== base && !abs.startsWith(base + path.sep)) throw new Error('Path outside workspace')
  return abs
}
const toRel = (abs) => path.relative(root, abs).split(path.sep).join('/')

// ---------- scan ----------
function repoKind(names) {
  for (const [file, kind] of REPO_MARKERS) if (names.includes(file)) return kind
  for (const [ext, kind] of REPO_EXT_MARKERS) if (names.some((n) => n.endsWith(ext))) return kind
  return null
}

async function scan() {
  const started = Date.now()
  const files = []
  const repos = []
  let skippedDirs = 0
  let truncated = false

  async function walk(dir, depth) {
    if (files.length >= MAX_FILES) { truncated = true; return }
    let entries
    try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { return }
    const names = entries.map((e) => e.name)
    if (depth > 0) {
      const kind = repoKind(names)
      if (kind) {
        let readme = null
        const r = names.find((n) => /^readme(\.md)?$/i.test(n))
        if (r) { try { readme = (await fsp.readFile(path.join(dir, r), 'utf8')).slice(0, 20000) } catch {} }
        let mtime = 0
        try { mtime = (await fsp.stat(dir)).mtimeMs } catch {}
        repos.push({ path: toRel(dir), name: path.basename(dir), kind, readme, mtime, entries: names.length })
        return
      }
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (IGNORED_DIRS.has(e.name)) { skippedDirs++; continue }
        await walk(abs, depth + 1)
      } else if (e.isFile()) {
        if (files.length >= MAX_FILES) { truncated = true; return }
        let st
        try { st = await fsp.stat(abs) } catch { continue }
        const ext = path.extname(e.name).toLowerCase()
        const f = { path: toRel(abs), name: e.name, ext, size: st.size, mtime: st.mtimeMs }
        if ((MD_EXT.has(ext) || f.path === '.wakil/tools.json' || f.path === 'usage/registry.json') && st.size <= MAX_MD_BYTES) {
          try { f.content = await fsp.readFile(abs, 'utf8') } catch {}
        }
        files.push(f)
      }
    }
  }

  await walk(root, 0)
  return {
    root,
    scannedAt: Date.now(),
    files,
    repos,
    stats: {
      files: files.length,
      mdFiles: files.filter((f) => f.content !== undefined).length,
      repos: repos.length,
      skippedDirs,
      truncated,
      durationMs: Date.now() - started,
    },
  }
}

// ---------- watcher ----------
function stopWatcher() {
  if (watcher) { try { watcher.close() } catch {} watcher = null }
}
function startWatcher() {
  stopWatcher()
  if (!root) return
  try {
    watcher = fs.watch(root, { recursive: true }, (_evt, filename) => {
      if (filename) {
        const parts = String(filename).split(/[\\/]/)
        if (parts.some((p) => IGNORED_DIRS.has(p))) return
      }
      clearTimeout(debounce)
      debounce = setTimeout(async () => {
        if (!win || win.isDestroyed()) return
        try {
          const data = await scan()
          win.webContents.send('workspace:changed', data)
        } catch (e) { console.error('rescan failed', e) }
      }, 600)
    })
    watcher.on('error', (e) => console.error('watcher error', e))
  } catch (e) {
    console.error('watch failed', e)
  }
}

function setRoot(dir) {
  root = path.resolve(dir)
  saveConfig({ ...loadConfig(), root })
  startWatcher()
}

// ---------- IPC (read-only API) ----------
ipcMain.handle('workspace:get', async () => {
  if (!root) return null
  return scan()
})
ipcMain.handle('workspace:choose', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choisir le dossier de l’écosystème',
    properties: ['openDirectory'],
    defaultPath: root || app.getPath('documents'),
  })
  if (res.canceled || !res.filePaths[0]) return null
  setRoot(res.filePaths[0])
  return scan()
})
ipcMain.handle('workspace:close', async () => {
  stopWatcher()
  root = null
  saveConfig({ ...loadConfig(), root: null })
  return true
})
ipcMain.handle('file:text', async (_e, rel) => {
  const abs = resolveInRoot(rel)
  const st = await fsp.stat(abs)
  if (st.size > 2 * 1024 * 1024) return { tooLarge: true, size: st.size }
  return { text: await fsp.readFile(abs, 'utf8') }
})
ipcMain.handle('file:dataUrl', async (_e, rel) => {
  const abs = resolveInRoot(rel)
  const st = await fsp.stat(abs)
  if (st.size > MAX_ASSET_BYTES) return null
  const ext = path.extname(abs).toLowerCase().slice(1)
  const mime = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', ico: 'image/x-icon', bmp: 'image/bmp', pdf: 'application/pdf' }[ext]
  if (!mime) return null
  const buf = await fsp.readFile(abs)
  return `data:${mime};base64,${buf.toString('base64')}`
})
// Token usage from Claude Code's local session logs (read-only).
ipcMain.handle('usage:get', async () => (root ? getUsage(root) : null))

// ---------- initialisation (the ONLY place where the app writes, after an explicit confirmation) ----------
const templateDir = () => (app.isPackaged ? path.join(process.resourcesPath, 'template') : path.join(__dirname, '..', 'template'))

async function listTemplate(dir, base = dir, out = []) {
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) {
      out.push({ rel: path.relative(base, abs), dir: true })
      await listTemplate(abs, base, out)
    } else if (e.name !== '.wakil-template.json') out.push({ rel: path.relative(base, abs), dir: false })
  }
  return out
}

/** Copies the template into target, creating only what is missing. Never overwrites. */
async function applyTemplate(target) {
  const items = await listTemplate(templateDir())
  const created = []
  let kept = 0
  for (const it of items) {
    const to = path.join(target, it.rel.replace(/gitkeep\.wakil$/, '.gitkeep'))
    if (it.dir) { await fsp.mkdir(to, { recursive: true }); continue }
    if (fs.existsSync(to)) { kept++; continue }
    await fsp.mkdir(path.dirname(to), { recursive: true })
    await fsp.copyFile(path.join(templateDir(), it.rel), to, fs.constants.COPYFILE_EXCL)
    created.push(path.relative(target, to).split(path.sep).join('/'))
  }
  // Copied files get a new modification date: refresh the Cursor/Codex sync stamp we just created,
  // otherwise the new ecosystem would look "out of sync" right away.
  if (created.includes('.wakil/tools.json')) {
    const stamp = path.join(target, '.wakil', 'tools.json')
    try {
      const m = JSON.parse(await fsp.readFile(stamp, 'utf8'))
      m.generatedAt = new Date(Date.now() + 5000).toISOString()
      await fsp.writeFile(stamp, JSON.stringify(m, null, 2) + '\n')
    } catch {}
  }
  return { created, kept }
}

async function missingCount(target) {
  const items = await listTemplate(templateDir())
  return items.filter((it) => !it.dir && !fs.existsSync(path.join(target, it.rel.replace(/gitkeep\.wakil$/, '.gitkeep')))).length
}

ipcMain.handle('workspace:init', async (_e, mode) => {
  if (!fs.existsSync(templateDir())) throw new Error('Modèle de structure introuvable dans l’application.')
  let target = root
  if (mode !== 'complete') {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choisir ou créer le dossier du nouvel écosystème',
      buttonLabel: 'Initialiser ici',
      properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
      defaultPath: app.getPath('documents'),
    })
    if (res.canceled || !res.filePaths[0]) return null
    target = res.filePaths[0]
  }
  if (!target) return null
  await fsp.mkdir(target, { recursive: true })
  const missing = await missingCount(target)
  const existing = (await fsp.readdir(target)).length
  if (missing === 0) {
    await dialog.showMessageBox(win, { type: 'info', title: 'Wakil', message: 'La structure est déjà complète.', detail: target })
  } else {
    const { response } = await dialog.showMessageBox(win, {
      type: existing ? 'warning' : 'question',
      title: 'Initialiser l’écosystème',
      message: `${missing} fichier(s) de structure vont être créés dans :\n${target}`,
      detail:
        (existing ? 'Le dossier n’est pas vide : seuls les fichiers manquants seront ajoutés. ' : '') +
        'Aucun fichier existant ne sera modifié ni supprimé. Ensuite, ouvrez Claude Code dans ce dossier et lancez /wakil.setup.',
      buttons: ['Initialiser', 'Annuler'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response !== 0) return null
  }
  const result = missing ? await applyTemplate(target) : { created: [], kept: 0 }
  setRoot(target)
  return { ...result, root: target, scan: await scan() }
})

// Export a report chosen by the user (Save dialog) – written where the user picks, never inside the workspace silently.
ipcMain.handle('report:save', async (_e, defaultName, content) => {
  if (typeof content !== 'string' || content.length > 20 * 1024 * 1024) return null
  const res = await dialog.showSaveDialog(win, {
    title: 'Exporter le rapport d’usage',
    defaultPath: path.join(app.getPath('documents'), String(defaultName || 'wakil-usage.csv').replace(/[\\/:*?"<>|]/g, '-')),
    filters: [{ name: 'CSV', extensions: ['csv'] }, { name: 'Markdown', extensions: ['md'] }],
  })
  if (res.canceled || !res.filePath) return null
  await fsp.writeFile(res.filePath, '﻿' + content, 'utf8') // BOM so Excel reads UTF-8 accents
  return res.filePath
})

// Opening a file with its default app / showing it in Explorer does not modify it.
ipcMain.handle('file:open', async (_e, rel) => shell.openPath(resolveInRoot(rel)))
ipcMain.handle('file:reveal', async (_e, rel) => { shell.showItemInFolder(resolveInRoot(rel)); return true })
ipcMain.handle('link:external', async (_e, url) => {
  if (typeof url === 'string' && /^(https?|mailto):/i.test(url)) await shell.openExternal(url)
  return true
})

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: '#0b132b',
    title: 'Wakil Desktop',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b132b', symbolColor: '#94a3b8', height: 32 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (DEV_URL && url.startsWith(DEV_URL)) return
    e.preventDefault()
  })
  if (DEV_URL) win.loadURL(DEV_URL)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  const fromEnv = process.env.WAKIL_WORKSPACE
  const saved = loadConfig().root
  const candidate = fromEnv || saved
  if (candidate && isDir(candidate)) setRoot(candidate)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => {
  stopWatcher()
  if (process.platform !== 'darwin') app.quit()
})
