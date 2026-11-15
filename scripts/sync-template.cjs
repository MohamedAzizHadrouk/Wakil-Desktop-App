// Copies the SHAREABLE structure of an ecosystem (the files git tracks or would track – never the private,
// git-ignored entities/ and ecosystem/ data) into ./template, which the app uses to initialise new folders.
// Usage: node scripts/sync-template.cjs "C:\path\to\my-ecosystem"
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const src = process.argv[2]
if (!src || !fs.existsSync(path.join(src, 'CLAUDE.md'))) {
  console.error('Give the path of an ecosystem folder (it must contain CLAUDE.md).')
  process.exit(1)
}
const out = path.join(__dirname, '..', 'template')
const list = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: src, encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)
  // safety net: never ship private data even if .gitignore changes
  .filter((p) => !/^(entities|ecosystem)\//.test(p) || /^(entities|ecosystem)\/_templates\//.test(p))
  .filter((p) => !/^\.claude\/(settings\.local\.json|launch\.json)$/.test(p))

fs.rmSync(out, { recursive: true, force: true })
for (const rel of list) {
  const from = path.join(src, rel)
  if (!fs.existsSync(from) || !fs.statSync(from).isFile()) continue
  // electron-builder drops .gitkeep files: store them as "gitkeep.wakil" (renamed back on copy)
  const to = path.join(out, rel.replace(/(^|\/)\.gitkeep$/, '$1gitkeep.wakil'))
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}
// empty folders that the structure expects
for (const d of ['entities', 'ecosystem']) fs.mkdirSync(path.join(out, d), { recursive: true })
fs.writeFileSync(path.join(out, '.wakil-template.json'), JSON.stringify({ from: path.basename(src), files: list.length, at: new Date().toISOString() }, null, 2))
console.log(`template/ ← ${list.length} files from ${src}`)
