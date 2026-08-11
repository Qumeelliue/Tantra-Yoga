// Персистентность (localStorage) и мета-прогресс: Грантха, дневник практики, статистика.
import { CARDS, ENEMIES, RELICS, EVENTS, QUOTES } from './data.js'

const KEY = 'tantra-yoga-save-v1'

export const EMPTY_META = () => ({
  compendium: { cards: {}, enemies: {}, relics: {}, events: {} },
  quotesUnlocked: {},
  practiceDiary: [],
  stats: { runs: 0, deaths: 0, victories: 0, pacified: 0, kills: 0, awakened: 0 },
  bestRun: null,
  seen: { cards: {}, enemies: {}, relics: {}, events: {} },
})

export function loadMeta() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY_META()
    const m = { ...EMPTY_META(), ...JSON.parse(raw) }
    m.compendium = { ...EMPTY_META().compendium, ...m.compendium }
    m.stats = { ...EMPTY_META().stats, ...m.stats }
    return m
  } catch {
    return EMPTY_META()
  }
}

export function saveMeta(meta) {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta))
  } catch {
    /* quota/безопасность — молча */
  }
}

export function resetMeta() {
  const m = EMPTY_META()
  saveMeta(m)
  return m
}

// Первая встреча открывает карточку в Грантхе. Возвращает новые открытия.
export function markSeen(meta, kind, id) {
  const unlocked = []
  const seen = meta.seen[kind]
  if (seen && !seen[id]) {
    seen[id] = true
    meta.compendium[kind][id] = true
    const quoteId = quoteFor(kind, id)
    if (quoteId && !meta.quotesUnlocked[quoteId]) {
      meta.quotesUnlocked[quoteId] = true
      unlocked.push(quoteId)
    }
    unlocked.push(id)
  }
  return unlocked
}

function quoteFor(kind, id) {
  if (kind === 'cards' && CARDS[id]) return CARDS[id].quoteId
  if (kind === 'enemies' && ENEMIES[id]) return ENEMIES[id].quoteId
  if (kind === 'relics' && RELICS[id]) return RELICS[id].quoteId
  if (kind === 'events' && EVENTS[id]) return null
  return null
}

export function addAnchor(meta, anchor) {
  const key = `${anchor.situation}|${anchor.practice}`
  if (!meta.practiceDiary.some((a) => `${a.situation}|${a.practice}` === key)) {
    meta.practiceDiary.push({ ...anchor, at: Date.now() })
    return true
  }
  return false
}

export function recordRunEnd(meta, result) {
  meta.stats.runs += 1
  if (result === 'death') meta.stats.deaths += 1
  if (result === 'victory') meta.stats.victories += 1
  if (result === 'awakening') meta.stats.awakened += 1
}

export function quoteById(id) {
  return QUOTES[id] || null
}

export function compendiumList(meta) {
  return {
    cards: Object.keys(meta.compendium.cards || {}),
    enemies: Object.keys(meta.compendium.enemies || {}),
    relics: Object.keys(meta.compendium.relics || {}),
    quotes: Object.keys(meta.quotesUnlocked || {}),
  }
}
