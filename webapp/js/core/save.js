// Персистентность (localStorage) + синк через Telegram CloudStorage (фаза 2, §17.1).
// Мета-прогресс: Грантха, дневник практики, статистика, стрики (§15), ежедневные вызовы (§16.2),
// варны (§12.1 — социальный цикл: шудра → кшатрия → випра → вайшья).
import { CARDS, ENEMIES, RELICS, EVENTS, QUOTES, CHALLENGES, MENTALITY_ORDER, MENTALITY_LEVELS, mentalityLevel, SADVIPRA_MIN_LEVEL, TRIALS, TRIAL_REWARD_CARDS, MENTALITIES } from './data.js'

const KEY = 'tantra-yoga-save-v1'
const CS_PREFIX = 'ty'
// Telegram CloudStorage: значение ключа — до 4096 символов (документация
// WebApp.CloudStorage), поэтому кусок берём с запасом.
const CS_CHUNK = 3600
const MAX_FREEZE = 3
const DAY_MS = 24 * 60 * 60 * 1000
// Сколько ждать перед отправкой в облако. Забег даёт десятки сохранений
// подряд (комната, дар, покупка), а сеть — это сеть. Значит: пишем один
// раз на пачку, а при уходе со страницы — сразу (см. flushCloud).
const CLOUD_DEBOUNCE_MS = 1500

export const EMPTY_META = () => ({
  compendium: { cards: {}, enemies: {}, relics: {}, events: {}, boons: {} },
  quotesUnlocked: {},
  recalled: {},
  lived: {},
  practiceDiary: [],
  stats: { runs: 0, deaths: 0, victories: 0, pacified: 0, kills: 0, awakened: 0 },
  bestRun: null,
  // РЕКОРДЫ (копия из Dead Cells «best time на уровень» и StS «лучший
  // результат в статистике»). Ключ — победа; мера — сколько оков освобождено
  // без единой крови. Подробно: `core/records.js`.
  //
  // Раньше забег не оставлял после себя НИЧЕГО, кроме счётчиков в профиле:
  // «сколько раз прошёл» не отвечает на вопрос «прошёл ли лучше, чем в
  // прошлый раз». Это и была вторая недостающая причина повторить забег.
  records: {},
  // ПРОРИЦАНИЯ (копия из Hades, Prophecies). Список целей с прогрессом;
  // награда забирается руками и один раз. Прогресс считается из счётчиков
  // профиля, а не из событий, — поэтому не откатывается назад.
  // Подробно: `core/prophecies.js`.
  prophecies: { claimed: [] },
  // ЖАР (копия механики «Heat» из Hades): выбранная ступень 0..HEAT_MAX.
  heatLevel: 0,
  seen: { cards: {}, enemies: {}, relics: {}, events: {}, boons: {} },
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
  // ── Поле Ума (забег в мире, §9.1) ───────────────────────────────────
  // Мета-растёт между побегами: знание и деньги остаются, тело — нет.
  // fieldFloor — насколько далеко дошли (карта чакр), focusVarna — кем идём.
  coins: 0,               // драхмы (Hades: drachma)
  hpBonus: 0,             // +макс. ХП из комнат покоя, навсегда
  boons: [],              // дары, копятся между побегами
  upgrades: [],           // мастерская севы (яма-нияма), копятся
  fieldFloor: 0,          // сколько чакр открыто
  focusVarna: 'shudra',   // ментальность, с которой идём
  krpaFell: 0,            // сколько раз милость падала
  krpaMissed: 0,          // сколько раз зонт подняли, а милость не достала
  settings: { haptics: true },
  letter: { text: '', at: 0, shownAt: 0 },
  onboarded: false,
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

function csRemove(key) {
  return new Promise((resolve) => {
    const cs = cloud()
    if (!cs) return resolve(false)
    try {
      cs.removeItem(key, () => resolve(true))
    } catch { resolve(false) }
  })
}

// ── CloudStorage (Telegram-аккаунт, перенос между устройствами) ──────────────
//
// Три правила, без которых облако однажды тихо съедало прогресс:
//
// 1. ОЧЕРЕДЬ. Telegram отвечает асинхронно, а saveMeta зовётся десятки раз
//    за забег. Две записи, ушедшие подряд, без очереди перемешивали куски:
//    в облаке лежал гибрид — часть от старой меты, часть от новой. Такой
//    JSON не собирается, и перенос между устройствами просто переставал
//    работать — без единой ошибки на экране.
// 2. ВЕРСИИ. Куски пишутся под номером версии, и «головка» с этим номером
//    записывается ПОСЛЕДНЕЙ. Головка — точка фиксации: пока её нет, облако
//    считает, что в нём лежит предыдущее целое сохранение. Раньше головка
//    писалась первой, и прерванная запись оставляла после себя смесь со
//    свежей датой — телефон показывал «всё сохранено», а прогресс был мусором.
// 3. ПРОВЕРКА. Длина собранного куска сверяется с записанной в головке.
//    Не сошлось — облако считается пустым, игрок играет с локального.

let cloudChain = Promise.resolve()
let cloudVersion = null

function inCloudQueue(fn) {
  const next = cloudChain.then(fn, fn)   // ошибка в одной записи не рвёт очередь
  cloudChain = next.then(() => {}, () => {})
  return next
}

async function readHead() {
  const raw = await csGet(`${CS_PREFIX}_head`)
  if (!raw) return null
  try {
    const h = JSON.parse(raw)
    return h && Number.isFinite(Number(h.n)) ? h : null
  } catch { return null }
}

async function cloudWrite(meta) {
  const json = JSON.stringify(meta)
  const head = await readHead()
  const prev = head && Number.isFinite(Number(head.v)) ? head : null
  const v = cloudVersion ?? ((Number(prev?.v) || 0) + 1)
  cloudVersion = v
  const chunks = []
  for (let i = 0; i < json.length; i += CS_CHUNK) chunks.push(json.slice(i, i + CS_CHUNK))
  for (let i = 0; i < chunks.length; i++) {
    if (!(await csSet(`${CS_PREFIX}_${v}_${i}`, chunks[i]))) return false
  }
  // Головка — последняя: облако переключается на новую версию только когда
  // все её куски уже лежат.
  const ok = await csSet(`${CS_PREFIX}_head`, JSON.stringify({
    v, n: chunks.length, t: meta.savedAt || Date.now(), len: json.length,
  }))
  if (!ok) return false
  // Прошлая версия больше не нужна — убираем, чтобы не копить ключи
  // (у игрока их может быть всего 1024).
  if (prev && Number(prev.v) !== v) {
    for (let i = 0; i < (prev.n || 0); i++) await csRemove(`${CS_PREFIX}_${prev.v}_${i}`)
  }
  return true
}

/** Записать в облако прямо сейчас. Всё остальное ждёт очереди. */
export function saveToCloud(meta) {
  return inCloudQueue(() => {
    if (!cloud()) return false
    return cloudWrite(meta)
  })
}

/**
 * Облако, записанное до версий: куски лежали просто по номерам, головка была
 * `ty_meta`. Читается один раз — чтобы никто не потерял прогресс из-за
 * смены формата. Когда автор убедится, что у всех новое, этот блок можно
 * убрать целиком.
 */
async function loadLegacy() {
  const headRaw = await csGet(`${CS_PREFIX}_meta`)
  if (!headRaw) return null
  let head
  try { head = JSON.parse(headRaw) } catch { return null }
  if (!head || !Number.isFinite(Number(head.n))) return null
  let json = ''
  for (let i = 0; i < head.n; i++) {
    const part = await csGet(`${CS_PREFIX}_${i}`)
    if (part == null) return null
    json += part
  }
  try {
    const meta = JSON.parse(json)
    meta.savedAt = head.t || 0
    // Переезжаем на версии, чтобы дальше читать единым способом.
    inCloudQueue(() => cloudWrite(meta)).then(() => {
      for (let i = 0; i < head.n; i++) csRemove(`${CS_PREFIX}_${i}`)
      csRemove(`${CS_PREFIX}_meta`)
    })
    return meta
  } catch { return null }
}

export function loadFromCloud() {
  return inCloudQueue(async () => {
    if (!cloud()) return null
    const head = await readHead()
    if (!head) return loadLegacy()
    cloudVersion = Number(head.v)
    let json = ''
    for (let i = 0; i < head.n; i++) {
      const part = await csGet(`${CS_PREFIX}_${head.v}_${i}`)
      if (part == null) return null
      json += part
    }
    if (Number.isFinite(Number(head.len)) && json.length !== Number(head.len)) return null
    try {
      const meta = JSON.parse(json)
      meta.savedAt = head.t || 0
      return meta
    } catch { return null }
  })
}

// Синк при старте: если в облаке сохранение новее — возвращаем его (побеждает
// последний забег). Если локальное новее или облако пустое — проталкиваем
// локальное: облако должно знать о прогрессе даже на новом устройстве.
export async function cloudSync(meta) {
  const cloudMeta = await loadFromCloud()
  if (!cloudMeta) {
    if ((meta.savedAt || 0) > 0) saveToCloud(meta)
    return null
  }
  if ((cloudMeta.savedAt || 0) > (meta.savedAt || 0)) {
    saveLocal(cloudMeta)
    return cloudMeta
  }
  if ((meta.savedAt || 0) > (cloudMeta.savedAt || 0)) {
    saveToCloud(meta)
  }
  return null
}

// ── Отправка в облако не на каждый чих ─────────────────────────────────────
// Мета меняется десятки раз за забег. Всё, что успело накопиться за пару
// секунд, уезжает одним куском. А если игрок закрывает приложение — ждать
// нельзя: телефон успевает убить страницу, поэтому есть flushCloud().
let cloudTimer = null
let cloudPending = null

function scheduleCloud(meta) {
  cloudPending = meta
  if (cloudTimer) return
  cloudTimer = setTimeout(() => {
    cloudTimer = null
    const m = cloudPending
    cloudPending = null
    if (m) saveToCloud(m)
  }, CLOUD_DEBOUNCE_MS)
}

/** Дописать всё накопленное в облако немедленно — при уходе со страницы. */
export function flushCloud() {
  if (cloudTimer) { clearTimeout(cloudTimer); cloudTimer = null }
  const m = cloudPending
  cloudPending = null
  return m ? saveToCloud(m) : Promise.resolve(false)
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
  m.seen = { ...EMPTY_META().seen, ...(m.seen || {}) }
  m.stats = { ...EMPTY_META().stats, ...m.stats }
  m.streak = { ...EMPTY_META().streak, ...m.streak }
  m.daily = { ...EMPTY_META().daily, ...m.daily }
  // Миграция для рекордов и жара. Без неё на стархранениях (а их у игроков
  // уже есть) `meta.records` был бы `undefined`, и `reasonsToRun` показал бы
  // «рекорда нет» даже после десяти побед.
  if (!m.records || typeof m.records !== 'object') m.records = {}
  // Миграция прорицаний: у игроков сохранения уже есть, а поля не будет —
  // и экран целей показывал бы «прорицания не найдены» вместо списка.
  if (!m.prophecies || typeof m.prophecies !== 'object') m.prophecies = { claimed: [] }
  if (!Array.isArray(m.prophecies.claimed)) m.prophecies.claimed = []
  if (typeof m.heatLevel !== 'number') m.heatLevel = 0
  m.heatLevel = Math.max(0, m.heatLevel)
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
  // Поле Ума: старые сохранения этих полей не знают — дополняем, чтобы
  // новая игра не ловила «undefined» на каждом шагу.
  if (!Array.isArray(m.boons)) m.boons = []
  if (!Array.isArray(m.upgrades)) m.upgrades = []
  if (typeof m.coins !== 'number' || !Number.isFinite(m.coins)) m.coins = 0
  if (typeof m.hpBonus !== 'number' || !Number.isFinite(m.hpBonus)) m.hpBonus = 0
  if (typeof m.fieldFloor !== 'number' || !Number.isFinite(m.fieldFloor)) m.fieldFloor = 0
  if (!m.focusVarna) m.focusVarna = 'shudra'
  if (typeof m.krpaFell !== 'number') m.krpaFell = 0
  if (typeof m.krpaMissed !== 'number') m.krpaMissed = 0
  return m
}

export function saveMeta(meta) {
  meta.savedAt = Date.now()
  saveLocal(meta)            // локально — сразу и синхронно: это надёжная часть
  scheduleCloud(meta)        // в облако — пачкой, без блокировки UI
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

/**
 * Исход ЗАБЕГА. Ровно один раз за побег — не за комнату.
 *
 * Раньше эта функция звалась на выходе из каждой комнаты Поля Ума, а комнат
 * в забеге 28. В Городу игрок видел «1 забег · 28 побед» и «% побед» = 2800 %.
 * `stats.awakened` («пробуждений») рос дважды за событие: за каждого
 * успокоенного владыка и ещё раз на экране финала. Смысла в таком числе не
 * было — см. `design/BASE-GAME.md`, МЕХАНИКА 36.
 *
 * @param {'death'|'victory'|'retreat'|'awakening'} result
 *   `death` — ум не выдержал, `retreat` — игрок сам оставил забег,
 *   `victory` — седьмой владыка снят, `awakening` — путь карты (второй путь).
 * @param {{floor?:number, pacified?:number, kills?:number, bosses?:number}} info
 *   `kills` и `bosses` — **за весь забег**, а не за последнюю комнату.
 */
export function recordRunEnd(meta, result, info = {}) {
  // runs считает startNewRun — здесь только исходы (иначе двойной счёт)
  if (result === 'death') meta.stats.deaths += 1
  if (result === 'victory') meta.stats.victories += 1
  if (result === 'retreat') meta.stats.deaths += 1
  // МИРНЫЙ ФИНАЛ (решение автора 2026-09-30) = забег без единой крови.
  //
  // В Поле Ума ударом не ранится рипу вовсе, сломать силой можно только
  // пашу, поэтому «без единой крови» = «ни одного сломанного паши за забег».
  // Число владык тоже должно быть полным: забег, в который игрок вошёл с
  // пятой чакры, мирным финалом не является — «Вершина Света» не достигнута.
  const kills = Number(info.kills) || 0
  const bosses = Number(info.bosses) || 0
  const fullPath = bosses >= 7
  const peaceful = result === 'awakening' || (result === 'victory' && kills === 0 && fullPath)
  if (peaceful) meta.stats.awakened += 1
  // История забегов (§16.2, «статистика» локально): последние 12 исходов
  // с деталями для экрана статистики.
  if (!Array.isArray(meta.runLog)) meta.runLog = []
  meta.runLog.push({
    result,
    floor: info.floor ?? null,
    pacified: info.pacified || 0,
    kills,
    // Сева за забег. Без неё строка истории не отвечает на вопрос, ради
    // которого игрок вообще открывает историю: «а какой забег был богаче».
    sevaPoints: info.sevaPoints || 0,
    bosses,
    // Возвраты из смерти (Nine Sols: Revival, МЕХАНИКА 49). Пишутся в историю,
    // потому что забег с возвратом и забег без него — разные забеги, и
    // «мирный финал» из одного и того же числа оков значил бы разное.
    revivals: Number(info.revivals) || 0,
    awakened: peaceful ? 1 : 0,
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
