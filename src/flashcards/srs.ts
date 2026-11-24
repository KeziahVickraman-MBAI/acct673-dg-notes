/**
 * Simple SM-2-style spaced repetition.
 * Intervals are in days (fractions allowed for short "learning" steps).
 */
export type Grade = 'again' | 'hard' | 'good' | 'easy'
export type CardState = { ease: number; interval: number; due: number; reps: number; lapses: number; last: number }

const MIN = 1 / (24 * 60) // one minute in days
const DAY = 24 * 60 * 60 * 1000

export function nextInterval(s: CardState | undefined, g: Grade): number {
  const reps = s?.reps ?? 0
  const iv = s?.interval ?? 0
  const ease = s?.ease ?? 2.5
  if (g === 'again') return 1 * MIN
  if (reps === 0) return g === 'hard' ? 10 * MIN : g === 'good' ? 1 : 4
  if (g === 'hard') return Math.max(1, iv * 1.2)
  if (g === 'good') return Math.max(1, iv * ease)
  return Math.max(2, iv * ease * 1.3)
}

export function rate(s: CardState | undefined, g: Grade, now = Date.now()): CardState {
  const ease0 = s?.ease ?? 2.5
  const ease =
    g === 'again' ? Math.max(1.3, ease0 - 0.2) : g === 'hard' ? Math.max(1.3, ease0 - 0.15) : g === 'easy' ? ease0 + 0.15 : ease0
  const interval = nextInterval(s, g)
  return {
    ease,
    interval,
    due: now + interval * DAY,
    reps: g === 'again' ? 0 : (s?.reps ?? 0) + 1,
    lapses: (s?.lapses ?? 0) + (g === 'again' && (s?.reps ?? 0) > 0 ? 1 : 0),
    last: now,
  }
}

export function fmtInterval(days: number) {
  const mins = Math.round(days * 24 * 60)
  if (mins < 60) return `${mins}m`
  if (days < 1) return `${Math.round(days * 24)}h`
  if (days < 30) return `${Math.round(days)}d`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}

export type Status = 'new' | 'learning' | 'due' | 'review' | 'mature'
export function status(s: CardState | undefined, now = Date.now()): Status {
  if (!s) return 'new'
  if (s.due <= now) return s.interval < 1 ? 'learning' : 'due'
  if (s.interval < 1) return 'learning'
  return s.interval >= 21 ? 'mature' : 'review'
}
