// Персистентность (localStorage) + синк через Telegram CloudStorage (фаза 2, §17.1).
// Мета-прогресс: Грантха, дневник практики, статистика, стрики (§15), ежедневные вызовы (§16.2),
// варны (§12.1 — социальный цикл: шудра → кшатрия → випра → вайшья).
import { CARDS, ENEMIES, RELICS, EVENTS, QUOTES, CHALLENGES, VARNA_ORDER, TRIALS, TRIAL_REWARD_CARDS } from './data.js'

const KEY = 'tantra-yoga-save-v1'
const CS_PREFIX = 'ty'
const CS_CHUNK = 3600
const MAX_FREEZE = 3
const DAY_MS = 24 * 60 * 60 * 1000

export const EMPTY_META = () => ({
  compendium: { cards: {}, enemies: {}, relics: {}, events: {} },
  quotesUnlocked: {},
  recalled: {},
  lived: {},
  practiceDiary: [],
  stats: { runs: 0, deaths: 0, victories: 0, pacified: 0, kills: 0, awakened: 0 },
  bestRun: null,
  seen: { cards: {}, enemies: {}, relics: {}, events: {} },
  encounters: {},
  streak: { current: 0, best: 0, lastDay: null, freeze: 0, total: 0 },
  daily: { date: null, challengeId: null, progress: 0, done: false, claimed: false },
  varnaPoints: 0,
  pacifiedBosses: [],
  nextLife: null,
  deathsInRow: 0,
  // Дерево челленджей Ямы/Ниямы (§16.2): карты, открытые испытаниями (мета-прогресс)
  unlockedCards: [],
  settings: { haptics: true },
  letter: { text: '', at: 0, shownAt: 0 },
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
    m.streak = { ...EMPTY_META().streak, ...m.streak }
    m.daily = { ...EMPTY_META().daily, ...m.daily }
    if (m.varnaPoints == null) m.varnaPoints = 0
    if (!Array.isArray(m.unlockedCards)) m.unlockedCards = []
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
  // runs считает startNewRun — здесь только исходы (иначе двойной счёт)
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

// ─────────────────────────────────────────────────────────────
// Стрики (§15) и ежедневные вызовы (§16.2)
// ─────────────────────────────────────────────────────────────

// Ключ дня в локальном времени: YYYY-MM-DD. Зависит от часового пояса игрока —
// для стриков это правильно (серия идёт по «его» дням).
export function dayKey(ts = Date.now()) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function yesterdayKey(ts = Date.now()) {
  return dayKey(ts - DAY_MS)
}

// Ежедневный вызов: детерминированно от даты (seed = сумма кодов дня).
export function challengeForDay(ts = Date.now(), pool = CHALLENGES) {
  const ids = Object.keys(pool)
  if (ids.length === 0) return null
  const seed = [...dayKey(ts)].reduce((a, c) => a + c.charCodeAt(0), 0)
  return pool[ids[seed % ids.length]]
}

// Нормализация меты после загрузки: добить недостающие поля стриков/вызовов.
function ensureDaily(meta, ts) {
  if (!meta.daily || meta.daily.date !== dayKey(ts)) {
    const challenge = challengeForDay(ts)
    meta.daily = {
      date: dayKey(ts),
      challengeId: challenge ? challenge.id : null,
      progress: 0,
      done: false,
      claimed: false,
    }
  }
  if (!meta.streak) meta.streak = { current: 0, best: 0, lastDay: null, freeze: 0 }
  return meta
}

// Ежедневный вход: отмечает визит, обновляет серию. Возвращает событие для UI.
// Правила (§15, Duolingo-паттерн): сегодня уже заходили → 0 изменений;
// вчера заходили → серия +1; пропустили день → тратится фриз (если есть),
// иначе серия обрывается до 1. Фриз — «страховка» от потери серии.
export function markVisit(meta, ts = Date.now()) {
  ensureDaily(meta, ts)
  const today = dayKey(ts)
  const s = meta.streak
  const event = { kind: 'none', current: s.current, best: s.best, freeze: s.freeze }

  if (s.lastDay === today) return { meta, event }
  s.total = (s.total || 0) + 1 // все дни практики подряд и вразброс — срывы часть пути
  if (s.lastDay === yesterdayKey(ts)) {
    s.current += 1
    event.kind = 'increase'
  } else if (s.lastDay === dayKey(ts - 2 * DAY_MS) && new Date(ts).getDay() === 0) {
    // «воскресенье покоя» (§исследование): пропуск одного дня в воскресенье
    // не ломает серию и не тратит фриз — отдых тоже часть практики
    event.kind = 'grace'
  } else if (s.lastDay === null) {
    s.current = 1
    event.kind = 'start'
  } else {
    // пропуск: фриз спасает серию
    if (s.freeze > 0) {
      s.freeze -= 1
      event.kind = 'freeze_used'
    } else {
      s.current = 1
      event.kind = 'break'
    }
  }
  s.lastDay = today
  if (s.current > s.best) {
    s.best = s.current
    event.best = s.best
  }
  event.current = s.current
  event.freeze = s.freeze
  return { meta, event }
}

// Прогресс ежедневного вызова. kind — тип метрики из challenges.json
// (pacify / samadhi / prama / kiirtana / meditate_q3 / boss_pacify).
export function progressDaily(meta, kind, amount = 1, ts = Date.now()) {
  ensureDaily(meta, ts)
  const d = meta.daily
  if (d.done || !d.challengeId) return { done: d.done, progress: d.progress }
  const ch = CHALLENGES[d.challengeId]
  if (!ch || ch.kind !== kind) return { done: d.done, progress: d.progress }
  d.progress = Math.min(ch.target, d.progress + amount)
  if (d.progress >= ch.target) {
    d.done = true
    meta.streak.freeze = Math.min(MAX_FREEZE, (meta.streak.freeze || 0) + 1) // награда: +1 фриз серии
    d.claimed = true // фриз уже выдан — отметить как забранное
  }
  return { done: d.done, progress: d.progress, challenge: ch }
}

// ─────────────────────────────────────────────────────────────
// Варны (§12.1): социальный цикл шудра → кшатрия → випра → вайшья
// ─────────────────────────────────────────────────────────────

// Сколько очков нужно для каждой варны (кумулятивно по VARNA_ORDER).
// Очки варны зарабатываются мирными освобождениями (ахимса) и пробуждениями.
const VARNA_COST = [0, 4, 10, 18]

export function varnaIndex(meta) {
  const pts = meta.varnaPoints || 0
  let idx = 0
  for (let i = 0; i < VARNA_COST.length; i++) {
    if (pts >= VARNA_COST[i]) idx = i
  }
  return idx
}

export function varnaProgress(meta) {
  const pts = meta.varnaPoints || 0
  const idx = varnaIndex(meta)
  const total = VARNA_COST.length
  const reached = VARNA_ORDER.slice(0, idx + 1)
  const nextId = idx < total - 1 ? VARNA_ORDER[idx + 1] : null
  const nextCost = idx < total - 1 ? VARNA_COST[idx + 1] : null
  const progress = nextCost != null ? Math.min(1, (pts - VARNA_COST[idx]) / (nextCost - VARNA_COST[idx])) : 1
  return { index: idx, total, points: pts, reached, nextId, nextCost, progress }
}

// Начисление очков варны. Источники (§12.1, идея №9): мирный путь.
export function addVarnaPoints(meta, n) {
  const before = varnaIndex(meta)
  meta.varnaPoints = (meta.varnaPoints || 0) + n
  const after = varnaIndex(meta)
  return after > before ? { leveled: true, from: before, to: after } : { leveled: false, from: before, to: after }
}

// ─────────────────────────────────────────────────────────────
// Дерево челленджей Ямы/Ниямы (§16.2, идея №16)
// ─────────────────────────────────────────────────────────────

// Открыть карту навсегда (мета-прогресс). Прошёл испытание — карта в пуле наград.
export function unlockCard(meta, cardId) {
  meta.unlockedCards = Array.isArray(meta.unlockedCards) ? meta.unlockedCards : []
  if (!meta.unlockedCards.includes(cardId)) {
    meta.unlockedCards.push(cardId)
    return true
  }
  return false
}

// Прогресс дерева: сколько карт открыто из 10 (Яма + Нияма), ветви отдельно.
export function trialsProgress(meta) {
  const unlocked = new Set(meta.unlockedCards || [])
  const done = (branch) => Object.values(TRIALS).filter((t) => t.branch === branch && unlocked.has(t.rewardCard))
  const yama = done('yama')
  const niyama = done('niyama')
  return {
    total: TRIAL_REWARD_CARDS.length,
    unlockedCount: unlocked.size,
    yamaDone: yama.length,
    niyamaDone: niyama.length,
    yamaTotal: Object.values(TRIALS).filter((t) => t.branch === 'yama').length,
    niyamaTotal: Object.values(TRIALS).filter((t) => t.branch === 'niyama').length,
  }
}
