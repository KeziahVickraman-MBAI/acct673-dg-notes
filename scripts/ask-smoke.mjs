// Smoke-test the Ask-a-Question backend once ANTHROPIC_API_KEY is in .env.
// Usage: npm run ask:test [-- "your question"]   (the server must be running: npm run dev)
const q = process.argv[2] ?? 'What is the difference between a data owner and a business data steward?'
const health = await fetch('http://127.0.0.1:8787/api/health').then((r) => r.json()).catch(() => null)
if (!health) { console.error('Server not reachable on :8787. Start it with: npm run dev'); process.exit(1) }
console.log('health:', JSON.stringify(health))
if (!health.hasKey) { console.error('No ANTHROPIC_API_KEY in .env. Add it and restart npm run dev.'); process.exit(1) }
console.log(`\nQ: ${q}\n`)
const res = await fetch('http://127.0.0.1:8787/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }) })
const dec = new TextDecoder(); let buf = ''; const cites = new Set(); let ok = false
for await (const chunk of res.body) {
  buf += dec.decode(chunk, { stream: true })
  let i
  while ((i = buf.indexOf('\n\n')) >= 0) {
    const raw = buf.slice(0, i); buf = buf.slice(i + 2)
    const ev = /^event: (.*)$/m.exec(raw)?.[1]; const d = JSON.parse(/^data: (.*)$/m.exec(raw)?.[1] ?? '{}')
    if (ev === 'text') process.stdout.write(d.t)
    if (ev === 'cite') { cites.add(d.source); process.stdout.write(` [${d.source}]`) }
    if (ev === 'status') console.log(`(${d.message})`)
    if (ev === 'error') console.error('\nERROR:', d.message)
    if (ev === 'done') { ok = true; console.log(`\n\n✓ done (${d.model}, ${d.usage.input} in / ${d.usage.output} out tokens). Cited: ${[...cites].join(', ') || 'none'}`) }
  }
}
process.exit(ok ? 0 : 1)
