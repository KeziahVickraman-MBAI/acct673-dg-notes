import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

// The materials folder on disk is "materials " (trailing space); accept either.
const MATERIALS = ['materials', 'materials ']
  .map((d) => path.resolve(__dirname, d))
  .find((d) => fs.existsSync(d))

// Serves /materials/<file>.pdf so citations can open the slide at #page=N.
function materialsPlugin(): Plugin {
  return {
    name: 'serve-materials',
    configureServer(server) {
      server.middlewares.use('/materials/', (req, res, next) => {
        if (!MATERIALS || !req.url) return next()
        const name = path.basename(decodeURIComponent(req.url.split('?')[0].split('#')[0]))
        const file = path.join(MATERIALS, name)
        if (!file.startsWith(MATERIALS) || !fs.existsSync(file)) return next()
        res.setHeader('Content-Type', 'application/pdf')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), materialsPlugin()],
  server: {
    port: 5173,
    // Ask-a-Question backend (added later) runs on 8787.
    proxy: { '/api': 'http://localhost:8787' },
  },
})
