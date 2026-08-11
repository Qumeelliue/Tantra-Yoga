// Персистентность (localStorage) + синк через Telegram CloudStorage (фаза 2, §17.1).
// Мета-прогресс: Грантха, дневник практики, статистика.
import { CARDS, ENEMIES, RELICS, EVENTS, QUOTES } from './data.js'

const KEY = 'tantra-yoga-save-v1'
const CS_PREFIX = 'ty'
const CS_CHUNK = 3600

export const EMPTY_META = () => ({
  compendium: { cards: {}, enemies: {}, relics: {}, events: {} },
  quotesUnlocked: {},
  practiceDiary: [],
  stats: { runs: 0, deaths: 0, victories: 0, pacified: 0, kills: 0, awakened: 0 },
  bestRun: null,
  seen: { cards: {}, enemies: {}, relics: {}, events: {} },
  savedAt: 0,
})

function cloud() {
  if (typeof window === 'undefined') return null
  try { return window.Telegram?.WebApp?.CloudStorage || null } catch { return null }
}

function csGet(key) {
  return new Promise((resolve) => {
    const cs = cloud()
    if (!cs) return resolve(null)
    try {
      cs.getItem(key, (err, val) => resolve(err ? null : val))
    } catch { resolve(null) }
  })
}

function csSet(key, value) {
  return new Promise((resolve) => {
    const cs = cloud()
    if (!cs) return resolve(false)
    try {
      cs.setItem(key, value, (err) => resolve(!err))
    } catch { resolve(false) }
  })
}

// ── CloudStorage (Telegram-аккаунт, перенос между устройствами) ──────────────

export async function saveToCloud(meta) {
  const cs = cloud()
  if (!cs) return false
  try {
    const json = JSON.stringify(meta)
    const chunks = []
    for (let i = 0; i < json.length; i += CS_CHUNK) chunks.push(json.slice(i, i + CS_CHUNK))
    await csSet(`${CS_PREFIX}_meta`, JSON.stringify({ n: chunks.length, t: meta.savedAt || Date.now() }))
    for (let i = 0; i < chunks.length; i++) {
      const ok = await csSet(`${CS_PREFIX}_${i}`, chunks[i])
      if (!ok) return false
    }
    return true
  } catch { return false }
}

export async function loadFromCloud() {
  const cs = cloud()
  if (!cs) return null
  try {
    const headRaw = await csGet(`${CS_PREFIX}_meta`)
    if (!headRaw) return null
    const head = JSON.parse(headRaw)
    let json = ''
    for (let i = 0; i < head.n; i++) {
      const part = await csGet(`${CS_PREFIX}_${i}`)
      if (part == null) return null
      json += part
    }
    const meta = JSON.parse(json)
    meta.savedAt = head.t || 0
    return meta
  } catch { return null }
}

// Синк при старте: если в облаке сохранение новее — возвращаем его (побеждает
// последний забег). Если локальное новее — проталкиваем в облако.
export async function cloudSync(meta) {
  const cloudMeta = await loadFromCloud()
  if (!cloudMeta) return null
  if ((cloudMeta.savedAt || 0) > (meta.savedAt || 0)) {
    saveLocal(cloudMeta)
    return cloudMeta
  }
  if ((meta.savedAt || 0) > (cloudMeta.savedAt || 0)) {
    saveToCloud(meta)
  }
  return null
}

// ── localStorage ──────────────────────────────────────────────────────────────

function saveLocal(meta) {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta))
  } catch {
    /* quota/безопасность — молча */
  }
}

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
  meta.savedAt = Date.now()
  saveLocal(meta)
  saveToCloud(meta) // огонь-и-забудь: не блокируем UI
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
