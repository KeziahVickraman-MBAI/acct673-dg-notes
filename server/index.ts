/** Local server: `npm run server` (or `npm run dev`). On Vercel, api/*.ts serve the same app. */
import { app, describe } from './app.js'

const PORT = Number(process.env.PORT ?? 8787)
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] http://127.0.0.1:${PORT}  ${describe()}`)
})
