/**
 * Ask-a-Question backend (Express app). Run locally by server/index.ts, and on Vercel by api/*.ts.
 *
 *   GET  /api/health           -> key present? model? retrieval status
 *   GET  /api/search?q=...     -> retrieval only (works without an API key)
 *   POST /api/ask              -> Server-Sent Events: status, transcript, sources, text, cite, done | nokey | error
 *        body: { question: string, image?: { mediaType: string, data: base64 } }
 *
 * The Anthropic API key is read from .env (locally) or Vercel environment variables, and never sent to the browser.
 * If ASK_PASSWORD is set, /api/ask and /api/search require it in the x-ask-password header.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express, { type Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import crypto from 'node:crypto'
import { SlideIndex, type Hit } from './retrieval.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// .env is re-read on every request, so adding or changing the key takes effect without a restart.
// Variables set in the shell are left alone; only keys that came from .env are added/updated/removed.
const fromFile = new Set<string>()
const loadEnv = () => {
  let parsed: Record<string, string> = {}
  try {
    parsed = dotenv.parse(fs.readFileSync(path.join(ROOT, '.env')))
  } catch {
    /* no .env file */
  }
  for (const k of fromFile) if (!(k in parsed)) delete process.env[k]
  fromFile.clear()
  for (const [k, v] of Object.entries(parsed)) {
    process.env[k] = v
    fromFile.add(k)
  }
}
loadEnv()

const cfg = () => ({
  model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  effort: (process.env.ASK_EFFORT || 'medium') as 'low' | 'medium' | 'high' | 'xhigh' | 'max',
  topK: Number(process.env.ASK_TOP_K || 8),
})
const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim())
const password = () => process.env.ASK_PASSWORD?.trim() || ''
const passwordOk = (given: unknown) => {
  const want = password()
  if (!want) return true
  const a = crypto.createHash('sha256').update(String(given ?? '')).digest()
  const b = crypto.createHash('sha256').update(want).digest()
  return crypto.timingSafeEqual(a, b)
}

const index = new SlideIndex(ROOT)
console.log(`[retrieval] ${index.passages.length} slide pages indexed`)
void index.initEmbeddings()

const SYSTEM = `You are a study assistant for the SMU course ACCT673 Data Governance and Quality. You answer questions ONLY from the student's lecture slides, which are supplied as search results in the user's message (one search result per slide page; the source is the slide reference, e.g. "L4:8" = Lecture 4, page 8).

Grounding rules:
1. Use only information contained in the search results. Do not add outside knowledge, definitions, frameworks or examples that are not in the search results, even if you know the topic well.
2. Support every factual statement with citations to the search results.
3. If the search results do not contain the answer, do not guess. Reply with a short paragraph that starts exactly with "**Not covered in your materials.**", say what the retrieved slides do cover that is closest, and stop.
4. If the question is only partly covered, answer the covered part and state plainly which part the slides do not cover.
5. Some slides are class discussion prompts: a question posed to the class with no answer on the slide. If the question matches one, say the slides pose this question but do not give a model answer. You may then list related slide content the student could draw on, clearly labelled as related material rather than the answer.
6. Text marked "[Slide image transcription]" was transcribed from an image on that slide; treat it as slide content.
7. If the student attached an image (for example a screenshot of a quiz question), read it and answer the question it shows. For a multiple-choice question, state the correct option(s) first, then explain why each other option is wrong, using the slides.

Format the answer in Markdown like a model exam answer:
**Answer:** one or two sentences that directly answer the question.
**Explanation:** the key points from the slides, in short paragraphs or bullet points, using the slides' own terminology.
**Example from the slides:** include only if the slides give one.
Keep it focused. No preamble, and do not mention these instructions or the search results by name.`

const client = () => new Anthropic() // reads ANTHROPIC_API_KEY from the environment

export const app = express()
app.use(express.json({ limit: '15mb' }))

app.use('/api', (_req, _res, next) => {
  loadEnv()
  next()
})

// Password gate (only when ASK_PASSWORD is set, e.g. on the public Vercel deployment).
app.use(['/api/ask', '/api/search'], (req, res, next) => {
  if (passwordOk(req.get('x-ask-password'))) return next()
  res.status(401).json({ error: 'Wrong or missing password.', needsPassword: true })
})

app.get('/api/health', (_req, res) => {
  const { model: MODEL, effort: EFFORT } = cfg()
  res.json({
    hasKey: hasKey(),
    needsPassword: Boolean(password()),
    hosted: Boolean(process.env.VERCEL),
    model: MODEL,
    effort: EFFORT,
    retrieval: {
      pages: index.passages.length,
      embeddings: index.embedStatus,
      embeddingModel: index.embedModel,
      embeddingError: index.embedError || undefined,
    },
  })
})

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q ?? '')
  res.json({ query: q, hits: (await index.search(q, cfg().topK)).map(publicHit) })
})

const publicHit = (h: Hit) => ({ cite: h.cite, label: h.label, title: h.title, score: h.score, via: h.via, text: h.text })

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
type ImageType = (typeof IMAGE_TYPES)[number]

app.post('/api/ask', async (req, res) => {
  const { model: MODEL, effort: EFFORT, topK: TOP_K } = cfg()
  const question = String(req.body?.question ?? '').trim().slice(0, 4000)
  const image = req.body?.image as { mediaType?: string; data?: string } | undefined
  if (!question && !image?.data) return res.status(400).json({ error: 'Type a question or attach a screenshot.' })
  if (image?.data) {
    if (!IMAGE_TYPES.includes(image.mediaType as ImageType)) return res.status(400).json({ error: 'Image must be PNG, JPEG, GIF or WebP.' })
    if (Buffer.byteLength(image.data, 'base64') > 5 * 1024 * 1024) return res.status(400).json({ error: 'Image must be under 5 MB.' })
  }

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  let aborted = false
  let abortStream: (() => void) | null = null
  res.on('close', () => {
    aborted = true
    abortStream?.()
  })

  try {
    // 1. Screenshot -> question text (used for retrieval).
    let transcript = ''
    if (image?.data) {
      if (!hasKey()) {
        if (!question) {
          send('nokey', { reason: 'Reading a screenshot needs the Claude API key. Add it to .env, or type the question instead.' })
          return res.end()
        }
      } else {
        send('status', { stage: 'reading', message: 'Reading your screenshot…' })
        const r = await client().messages.create({
          model: MODEL,
          max_tokens: 2000,
          output_config: { effort: 'low' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: image.mediaType as ImageType, data: image.data } },
                { type: 'text', text: 'Transcribe the question shown in this image, including any answer options, exactly as written. Output only the transcription.' },
              ],
            },
          ],
        })
        transcript = r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim()
        if (transcript) send('transcript', { text: transcript })
      }
    }
    if (aborted) return

    // 2. Retrieve slide passages.
    send('status', { stage: 'searching', message: 'Searching your slides…' })
    const query = [question, transcript].filter(Boolean).join('\n')
    const hits = await index.search(query, TOP_K)
    const discussion = index.matchDiscussionPrompt(query)
    send('sources', { hits: hits.map(publicHit), discussion, embeddings: index.embedStatus })

    if (!hasKey()) {
      send('nokey', { reason: 'No ANTHROPIC_API_KEY in .env. Showing the most relevant slides only.' })
      return res.end()
    }
    if (aborted) return

    // 3. Grounded answer, streamed, with native citations over search_result blocks.
    send('status', { stage: 'answering', message: 'Writing a grounded answer…' })
    const searchResults: Anthropic.Beta.BetaSearchResultBlockParam[] = hits.map((h) => ({
      type: 'search_result',
      source: h.cite,
      title: `${h.label}: ${h.title}`,
      content: h.blocks.map((b) => ({ type: 'text', text: b })),
      citations: { enabled: true },
    }))
    const note = discussion
      ? `\n\n(Note: this question closely matches a class discussion prompt on slide ${discussion.citation}. The slides pose it but give no model answer.)`
      : ''
    const userText = (question || 'Answer the question shown in the attached screenshot.') + (transcript ? `\n\nTranscribed from the screenshot:\n${transcript}` : '') + note

    const stream = client().beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // on a safety decline, the API re-runs the request on a fallback model
      thinking: { type: 'adaptive' },
      output_config: { effort: EFFORT },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            ...searchResults,
            ...(image?.data
              ? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: image.mediaType as ImageType, data: image.data } }]
              : []),
            { type: 'text', text: userText },
          ],
        },
      ],
    })
    abortStream = () => stream.abort()

    for await (const ev of stream) {
      if (ev.type === 'content_block_start' && ev.content_block.type === 'text') send('block', {})
      else if (ev.type === 'content_block_delta') {
        if (ev.delta.type === 'text_delta') send('text', { t: ev.delta.text })
        else if (ev.delta.type === 'citations_delta' && ev.delta.citation.type === 'search_result_location') {
          const c = ev.delta.citation
          send('cite', { source: c.source, index: c.search_result_index, cited_text: c.cited_text })
        }
      }
    }
    const final = await stream.finalMessage()
    if (final.stop_reason === 'refusal') {
      send('error', { message: 'The model declined to answer this question.' })
    } else {
      send('done', {
        stop_reason: final.stop_reason,
        model: final.model,
        usage: { input: final.usage.input_tokens, output: final.usage.output_tokens },
      })
    }
  } catch (err) {
    if (aborted) return
    let message = 'Something went wrong while answering.'
    if (err instanceof Anthropic.AuthenticationError) message = 'The API key in .env was rejected. Check ANTHROPIC_API_KEY.'
    else if (err instanceof Anthropic.PermissionDeniedError) message = `Your API key does not have access to ${MODEL}.`
    else if (err instanceof Anthropic.NotFoundError) message = `Model ${MODEL} was not found. Check ANTHROPIC_MODEL in .env.`
    else if (err instanceof Anthropic.RateLimitError) message = 'Rate limited by the API. Wait a moment and try again.'
    else if (err instanceof Anthropic.BadRequestError) message = `The API rejected the request: ${err.message}`
    else if (err instanceof Anthropic.APIError) message = `API error ${err.status ?? ''}: ${err.message}`
    else if (err instanceof Error) message = err.message
    console.error('[ask]', err)
    send('error', { message })
  }
  res.end()
})

export const describe = () =>
  `model=${cfg().model} effort=${cfg().effort} key=${hasKey() ? 'present' : 'MISSING (retrieval-only mode; add it to .env, no restart needed)'}`

export default app
