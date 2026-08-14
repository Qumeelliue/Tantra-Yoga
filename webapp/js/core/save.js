// Персистентность (localStorage) + синк через Telegram CloudStorage (фаза 2, §17.1).
// Мета-прогресс: Грантха, дневник практики, статистика, стрики (§15), ежедневные вызовы (§16.2),
// варны (§12.1 — социальный цикл: шудра → кшатрия → випра → вайшья).
import { CARDS, ENEMIES, RELICS, EVENTS, QUOTES, CHALLENGES, MENTALITY_ORDER, MENTALITY_LEVELS, mentalityLevel, SADVIPRA_MIN_LEVEL, TRIALS, TRIAL_REWARD_CARDS, MENTALITIES } from './data.js'

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
  // Четыре ментальности ума (§12): очки каждой растут параллельно от поступков.
  varnas: { shudra: 0, kshatriya: 0, vipra: 0, vaeshya: 0 },
  // Ветви мастерства ментальностей (§12.1, варны-деревья): выбор направления
  // на уровне 3 (зрелость). Хранится как { [ментальность]: idВетви }.
  varnaBranches: {},
  sadvipraAnnounced: false,
  pacifiedBosses: [],
  // «Свет в Городе» (§14.1): учителя, у которых игрок уже взял благословение
  // (первый разговор с успокоенным владыкой даёт знание + саттву к следующему забегу).
  citySpoken: [],
  nextLife: null,
  deathsInRow: 0,
  // Призраки прошлых жизней (§10.3): следы смертей — урок на карте пути.
  // Знание переживает смерть; призрак указывает, что осталось непрожитым.
  deathLog: [],
  // История забегов (§16.2, «Бэкенд — статистика», локально): последние 12 исходов
  // для экрана «Статистика» (Duolingo/Balatro-паттерн «ещё один забег»).
  runLog: [],
  // Аудиотека практики (§16.2, идея №33): звуки, «прожитые» и записанные в жизнь.
  // Звук, сыгранный в бою картой-носителем или дыхательной медитацией, остаётся
  // в аудиотеке — его можно слушать как практику (WebAudio). Собирается между жизнями.
  audioLibrary: {},
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
    return migrateMeta(JSON.parse(raw))
  } catch {
    return EMPTY_META()
  }
}

// Приведение меты к актуальной схеме (совместимость старых сохранений).
export function migrateMeta(m) {
  m = { ...EMPTY_META(), ...m }
  m.compendium = { ...EMPTY_META().compendium, ...m.compendium }
  m.stats = { ...EMPTY_META().stats, ...m.stats }
  m.streak = { ...EMPTY_META().streak, ...m.streak }
  m.daily = { ...EMPTY_META().daily, ...m.daily }
  // Миграция: старые сохранения с одной шкалой «очков варны» (начислялись за
  // освобождения) переносим в кшатрию — смелость освобождать (Human Society 2).
  if (typeof m.varnaPoints === 'number' && m.varnaPoints > 0) {
    m.varnas = { ...EMPTY_META().varnas, ...(m.varnas || {}) }
    m.varnas.kshatriya = (m.varnas.kshatriya || 0) + m.varnaPoints
  }
  delete m.varnaPoints
  if (!Array.isArray(m.unlockedCards)) m.unlockedCards = []
  if (!Array.isArray(m.citySpoken)) m.citySpoken = []
  if (!Array.isArray(m.runLog)) m.runLog = []
  if (!m.varnaBranches || typeof m.varnaBranches !== 'object') m.varnaBranches = {}
  return m
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

export function recordRunEnd(meta, result, info = {}) {
  // runs считает startNewRun — здесь только исходы (иначе двойной счёт)
  if (result === 'death') meta.stats.deaths += 1
  if (result === 'victory') meta.stats.victories += 1
  if (result === 'awakening') meta.stats.awakened += 1
  // История забегов (§16.2, «статистика» локально): последние 12 исходов
  // с деталями для экрана статистики.
  if (!Array.isArray(meta.runLog)) meta.runLog = []
  meta.runLog.push({
    result,
    floor: info.floor ?? null,
    pacified: info.pacified || 0,
    kills: info.kills || 0,
    awakened: result === 'awakening' ? 1 : 0,
    at: Date.now(),
  })
  if (meta.runLog.length > 12) meta.runLog = meta.runLog.slice(-12)
}

// Записать смерть как «призрак» для карты пути (§10.3): где пал и от чего.
// Знание переживает смерть — призрак напоминает о непрожитом термине.
export function recordDeath(meta, info) {
  if (!Array.isArray(meta.deathLog)) meta.deathLog = []
  const entry = {
    floor: info.floor,
    killedBy: info.killedBy || 'неведение',
    killedById: info.killedById || null,
    at: Date.now(),
  }
  meta.deathLog.push(entry)
  if (meta.deathLog.length > 5) meta.deathLog = meta.deathLog.slice(-5)
  return entry
}

export function quoteById(id) {
  return QUOTES[id] || null
}

// «Прожито» (живые цитаты, §исследование): термин применён — цитата раскрыта навсегда.
// Возвращает true, если раскрытие новое (чтобы вызвать звук/тост один раз).
export function markLived(meta, quoteId) {
  if (!quoteId) return false
  meta.lived = meta.lived || {}
  if (meta.lived[quoteId]) return false
  meta.lived[quoteId] = true
  return true
}

// «Свет в Городе» (§14.1): благословение учителей — +1 саттва к старту забега
// за каждого поговорившего с успокоенным владыкой (милость, копится между жизнями).
export function cityBlessingBonus(meta) {
  const spoken = Array.isArray(meta.citySpoken) ? meta.citySpoken : []
  return Math.min(spoken.length, 7)
}

export function isLived(meta, quoteId) {
  return !!(meta && meta.lived && meta.lived[quoteId])
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
// Четыре ментальности ума (§12.1, Human Society Part 2)
// ─────────────────────────────────────────────────────────────

// Очки ментальности растут ПАРАЛЛЕЛЬНО от разных поступков: шудра (присутствие) —
// медитация и сожжение оков; кшатрия (смелость) — освобождения; випра (знание) —
// цитаты и припоминание; вайшья (мудрость ресурсов) — лавка и сожжение в лавке.
// Слабая ментальность = недостающий навык; садвипра = все четыре развиты.

export function varnaState(meta) {
  const points = { ...EMPTY_META().varnas, ...(meta.varnas || {}) }
  const levels = {}
  let sadvipra = true
  for (const id of MENTALITY_ORDER) {
    const p = points[id] || 0
    const lv = mentalityLevel(p)
    levels[id] = lv
    if (lv < SADVIPRA_MIN_LEVEL) sadvipra = false
  }
  return { points, levels, sadvipra, minLevel: SADVIPRA_MIN_LEVEL }
}

export function isSadvipra(meta) {
  return varnaState(meta).sadvipra
}

// Начисление очков конкретной ментальности. kind — id из MENTALITY_ORDER.
// Возвращает { leveled: bool, kind, from, to } — поднялся ли уровень.
export function addVarnaPoints(meta, kind, n) {
  if (!MENTALITY_ORDER.includes(kind)) return { leveled: false, kind, from: 0, to: 0 }
  meta.varnas = { ...EMPTY_META().varnas, ...(meta.varnas || {}) }
  const before = mentalityLevel(meta.varnas[kind] || 0)
  meta.varnas[kind] = (meta.varnas[kind] || 0) + n
  const after = mentalityLevel(meta.varnas[kind])
  return { leveled: after > before, kind, from: before, to: after }
}

// Выбор ветви мастерства ментальности (§12.1, варны-деревья): направление на
// уровне 3. Возвращает true, если выбор новый (для звука/тоста).
export function setVarnaBranch(meta, kind, branchId) {
  if (!MENTALITY_ORDER.includes(kind)) return false
  const m = MENTALITIES[kind]
  const branches = Array.isArray(m && m.branches) ? m.branches : []
  if (!branches.some((b) => b.id === branchId)) return false
  meta.varnaBranches = { ...(meta.varnaBranches || {}) }
  if (meta.varnaBranches[kind] === branchId) return false
  meta.varnaBranches[kind] = branchId
  return true
}

// Текущая ветвь мастерства ментальности (или null, если не выбрана / нет ур. 3).
export function varnaBranch(meta, kind) {
  const m = MENTALITIES[kind]
  const branches = Array.isArray(m && m.branches) ? m.branches : []
  const id = (meta.varnaBranches || {})[kind]
  return branches.find((b) => b.id === id) || null
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

// ─────────────────────────────────────────────────────────────
// Сад Знания (соцслой, локально): прожитые термины пускают корни.
// ─────────────────────────────────────────────────────────────

// Стадии сада по числу прожитых знаний (meta.lived). Знание, прожитое в бою,
// «пускает корень»; цветущий сад — знание, которое помогает в следующих жизнях
// (мета-бонус к старту забега: +саттва). Outer Wilds: прогресс = знание.
export const GARDEN_STAGES = [
  { min: 0, name: 'Зерно', emoji: '🌰', bonus: 0, desc: 'Знание ещё спит в земле — проживите первые термины.' },
  { min: 5, name: 'Росток', emoji: '🌱', bonus: 0, desc: 'Первые прожитые слова пускают корни.' },
  { min: 12, name: 'Цветение', emoji: '🌸', bonus: 1, desc: 'Сад цветёт: +1 саттва к началу каждого забега.' },
  { min: 24, name: 'Плод', emoji: '🍎', bonus: 1, desc: 'Плод знания кормит следующие жизни.' },
  { min: 36, name: 'Древо', emoji: '🌳', bonus: 2, desc: 'Древо знания: +2 саттвы к началу каждого забега.' },
]

export function gardenState(meta) {
  const lived = Object.keys((meta && meta.lived) || {}).length
  let stage = GARDEN_STAGES[0]
  for (const s of GARDEN_STAGES) {
    if (lived >= s.min) stage = s
  }
  return { lived, stage, stages: GARDEN_STAGES }
}

// ─────────────────────────────────────────────────────────────
// Аудиотека практики (§16.2, идея №33): звуки, прожитые и собранные.
// ─────────────────────────────────────────────────────────────

// Записать звук в аудиотеку. Возвращает true, если запись новая (звук «собран»).
// Звук проживается носителем: сыгранной картой (om → пранава, кииртан-карты →
// кииртана) или дыхательной медитацией (pranayama). Собирается между жизнями —
// знание (и звук) переживает смерть.
export function recordSound(meta, soundId) {
  if (!soundId) return false
  meta.audioLibrary = meta.audioLibrary || {}
  if (meta.audioLibrary[soundId]) return false
  meta.audioLibrary[soundId] = true
  return true
}

// Сколько звуков собрано из аудиотеки.
export function soundState(meta, library) {
  const rec = Object.keys((meta && meta.audioLibrary) || {})
  const all = Object.keys(library || {})
  return { recorded: rec.filter((id) => library && library[id]), total: all.length }
}
