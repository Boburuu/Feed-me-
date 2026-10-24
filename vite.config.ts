import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'node:path'
import { execSync } from 'node:child_process'

/** Version affichée dans l'app : dernière version publiée (tag), mises à jour depuis, date. */
function appVersion() {
  const date = new Date().toISOString().slice(0, 10)
  try {
    const described = execSync('git describe --tags --long', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    const [, tag, count, hash] = described.match(/^(.*)-(\d+)-g([0-9a-f]+)$/) ?? []
    return { tag: tag ?? described, after: Number(count ?? 0), hash: hash ?? '', date }
  } catch {
    return { tag: '', after: 0, hash: '', date }
  }
}

// Vite config — https://vitejs.dev/config/
// `npm run build` produit un unique dist/index.html (JS et CSS intégrés)
// qui s'ouvre directement dans le navigateur, sans serveur.
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
})
