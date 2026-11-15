import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Strict CSP for the packaged app only (the dev server needs inline scripts for hot reload).
const csp = (): Plugin => ({
  name: 'wakil-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; object-src 'none'" />`,
    ),
})

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), csp()],
  build: { outDir: 'dist', emptyOutDir: true },
})
