// Точка входа: маршрутизация экранов, забег, узлы, Грантха, дневник.
import { h, mount } from './ui/dom.js'
import { initFx, sfx, setTint, playLibrarySound } from './ui/fx.js'
import { setHaptics, haptics } from './ui/haptics.js'
import { quoteBox, cardEl } from './ui/widgets.js'
import { combatScreen } from './ui/screens/combat.js'
import { meditationScreen } from './ui/screens/meditation.js'
import { fieldScreen } from './ui/screens/field.js'
import { buildFieldFloor, fieldHead } from './core/fieldBuild.js'
import { WORKSHOP, workshopCost, canBuy, sevaPointsFor, applyUpgrades } from './core/workshop.js'
import { FLOOR_MANTRA, DEFAULT_FIELD_OPTIONS } from './core/field.js'
import { applyVarna } from './core/varnaKits.js'
import { rollKeepsakes, KEEPSAKE_BY_ID, applyKeepsake } from './core/keepsakes.js'
import { nextStage, ROOMS_PER_STAGE, isLastFloor } from './core/stageRoute.js'
import { chakraQuote, nextTeacherQuote, teacherChain, placeQuotes } from './core/teaching.js'
import { BOONS as FIELD_BOONS, rollBoons, applyBoons } from './core/boons.js'
import { createField } from './core/field.js'
import { CARDS, ENEMIES, RELICS, EVENTS, QUOTES, MENTALITIES, MENTALITY_ORDER, CHALLENGES, TRIALS, BOONS, quoteLiveHint, isQuoteLived, AUDIO_LIBRARY, soundForCard, CITY_TEACHERS, WORLDS, WORLD_PATH, worldForFloor } from './core/data.js'
import { computeSynergies } from './core/engine.js'
import {
  createRun, currentNode, currentEnemyId, startCombatAtNode, finishCombat,
  takeCardReward, gainRelic,
  eventOptions, resolveEventChoice, isNodeDone, markNodeDone,
  floorComplete, advanceFloor, CHAKRAS, LEPESTKI,
  rollShop, buyShopCard, buyShopRemove, buyShopRelic, SHOP_COSTS, shopPrice, shopDiscount,
  challengeFulfilled, rollBoonChoices,
} from './core/run.js'
import {
  loadMeta, saveMeta, markSeen, addAnchor, recordRunEnd, recordDeath, resetMeta, quoteById, cloudSync,
  markVisit, progressDaily, varnaState, addVarnaPoints, isSadvipra,
  unlockCard, trialsProgress, markLived, gardenState, recordSound, soundState,
  cityBlessingBonus, setVarnaBranch, flushCloud,
} from './core/save.js'
import { processAnchorReminders, reminderStatusLine } from './core/anchorPush.js'

const appEl = document.getElementById('app')

let app = null
let booted = false

function boot() {
  if (booted) return
  booted = true
  initFx()
  applySafeArea()
  try {
    window.Telegram?.WebApp?.ready()
    window.Telegram?.WebApp?.expand()
  } catch {}
  app = { meta: loadMeta(), run: null, combat: null }
  app.onCombatEnd = onCombatEnd
  setHaptics(app.meta.settings?.haptics !== false)
  const { event } = markVisit(app.meta)
  saveMeta(app.meta)
  // Пуш-напоминания якорей (§11.2). Отправка идёт через серверный токен
  // бота, которого пока нет: без него напоминание не уходит — и игра
  // говорит об этом прямо, а не делает вид, что отправила. Результат
  // показываем один раз на этом запуске.
  checkAnchorReminders()
  if (event && (event.kind === 'increase' || event.kind === 'break' || event.kind === 'grace')) {
    app.bootEvent = event
  }
  showHome()
  // Телефон умеет убить страницу, не спросив. Локально мета уже записана
  // (localStorage пишется сразу), но в облако она уезжает пачкой через
  // полторы секунды — а палец мог закрыть приложение раньше. Поэтому на
  // уходе со страницы дописываем всё накопленное немедленно.
  addEventListener('pagehide', () => { flushCloud() })
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushCloud()
    // Телефон мог пролежать неделю без открытия игры. Напоминания о
    // якорях досылаются на ВХОДЕ в приложение, а не по таймеру: таймер в
    // мини-аппе не живёт, когда приложение закрыто.
    if (document.visibilityState === 'visible') checkAnchorReminders()
  })
  // фаза 2 (§17.1): синк через Telegram CloudStorage — побеждает свежее сохранение
  cloudSync(app.meta).then((fresh) => {
    if (fresh) {
      app.meta = fresh
      const { event: e2 } = markVisit(app.meta)
      if (e2 && e2.kind !== 'none') app.bootEvent = e2
      saveMeta(app.meta)
      showHome()
    }
  })
}

/**
 * Безопасные зоны. Телефон срезает верх вырезом, а Telegram — своей
 * шапкой и нижней панелью, и сообщает размеры в `contentSafeAreaInset`
 * (в CSS-пикселях). Мы выкладываем их в CSS-переменные, а стили берут
 * максимум из них и из `env(safe-area-inset-*)`: пока кто-то открывает игру
 * в браузере, работает env, внутри Telegram — его числа.
 */
function applySafeArea() {
  const wa = window.Telegram?.WebApp
  const insets = wa?.contentSafeAreaInset || wa?.safeAreaInset
  if (!insets) return
  const root = document.documentElement
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const v = Number(insets[side])
    if (Number.isFinite(v) && v > 0) root.style.setProperty(`--sa-${side}`, `${v}px`)
  }
}

// ── Пуш-напоминания якорей (§11.2) ──────────────────────────────────────────
//
// Правда о том, как это работает. Уведомление в Telegram Mini App отправляет
// ТОЛЬКО бот на сервере: `WebApp.sendData` лишь передаёт данные клиенту, а
// клиент не может проверить подпись initData — то есть подделать push нельзя
// и не нужно. Сервера у проекта пока нет, поэтому:
//
//   · если токена/эндпоинта нет — напоминание НЕ помечается как отправленное
//     и остаётся в дневнике. Иначе якорь молча исчезал бы из расписания;
//   · игрок видит честную строку, а не «напоминание отправлено».
//
// Когда сервер появится, достаточно задать window.TANTRA_PUSH_URL — остальное
// уже написано и покрыто тестами.
let anchorStatusShown = false

function checkAnchorReminders() {
  let res
  try {
    res = processAnchorReminders(app.meta, { send: pushSender() })
  } catch { return }
  const line = reminderStatusLine(res)
  if (!line) return
  // Показываем один раз: иначе всплывашка сыпется на каждом входе.
  if (!anchorStatusShown && res.failed > 0) {
    anchorStatusShown = true
    toast(line, 'hl')
  }
  if (res.sent) saveMeta(app.meta)
}

/**
 * Отправить одно напоминание. Возвращает функцию или null.
 *
 * null — значит отправлять нечем. Это НЕ ошибка: игры в браузере, без
 * сервера, и это надо проговаривать, а не прятать.
 */
function pushSender() {
  const url = (typeof window !== 'undefined' && window.TANTRA_PUSH_URL) || ''
  if (!url) return null
  return async (text, anchor) => {
    const wa = window.Telegram?.WebApp
    const initData = wa?.initData || ''
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, text, situation: anchor?.situation, practice: anchor?.practice }),
    })
    if (!res.ok) throw new Error(`push ${res.status}`)
  }
}

// Первый запуск показывает обучение; дальше — титульный экран.
function showHome() {
  if (!app.meta.onboarded) showOnboarding()
  else showTitle()
}

function show(node) {
  mount(appEl, node)
  window.scrollTo(0, 0)
}

function markSeenMany(kind, ids) {
  for (const id of ids) markSeen(app.meta, kind, id)
  saveMeta(app.meta)
}

function unlockRandomQuote() {
  const locked = Object.keys(QUOTES).filter((id) => !app.meta.quotesUnlocked[id])
  if (locked.length === 0) return null
  const id = locked[Math.floor(Math.random() * locked.length)]
  app.meta.quotesUnlocked[id] = true
  markLived(app.meta, id) // вручённое знание — уже прожитое (милость гуру)
  saveMeta(app.meta)
  return id
}

// ─────────────────────────────────────────────────────────────
// Титульный экран / Город
// ─────────────────────────────────────────────────────────────

function showTitle() {
  const { meta } = app
  const compCount = Object.keys(meta.compendium.cards).length +
    Object.keys(meta.compendium.enemies).length +
    Object.keys(meta.compendium.relics).length
  const quoteCount = Object.keys(meta.quotesUnlocked).length

  const cityStage = Math.min(4, meta.stats.pacified + meta.stats.awakened)
  const CITY_TEXT = [
    'Город спит под пеленой Тамаса. Начните восхождение.',
    'В Городе зажигаются первые огни.',
    'Улицы светлеют — оковы распадаются, люди поднимают глаза.',
    'Город пробуждается. Бывшие владыки становятся учителями.',
    'Город светится. Цикл неведения разомкнут.',
  ]
  const cityText = CITY_TEXT[cityStage]
  const teachers = meta.pacifiedBosses && meta.pacifiedBosses.length > 0
    ? h('div', { class: 'hint center mt', style: 'color:var(--gold-soft)' },
        `Учителя города: ${meta.pacifiedBosses.join(' · ')}`)
    : null

  const gauges = [
    h('div', { class: 'gauge' }, h('div', { class: 'num' }, meta.stats.runs), h('div', { class: 'lbl' }, 'забеги')),
    h('div', { class: 'gauge' }, h('div', { class: 'num' }, meta.stats.pacified), h('div', { class: 'lbl' }, 'мирных')),
    h('div', { class: 'gauge' }, h('div', { class: 'num' }, meta.stats.victories), h('div', { class: 'lbl' }, 'побед')),
    h('div', { class: 'gauge' }, h('div', { class: 'num' }, meta.stats.awakened), h('div', { class: 'lbl' }, 'пробуждений')),
    h('div', { class: 'gauge' }, h('div', { class: 'num' }, `${quoteCount}/${Object.keys(QUOTES).length}`), h('div', { class: 'lbl' }, 'цитат')),
  ]

  const cityDots = h('div', { class: 'city-stages' },
    Array.from({ length: 5 }, (_, i) =>
      h('div', { class: `stage-dot ${i <= cityStage ? 'on' : ''}` }, h('span', {}, `✦ ${i + 1}`))))

  const streakBlock = streakCard(meta)
  const challengeBlock = challengeCard(meta)
  const varnaBlock = varnaCard(meta)
  const trialsBlock = trialsCard(meta)
  const gardenBlock = gardenCard(meta)
  const audioBlock = audioCard(meta)
  const cityBlock = h('div', { class: 'varna-card garden-card audio-card city-card', onclick: () => showCity() },
    h('div', { class: 'varna-head' },
      h('div', {},
        h('div', { class: 'varna-label' }, 'Город'),
        h('div', { class: 'varna-name' }, `свет в площадях · ${(meta.pacifiedBosses || []).length}/${Object.keys(CITY_TEACHERS).length}`)),
      h('div', { class: 'varna-next' }, 'войти →')),
    h('div', { class: 'city-dots' },
      Object.values(CITY_TEACHERS).map((t) => {
        const bossName = ENEMIES[t.bossId] && ENEMIES[t.bossId].name
        const on = bossName && (meta.pacifiedBosses || []).includes(bossName)
        return h('div', { class: `city-mini ${on ? 'on' : ''}` }, on ? '✦' : '·')
      })),
    h('div', { class: 'varna-hint' },
      (meta.pacifiedBosses || []).length === 0
        ? 'Успокойте владык чакр — и они зажгут свет в Городе'
        : 'Успокоенные владыки стали учителями — поговорите с ними'))

  const statsBlock = h('div', { class: 'varna-card garden-card audio-card city-card', onclick: () => showStats() },
    h('div', { class: 'varna-head' },
      h('div', {},
        h('div', { class: 'varna-label' }, 'Статистика'),
        h('div', { class: 'varna-name' }, `${meta.stats.runs} забегов · ${meta.stats.victories + meta.stats.awakened} побед`)),
      h('div', { class: 'varna-next' }, 'смотреть →')),
    h('div', { class: 'stats-mini' },
      h('div', { class: 'stats-mini-cell' }, h('div', { class: 'stats-mini-n' }, meta.stats.runs), h('div', { class: 'stats-mini-l' }, 'забеги')),
      h('div', { class: 'stats-mini-cell' }, h('div', { class: 'stats-mini-n' }, meta.stats.awakened), h('div', { class: 'stats-mini-l' }, 'пробуждений')),
      h('div', { class: 'stats-mini-cell' }, h('div', { class: 'stats-mini-n' }, meta.stats.pacified), h('div', { class: 'stats-mini-l' }, 'мирных')),
      h('div', { class: 'stats-mini-cell' }, h('div', { class: 'stats-mini-n' }, (meta.stats.runs > 0 ? Math.round(((meta.stats.victories + meta.stats.awakened) / meta.stats.runs) * 100) : 0)), h('div', { class: 'stats-mini-l' }, '% побед'))),
    h('div', { class: 'varna-hint' },
      meta.runLog && meta.runLog.length > 0
        ? 'История последних забегов — каждый прожит, ни один не зря'
        : 'Сыграйте первый забег — начнётся история ума'))

  // Прогресс-бары (§дофамин): тонкие полоски «ещё чуть-чуть» на титуле —
  // сколько владык успокоено до Пробуждения, сколько цитат до новой, сад.
  const bosses = (meta.pacifiedBosses || []).length
  const quotesHave = Object.keys(meta.quotesUnlocked || {}).length
  const progressBlock = h('div', { class: 'panel progress-panel' },
    h('div', { class: 'progress-row' },
      h('span', { class: 'progress-lbl' }, `владык успокоено ${bosses}/7`),
      h('div', { class: 'progress-track' },
        h('div', { class: 'progress-fill', style: `width:${(bosses / 7) * 100}%` }))),
    h('div', { class: 'progress-row' },
      h('span', { class: 'progress-lbl' }, `Грантха ${quotesHave}/${Object.keys(QUOTES).length}`),
      h('div', { class: 'progress-track' },
        h('div', { class: 'progress-fill', style: `width:${(quotesHave / Object.keys(QUOTES).length) * 100}%` }))),
  )

  const bootEvent = app.bootEvent
  app.bootEvent = null
  if (bootEvent && bootEvent.kind === 'increase') {
    sfx.med()
  }

  const best = meta.bestRun
    ? h('div', { class: 'hint mt', style: 'text-align:center' },
        best.awakened
          ? 'Лучший забег: полное Пробуждение.'
          : `Лучший забег: ${best.pacified} мирных освобождений.`)
    : null

  // Мета-прогресс (стрики, ментальности, испытания, сад, город…) — под аккордеон,
  // чтобы титул не выглядел «стеной окон»: разворачивается по желанию.
  const metaBodyEl = h('div', { class: 'meta-fold-body' },
    streakBlock, challengeBlock, varnaBlock, trialsBlock, gardenBlock, audioBlock, cityBlock, statsBlock)
  const metaHeadEl = h('button', { class: 'meta-fold-head', onclick: () => {
    const open = metaBodyEl.style.display !== 'block'
    metaBodyEl.style.display = open ? 'block' : 'none'
    metaHeadEl.textContent = open ? 'Прогресс садхаки ▴' : 'Прогресс садхаки ▾'
  } }, 'Прогресс садхаки ▾')
  const metaFoldBlock = h('div', { class: 'meta-fold' }, metaHeadEl, metaBodyEl)

  // Статистика крипы: сколько раз милость доставала и сколько раз зонт
  // тщеславия её не пустил. Это единственная честная мера «снимал ли я себя».
  const krpaLine = (meta.krpaFell || meta.krpaMissed) ? h('div', { class: 'krpa-stats' },
    h('span', {}, `☂ под крипой ${meta.krpaFell || 0}`),
    (meta.krpaMissed || 0) ? h('span', { class: 'missed' }, `зонт не пустил ${meta.krpaMissed}`) : null,
  ) : null

  show(h('div', { class: 'screen active title-screen' },
    h('div', { class: 'mandala-wrap' },
      h('div', { class: 'mandala' }),
      h('div', { class: 'mandala core' }),
      h('div', { class: 'om-glyph', style: 'position:absolute' }, 'ॐ')),
    h('div', { class: 'game-title' }, 'Tantra: The Game'),
    h('div', { class: 'game-sub' }, 'игра-учение · садхака идёт сам'),
    h('p', { class: 'hint', style: 'max-width:300px' }, cityText),
    cityDots,
    teachers,

    // Один путь. Мир — единственная игра. Колода спрятана в «Городе»,
    // потому что на титуле она отвлекала от главного и мешала начать забег.
    h('div', { class: 'btn-row mt', style: 'margin-top:14px' },
      h('button', { class: 'btn primary', onclick: showWeaponSelect }, 'В путь по миру ▶'),
      h('button', { class: 'btn ghost', onclick: showSevaWorkshop }, 'Мастерская')),

    progressBlock,
    krpaLine,
    metaFoldBlock,
    h('div', { class: 'panel city-card' },
      h('div', { class: 'row between', style: 'font-size:12px;color:var(--muted)' },
        h('span', {}, 'путь города'),
        h('span', {}, 'освобождено оков'),
        h('span', {}, 'Грантха')),
      h('div', { class: 'gauges' }, gauges),
      best,

      h('div', { class: 'btn-row' },
        // Поле — игра. Колода спрятана рядом и названа честно: это второй
        // путь, а не «начать игру». Раньше главная кнопка вела в колоду, и
        // игрок, прочитавший на титуле про поле, попадал в карточный бой.
        h('button', { class: 'btn', onclick: () => showCompendium() }, `Грантха (${compCount})`),
        h('button', { class: 'btn ghost', onclick: startNewRun }, 'Колода — второй путь')),
    h('div', { class: 'btn-row mt' },
      h('button', { class: 'btn ghost', onclick: () => showDiary() }, 'Дневник практики'),
      h('button', { class: 'btn ghost small', style: 'width:auto', onclick: () => showHowto() }, '?'),
      h('button', { class: 'btn ghost small', style: 'width:auto', onclick: toggleHaptics },
        app.meta.settings?.haptics === false ? '🔕' : '📳')),
    )
  ))

  if (bootEvent) {
    const messages = {
      increase: `Серия дней: ${meta.streak.current}. Ум укрепляется.`,
      start: 'Начата серия дней. Завтра возвращайтесь — серия растёт.',
      freeze_used: 'Фриз спас серию — день пропущен без потери.',
      break: 'Серия оборвалась. Не расстраивайтесь — каждый день начинается заново.',
      grace: 'Воскресенье покоя: серия сохранена. Отдых — тоже практика.',
    }
    toast(messages[bootEvent.kind], bootEvent.kind === 'break' ? 'danger' : '')
  }
}

function showHowto() {
  show(h('div', { class: 'screen active' },
    h('button', { class: 'btn ghost small', onclick: showTitle }, '← Назад'),
    h('div', { class: 'panel mt' },
      h('div', { class: 'display', style: 'font-size:22px' }, 'Как играть'),
      h('div', { class: 'hint', style: 'color:var(--gold-soft)' }, 'ПОЛЕ УМА — основной путь'),
      h('div', { class: 'hint mt' },
        'Ты ходишь по комнате, и оки приходят к тебе. Две кнопки: «Дефлект» — поймать удар и вернуть его, «Сева» — встать и выдержать, когда сил нет.'),
      h('div', { class: 'hint mt' },
        'Ока замахнулась — жми кольцо. Попадание в окно отправляет удар обратно и снимает часть её сомнения. Сомнение кончилось — ока уходит сама, её не нужно добивать.'),
      h('div', { class: 'hint mt' },
        'Пока в комнате не пройдёт время, мир злится: оки быстрее. Это «часы смерти» — они и держат напряжение.'),
      h('div', { class: 'hint mt' },
        'Решения: у Фонтана — один нефрит на забег, после владыки — дар из трёх. Между — лавка за монеты и комната амбросии перед владыкой.'),
      h('div', { class: 'hint mt' },
        'Смерть отнимает нефрит и дары, но не знание: цитаты, что ты открыл, остаются. Семь чакр — семь владык, и Вершина Света в конце.'),
      h('div', { class: 'hint mt', style: 'color:var(--muted)' },
        'КОЛОДА — второй путь, он спрятан в Городе. Карты-практики против оков, три гуны вместо маны, мирный финал через ахимсу. Играется иначе, но тот же ум.'),
    ),
    h('button', { class: 'btn primary mt', onclick: showWeaponSelect }, 'Понятно, в путь'),
  ))
}

// ── Первый запуск (§онбординг): короткий рассказ о том, что за игра и где геймплей.
// Показывается один раз, до первого забега. Язык — игровой, без жаргона.

// Онбординг учит ТОМУ, во что игрок пойдёт. Раньше здесь было пять шагов
// про колоду, карты и «три гуны в бою», а кнопка в конце отправляла в
// карточный путь — и новичок читал одно, а играл в другое. Игра теперь
// поле: шаг, две кнопки, дефлект. Учим именно этому.
const ONBOARDING_STEPS = [
  { e: '🚶', t: 'Ты идёшь сам', d: 'Никакой карты на столе. Ты ходишь по комнате, оки приходят к тебе, и всё решают две кнопки. Комната — это комната, а не стол с картами.' },
  { e: '✋', t: 'Ока замахнулась — жми кольцо', d: 'Когда ока бьёт, нажимай «Дефлект». Попадёшь в окно — удар вернётся в неё, и она станет спокойнее. Это и есть весь бой: поймал момент.' },
  { e: '🕊', t: 'Убивать нельзя', d: 'Окову снимают терпением: бей в ритм и жди, пока сомкнётся кольцо. Снятая ока уходит сама. Мирный путь — настоящий финал, как в Hades, где можно пройти без единого убийства.' },
  { e: '🕯', t: 'Между комнатами — выбор', d: 'У Фонтана берёшь один нефрит на весь забег. После владыки — дар: один из трёх, остаются до конца. Это единственные решения в игре, и они копятся.' },
  { e: '♻️', t: 'Смерть — это перерождение', d: 'Смерть отнимает нефрит и дары, но не знание. Цитаты, которые ты открыл, остаются навсегда: следующий забег начинается не с нуля, а с того, что ты уже понял.' },
]

function showOnboarding() {
  show(h('div', { class: 'screen active node-screen' },
    h('div', { class: 'node-icon' }, 'ॐ'),
    h('div', { class: 'node-title display' }, 'Тантра — путь ума'),
    h('p', { class: 'node-text' }, 'Это рогалик о том, как ум поднимается из неведения к ясности. Коротко, что вы будете делать:'),
    h('div', { class: 'onboard-steps' },
      ONBOARDING_STEPS.map((s) =>
        h('div', { class: 'onboard-step' },
          h('div', { class: 'onboard-e' }, s.e),
          h('div', {},
            h('div', { class: 'onboard-t' }, s.t),
            h('div', { class: 'onboard-d' }, s.d))))),
    h('div', { class: 'hint center mt' }, 'Подсказка «?» на титуле — всегда под рукой.'),
    h('button', { class: 'btn primary mt', onclick: () => {
      app.meta.onboarded = true
      saveMeta(app.meta)
      // В игру — в поле, а не в колоду: кнопка «в путь» обязана вести туда,
      // о чём только что рассказала.
      showWeaponSelect()
    } }, 'Понятно — в путь ▶'),
  ))
}

// ─────────────────────────────────────────────────────────────
// Стрики (§15) и ежедневный вызов (§16.2) на титуле
// ─────────────────────────────────────────────────────────────

function streakCard(meta) {
  const s = meta.streak || { current: 0, best: 0, freeze: 0, total: 0 }
  // последние 7 дней: серия идёт назад от сегодня
  const dots = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(Date.now() - i * 86400000)
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    const on = s.lastDay === key || (s.current > 0 && i < s.current)
    dots.push(h('div', { class: `streak-dot ${on ? 'on' : ''}` }, i === 0 ? 'сегодня' : `${i + 1}`))
  }
  return h('div', { class: 'streak-card' },
    h('div', { class: 'streak-head' },
      h('div', { class: 'streak-lotus' }, LOTUS[Math.min(LOTUS.length - 1, Math.floor(s.current / 2))]),
      h('div', {},
        h('div', { class: 'streak-label' }, 'серия дней'),
        h('div', { class: 'streak-num' }, `${s.current}${s.best > s.current ? ` · рекорд ${s.best}` : ''}`)),
      h('div', { class: 'streak-freeze' }, `🛡 фриз: ${s.freeze}`)),
    h('div', { class: 'streak-dots' }, dots),
    s.total > 0 ? h('div', { class: 'hint center', style: 'font-size:10px' },
      `всего дней практики: ${s.total} · срывы — часть пути, возвращение — сама практика`) : null)
}

// Лотос практики растёт с серией (метафора Forest/Finch: видимый живой прогресс).
const LOTUS = ['🌱', '🌿', '🍃', '🌸', '🪷']

function challengeCard(meta) {
  const d = meta.daily || {}
  const ch = d.challengeId ? CHALLENGES[d.challengeId] : null
  if (!ch) return null
  const pct = Math.min(100, (d.progress / ch.target) * 100)
  const prog = d.done
    ? h('div', { class: 'challenge-done' }, '✓ вызов выполнен · +1 фриз серии')
    : h('div', { class: 'challenge-progress' }, `${d.progress} / ${ch.target}`)
  return h('div', { class: 'challenge-card' },
    h('div', { class: 'challenge-term' }, `вызов дня · ${ch.term}`),
    h('div', { class: 'challenge-name' }, `${ch.name} · ${ch.sanskrit}`),
    h('div', { class: 'challenge-desc' }, ch.desc),
    prog)
}

// Четыре ментальности ума (§12): шудра/кшатрия/випра/вайшья растут параллельно.
// Садвипра — когда все четыре достигли зрелости. Слабая ментальность = недостающий
// навык (Human Society Part 2, гл. 4): развивайте все, а не одну.
function varnaCard(meta) {
  const vs = varnaState(meta)
  const rows = MENTALITY_ORDER.map((id) => {
    const m = MENTALITIES[id]
    const lv = vs.levels[id]
    const pts = vs.points[id] || 0
    const pct = Math.max(4, Math.min(100, (pts / 18) * 100))
    const skills = m.skills || []
    const skillText = skills[Math.min(skills.length - 1, lv)] || ''
    const chosen = (meta.varnaBranches || {})[id]
    const branchLabel = chosen
      ? (m.branches || []).find((b) => b.id === chosen)?.desc || ''
      : null
    return h('div', { class: 'varna-row' },
      h('div', { class: 'varna-row-head' },
        h('span', { class: 'varna-m-name', style: `color:${m.color}` }, `${m.name} · ${m.sanskrit}`),
        h('span', { class: 'varna-m-lv' }, `ур. ${lv}`)),
      h('div', { class: 'varna-bar' }, h('div', { class: 'varna-fill', style: `width:${pct}%;background:${m.color}` })),
      h('div', { class: 'varna-row-hint' }, `${m.focusDesc}`),
      h('div', { class: 'varna-row-skill' }, skillText),
      lv >= 3
        ? h('div', { class: 'varna-branches', onclick: () => showBranchChoice(id) },
            chosen
              ? h('div', { class: 'varna-branch-pick' }, `✓ ${branchLabel}`)
              : h('div', { class: 'varna-branch-pick hint-pick' }, 'выбрать направление мастерства →'))
        : null)
  })
  return h('div', { class: 'varna-card' },
    h('div', { class: 'varna-head' },
      h('div', {},
        h('div', { class: 'varna-label' }, 'четыре ментальности ума'),
        h('div', { class: 'varna-name' },
          vs.sadvipra ? '🕉 путь садвипры открыт' : 'развивайте все четыре')),
      vs.sadvipra
        ? h('div', { class: 'varna-next done' }, 'садвипра ✓')
        : h('div', { class: 'varna-next' }, `зрелость: ур. ${vs.minLevel}+`)),
    h('div', { class: 'varna-rows' }, rows))
}

// Выбор ветви мастерства ментальности (§12.1, варны-деревья): направление на ур. 3.
function showBranchChoice(kind) {
  const m = MENTALITIES[kind]
  const vs = varnaState(app.meta)
  const chosen = (app.meta.varnaBranches || {})[kind]
  const opts = (m.branches || []).map((b) => h('div', {
    class: 'choice',
    onclick: () => chooseBranch(kind, b.id),
  },
    h('div', { class: 'c-main' }, `${b.name}${chosen === b.id ? ' · ✓' : ''}`),
    h('div', { class: 'c-sub' }, b.desc)))
  show(h('div', { class: 'screen active node-screen' },
    h('button', { class: 'btn ghost small', onclick: showTitle }, '← Город'),
    h('div', { class: 'node-icon' }, m.sanskrit),
    h('div', { class: 'node-title display' }, `${m.name} · мастерство`),
    h('p', { class: 'node-text' },
      `Ментальность ${m.name} достигла уровня 3. Зрелый ум выбирает направление — какой гранью мастерства воспользоваться в каждом забеге (Human Society Part 2: зрелость = осознанный выбор).`),
    h('div', { class: 'choices' }, opts),
    h('div', { class: 'hint center mt' }, 'Выбор постоянный. Пока не выбрали — навык уровня 3 действует как обычно.'),
  ))
}

function chooseBranch(kind, branchId) {
  const ok = setVarnaBranch(app.meta, kind, branchId)
  if (ok) {
    saveMeta(app.meta)
    const m = MENTALITIES[kind]
    const b = (m.branches || []).find((x) => x.id === branchId)
    sfx.unlock()
    toast(`${m.name}: мастерство «${b ? b.name : branchId}»`, 'hl')
  }
  showTitle()
}

// Дерево челленджей Ямы/Ниямы (§16.2, идея №16): испытания открывают карты-практики
// навсегда. Ветви «Яма» (5) и «Нияма» (5) — дисциплина, прожитая в бою.
function trialsCard(meta) {
  const tp = trialsProgress(meta)
  if (tp.total === 0) return null
  const branch = (name, done, total) => h('div', { class: 'trial-branch' },
    h('div', { class: 'trial-branch-name' }, name),
    h('div', { class: 'trial-branch-bar' },
      h('div', { class: 'trial-branch-fill', style: `width:${Math.max(4, Math.round((done / total) * 100))}%` })))
  return h('div', { class: 'varna-card trial-card', onclick: () => showTrials() },
    h('div', { class: 'varna-head' },
      h('div', {},
        h('div', { class: 'varna-label' }, 'дерево Ямы и Ниямы'),
        h('div', { class: 'varna-name' }, `испытания · ${tp.unlockedCount}/${tp.total}`)),
      h('div', { class: 'varna-next' }, 'открыть →')),
    h('div', { class: 'trial-branches' },
      branch('Яма', tp.yamaDone, tp.yamaTotal),
      branch('Нияма', tp.niyamaDone, tp.niyamaTotal)),
    h('div', { class: 'varna-hint' }, 'проходите испытания — карты практик открываются навсегда'))
}

// Экран дерева испытаний: две ветви, доступные и пройденные испытания.
function showTrials() {
  const meta = app.meta
  const unlocked = new Set(meta.unlockedCards || [])
  const branch = (name, order) => {
    const list = Object.values(TRIALS).filter((t) => t.branch === order).sort((a, b) => a.order - b.order)
    return h('div', { class: 'panel mt' },
      h('div', { class: 'display', style: 'font-size:18px' }, name),
      list.map((t) => {
        const done = unlocked.has(t.rewardCard)
        const card = CARDS[t.rewardCard]
        return h('div', { class: `trial-row ${done ? 'done' : ''}` },
          h('div', { class: 'trial-row-main' },
            h('span', { style: 'color:var(--sat);font-weight:800' }, done ? '✓' : '✧'),
            h('span', { class: 'sanscr' }, ` ${t.name} · ${t.sanskrit}`)),
          h('div', { class: 'trial-row-sub' },
            done
              ? `карта открыта: ${card ? card.name : t.rewardCard}`
              : `${t.desc} → откроет «${card ? card.name : t.rewardCard}» · этаж ${t.minFloor ?? 0}+`))
      }))
  }
  show(h('div', { class: 'screen active comp-screen' },
    h('button', { class: 'btn ghost small', onclick: showTitle }, '← Назад'),
    h('div', { class: 'display chakra-title' }, 'Дерево испытаний'),
    h('div', { class: 'chakra-sub' }, 'дисциплина, прожитая в бою · знание остаётся'),
    h('p', { class: 'hint center mt' }, 'Каждое испытание — правило боя. Выполните его — и карта практики навсегда войдёт в награды.'),
    branch('Яма', 'yama'),
    branch('Нияма', 'niyama'),
  ))
}

// Сад Знания (соцслой, локально): прожитые термины пускают корни — знание,
// которое переживает смерть, помогает в следующих жизнях (+саттва к забегу).
function gardenCard(meta) {
  const g = gardenState(meta)
  const s = g.stage
  const next = g.stages.find((st) => st.min > g.lived)
  return h('div', { class: 'varna-card garden-card', onclick: () => showGarden() },
    h('div', { class: 'varna-head' },
      h('div', {},
        h('div', { class: 'varna-label' }, 'Сад Знания'),
        h('div', { class: 'varna-name' }, `${s.emoji} ${s.name} · прожито ${g.lived}`)),
      h('div', { class: 'varna-next' }, 'открыть →')),
    h('div', { class: 'garden-row' },
      g.stages.map((st, i) => {
        const done = i <= g.stages.indexOf(s)
        const active = i === g.stages.indexOf(s)
        return h('div', { class: `garden-dot ${done ? 'on' : ''} ${active ? 'cur' : ''}` },
          h('span', { class: 'g-dot-e' }, st.emoji),
          h('span', { class: 'g-dot-l' }, `${st.name}`))
      })),
    h('div', { class: 'varna-hint' },
      next
        ? `до «${next.name}»: ещё ${next.min - g.lived} прожитых знаний`
        : 'сад в полном цвету: древо знания дарит +2 саттвы к каждому забегу'))
}

// Экран «Сад Знания»: наглядный рост прожитых терминов и его награда.
function showGarden() {
  const g = gardenState(app.meta)
  const s = g.stage
  show(h('div', { class: 'screen active comp-screen' },
    h('button', { class: 'btn ghost small', onclick: showTitle }, '← Город'),
    h('div', { class: 'display chakra-title' }, 'Сад Знания'),
    h('div', { class: 'chakra-sub' }, 'прожитое знание пускает корни'),
    h('div', { class: 'garden-scene' },
      h('div', { class: 'garden-canopy' }, s.emoji),
      h('div', { class: 'garden-ground' })),
    h('p', { class: 'node-text center' },
      'Каждый сыгранный термин, успокоенный враг и взятая реликвия — прожитое знание. Оно переживает смерть и в следующих жизнях помогает: цветущий сад даёт +1 саттву к началу забега, древо — +2.'),
    h('div', { class: 'panel mt' },
      h('div', { class: 'row between' },
        h('span', { class: 'hint' }, 'прожито знаний'),
        h('span', { style: 'color:var(--sat);font-weight:800' }, g.lived)),
      g.stages.map((st) => {
        const on = st.min <= g.lived
        return h('div', { class: `garden-line ${on ? 'on' : ''}` },
          h('span', { class: 'g-line-e' }, st.emoji),
          h('div', {},
            h('div', { class: 'g-line-name' }, `${st.name}${st.bonus > 0 ? ` · +${st.bonus} саттвы` : ''}`),
            h('div', { class: 'hint' }, st.desc)))
      })),
    h('div', { class: 'hint center mt' }, 'Знание — единственный ресурс, который не умирает.'),
  ))
}

// Аудиотека практики (§16.2, идея №33): звуки, прожитые в игре, записываются в
// личную аудиотеку — «собрать биджа-звуки, забрать в жизнь». Слушать можно как
// практику (WebAudio, без файлов). Как живые цитаты: звук надо прожить (сыграть
// карту-носитель или пройти дыхательную медитацию).
function audioCard(meta) {
  const s = soundState(meta, AUDIO_LIBRARY)
  return h('div', { class: 'varna-card garden-card audio-card', onclick: () => showAudioLibrary() },
    h('div', { class: 'varna-head' },
      h('div', {},
        h('div', { class: 'varna-label' }, 'Аудиотека практики'),
        h('div', { class: 'varna-name' }, `звуки · ${s.recorded.length}/${s.total}`)),
      h('div', { class: 'varna-next' }, 'открыть →')),
    h('div', { class: 'audio-icons' },
      Object.values(AUDIO_LIBRARY).map((a) => {
        const on = s.recorded.includes(a.id)
        return h('div', { class: `audio-ic ${on ? 'on' : ''}` }, a.emoji)
      })),
    h('div', { class: 'varna-hint' },
      s.recorded.length === 0
        ? 'Сыграйте Ом, кииртану или мантру — звук запишется в вашу практику'
        : 'Звук, прожитый в игре, остаётся с вами — слушайте как практику'))
}

// Экран аудиотеки: список собранных звуков; клик по прожитому — прослушать.
function showAudioLibrary() {
  const s = soundState(app.meta, AUDIO_LIBRARY)
  const items = Object.values(AUDIO_LIBRARY).map((a) => {
    const on = s.recorded.includes(a.id)
    const how = a.meditate
      ? 'Проживите дыхательную медитацию в забеге'
      : `Сыграйте в бою: ${a.cardIds.map((id) => CARDS[id]?.name || id).join(', ')}`
    return h('div', { class: `audio-item ${on ? 'on' : 'locked'}` },
      h('div', { class: 'audio-item-head' },
        h('span', { class: 'audio-item-e' }, a.emoji),
        h('div', {},
          h('div', { class: 'audio-item-name' }, `${a.name} · ${a.sanskrit}`),
          h('div', { class: 'audio-item-desc' }, a.desc)),
        on
          ? h('button', { class: 'btn ghost small', onclick: () => { playLibrarySound(a.id); haptics.notify('selection') } }, '▶ слушать')
          : null),
      on
        ? h('div', { class: 'audio-item-src' }, a.source)
        : h('div', { class: 'audio-item-hint' }, `🔒 ${how}`))
  })
  show(h('div', { class: 'screen active comp-screen' },
    h('button', { class: 'btn ghost small', onclick: showTitle }, '← Город'),
    h('div', { class: 'display chakra-title' }, 'Аудиотека практики'),
    h('div', { class: 'chakra-sub' }, 'собрать звуки · забрать в жизнь'),
    h('p', { class: 'hint center mt' },
      'Собранные звуки — подлинные термины Шастры, прожитые в игре. Каждый можно слушать как практику: вернитесь к Ом, когда ум шумит, к кииртане — когда уныние.'),
    items,
    h('div', { class: 'hint center mt' }, `собрано звуков: ${s.recorded.length}/${s.total}`),
  ))
}

// ─────────────────────────────────────────────────────────────
// «Свет в Городе» (§14.1): экран города — семь площадей чакр.
// Успокоенный владыка зажигает свет и становится учителем (Undertale: враг → друг).
// Первый разговор с учителем даёт знание (цитата проживается) и благословение
// (+1 саттва к следующему забегу, §9.5 мирный путь).
// ─────────────────────────────────────────────────────────────

function teacherByBossName(name) {
  return Object.values(CITY_TEACHERS).find((t) => ENEMIES[t.bossId] && ENEMIES[t.bossId].name === name)
}

function showCity() {
  const { meta } = app
  const spoken = new Set(meta.citySpoken || [])
  const pacified = new Set(meta.pacifiedBosses || [])

  const areas = Object.values(CITY_TEACHERS).map((t) => {
    const bossName = ENEMIES[t.bossId] && ENEMIES[t.bossId].name
    const lit = bossName && pacified.has(bossName)
    const talked = spoken.has(t.id)
    const quoteLived = isQuoteLived(meta, t.quoteId)

    const content = lit
      ? h('div', { class: 'city-area-lit' },
          h('div', { class: 'city-area-glyph', style: 'font-size:34px' }, t.glyph === 'mask' ? '◐' : t.glyph === 'crown' ? '👑' : t.glyph === 'eye' ? '👁' : t.glyph === 'greed' ? '👑' : t.glyph === 'heart' ? '♥' : '✦'),
          h('div', { class: 'city-area-name' }, t.name),
          h('div', { class: 'city-area-epithet' }, t.epithet),
          // Учителя можно слушать и после первого визита: у него есть
          // цепочка цитат, и он отдаёт её по одной.
          h('button', {
            class: 'btn small mt',
            onclick: () => talkToTeacher(t),
          }, talked
            ? (nextTeacherQuote(t.id, meta.lived || {}) ? 'Учитель даст ещё' : 'Учитель ждёт')
            : 'Поговорить с учителем'))
      : h('div', { class: 'city-area-dark' },
          h('div', { class: 'city-area-glyph', style: 'font-size:34px' }, '·'),
          h('div', { class: 'city-area-name' }, t.epithet.replace('Учитель', 'Владыка')),
          h('div', { class: 'city-area-hint' }, 'площадь спит во тьме неведения'),
          h('div', { class: 'city-area-hint' }, 'успокойте этого владыку — и здесь зажжётся свет'))

    return h('div', { class: `city-area ${lit ? 'lit' : 'dark'} ${talked ? 'talked' : ''}` }, content)
  })

  const blessing = cityBlessingBonus(meta)
  show(h('div', { class: 'screen active comp-screen' },
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn ghost small', onclick: showTitle }, '← Город'),
      h('div', { class: 'display chakra-title', style: 'flex:1;text-align:center' }, 'Город')),
    h('div', { class: 'chakra-sub' }, 'внутренний путь отражается во внешнем мире'),
    h('p', { class: 'hint center mt' },
      'Семь чакр — семь площадей. Успокоенный владыка становится учителем и зажигает свет; его благословение (+1 саттва на забег) копится в Городе.'),
    h('div', { class: 'city-grid' }, areas),
    h('div', { class: 'panel mt' },
      h('div', { class: 'row between' },
        h('span', { class: 'hint' }, 'площадей освещено'),
        h('span', { style: 'color:var(--sat);font-weight:800' }, `${(meta.pacifiedBosses || []).length}/${Object.keys(CITY_TEACHERS).length}`)),
      h('div', { class: 'row between' },
        h('span', { class: 'hint' }, 'благословение на следующий забег'),
        h('span', { style: 'color:var(--gold-soft);font-weight:800' }, `+${blessing} саттвы`)),
      h('div', { class: 'hint mt' }, 'Благословение применяется в начале забега, как милость учителей. Возьмите его, выбрав «Колода — второй путь» на титуле.'))
  ))
}

// Разговор с учителем. Учитель — это успокоенный владыка, и у него НЕ одна
// фраза, а учение: несколько цитат, которые он вручает по одной за визит.
// Так устроена садхана — пришёл, получил следующий слой, ушёл думать.
// Раньше он давал ровно одну цитату, и 14 цитат корпуса не открывались ничем.
function talkToTeacher(t) {
  const meta = app.meta
  const spoken = meta.citySpoken || (meta.citySpoken = [])

  // Что он даст в этот раз: собственная цитата о нём, если ещё не дана,
  // иначе — следующая в его цепочке. Закончил цепочку — больше нечего.
  const chain = teacherChain(t.id)
  const own = !isQuoteLived(meta, t.quoteId) ? t.quoteId : null
  const next = own || nextTeacherQuote(t.id, meta.lived || {})
  if (!next) {
    show(h('div', { class: 'screen active comp-screen' },
      h('button', { class: 'btn ghost small', onclick: showCity }, '← Город'),
      h('div', { class: 'display chakra-title' }, t.name),
      h('div', { class: 'chakra-sub' }, t.epithet),
      h('div', { class: 'panel mt city-story' },
        h('p', { class: 'hint' }, t.story),
        h('p', { class: 'hint mt', style: 'color:var(--gold-soft)' }, t.advice)),
      h('p', { class: 'hint center mt' }, `Он дал тебе всё, что мог: ${chain.length + 1} слой. Иди и проживай.`),
      h('button', { class: 'btn primary mt', onclick: showCity }, 'Вернуться в Город')))
    return
  }

  const isFirst = !spoken.includes(t.id)
  markLived(meta, next)
  if (meta.quotesUnlocked && !meta.quotesUnlocked[next]) meta.quotesUnlocked[next] = true
  if (isFirst) spoken.push(t.id)
  saveMeta(meta)

  const left = teacherChain(t.id).filter((id) => !isQuoteLived(meta, id)).length
  show(h('div', { class: 'screen active comp-screen' },
    h('button', { class: 'btn ghost small', onclick: showCity }, '← Город'),
    h('div', { class: 'display chakra-title' }, t.name),
    h('div', { class: 'chakra-sub' }, t.epithet),
    h('div', { class: 'panel mt city-story' },
      h('p', { class: 'hint' }, t.story),
      h('p', { class: 'hint mt', style: 'color:var(--gold-soft)' }, t.advice)),
    quoteBox(next, { revealed: true }),
    isFirst
      ? h('div', { class: 'panel mt' },
        h('div', { class: 'row between' },
          h('span', { class: 'hint' }, 'благословение учителя'),
          h('span', { style: 'color:var(--sat);font-weight:800' }, '+1 саттва к следующему забегу')))
      : h('p', { class: 'hint center mt' },
        left > 0 ? `Он дал следующий слой. Осталось у него ${left}.` : 'Это был последний его слой.'),
    h('button', { class: 'btn primary mt', onclick: showCity }, 'Вернуться в Город'),
    h('div', { class: 'hint center mt' }, 'Знание вручено — оково больше не держит.'))
  )
}

// ─────────────────────────────────────────────────────────────
// Статистика (§16.2, «Бэкенд — статистика», локально)
// ─────────────────────────────────────────────────────────────

function showStats() {
  const { meta } = app
  const s = meta.stats
  const total = s.runs || 0
  const wins = s.victories + s.awakened
  const winPct = total > 0 ? Math.round((wins / total) * 100) : 0
  const log = (meta.runLog || []).slice().reverse()

  const RESULT = {
    death: { icon: '✝', label: 'перерождение', cls: 'death' },
    victory: { icon: '☀', label: 'завершён', cls: 'victory' },
    awakening: { icon: '🕉', label: 'пробуждение', cls: 'awakening' },
  }
  const rows = log.length === 0
    ? h('div', { class: 'hint center mt' }, 'Забегов ещё не было. Каждая смерть — шаг к пониманию, а не конец.')
    : log.map((r, i) => {
        const rk = RESULT[r.result] || RESULT.death
        const d = new Date(r.at)
        const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
        return h('div', { class: `run-row ${rk.cls}` },
          h('div', { class: 'run-row-icon' }, rk.icon),
          h('div', { class: 'run-row-main' },
            h('div', { class: 'run-row-name' }, rk.label),
            h('div', { class: 'run-row-sub' },
              r.floor != null ? `этаж ${r.floor + 1}` : '—',
              r.pacified > 0 ? ` · мирных ${r.pacified}` : '',
              r.kills > 0 ? ` · подавлено ${r.kills}` : '')),
          h('div', { class: 'run-row-date' }, date))
      })

  const gauges = [
    ['забеги', total],
    ['победы', wins],
    ['пробуждения', s.awakened],
    ['мирные', s.pacified],
    ['% побед', `${winPct}%`],
  ]
  show(h('div', { class: 'screen active comp-screen' },
    h('button', { class: 'btn ghost small', onclick: showTitle }, '← Город'),
    h('div', { class: 'display chakra-title' }, 'Статистика'),
    h('div', { class: 'chakra-sub' }, 'история ума — каждая жизнь прожита'),
    h('div', { class: 'stats-grid' },
      gauges.map(([l, v]) => h('div', { class: 'stats-cell' },
        h('div', { class: 'stats-n' }, v),
        h('div', { class: 'stats-l' }, l)))),
    meta.bestRun
      ? h('div', { class: 'panel mt' },
          h('div', { class: 'row between' },
            h('span', { class: 'hint' }, 'лучший забег'),
            h('span', { style: 'color:var(--gold-soft);font-weight:800' },
              meta.bestRun.awakened ? 'полное Пробуждение' : `${meta.bestRun.pacified} мирных освобождений`)))
      : null,
    h('div', { class: 'panel mt' },
      h('div', { class: 'row between' },
        h('span', { class: 'hint' }, 'последние забеги'),
        h('span', { style: 'color:var(--muted)' }, `${log.length}/12`)),
      rows),
    h('div', { class: 'hint center mt' },
      log.length > 0
        ? 'Пробуждение — не везение, а накопленный мир. Каждый забег учил вас чему-то.'
        : null),
    h('div', { class: 'btn-row mt' },
      h('button', { class: 'btn primary', onclick: startNewRun }, 'Новый забег ▶'),
      h('button', { class: 'btn ghost', onclick: showFieldChakra }, 'Поле Ума ▶')),
  ))
}


// ─────────────────────────────────────────────────────────────
// Забег: карта
// ─────────────────────────────────────────────────────────────

function startNewRun() {
  app.meta.stats.runs += 1
  saveMeta(app.meta)
  showFocus()
}

// ─────────────────────────────────────────────────────────────
// Поле Ума: бой в локации (изометрия, вместо карточного стола)
// ─────────────────────────────────────────────────────────────

// Выбор чакры для «Поля Ума». Показываем, чему чакра учит, — это и есть
// цель пути, а не просто список уровней.
/**
 * Выбор оружия в начале забега — экран как в Hades.
 *
 * «Оружие» здесь — ментальность (варна) из Human Society Part 2. Это не
 * классы и не «класс души», а психология ума: за них идёт бой, у каждой свой
 * навык. Всё содержимое — из `MENTALITIES`, ничего не выдумано.
 * Зеркальный аналог выбора оружия в Hades, но с нашей терминологией.
 */
function showWeaponSelect() {
  const meta = app.meta
  const cards = MENTALITY_ORDER.map((id) => {
    const m = MENTALITIES[id]
    const lv = meta.varnas?.[id] ?? 0
    return h('button', {
      class: `wsel-card w-${id}`,
      style: `--wcolor:${m.color}`,
      onclick: () => { meta.focusVarna = id; saveMeta(meta); sfx.unlock?.(); showFountain() },
    },
      h('div', { class: 'wsel-top' },
        h('i', { class: 'wsel-mark' }, m.sanskrit),
        h('b', {}, m.name),
        h('span', { class: 'wsel-lv' }, lv > 0 ? `ур. ${lv}` : 'новое'),
      ),
      h('p', { class: 'wsel-desc' }, m.desc),
      h('p', { class: 'wsel-focus' }, m.focusDesc),
    )
  })

  show(h('div', { class: 'screen active node-screen wsel-screen' },
    h('button', { class: 'btn ghost small', onclick: showTitle }, '← Назад'),
    h('div', { class: 'node-icon' }, '⚔'),
    h('div', { class: 'node-title display' }, 'Кем ты идёшь'),
    h('p', { class: 'node-text' },
      'Варны — не классы и не «класс души», а психология ума (Human Society Part 2). Выбери, с кем пойдёшь: у каждой свой навык, и он меняет бой.'),
    h('div', { class: 'wsel-row' }, cards),
  ))
}

/**
 * Фонтан юности (Hades: Fountain of Youth) — выбор нефрита на забег.
 *
 * В Hades это ровно то же место и то же назначение: одно «хранилище» на
 * побег, выбираешь один раз, и оно меняет бой до конца забега.
 * Здесь термины настоящие (content/quotes.json), эффекты — только
 * уже существующие величины боя.
 */
function showFountain() {
  const picks = rollKeepsakes(Math.random, 3)
  const stone = (k) => h('button', {
    class: 'boon-card r-rare jade-card',
    onclick: () => {
      app.runKeepsake = k.id
      app.runHp = null
      app.boons = []          // новый забег — старые дары остались в прошлом
      sfx.unlock?.()
      markLived(app.meta, k.quoteId)
      saveMeta(app.meta)
      showFieldChakra()
    },
  },
    h('span', { class: 'boon-rar' }, 'нефрит'),
    h('b', { class: 'boon-name' }, k.name),
    h('i', { class: 'boon-sub' }, k.sub),
    h('span', { class: 'boon-desc' }, k.desc),
  )

  show(h('div', { class: 'screen active node-screen wsel-screen' },
    h('button', { class: 'btn ghost small', onclick: showWeaponSelect }, '← Назад'),
    h('div', { class: 'node-icon' }, '◈'),
    h('div', { class: 'node-title display' }, 'Фонтан юности'),
    h('p', { class: 'node-text' },
      'Один нефрит на весь побег. Он не лечит и не бьёт — он меняет правила боя, и менять придётся до конца. Дары боги дадут потом, а это — твоё.'),
    h('div', { class: 'wsel-row' }, picks.map(stone)),
  ))
}

function showFieldChakra() {
  const meta = app.meta
  const unlocked = meta.fieldFloor || 0
  show(h('div', { class: 'screen active node-screen' },
    h('div', { class: 'node-icon' }, '◉'),
    h('div', { class: 'node-title display' }, 'Поле Ума'),
    h('p', { class: 'node-text' },
      'Иди по миру и возвращай оковы ударами. Ока замахнулась — кольцо сомкнулось — жми дефлект. Убить их нельзя.'),
    h('div', { class: 'stack', style: 'margin-top:16px' },
      CHAKRAS.map((name, i) => {
        const w = worldForFloor(i)
        const locked = i > unlocked
        return h('div', {
          class: `varna-card ${locked ? 'locked' : ''}`,
          style: locked ? 'opacity:.45' : '',
          onclick: () => { if (!locked) startFieldRun(i) },
        },
          h('div', { class: 'varna-head' },
            h('div', {},
              h('div', { class: 'varna-label' }, `${i + 1} · ${w.elementIcon || '◉'} ${w.element || 'чакра'}`),
              h('div', { class: 'varna-name' }, `${w.name || ''} · ${name}`)),
            h('div', { class: 'varna-next' }, locked ? '🔒' : 'войти →')),
          h('div', { class: 'varna-hint' }, w.teach || w.land || ''),
        )
      })),
    h('div', { class: 'btn-row mt' },
      h('button', { class: 'btn ghost', onclick: showTitle }, '← Город')),
  ))
}

/**
 * Лавка между комнатами — как в Hades: за монеты лечат, качают сердце
 * и покупают дары. Лавка стоит не в каждой комнате (в Hades тоже не в каждой).
 * Монеты **живут между забегами** — их не тратишь, а копишь, как в игре.
 */
function showFieldShop(st, nextFloor) {
  const meta = app.meta
  const purse = meta.coins || 0
  app.fieldShopDiscount = st?.o?.shopDiscount || 0
  // Лавка — место, где учат: песня, танец и инструмент вместе.
  const sq = QUOTES[placeQuotes('shop')[0]]
  if (sq) markLived(meta, sq.id)
  const has = (cost) => purse >= cost
  // Товар в лавке можно взять ОДИН раз. В Hades лавка одноразовая: полки
  // пустеют, и уйти — уйти. Раньше бесплатный дар можно было выкупать
  // кликами без конца, и за один забег собирались все десять.
  // Список покупок НЕ сбрасывается при перерисовке лавки — иначе «куплено»
  // сбрасывалось бы тем же кликом, который только что купил.
  if (!app.fieldShopBought) app.fieldShopBought = {}

  const item = (mark, key, name, desc, cost, buy) => {
    const taken = !!app.fieldShopBought[key]
    const price = Math.round(cost * (1 - (app.fieldShopDiscount || 0)))
    return h('button', {
      class: `shop-item ${taken ? 'poor' : (cost === 0 || has(cost) ? 'can' : 'poor')}`,
      disabled: taken || cost > purse,
      onclick: () => {
        if (app.fieldShopBought[key]) return
        if (price > purse) return
        app.fieldShopBought[key] = true
        meta.coins = purse - price; buy(); saveMeta(meta); sfx.buy?.(); showFieldShop(st, nextFloor)
      },
    },
      h('i', { class: 'shop-mark' }, mark),
      h('div', { class: 'shop-tx' }, h('b', {}, name), h('span', {}, taken ? 'куплено' : desc)),
      h('i', { class: 'shop-cost' }, taken ? '—' : cost === 0 ? 'дар' : `${price} монет`),
    )
  }

  show(h('div', { class: 'screen active node-screen' },
    h('button', { class: 'btn ghost small', onclick: () => { collectCoins(meta, st); showBoonDraft(nextFloor) } }, '← уйти'),
    h('div', { class: 'node-icon' }, '◈'),
    h('div', { class: 'node-title display' }, 'Лавка'),
    h('div', { class: 'ws-points' }, h('b', {}, String(purse)), h('span', {}, 'монет')),
    h('div', { class: 'stack', style: 'margin-top:12px' },
      item('❖', 'boon', 'Дар чакры', 'Случайный дар на этот путь.', 0, () => {
        const opts2 = rollBoons(runBoons(), Math.random, 1)
        if (opts2[0]) { runBoons().push(opts2[0].id); markLived(meta, opts2[0].quoteId) }
      }),
      item('♥', 'full', 'Ахимса', 'Восстановить всю жизнь.', 25, () => { st.player.hp = st.player.maxHp }),
      item('✦', 'shakti', 'Духовная сила', 'Наполнить духовную силу до конца.', 20, () => { st.player.shakti = st.player.shaktiMax }),
    ),
  ))
}

function collectCoins(meta, st) {
  if (!st) return
  const take = st.coinsTaken || 0
  if (take > 0) { meta.coins = (meta.coins || 0) + take; saveMeta(meta) }
}

/**
 * Дары ТЕКУЩЕГО забега. В Hades дары умирают вместе с побегом: умер — и
 * начинаешь с нуля, поэтому каждый забег снова решает, кем ты будешь.
 * Раньше они лежали в meta и копились забег за забегом: к третьему пул из
 * 10 даров кончался, и дальше поле шло вообще без выбора и без силы.
 *
 * Между забегами остаётся знание (цитаты, прожитого) — оно и должно
 * копиться, а не боевая мощь.
 */
function runBoons() {
  if (!Array.isArray(app.boons)) app.boons = []
  return app.boons
}

/** Дары чакры — выбор 1 из 3, как в Hades. Стоит между локациями:
 * окно просто и ясно, три карточки, одна кнопка на каждой.
 */
function showBoonDraft(nextFloor, caption) {
  const meta = app.meta
  // Дары живут ОДИН ЗАБЕГ, как в Hades. Раньше они копились в meta между
  // побегами, и к третьему забегу их не оставалось ни одного: пул кончался,
  // экран выбора пропускался, и поле игралось вообще без силы. Это была
  // не плавная сложность, а поломка петли.
  const owned = runBoons()
  const options = rollBoons(owned, Math.random, 3)
  if (!options.length) { startFieldRun(nextFloor); return }

  const cards = options.map((b) => h('button', {
    class: `boon-card r-${b.rarity}`,
    onclick: () => {
      owned.push(b.id)
      markLived(meta, b.quoteId)          // дар открывает цитату
      saveMeta(meta)
      sfx.buy?.()
      startFieldRun(nextFloor)
    },
  },
    h('span', { class: 'boon-rar' }, b.rarity === 'common' ? 'обычный' : b.rarity === 'uncommon' ? 'необычный' : 'редкий'),
    h('b', { class: 'boon-name' }, b.name),
    h('i', { class: 'boon-sans' }, b.sanskrit),
    h('span', { class: 'boon-desc' }, b.desc),
    h('em', { class: 'boon-field' }, b.field),
  ))

  show(h('div', { class: 'screen active node-screen boon-screen' },
    h('div', { class: 'node-icon' }, '✦'),
    h('div', { class: 'node-title display' }, 'Дары чакры'),
    h('p', { class: 'node-text' }, caption || 'Возьми один. Они останутся до конца пути и сложатся.'),
    h('div', { class: 'boon-row' }, cards),
    owned.length
      ? h('div', { class: 'boon-owned' }, 'уже с тобой: ' + owned.map((id) => FIELD_BOONS.find((x) => x.id === id)?.name).filter(Boolean).join(' · '))
      : null,
  ))
}

/**
 * Мастерская севы. Тратит накопленные очки севы на практику, а не на силу:
 * каждое усиление — принцип Ямы или Ниямы, и покупая его, игрок открывает
 * цитату из шастр (SPEC §10.1a: знание надо прожить).
 */
function showSevaWorkshop() {
  const meta = app.meta
  const owned = meta.upgrades || (meta.upgrades = [])
  const pts = meta.sevaPoints || 0
  const rows = WORKSHOP.map((u) => {
    const has = owned.includes(u.id)
    const afford = canBuy(u.id, pts, owned)
    return h('button', {
      class: `ws-row ${has ? 'has' : afford ? 'can' : 'poor'}`,
      disabled: has || !afford,
      onclick: () => {
        if (!canBuy(u.id, pts, owned)) return
        meta.sevaPoints = pts - u.cost
        owned.push(u.id)
        markLived(meta, u.quoteId)     // усиление открывает цитату
        saveMeta(meta)
        sfx.buy?.()
        showSevaWorkshop()
      },
    },
      h('i', { class: 'ws-mark' }, has ? '✦' : '◇'),
      h('div', { class: 'ws-tx' },
        h('b', {}, u.name),
        h('span', {}, u.desc),
        h('em', {}, u.why),
      ),
      h('i', { class: 'ws-cost' }, has ? 'есть' : `${u.cost} сева`),
    )
  })

  show(h('div', { class: 'screen active node-screen' },
    h('button', { class: 'btn ghost small', onclick: showTitle }, '← Назад'),
    h('div', { class: 'node-icon' }, '◈'),
    h('div', { class: 'node-title display' }, 'Мастерская севы'),
    h('p', { class: 'node-text' },
      'Очки севы набегают за помощь и за оковы, снятые без удара. Тратятся не на силу, а на практику: каждый принцип меняет одно правило боя и открывает цитату.'),
    h('div', { class: 'ws-points' },
      h('b', {}, String(pts)), h('span', {}, 'очков севы накоплено')),
    h('div', { class: 'stack', style: 'margin-top:12px' }, rows),
  ))
}

/**
 * Комната забега. `stage`:
 *   'room' — обычная комната с оками, в конце дверь
 *   'boss' — комната владыки: он один, дверь закрыта до его падения
 * В Hades босс — всегда ОТДЕЛЬНАЯ комната в конце этапа. Здесь так же.
 */
function startFieldRun(floor, stage = 'room', room = 0) {
  const meta = app.meta
  const built = buildFieldFloor(floor, { room })
  const foes = stage === 'boss' ? [] : built.foes.slice()
  if (stage === 'boss' && built.boss) foes.push(built.boss)

  // Мантра выдаётся по чакре сама — выбирать нечего (см. FLOOR_MANTRA).
  const vId = meta.focusVarna || 'shudra'
  const vLv = meta.varnas?.[vId] ?? 0
  const base = { playerHp: 60 + (vLv * 4) + (MENTALITIES[vId]?.focusHp || 0) + (meta.hpBonus || 0),
    look: built.look, world: built.world, mantraId: FLOOR_MANTRA[floor] || 'japa',
    coins: meta.coins || 0, varna: vId, varnaLevel: vLv,
    keepsake: app.runKeepsake || null,
    deaths: meta.stats?.deaths || 0,
    // Фонтан амбросии стоит в последней комнате этапа — прямо перед
    // владыкой (Hades). Без него туда входят с тем, что осталось.
    spring: stage === 'room' && room === ROOMS_PER_STAGE - 1 }
  // Сначала дары, потом мастерская — усиления перекрывают дары, если
  // затрагивают ту же величину (и это правильно: усиление дороже).
  // порядок: варна → дары → мастерская (позднее перекрывает раньше)
  // порядок: варна → нефрит → дары → мастерская (позднее перекрывает раньше)
  const opts2 = applyUpgrades(
    applyBoons(applyKeepsake(applyVarna(base, vId), app.runKeepsake), runBoons()),
    meta.upgrades || [],
  )

  // Здоровье живёт весь побег, как в Hades: вышел из комнаты битый — вошёл
  // в следующую битый. Раньше каждая комната начиналась с полной жизни, и
  // весь забег становился бесконечным «сбросом»: напряжения не было вовсе,
  // а фонтан амбросии и комната покоя теряли смысл.
  const fullHp = opts2.playerHp || 60
  const entryHp = app.runHp == null ? fullHp : Math.max(1, Math.min(fullHp, app.runHp))

  const st = createField({
    player: { x: built.field.w * 0.5, y: built.field.h * 0.72, hp: entryHp, maxHp: fullHp },
    foes,
    wares: built.wares,
    field: built.field,
    rng: Math.random,
    opts: opts2,
  })
  app.field = st
  app.fieldFloor = floor
  // Отладочный доступ к состоянию поля из консоли (не влияет на игру).
  if (typeof window !== 'undefined') window.__field = st
  setTint(null)
  show(fieldScreen(st, {
    floor,
    room,
    placeQuotes,
    onKnowledge: (qid, name) => {
      markLived(meta, qid)
      markSeen(meta, 'enemies', st.foes.find((f) => f.name === name)?.id || '')
      saveMeta(meta)
    },
    // Цитата чакры: приходит сама, когда входишь в локацию впервые.
    // Раньше 48 цитат корпуса не открывались ничем — они лежали в файле
    // и были не видны игроку.
    onEnter: () => {
      const q = chakraQuote(built.world?.id)
      if (q && QUOTES[q] && !isQuoteLived(meta, q)) {
        markLived(meta, q)
        saveMeta(meta)
        return q
      }
      return null
    },
    // Хаос-путь: дар бесплатно за проклятие (Hades: Chaos Gate).
    onChaos: (st2) => {
      const owned = runBoons()
      const opts3 = rollBoons(owned, Math.random, 1)
      if (opts3[0]) { owned.push(opts3[0].id); markLived(meta, opts3[0].quoteId); saveMeta(meta) }
    },
    // Крипа пала под дождём: метка в профиле. «Побывал под крипой» —
    // и есть настоящая статистика: сколько раз милость тебя достала.
    onKrpa: (landed) => {
      meta.krpaFell = (meta.krpaFell || 0) + (landed ? 1 : 0)
      meta.krpaMissed = (meta.krpaMissed || 0) + (landed ? 0 : 1)
      saveMeta(meta)
    },
    // Смерть — как в Hades: знание и монеты остаются, забег начинается заново.
    onRetry: (st2) => {
      // Смерть — место, которое учит. Смерть приносит слово, которого
      // в бою не было: «освобождение нужно во всех сферах жизни».
      const dq = QUOTES[placeQuotes('death')[0]]
      if (dq && !isQuoteLived(meta, dq.id)) markLived(meta, dq.id)
      // Смерть — конец побега: в следующую попытку жизнь полная и дары
      // прежние, как в Hades. Умер — начал заново, без накопленного.
      app.runHp = null
      app.boons = []
      settleFieldRun(meta, st2, floor)
      app.field = null
      startFieldRun(floor)
    },
    onNext: (nextFloor, st2) => {
      // Запоминаем здоровье ПЕРЕД тем, как комната закончилась: дверь в
      // следующую открывается из последнего кадра боя, а не из экрана.
      if (st2?.player) app.runHp = st2.player.hp
      settleFieldRun(meta, st2, floor)
      app.field = null
      // Этап — это несколько комнат подряд, потом комната владыки (Hades).
      // Маршрут считает отдельная чистая функция: она покрыта тестами, и
      // ошибиться в ней нельзя молча.
      const step = nextStage(stage, room, !!built.boss)
      if (step.kind === 'room') { startFieldRun(floor, 'room', step.room); return }
      if (step.kind === 'boss') { startFieldRun(floor, 'boss', step.room); return }
      if (stage === 'boss') {
        settleFloor(meta, floor)
        app.field = null
        // За седьмым владыкой забег заканчивается. Раньше он не
        // заканчивался вовсе: дар вёл в «чакру 8», которой нет, и мир
        // снова становился первым — игрок крутился по кругу вечно.
        if (isLastFloor(floor)) { showFieldVictory(meta, floor, st2); return }
        showAfterBoss(meta, floor, st2)
        return
      }
      // Лавка ставится ПОСЛЕ владыки (см. showAfterBoss → afterRest), а не
      // здесь: сюда эта ветка не доходила никогда. Маршрут из nextStage
      // даёт либо следующую комнату, либо босса, либо конец — третьего нет,
      // и условие `(nextFloor % 2) === 1` было мёртвым кодом. Монеты
      // копились, а тратить их было негде.
      collectCoins(meta, st2)
      showBoonDraft(nextFloor)
    },
    onClose: (st2) => {
      settleFieldRun(meta, st2, floor)
      app.field = null
      app.runHp = null
      app.runKeepsake = null
      app.boons = []
      showFieldChakra()
    },
  }))
}

/** Этаж пройден: владыка падён — чакра открыта. */
/**
 * ФИНАЛ ЗАБЕГА. Седьмой владыка снят — забег закончен.
 *
 * Раньше этого экрана не было: дар после седьмого владыки вёл в «чакру 8»,
 * которой не существует, и мир снова становился первым. Игрок крутился по
 * кругу вечно, и пройти игру было нельзя.
 *
 * Итог — как побег в Hades: что прошёл, сколько снял, сколько убил,
 * сколько узнал. И два выхода: ещё раз или в Город.
 */
function showFieldVictory(meta, floor, st) {
  const p = st?.player || {}
  const kills = st ? st.foes.filter((f) => f.dead).length : 0
  const pacified = st ? st.pacified : 0
  const time = Math.round(st?.time || 0)
  const peaceful = kills === 0

  meta.stats.victories = (meta.stats.victories || 0) + 1
  if (peaceful) meta.stats.awakened = (meta.stats.awakened || 0) + 1
  meta.fieldFloor = CHAKRAS.length
  saveMeta(meta)

  // Финал отдаёт знание щедро: одна цитата за целый забег — скупо, когда
  // пройдено семь чакр. Здесь — ахимса (или освобождение от статичности)
  // плюс то, что копилось всю дорогу и осталось невыданным.
  const quoteId = peaceful ? 'ahimsa' : 'liberation_from_staticity'
  const q = QUOTES[quoteId] || {}
  markLived(meta, quoteId)
  const given = []
  for (const id of placeQuotes('finale')) {
    if (!QUOTES[id] || isQuoteLived(meta, id)) continue
    markLived(meta, id)
    given.push(id)
  }
  saveMeta(meta)

  const line = (k, v) => h('div', { class: 'win-row' },
    h('span', { class: 'win-k' }, k), h('b', { class: 'win-v' }, v))

  const mm = String(Math.floor(time / 60)).padStart(2, '0')
  const ss = String(time % 60).padStart(2, '0')

  show(h('div', { class: 'screen active node-screen win-screen' },
    h('div', { class: 'node-icon' }, peaceful ? '❖' : '✦'),
    h('div', { class: 'node-title display' },
      peaceful ? 'Вершина Света — без крови' : 'Вершина Света'),
    h('p', { class: 'node-text' },
      peaceful
        ? 'Семь владык снято, и никого не убито. Учение говорит, что высший результат — не перебить чужую жизнь, а снять с неё оковы.'
        : 'Семь владык снято. Но кровь осталась на твоих руках: оковы, которые можно было разрубить, ты рубил.'),
    h('div', { class: 'win-quote' },
      q.quote ? h('p', {}, q.quote) : null,
      q.source ? h('cite', {}, q.source) : null),
    given.length
      ? h('p', { class: 'win-more' },
        `Вершина отдала ${given.length} ещё: ${given.map((id) => QUOTES[id].term).join(' · ')}`)
      : null,
    h('div', { class: 'win-rows' },
      line('время забега', `${mm}:${ss}`),
      line('освобождено', String(pacified)),
      line('убито', String(kills)),
      line('монет', String(meta.coins || 0)),
      line('открыто знаний', String(Object.keys(meta.lived || {}).length)),
    ),
    h('div', { class: 'btn-row mt' },
      h('button', {
        class: 'btn primary',
        onclick: () => { app.runHp = null; app.runKeepsake = null; showFountain() },
      }, 'Ещё раз'),
      h('button', { class: 'btn ghost', onclick: showTitle }, 'В Город')),
  ))
}

function settleFloor(meta, floor) {
  if (!isLastFloor(floor) && (meta.fieldFloor || 0) < floor + 1) meta.fieldFloor = floor + 1
  saveMeta(meta)
}

/** После владыки: покой, потом чередование лавка/дар, потом следующая чакра. */
function showAfterBoss(meta, floor, st) {
  collectCoins(meta, st)
  // Комната покоя — как в Hades после босса: либо здоровье, либо +макс. ХП.
  // Одно из двух, выбор как в остальном — одна карточка из двух.
  showRestRoom(meta, floor, st)
}

/**
 * Что после покоя. В Hades после босса — награда, а лавка попадается в
 * маршруте. Здесь лавка стоит через чакру: монеты копились в забеге, и
 * тратить их было негде — экран лавки был написан, но не вызывался ни разу.
 */
function afterRest(meta, next, st) {
  if (next % 2 === 1) {
    app.fieldShopBought = {}       // новая лавка — товар снова на полке
    showFieldShop(st, next)
    return
  }
  showBoonDraft(next, 'владыка пал — выбери дар')
}

/** Комната покоя: выбрать — лечиться или стать крепче. */
function showRestRoom(meta, floor, st) {
  // Покой — место, которое учит: стоять нужно во всех сферах жизни.
  const rq = QUOTES[placeQuotes('rest')[0]]
  if (rq) markLived(meta, rq.id)
  // Выбор покоя влияет на то, с чем пойдёшь дальше по забегу.
  const run = { hp: st?.player?.hp ?? 0, maxHp: st?.player?.maxHp ?? 60 }
  app.runHp = run.hp
  const next = floor + 1
  const card = (mark, name, desc, buy) => h('button', {
    class: 'boon-card r-rare',
    onclick: () => { buy(); saveMeta(meta); sfx.buy?.(); afterRest(meta, next, st) },
  },
    h('span', { class: 'boon-rar' }, 'покой'),
    h('b', { class: 'boon-name' }, name),
    h('span', { class: 'boon-desc' }, desc),
  )
  show(h('div', { class: 'screen active node-screen' },
    h('div', { class: 'node-icon' }, '☾'),
    h('div', { class: 'node-title display' }, 'Комната покоя'),
    h('p', { class: 'node-text' },
      'Стоять нужно. Одно из двух: восстановиться или стать крепче на всю оставшуюся жизнь.'),
    h('div', { class: 'boon-row' },
      card('♥', 'Ахимса', 'Восстановить всю жизнь.', () => { run.hp = run.maxHp; app.runHp = run.maxHp }),
      card('✚', 'Тapa', 'Максимум жизни +6 — навсегда.', () => { run.maxHp += 6; meta.hpBonus = (meta.hpBonus || 0) + 6 }),
    ),
  ))
}


// Итоги локации засчитываются в мету один раз: и владыки в город,
// и следующая чакра открывается только за чистый путь.
function settleFieldRun(meta, st, floor) {
  if (st.__settled) return
  st.__settled = true
  // Очки севы — постоянная валюта мастерской (Nine Sols: 拜 → мастерская).
  const pts = sevaPointsFor(st)
  meta.sevaPoints = (meta.sevaPoints || 0) + pts
  for (const f of st.foes) {
    if (f.pacified) {
      markSeen(meta, 'enemies', f.id)
      meta.stats.pacified += 1
      if (f.isBoss) {
        meta.stats.awakened += 1
        const list = meta.pacifiedBosses || (meta.pacifiedBosses = [])
        if (!list.includes(f.name)) list.push(f.name)
      }
    } else if (f.dead) {
      markSeen(meta, 'enemies', f.id)
      meta.stats.kills += 1
    }
  }
  // Монеты собираются даже при смерти — как в Hades: драхма остаётся.
  collectCoins(meta, st)
  // Следующая чакра — только если все оковы сняты терпением.
  if (st.foes.every((f) => f.pacified) && !isLastFloor(floor)) {
    if ((meta.fieldFloor || 0) < floor + 1) meta.fieldFloor = floor + 1
  }
  meta.deathsInRow = st.player.alive ? 0 : (meta.deathsInRow || 0) + 1
  recordRunEnd(meta, st.player.alive ? 'victory' : 'death', {
    floor, pacified: st.pacified, kills: st.foes.filter((f) => f.dead).length,
  })
  saveMeta(meta)
}

function showFocus() {
  const vs = varnaState(app.meta)
  show(h('div', { class: 'screen active node-screen' },
    h('div', { class: 'node-icon' }, 'ॐ'),
    h('div', { class: 'node-title display' }, 'Фокус ума'),
    h('p', { class: 'node-text' }, 'Какую ментальность вы тренируете в этой жизни? Варны — не классы и не «класс души», а психология ума (Human Society Part 2). Все четыре развиваются параллельно — слабая ментальность означает недостающий навык.'),
    h('div', { class: 'choices' },
      MENTALITY_ORDER.map((id) => {
        const m = MENTALITIES[id]
        const lv = vs.levels[id]
        return h('div', {
          class: 'choice',
          onclick: () => beginRun(id),
        },
          h('div', { class: 'c-main' }, `${m.name} · ${m.sanskrit} · ур. ${lv}`),
          h('div', { class: 'c-sub' }, m.focusDesc))
      })),
  ))
}

function beginRun(focusId) {
  app.run = createRun({ meta: app.meta, options: { focus: focusId } })
  // Отладочный доступ к забегу из консоли (как у поля). Нужен стенду,
  // чтобы доводить карточный забег до конца: без него экраны этого пути
  // нечем проверять. На игру не влияет.
  if (typeof window !== 'undefined') window.__run = app.run
  // Самскара прошлой жизни (§5/§10): смерть конструирует следующего тебя
  const nl = app.meta.nextLife
  if (nl) {
    const g = app.run.gunaStart
    if (nl === 'sattva') app.run.gunaStart = { ...g, s: g.s + 1 }
    else if (nl === 'prana') app.run.prana += 5
    else if (nl === 'knowledge') unlockRandomQuote()
    app.meta.nextLife = null
  }
  markSeenMany('cards', app.run.deck)
  // Сад Знания (соцслой, локально): прожитое знание помогает в следующей жизни —
  // цветущий сад даёт +саттву к старту забега (Outer Wilds: прогресс = знание).
  const gBonus = gardenState(app.meta).stage.bonus
  if (gBonus > 0) {
    const g = app.run.gunaStart
    app.run.gunaStart = { ...g, s: g.s + gBonus }
    toast(`Сад Знания цветёт: +${gBonus} саттва к началу этой жизни`, 'hl')
  }
  // «Свет в Городе» (§14.1): благословение успокоенных владык-учителей —
  // +1 саттва за каждого поговорившего учителя (милость, как сад, но из Города).
  const cBonus = cityBlessingBonus(app.meta)
  if (cBonus > 0) {
    const g = app.run.gunaStart
    app.run.gunaStart = { ...g, s: g.s + cBonus }
    toast(`Учителя города благословляют: +${cBonus} саттва к началу этой жизни`, 'hl')
  }
  // открываем врагов заранее в этом забеге нельзя — откроются при встрече
  // Сострадательный дизайн (§исследование): после трёх смертей подряд Путь мягче
  if ((app.meta.deathsInRow || 0) >= 3) {
    const g = app.run.gunaStart
    app.run.gunaStart = { ...g, s: g.s + 1 }
    toast('Ум устал — Путь стал мягче: +1 саттва (перерождение после трёх смертей)')
  }
  showMap()
}

const NODE_GLYPH = { combat: '⚔', elite: '⚔', meditate: 'ॐ', event: '✧', relic: '❖', memory: '◈', trial: '✊', boss: '◉' }
const NODE_LABEL = { combat: 'бой', elite: 'элита', meditate: 'медитация', event: 'событие', relic: 'реликвия', memory: 'воспоминание', trial: 'испытание', boss: 'владыка' }

function showMap() {
  const run = app.run
  if (!run) return showTitle()
  const floor = run.floor
  const chakra = CHAKRAS[Math.min(floor, CHAKRAS.length - 1)]
  const biome = Math.min(floor, CHAKRAS.length - 1)

  // Призраки прошлых жизней (§10.3): последняя смерть на этаже оставляет урок
  const deathsByFloor = {}
  for (const d of (app.meta.deathLog || [])) deathsByFloor[d.floor] = d

  // ── локация этой чакры: цели на карте, дорога между ними ─────────────
  // (в % от сцены: вход внизу, владыка далеко вверху — «мир как в Героях»)
  const POS = [
    { i: 0, x: 28, y: 62 },   // бой / элита
    { i: 1, x: 72, y: 68 },   // второй узел (медитация/событие/реликвия/воспоминание/испытание)
    { i: 2, x: 50, y: 13 },   // владыка чакры
  ]
  const START = { x: 50, y: 90 }

  const sceneEl = h('div', { class: 'world-scene' })
  const sunEl = h('div', { class: 'world-sun' })
  const road = h('svg', { class: 'w-road', viewBox: '0 0 100 100', preserveAspectRatio: 'none' },
    h('path', {
      d: 'M50 96 C 40 86, 22 76, 28 62 C 32 52, 62 74, 72 68 C 80 63, 60 40, 50 13',
      fill: 'none', stroke: 'rgba(242,196,109,0.32)', 'stroke-width': 1.6, 'stroke-dasharray': '2 3',
    }))
  const decor = []
  for (let k = 0; k < 6; k++) {
    const dx = Math.round((0.05 + Math.random() * 0.9) * 100)
    const dy = Math.round((0.06 + Math.random() * 0.9) * 100)
    decor.push(h('div', { class: `w-dec w-dec-${k % 3}`, style: `left:${dx}%;top:${dy}%` }))
  }
  const worldEl = h('div', { class: `world world-map biome-${biome}` }, sceneEl, sunEl, road, ...decor)
  const sadhu = sadhuEl()
  worldEl.append(sadhu)
  const entrance = h('div', { class: 'w-entrance', style: `left:${START.x}%;top:${START.y}%` }, 'ты здесь')
  worldEl.append(entrance)

  // Подсказка первого входа
  run._worldHinted = run._worldHinted || false
  const showHint = !run._worldHinted
  let hintEl = null
  if (showHint) {
    hintEl = h('div', { class: 'w-hint' },
      h('span', {}, 'Перед тобой — земля этой чакры. Тапни в любую точку — садхака пойдёт туда. Подойди к светящейся цели или к мерцающему ✦ — и произойдёт встреча.'),
      h('button', { class: 'btn ghost small w-hint-ok', onclick: () => { run._worldHinted = true; hintEl.remove() } }, 'Понятно'))
  }

  // Цели на карте: бой, второй узел, владыка
  const objs = {}
  const curNodes = run.floors[floor]
  POS.forEach((p) => {
    const node = curNodes && curNodes[p.i]
    if (!node) return
    const done = isNodeDone(run, p.i)
    const available = !done
    const isBoss = node.type === 'boss'
    const mk = h('div', {
      class: `w-node w-obj ${isBoss ? 'boss' : ''} ${done ? 'done' : ''} ${available ? 'available' : ''}`,
      style: `left:${p.x}%;top:${p.y}%`,
      onclick: available ? () => walkToObj(p.i) : null,
    },
      h('span', { class: 'w-glyph' }, NODE_GLYPH[node.type]),
      h('span', { class: 'w-label' }, NODE_LABEL[node.type]))
    objs[p.i] = { el: mk, x: p.x, y: p.y, available }
    worldEl.append(mk)
  })

  const ghost = deathsByFloor[floor]
  if (ghost) {
    const g = h('div', { class: 'ghost w-ghost', style: 'left:12%;top:46%', onclick: () => showGhostLesson(ghost) }, '👻')
    worldEl.append(g)
  }

  // Спрятанные слоги — по углам локации
  run._found = run._found || {}
  const sparkles = []
  const SPARK_XY = [{ x: 6, y: 30 }, { x: 94, y: 42 }, { x: 50, y: 84 }]
  const sparkCount = 1 + (Math.random() < 0.6 ? 1 : 0)
  for (let k = 0; k < sparkCount; k++) {
    const key = floor + '_' + k
    const pos = SPARK_XY[k % SPARK_XY.length]
    const sp = h('div', {
      class: `w-spark ${run._found[key] ? 'found' : ''}`,
      style: `left:${pos.x}%;top:${pos.y}%`,
      onclick: () => findSparkle(key, sp),
    }, '✦')
    sparkles.push(sp)
    worldEl.append(sp)
  }

  show(h('div', { class: 'screen active map-screen' },
    h('div', { class: 'btn-row', style: 'justify-content:space-between' },
      h('button', { class: 'btn ghost small', onclick: showTitle }, '← Город'),
      h('button', { class: 'btn ghost small', onclick: showWorldLore }, '📜 о мире')),
    h('div', { class: 'display chakra-title mt' }, chakra),
    h('div', { class: 'chakra-sub' }, 'восхождение'),
    h('div', { class: 'run-bar' },
      // Раньше здесь была строка с HTML внутри: игрок видел на экране
      // «ХП <span class="gold">70</span>» буквально. Значение и подпись —
      // два разных элемента.
      h('div', { class: 'chip' }, 'ХП ', h('b', { class: 'gold' }, String(run.hp))),
      h('div', { class: 'chip' }, 'Прана ', h('b', { class: 'gold' }, String(run.prana))),
      h('div', { class: 'chip' }, 'колода ', h('b', { class: 'gold' }, String(run.deck.length))),
      h('div', { class: 'chip' }, 'реликвии ', h('b', { class: 'gold' }, String(run.relics.length)))),
    hintEl,
    worldEl,
    runSynergiesLine(run),
    run.relics.length > 0 ? h('div', { class: 'hint center mt' }, 'реликвии: ' + run.relics.map((r) => RELICS[r].name).join(' · ')) : null,
    run.boons && run.boons.length > 0 ? h('div', { class: 'hint center mt', style: 'color:var(--gold-soft)' }, '✦ дары: ' + run.boons.map((b) => BOONS[b] ? BOONS[b].name : b).join(' · ')) : null,
  ))

  // после монтирования: садхака у входа в локацию
  requestAnimationFrame(() => {
    const wr = worldEl.getBoundingClientRect()
    sadhu.style.left = (wr.width * START.x / 100 - sadhu.offsetWidth / 2) + 'px'
    sadhu.style.top = (wr.height * START.y / 100 - sadhu.offsetHeight) + 'px'
  })

  // свободная ходьба по карте: тап по любой точке — садхака идёт; подошёл к цели — встреча
  worldEl.addEventListener('click', (e) => {
    if (app._walkBusy) return
    if (e.target.closest('.w-obj') || e.target.closest('.w-spark')) return
    const wr = worldEl.getBoundingClientRect()
    const px = e.clientX - wr.left
    const py = e.clientY - wr.top
    walkToPoint(px, py, () => maybeEnterNearby(px, py))
  })

  function objCenter(i) {
    const o = objs[i]
    if (!o) return null
    const wr = worldEl.getBoundingClientRect()
    return { x: wr.width * o.x / 100, y: wr.height * o.y / 100 }
  }

  function walkToPoint(px, py, then) {
    if (app._walkBusy) return
    app._walkBusy = true
    sadhu.style.left = (px - sadhu.offsetWidth / 2) + 'px'
    sadhu.style.top = (py - sadhu.offsetHeight) + 'px'
    setTimeout(() => { app._walkBusy = false; if (then) then() }, 480)
  }

  function walkToObj(i) {
    if (app._walkBusy) return
    run._worldHinted = true
    if (hintEl) hintEl.remove()
    const p = objCenter(i)
    if (!p) return enterNode(i)
    walkToPoint(p.x, p.y, () => enterNode(i))
  }

  function maybeEnterNearby(px, py) {
    for (const key in objs) {
      const o = objs[key]
      if (!o.available) continue
      const p = objCenter(Number(key))
      if (p && Math.hypot(px - p.x, py - p.y) < 48) {
        run._worldHinted = true
        if (hintEl) hintEl.remove()
        enterNode(Number(key))
        return
      }
    }
  }
}

// Спрятанный слог: открывает цитату или даёт Прану (уже открытый — награда поменьше).
function findSparkle(key, sp) {
  const run = app.run
  if (!run) return
  if (run._found[key]) return
  run._found[key] = true
  const qid = unlockRandomQuote()
  if (qid && QUOTES[qid]) {
    sfx.unlock()
    toast(`Ты нашёл слог мудрости: «${QUOTES[qid].term}» — ${QUOTES[qid].meaning}. Знание в Грантхе.`, 'hl')
  } else {
    run.prana += 2
    sfx.peace()
    toast('Слог уже раскрыт — Прана +2.', 'good')
  }
  sp.classList.add('found')
  saveMeta(app.meta)
}

// Фигурка садхаки в охряной робе: стоит на месте силы, качается на ходу.
function sadhuEl() {
  return h('div', { class: 'sadhu' },
    h('div', { class: 'sadhu-shadow' }),
    h('div', { class: 'sadhu-body' }))
}

// Поставить садхаку «ногами» в центр маркера (или в центр, если foot=false).
function placeSadhu(sadhu, target, containerRect) {
  const tr = target.getBoundingClientRect()
  const x = tr.left - containerRect.left + tr.width / 2 - sadhu.offsetWidth / 2
  const y = tr.top - containerRect.top + tr.height / 2 - sadhu.offsetHeight
  sadhu.style.left = x + 'px'
  sadhu.style.top = y + 'px'
}

// ─────────────────────────────────────────────────────────────
// Лор мира (§16.2a): «скрижаль» чакры — земля, что она держит, чему учит.
// Глубокая правда (deeper) открывается, когда владыка успокоен — знание как ключ.
// ─────────────────────────────────────────────────────────────

function showWorldLore() {
  const run = app.run
  if (!run) return showTitle()
  const w = Object.values(WORLDS).find((x) => x.floor === run.floor) || Object.values(WORLDS)[0]
  const lord = w && w.lordId && ENEMIES[w.lordId] ? ENEMIES[w.lordId] : null
  const pacified = lord ? (app.meta.pacifiedBosses || []).includes(lord.name) : false
  const biome = Math.min(run.floor, 6)

  const elementChip = h('div', { class: 'w-elements' },
    h('div', { class: 'w-el' }, `${w.elementIcon} ${w.element}`),
    h('div', { class: 'w-el' }, `◈ ${w.vrttis}`))

  const deeper = pacified && w.deeper
    ? h('div', { class: 'w-deeper fade-in' },
        h('div', { class: 'w-deeper-lbl' }, `освобождённый владыка · ${lord.name}`),
        h('p', { class: 'w-deeper-text' }, `«${w.deeper}»`),
        quoteBox(lord.quoteId, { revealed: true }))
    : h('div', { class: 'hint center', style: 'font-size:12px' },
        `Владыка ${lord ? lord.name : ''} ещё держит этот мир. Успокойте его — и он откроет тайну (ахимса — единственный ключ).`)

  const pathIntro = run.floor === 0 && WORLD_PATH
    ? h('div', { class: 'panel mt w-path' },
        h('div', { class: 'hint', style: 'font-weight:800;color:var(--gold-soft);font-size:12px' }, WORLD_PATH.title),
        h('p', { class: 'hint mt' }, WORLD_PATH.intro))
    : null

  show(h('div', { class: 'screen active comp-screen' },
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn ghost small', onclick: showMap }, '← Путь'),
      h('div', { class: 'display chakra-title', style: 'flex:1;text-align:center' }, w.chakra)),
    h('div', { class: 'chakra-sub' }, `${w.name} · ${w.sanskrit}`),
    h('div', { class: `world world-mini biome-${biome}` },
      h('div', { class: 'world-scene' }),
      h('div', { class: 'world-sun' }),
      h('div', { class: 'world-mini-title' }, `${w.elementIcon} ${w.name}`)),
    h('p', { class: 'node-text center mt' }, w.land),
    elementChip,
    h('div', { class: 'panel mt' },
      h('div', { class: 'w-block-lbl' }, 'что держит этот мир'),
      h('p', { class: 'hint mt' }, w.hold)),
    h('div', { class: 'panel mt' },
      h('div', { class: 'w-block-lbl' }, 'чему учит'),
      h('p', { class: 'hint mt' }, w.teach)),
    deeper,
    pathIntro,
    h('p', { class: 'hint center mt', style: 'font-size:11px;font-style:italic' }, w.cosmos),
  ))
}

// «След мудреца» на пути: знание не умирает — оно передаётся дальше. Показываем
// открытую цитату (детерминированно от этажа) как наставление, аналог «призраков».
function sageTrace(run) {
  const unlocked = Object.keys(app.meta.quotesUnlocked || {}).filter((id) => QUOTES[id])
  if (unlocked.length === 0) return null
  const id = unlocked[run.floor % unlocked.length]
  const q = QUOTES[id]
  if (!q) return null
  return h('div', { class: 'hint center mt', style: 'font-style:italic;color:var(--muted)' }, `«${q.quote}»`)
}

// Призрак прошлой жизни (§10.3): клик открывает цитату врага, от которого пал —
// знание пережило смерть, теперь его можно прожить (освободить, не убивая).
function showGhostLesson(d) {
  const qid = d.killedById && ENEMIES[d.killedById] ? ENEMIES[d.killedById].quoteId : null
  if (qid && QUOTES[qid]) {
    showQuote(qid)
    return
  }
  toast('Смерть — не потеря: непрожитое знание ждёт в Грантхе.')
}

// Потоки-«школы ума» (§8.5) на карте забега: видно, какие синергии уже собраны.
function runSynergiesLine(run) {
  const s = computeSynergies(run.deck, CARDS)
  const names = []
  if (s.ahimsa) names.push('☯ ахимса')
  if (s.kiirtana) names.push('◉ кииртан')
  if (s.yama) names.push('🕉 яма')
  if (s.seva) names.push('✋ сева')
  if (names.length === 0) return null
  return h('div', { class: 'hint center mt' }, 'потоки: ' + names.join(' · '))
}

// Четыре лепестка чакры (§5.3): Кама → Артха → Дхарма → Мокша. Проходя узлы этажа,
// садхака «проходит лепестки», но не оседает — идёт вверх. Лепестки зажигаются
// пройденными узлами; Мокша — после освобождения владыки.
function petalsBlock(run) {
  const doneCount = run.done[run.floor] ? run.done[run.floor].filter(Boolean).length : 0
  const petals = LEPESTKI.map((name, i) => {
    const on = i < LEPESTKI.length - 1 ? doneCount >= i + 1 : floorComplete(run)
    return h('div', { class: `petal ${on ? 'on' : ''}` },
      h('span', { class: 'p-glyph' }, '❀'),
      h('span', { class: 'p-name' }, name))
  })
  return h('div', { class: 'petals-wrap' },
    h('div', { class: 'petals' }, petals),
    h('div', { class: 'petals-hint' }, 'не оседай ни в одном лепестке — иди вверх'))
}

function enterNode(i) {
  const run = app.run
  run.nodeIndex = i
  const node = currentNode(run)
  if (node.type === 'combat' || node.type === 'elite' || node.type === 'boss') {
    enterCombat()
  } else if (node.type === 'meditate') {
    showMeditation()
  } else if (node.type === 'event') {
    showEvent()
  } else if (node.type === 'relic') {
    showRelic()
  } else if (node.type === 'memory') {
    showMemory()
  } else if (node.type === 'trial') {
    const t = node.trialId && TRIALS[node.trialId] ? TRIALS[node.trialId] : null
    toast(t ? `Испытание ${t.name}: ${t.desc}` : 'Испытание: соблюдите правило боя.')
    enterCombat()
  }
}

// SRS-узел «Воспоминание» (§исследование): интерливинг — повторяем уже открытые
// термины из разных семейств (эффект тестирования + кривая забывания). Добровольно:
// игрок, которому не до повторения, просто идёт мимо. Узел никогда не блокирует путь.
function showMemory() {
  const run = app.run
  const unlocked = Object.keys(app.meta.quotesUnlocked || {}).filter((id) => QUOTES[id])
  if (unlocked.length === 0) {
    toast('Откройте цитаты в бою — возвращайтесь «вспоминать» их здесь')
    markNodeDone(run)
    afterNode()
    return
  }
  // SRS (§исследование): сначала — самые «забытые» термины (старейший последний recall)
  const recalled = app.meta.recalled || {}
  const picked = unlocked.sort((a, b) => (recalled[a] || 0) - (recalled[b] || 0)).slice(0, 2)
  let qi = 0
  let score = 0

  const qEl = h('div', { class: 'node-title display' }, 'Воспоминание')
  const textEl = h('p', { class: 'node-text' })
  const optsEl = h('div', { class: 'choices' })
  const scoreEl = h('div', { class: 'hint center mt' })
  const doneBtn = h('button', { class: 'btn primary mt', style: 'display:none', onclick: reward }, 'Забрать награду')

  function ask() {
    if (qi >= picked.length) {
      textEl.textContent = score > 0
        ? `Память укреплена: ${score} Праны.`
        : 'Память укрепилась даже без правильных ответов — важно вспоминать.'
      scoreEl.textContent = `верно: ${score / 4} из ${picked.length}`
      doneBtn.style.display = 'block'
      mount(optsEl)
      return
    }
    const q = QUOTES[picked[qi]]
    const options = recallOptions(q)
    textEl.textContent = `«${q.term}» — это…`
    mount(optsEl, options.map((opt) =>
      h('div', { class: 'choice', onclick: () => answer(opt) },
        h('div', { class: 'c-main' }, opt.text))))
  }

  function answer(opt) {
    if (opt.correct) { score += 4; sfx.unlock(); haptics.notify('success') } else { sfx.play() }
    qi += 1
    scoreEl.textContent = `вспомнено: ${qi}/${picked.length}`
    ask()
  }

  function reward() {
    run.prana += score
    if (score >= 4) unlockRandomQuote() // верно вспомнил хотя бы один — знание растёт
    saveMeta(app.meta)
    sfx.peace()
    markNodeDone(run)
    afterNode()
  }

  show(h('div', { class: 'screen active node-screen' },
    qEl,
    h('div', { class: 'chakra-sub' }, 'садхана вспоминает'),
    textEl,
    optsEl,
    scoreEl,
    doneBtn))
  ask()
}

// ─────────────────────────────────────────────────────────────
// Бой
// ─────────────────────────────────────────────────────────────

function enterCombat() {
  const run = app.run
  // враг узла фиксируется при входе: markSeen и бой должны совпадать
  const node = currentNode(run)
  if (!node.enemyId) node.enemyId = currentEnemyId(run)
  markSeen(app.meta, 'enemies', node.enemyId)
  // «Мир помнит» (§исследование, Undertale): счётчик встреч в прошлых жизнях
  app.meta.encounters = app.meta.encounters || {}
  app.meta.encounters[node.enemyId] = (app.meta.encounters[node.enemyId] || 0) + 1
  saveMeta(app.meta)
  app.combat = startCombatAtNode(run)
  // Отладочный доступ к бою из консоли (как у поля). Нужен стенду, чтобы
  // доводить карточный забег до финала. На игру не влияет.
  if (typeof window !== 'undefined') window.__combat = app.combat
  show(combatScreen(app))
}

function onCombatEnd(combat) {
  // Бой окончен — отладочная ссылка тоже должна погаснуть, иначе стенд
  // (и консоль) продолжают «видеть» бой, которого уже нет.
  if (typeof window !== 'undefined') window.__combat = null
  const run = app.run
  const node = currentNode(run)
  const isFinalBoss = node.type === 'boss' && run.floor === run.floors.length - 1
  const result = finishCombat(run, combat)

  // Вызов учителя (§дофамин): условие исполнено в этом бою? Награда — редкая карта.
  if (!result.dead && run.challenge && challengeFulfilled(run, combat)) {
    const rewardId = run.challenge.rewardCard
    if (rewardId && CARDS[rewardId]) {
      takeCardReward(run, rewardId)
      app.trialUnlockToast = `Вызов исполнен: учитель дарит карту «${CARDS[rewardId].name}».`
      sfx.unlock()
    }
    run.challenge = null
  } else if (!result.dead && run.challenge) {
    run.challenge = null
    app.trialUnlockToast = 'Вызов учителя не исполнен: дисциплина требует усилия. Учитель ушёл.'
  }

  // «Наставник» после боя (образование через инсайт): закрываем момент термином
  app.lastCombat = {
    name: combat.enemies[0] ? combat.enemies[0].name : '',
    isBoss: node.type === 'boss',
    pacified: combat.pacified > 0,
    quoteId: (combat.enemies[0] && combat.enemies[0].def && combat.enemies[0].def.quoteId) || 'ahimsa',
  }

  // «Живые цитаты» (§исследование): сыгранная карта = прожитый термин
  if (combat.playedCards && combat.playedCards.length > 0) {
    app.meta.lived = app.meta.lived || {}
    for (const cid of combat.playedCards) {
      const qid = CARDS[cid] && CARDS[cid].quoteId
      if (qid && !app.meta.lived[qid]) app.meta.lived[qid] = true
      // Аудиотека практики (§16.2): сыгранная звуковая карта записывает звук
      const sid = soundForCard(cid)
      if (recordSound(app.meta, sid)) {
        const snd = AUDIO_LIBRARY[sid]
        app.audioRecordedToast = snd ? `Записан звук: ${snd.emoji} ${snd.name}` : null
        sfx.unlock()
      }
    }
  }
  // Раскрываемость: успокоенный враг = знание о нём прожито. Убийство НЕ раскрывает —
  // окову понимают через ненасилие (ахимса = мирный путь, Undertale-логика).
  for (const e of combat.enemies || []) {
    if (e.pacified && e.def && e.def.quoteId) markLived(app.meta, e.def.quoteId)
  }

  // якоря
  for (const a of combat.anchors) addAnchor(app.meta, a)
  // «Сильный якорь» (§11): якорь, на котором забег устоял до победы — особая метка
  if (combat.anchors.length > 0 && !result.dead) {
    const diary = app.meta.practiceDiary
    const last = diary[diary.length - 1]
    if (last) last.strong = true
  }

  // ежедневный вызов (§16.2): прогресс по метрикам боя
  trackDaily(combat, node.type === 'boss')

  // Четыре ментальности ума (§12, Human Society Part 2): очки растут ПАРАЛЛЕЛЬНО
  // от разных поступков. Освобождение (смелость НЕ убивать) питает кшатрию.
  if (combat.pacified > 0) {
    const gained = combat.bossPacified ? 2 : 1
    const lv = gainMentality('kshatriya', gained, { silent: true })
    if (lv.leveled) app.varnaLevel = lv
  }

  // «Учителя города» (§14.1, Undertale: враг → друг): успокоенные владыки остаются в Городе
  if (combat.bossPacified && combat.enemies[0] && combat.enemies[0].def) {
    const name = combat.enemies[0].def.name
    const list = app.meta.pacifiedBosses || (app.meta.pacifiedBosses = [])
    if (!list.includes(name)) list.push(name)
  }

  if (result.dead) {
    recordRunEnd(app.meta, 'death', { floor: run.floor, pacified: combat.pacified, kills: combat.kills })
    app.meta.stats.kills += combat.kills
    app.meta.stats.pacified += combat.pacified
    // Призрак прошлой жизни (§10.3): место падения оставляет урок на карте пути
    recordDeath(app.meta, { floor: run.floor, killedBy: result.killedBy, killedById: result.killedById })
    // Сострадательный дизайн (§исследование, God Mode Hades): усталый ум не ломается
    app.meta.deathsInRow = (app.meta.deathsInRow || 0) + 1
    saveMeta(app.meta)
    showDeath(result)
    return
  }
  app.meta.deathsInRow = 0

  app.meta.stats.pacified += combat.pacified
  app.meta.stats.kills += combat.kills
  if (result.knowledge > 0) unlockRandomQuote()
  // Дерево Ямы/Ниямы (§16.2): пройденное испытание открывает карту навсегда
  if (result.trialReward) {
    if (unlockCard(app.meta, result.trialReward)) {
      markSeen(app.meta, 'cards', result.trialReward)
      const c = CARDS[result.trialReward]
      app.trialUnlockToast = c ? `Карта открыта: ${c.name} — она теперь в наградах` : null
      sfx.unlock()
    }
  }
  // §9.2: мирное освобождение дарит «память»-реликвию
  if (result.relic) {
    gainRelic(run, result.relic)
    markSeen(app.meta, 'relics', result.relic)
    if (RELICS[result.relic]) markLived(app.meta, RELICS[result.relic].quoteId)
  }

  if (isFinalBoss) {
    recordRunEnd(app.meta, run.outcome === 'awakening' ? 'awakening' : 'victory', { floor: run.floor, pacified: combat.pacified, kills: combat.kills })
    if (run.bossPacified) app.meta.stats.awakened += 1
    app.meta.bestRun = { pacified: app.meta.stats.pacified, awakened: run.bossPacified, date: Date.now() }
    saveMeta(app.meta)
    showVictory(run.outcome)
    return
  }

  saveMeta(app.meta)
  // Дары чакры (§16.2): генерируем 3 случайных дара для выбора после боя.
  result.boonChoices = rollBoonChoices(run, run.rand)
  app.lastReward = result
  showRewards(result)
  if (app.trialUnlockToast) {
    toast(app.trialUnlockToast, 'hl')
    app.trialUnlockToast = null
  }
  if (app.audioRecordedToast) {
    toast(app.audioRecordedToast, 'hl')
    app.audioRecordedToast = null
  }
}

// Ежедневный вызов: прогресс по итогам боя. isBoss — бой с владыкой чакры.
function trackDaily(combat, isBoss) {
  if (combat.pacified > 0) progressDaily(app.meta, 'pacify', combat.pacified)
  if (combat.player.inSamadhi) progressDaily(app.meta, 'samadhi', 1)
  if (combat.player.prama) progressDaily(app.meta, 'prama', 1)
  if (combat.kiirtanaPlayed > 0) progressDaily(app.meta, 'kiirtana', combat.kiirtanaPlayed)
  if (isBoss && combat.bossPacified) progressDaily(app.meta, 'boss_pacify', 1)
}

// ─────────────────────────────────────────────────────────────
// Награды после боя
// ─────────────────────────────────────────────────────────────

function showRewards(result) {
  const run = app.run

  show(h('div', { class: 'screen active node-screen' },
    h('div', { class: 'node-icon' }, result.pacified ? '🕊️' : '⚔'),
    h('div', { class: 'node-title display' }, result.pacified ? 'Освобождение' : 'Победа'),
    trialLine(result),
    h('p', { class: 'node-text' },
      result.pacified
        ? 'Враг распался в свет. Вы не убили — вы освободили. Так оковы становятся учителями.'
        : 'Враг повержен. Но помните: сила порождает силу — самскара вернётся.'),
    mentorLine(app.lastCombat),

    h('div', { class: 'panel' },
      h('div', { class: 'row between' },
        h('span', { class: 'hint' }, 'Прана'),
        h('span', { style: 'color:var(--gold-soft);font-weight:800' }, `+${result.prana}`)),
    result.pacified ? h('div', { class: 'row between mt' },
      h('span', { class: 'hint' }, 'Саттва · Знание'),
      h('span', { style: 'color:var(--sat);font-weight:800' }, '+3 · +1')) : null,

    result.relic ? h('div', { class: 'hint mt', style: 'text-align:center' },
      `Память: <b>${RELICS[result.relic].name}</b> — ${RELICS[result.relic].desc}`) : null,
    ),

    result.trialReward ? h('div', { class: 'hint center mt', style: 'color:var(--sat);font-weight:700' },
      `Дерево: карта «${CARDS[result.trialReward]?.name || result.trialReward}» открыта навсегда`) : null,

    result.pacified ? quoteBox((app.lastCombat && app.lastCombat.quoteId) || 'ahimsa') : null,

    varnaLevelLine(),

    // Дары чакры (§16.2, Hades-style boons): после боя — выбор 1 из 3 даров.
    // Дары комбинируются между собой — каждый забег уникален.
    h('div', { class: 'hint center', style: 'color:var(--gold-soft);font-weight:700;margin-top:12px' }, '✦ Дары чакры — выберите один'),
    h('div', { class: 'reward-cards' },
      (result.boonChoices || []).map((id) => {
        const b = BOONS[id]
        if (!b) return null
        return h('div', {
          class: 'card boon-card',
          onclick: () => pickBoon(id),
        },
          h('div', { class: 'card-name', style: 'color:var(--gold-soft)' }, b.name),
          h('div', { class: 'card-sanskrit' }, b.sanskrit),
          h('div', { class: 'card-desc' }, b.desc),
          h('div', { class: 'card-rarity' }, b.rarity === 'rare' ? '✦ редкий' : b.rarity === 'uncommon' ? '✧ необычный' : '○ обычный'),
        )
      })),
    h('div', { class: 'hint center' }, 'Выберите карту в колоду (ум)'),
    h('div', { class: 'reward-cards' },
      result.cardChoices.map((id) => cardEl(CARDS[id], { onPlay: () => pickRewardCard(id), glow: CARDS[id].rarity === 'rare', hint: rewardSynergyHint(id) }))),
  ))
}

// Выбор дара чакры (§16.2): добавляет дар в забег. Дары применяются движком
// через opts.boons при следующем createCombat (см. run.startCombatAtNode).
function pickBoon(id) {
  const run = app.run
  if (!run || !BOONS[id]) return
  if (!run.boons.includes(id)) {
    run.boons.push(id)
    markSeen(app.meta, 'boons', id)
    // Цитата открывается, только если она реально есть в Грантхе (не все
    // термины имеют карточку — не пишем «прожито» в пустоту).
    if (quoteById(BOONS[id].quoteId)) markLived(app.meta, BOONS[id].quoteId)
    sfx.unlock()
    toast(`Дар получен: ${BOONS[id].name}`, 'hl')
  }
  // Перерисовываем экран наград из сохранённого результата боя (finishCombat
  // уже отработал в onCombatEnd — второй раз его звать нельзя).
  const res = app.lastReward
  if (res) {
    res.boonChoices = (res.boonChoices || []).filter((b) => b !== id)
    showRewards(res)
  }
}

// Подсказка синергии при выборе карты (§дофамин): если карта приближает/добирает
// поток ума (ахимса/кииртан/яма/служение) — показать «в колоде уже X из N»,
// чтобы сбор синергий был осознанным и вкусным (как Balatro-подсказки).
function rewardSynergyHint(cardId) {
  const run = app.run
  if (!run) return null
  const deck = run.deck || []
  const c = CARDS[cardId]
  if (!c) return null
  const counts = { ahimsa: 0, kiirtana: 0, practice: 0, seva: 0 }
  for (const id of [...deck, cardId]) {
    const cc = CARDS[id]
    if (!cc) continue
    if (cc.id === 'ahimsa' || (cc.tags && cc.tags.includes('pacify'))) counts.ahimsa++
    if (cc.type === 'kiirtana') counts.kiirtana++
    if (cc.type === 'practice') counts.practice++
    if (cc.type === 'seva') counts.seva++
  }
  const hints = []
  if (counts.ahimsa >= 3) hints.push('☯ поток ахимсы')
  else if (counts.ahimsa >= 2) hints.push(`☯ ахимса ${counts.ahimsa}/3`)
  if (counts.kiirtana >= 3) hints.push('◉ поток кииртана')
  else if (counts.kiirtana >= 2) hints.push(`◉ кииртан ${counts.kiirtana}/3`)
  if (counts.practice >= 4) hints.push('🕉 поток ямы')
  else if (counts.practice >= 3) hints.push(`🕉 яма ${counts.practice}/4`)
  if (counts.seva >= 3) hints.push('✋ поток служения')
  else if (counts.seva >= 2) hints.push(`✋ сева ${counts.seva}/3`)
  return hints.length > 0 ? `в колоде уже: ${hints.join(' · ')}` : null
}

// Результат испытания Ямы/Ниямы (узел «Испытание»): правило дисциплины соблюдено?
function trialLine(result) {
  if (!result || result.trialPassed === undefined) return null
  const node = currentNode(app.run)
  const t = node && node.trialId && TRIALS[node.trialId] ? TRIALS[node.trialId] : null
  const trialName = t ? `${t.name} · ${t.sanskrit}` : 'Испытание'
  return h('div', { class: 'hint center', style: 'color:var(--sat);font-weight:700' },
    result.trialPassed
      ? `✓ ${trialName} пройдено: правило соблюдено.`
      : `✗ ${trialName} нарушено. Дисциплина — следующая ступень.`)
}

// Строка наставника после боя: закрываем момент инсайта именем термина (идея §10/§15).
function mentorLine(info) {
  if (!info) return null
  const { name, isBoss, pacified } = info
  let text
  if (isBoss) {
    text = pacified
      ? `Наставник: «Ты освободил ${name}, а не убил. На санскрите это зовётся ахимсой.»`
      : `Наставник: «Сила родила силу: ${name} вернётся сильнее. Истинный путь — успокоение.»`
  } else {
    text = pacified
      ? `Наставник: «Освободить — значит понять: ${name} прошёл насквозь и растворился в свете.»`
      : `Наставник: «Успокоение даёт больше, чем победа: ахимса — не слабость, а стратегия ума.»`
  }
  return h('div', { class: 'mentor-line' }, text)
}

// Начисление очков ментальности (§12): рост параллельный, у каждой своя пища.
// silent — для боя (подъём покажет строка в наградах); иначе тост о росте.
function gainMentality(kind, n, { silent = false } = {}) {
  const lv = addVarnaPoints(app.meta, kind, n)
  if (!silent && lv.leveled) {
    const m = MENTALITIES[kind]
    sfx.unlock()
    toast(`⬆ Ментальность ${m.name}: уровень ${lv.to}. Навык ума зреет.`, 'hl')
  }
  // Садвипра (Human Society Part 2, гл. 4): все четыре ментальности развиты.
  if (isSadvipra(app.meta) && !app.meta.sadvipraAnnounced) {
    app.meta.sadvipraAnnounced = true
    sfx.unlock()
    toast('🕉 Садвипра: все четыре ментальности ума развиты. Путь к истинному финалу открыт.', 'hl')
  }
  return lv
}

// Строка о росте ментальности (§12.1), если он случился в бою (тихий режим).
function varnaLevelLine() {
  const lv = app.varnaLevel
  app.varnaLevel = null
  if (!lv) return null
  const m = MENTALITIES[lv.kind]
  sfx.unlock()
  return h('div', { class: 'varna-up' },
    `⬆ Ментальность ${m.name} достигла уровня ${lv.to}. Навык ума укрепился — так у садхаки зреют все четыре.`)
}

function pickRewardCard(id) {
  const before = computeSynergies(app.run.deck, CARDS)
  takeCardReward(app.run, id)
  notifySynergy(before, computeSynergies(app.run.deck, CARDS))
  markSeen(app.meta, 'cards', id)
  saveMeta(app.meta)
  sfx.unlock()
  markNodeDone(app.run)
  afterNode()
}

// «Поток открыт!» (§8.5): сбор школы ума — момент эврики, подкреплённый звуком.
function notifySynergy(before, after) {
  const NEW = [
    ['ahimsa', '☯ Поток Ахимсы открыт: успокоение сильнее — ненасилие стало стратегией.'],
    ['kiirtana', '◉ Поток Кииртана открыт: пение несёт больше саттвы.'],
    ['yama', '🕉 Поток Ямы открыт: дисциплина удешевляет практики.'],
    ['seva', '✋ Поток Служения открыт: лечение сильнее.'],
  ]
  for (const [key, msg] of NEW) {
    if (!before[key] && after[key]) { sfx.unlock(); toast(msg, 'hl') }
  }
}

// ─────────────────────────────────────────────────────────────
// Медитация
// ─────────────────────────────────────────────────────────────

function showMeditation() {
  // Медитация — это и есть узел восстановления (Hades: fountain). В карточном
  // пути больше нечему лечиться: победа в бое не даёт жизни, как и в Hades.
  // Практика возвращает часть тела — и это честно: ты сел и дышал.
  show(meditationScreen(app, { onDone: (res) => {
    if (res && res.quality >= 3) progressDaily(app.meta, 'meditate_q3', 1)
    const heal = Math.round(app.run.maxHp * (res && res.quality >= 3 ? 0.4 : 0.22))
    const before = app.run.hp
    app.run.hp = Math.min(app.run.maxHp, app.run.hp + heal)
    const got = app.run.hp - before
    if (got > 0) toast(`Практика вернула ${got} жизни`, 'hl')
    // Аудиотека практики (§16.2): дыхательная медитация записывает звук пранаямы
    if (recordSound(app.meta, 'pranayama')) {
      sfx.unlock()
      toast('Записан звук: 〰 Пранаяма — дыхание как практика', 'hl')
    }
    // Шудра-ментальность (присутствие): труд над умом — медитация и сожжение оков.
    gainMentality('shudra', res && res.burned > 0 ? 1 : 0)
    saveMeta(app.meta)
    markNodeDone(app.run)
    afterNode()
  } }))
}

// ─────────────────────────────────────────────────────────────
// Событие
// ─────────────────────────────────────────────────────────────

function showEvent() {
  const { id, event } = eventOptions(app.run)
  markSeen(app.meta, 'events', id)
  saveMeta(app.meta)
  show(h('div', { class: 'screen active node-screen' },
    h('div', { class: 'node-icon' }, '✧'),
    h('div', { class: 'node-title display' }, event.name),
    h('p', { class: 'node-text' }, event.text),
    h('div', { class: 'choices' },
      event.choices.map((c, i) =>
        h('div', { class: 'choice', onclick: () => pickEvent(id, i) },
          h('div', { class: 'c-main' }, c.text),
          h('div', { class: 'c-sub' }, c.sub)))),
  ))
}

function pickEvent(id, choiceIndex) {
  const run = app.run
  const res = resolveEventChoice(run, id, choiceIndex)
  for (const a of res.anchors) addAnchor(app.meta, a)
  // саттва из события (напр. «Отказаться») уходит в стартовые гуны следующих боёв —
  // раньше результат терялся (фикс бага аудита)
  if (res.sattvaGain > 0) {
    const base = run.gunaStart || { s: 3, r: 3, t: 3 }
    run.gunaStart = { ...base, s: base.s + res.sattvaGain }
  }
  saveMeta(app.meta)
  const quoteToShow = res.knowledge > 0 ? unlockRandomQuote() : null
  sfx.unlock()
  markNodeDone(run)
  if (res.challenge) {
    toast('Вызов учителя принят: 3 практики в следующем бою.', 'hl')
  }
  if (quoteToShow) {
    show(h('div', { class: 'screen active node-screen' },
      quoteBox(quoteToShow, { onClose: afterNode })))
  } else {
    afterNode()
  }
}

// ─────────────────────────────────────────────────────────────
// Реликвия
// ─────────────────────────────────────────────────────────────

function showRelic() {
  const locked = Object.keys(RELICS).filter((id) => !app.run.relics.includes(id))
  const id = locked[Math.floor(Math.random() * locked.length)] || Object.keys(RELICS)[0]
  const relic = RELICS[id]
  show(h('div', { class: 'screen active node-screen' },
    h('div', { class: 'node-icon' }, '❖'),
    h('div', { class: 'node-title display' }, relic.name),
    h('p', { class: 'node-text' }, relic.desc),
    quoteBox(relic.quoteId),
    h('button', { class: 'btn primary', onclick: () => takeRelic(id) }, 'Взять реликвию'),
  ))
}

function takeRelic(id) {
  gainRelic(app.run, id)
  markSeen(app.meta, 'relics', id)
  if (RELICS[id]) markLived(app.meta, RELICS[id].quoteId) // реликвия прожита: она теперь с вами
  saveMeta(app.meta)
  sfx.unlock()
  markNodeDone(app.run)
  afterNode()
}

// ─────────────────────────────────────────────────────────────
// Смерть и победа
// ─────────────────────────────────────────────────────────────

// Самскары для следующей жизни (экран смерти = вопрос, идея §5/§10):
// смерть не стирает ум — она конструирует следующего тебя (как зеркало Hades).
const SAMSKARA_CHOICES = [
  { id: 'sattva', title: 'Удерживать равновесие', bonus: '+1 саттва на старте', sanskrit: 'प्रमा' },
  { id: 'prana', title: 'Отдавать, а не копить', bonus: '+5 Праны на старте', sanskrit: 'अपरिग्रहः' },
  { id: 'knowledge', title: 'Помнить: знание переживает смерть', bonus: 'открыть цитату', sanskrit: 'ज्ञानम्' },
]

function showDeath(result) {
  setTint('t')
  const meta = app.meta
  // «Смерть = прогресс»: показываем, что из забега осталось с игроком, и даём
  // сразу переродиться — дофамин «знание не пропало», хочется ещё один забег.
  const qid = result.killedById && ENEMIES[result.killedById] ? ENEMIES[result.killedById].quoteId : null
  const keptQuote = qid && meta.quotesUnlocked && meta.quotesUnlocked[qid]
    ? QUOTES[qid]
    : null
  const knowledgeLine = keptQuote
    ? `Ты извлёк знание: «${keptQuote.term}» — ${keptQuote.meaning}.`
    : `Ты извлёк знание: ${Object.keys(meta.quotesUnlocked || {}).length} из ${Object.keys(QUOTES).length} цитат Грантхи.`
  show(h('div', { class: 'screen active end-screen' },
    h('div', { class: 'end-om' }, 'ॐ'),
    h('div', { class: 'game-title', style: 'font-size:30px' }, 'Перерождение'),
    h('p', { class: 'node-text' }, 'Тело ушло — ум унёс свои самскары. В следующей жизни сохранится только знание.'),
    h('div', { class: 'knowledge-kept' },
      h('div', { class: 'k-chip', style: 'color:var(--sat)' }, `✓ ${knowledgeLine}`)),
    h('div', { class: 'samskar-card' },
      h('div', { class: 's-title' }, 'Дневник самскар'),
      h('div', { class: 's-line' }, `Вы пали в битве с <b>${result.killedBy}</b>${result.lastIntent ? ` (${result.lastIntent})` : ''}.`),
      h('div', { class: 's-line' }, 'Что не хватило? Посмотрите в Грантху — карточки открыты, они остаются с вами.')),
    h('div', { class: 'samskar-q' }, 'Какую самскару вы уносите в следующую жизнь?'),
    h('div', { class: 'choices' },
      SAMSKARA_CHOICES.map((c) =>
        h('div', { class: 'choice', onclick: () => pickSamskara(c.id) },
          h('div', { class: 'c-main' }, `${c.title} · ${c.sanskrit}`),
          h('div', { class: 'c-sub' }, c.bonus)))),
    h('div', { class: 'knowledge-kept' },
      h('div', { class: 'k-chip' }, `Грантха: <b>${Object.keys(meta.compendium.cards).length}</b>`),
      h('div', { class: 'k-chip' }, `цитат: <b>${Object.keys(meta.quotesUnlocked).length}</b>`),
      h('div', { class: 'k-chip' }, `якорей: <b>${meta.practiceDiary.length}</b>`)),
    h('button', { class: 'btn primary mt', onclick: () => { setTint(null); startNewRun() } },
      'Переродиться — новый забег ▶'),
    h('button', { class: 'btn ghost small mt', style: 'width:auto;align-self:center', onclick: () => { setTint(null); showTitle() } },
      'Вернуться в Город'),
  ))
}

function pickSamskara(choiceId) {
  app.meta.nextLife = choiceId
  saveMeta(app.meta)
  setTint(null)
  showTitle()
}

function showVictory(outcome) {
  const awakened = outcome === 'awakening'
  setTint(null)
  const run = app.run
  show(h('div', { class: 'screen active end-screen' },
    h('div', { class: 'end-om' }, 'ॐ'),
    h('div', { class: 'game-title', style: 'font-size:30px' }, awakened ? 'Пробуждение' : 'Сила'),
    h('p', { class: 'node-text' },
      awakened
        ? 'Вы успокоили всех семерых владык чакр. Город просыпается — оковы распались в свет, и ум стал тише.'
        : `Вы одолели Владыку Сахасрары силой. Но пелена рассеется снова: успокоено ${run.bossesPacified || 0} из 7 владык. Мирный путь — истинный финал.`),
    h('div', { class: 'knowledge-kept' },
      h('div', { class: 'k-chip' }, `владык успокоено: <b>${run.bossesPacified || 0} / 7</b>`),
      h('div', { class: 'k-chip' }, `цитат: <b>${Object.keys(app.meta.quotesUnlocked).length}</b>`)),
    awakened && run.pacifiedBosses && run.pacifiedBosses.length > 0
      ? h('div', { class: 'mentor-line mt' },
          `Освобождённые владыки стали учителями: ${run.pacifiedBosses.map((id) => ENEMIES[id]?.name || id).join(' · ')}`)
      : null,
    awakened ? quoteBox('samadhi') : quoteBox('moha'),
    h('button', { class: 'btn primary', onclick: () => { setTint(null); showTitle() } }, 'Новый забег'),
  ))
}

// ─────────────────────────────────────────────────────────────
// Грантха / Дневник
// ─────────────────────────────────────────────────────────────

const COMP_TABS = ['Карты', 'Враги', 'Реликвии', 'Цитаты']

function showCompendium(tab = 'Цитаты') {
  const { meta } = app
  let listEl = h('div', {})
  let search = ''

  // Коллекционные наборы (§исследование, completionist): собрал весь пантеон врагов —
  // открывается ключ-цитата. Коллекционирование «пониманий», а не предметов.
  // Шесть внутренних врагов (Elementary Philosophy, гл. 6): кама, кродха, лобха,
  // моха, мада, матсарья. «Моха» в игре — владыка Муладхары, поэтому он же
  // засчитывается в пантеоне рипу; нидра (сон) в шесть внутренних не входит.
  const RIPU_IDS = ['kama', 'krodha', 'lobha', 'moha', 'mada', 'matsarya']
  const PASHA_IDS = ['bhaya_pasha', 'lajja', 'ghrna', 'samshaya_pasha', 'kula', 'sila', 'mana_pasha', 'jugupsa']
  const BOSS_IDS = ['moha', 'kama_raja', 'krodha_maharaja', 'mada_natha', 'matsarya_kala', 'lobha_pati', 'ahankara']

  function collectionLine() {
    const has = (arr) => arr.filter((id) => meta.compendium.enemies[id]).length
    const ripu = has(RIPU_IDS)
    const pasha = has(PASHA_IDS)
    const boss = has(BOSS_IDS)
    let key = null
    if (ripu === RIPU_IDS.length && !meta.quotesUnlocked.sadripu) { meta.quotesUnlocked.sadripu = true; markLived(meta, 'sadripu'); key = 'sadripu' }
    if (pasha === PASHA_IDS.length && !meta.quotesUnlocked.pasha) { meta.quotesUnlocked.pasha = true; markLived(meta, 'pasha'); key = key || 'pasha' }
    if (key) saveMeta(meta)
    return h('div', { class: 'hint center mt' },
      `собрано: рипу ${ripu}/${RIPU_IDS.length} · паши ${pasha}/${PASHA_IDS.length} · владыки ${boss}/${BOSS_IDS.length}`,
      key ? h('div', { style: 'color:var(--sat);font-weight:700' }, `Открыт ключ-термин: ${QUOTES[key]?.term || key}`) : null)
  }

  function renderTab(t) {
    if (t === 'Карты') {
      const ids = Object.keys(meta.compendium.cards)
      mount(listEl, ids.length === 0
        ? h('p', { class: 'hint center' }, 'Пока пусто — карточки откроются при встрече.')
        : ids.map((id) => entryRow(CARDS[id].name, CARDS[id].sanskrit, typeRu(CARDS[id]), CARDS[id].quoteId)))
    } else if (t === 'Враги') {
      const ids = Object.keys(meta.compendium.enemies)
      mount(listEl,
        collectionLine(),
        ids.length === 0
        ? h('p', { class: 'hint center' }, 'Пока пусто — враги откроются при встрече.')
        : ids.map((id) => entryRow(`${ENEMIES[id].name} — ${ENEMIES[id].epithet}`, ENEMIES[id].sanskrit, '', ENEMIES[id].quoteId)))
    } else if (t === 'Реликвии') {
      const ids = Object.keys(meta.compendium.relics)
      mount(listEl, ids.length === 0
        ? h('p', { class: 'hint center' }, 'Пока пусто — реликвии открываются при получении.')
        : ids.map((id) => entryRow(RELICS[id].name, '', '', RELICS[id].quoteId)))
    } else {
      const qs = Object.keys(meta.quotesUnlocked).map((id) => quoteById(id)).filter(Boolean)
      const filtered = search
        ? qs.filter((q) => `${q.term} ${q.meaning} ${q.source}`.toLowerCase().includes(search.toLowerCase()))
        : qs
      mount(listEl, filtered.length === 0
        ? h('p', { class: 'hint center' }, search ? 'Ничего не найдено.' : 'Цитаты открываются по мере игры.')
        : filtered.map((q) => quoteCard(q)))
    }
  }

  function quoteCard(q) {
    if (!q) return null
    const lived = isQuoteLived(app.meta, q.id)
    const hint = quoteLiveHint(q.id)
    return h('div', { class: `quote-card ${lived ? '' : 'qc-locked'}` },
      h('div', { class: 'qc-term sanscr' },
        `${q.term} · ${q.sanskrit}`,
        lived
          ? h('span', { style: 'color:var(--sat);font-size:11px;margin-left:6px' }, '✓ прожито')
          : h('span', { style: 'color:var(--muted);font-size:11px;margin-left:6px' }, '🔒 зерно')),
      h('div', { class: 'qc-meaning' }, q.meaning),
      lived ? [
        h('div', { class: 'qc-quote' }, `«${q.quote}»`),
        h('div', { class: 'qc-src' }, q.source),
        h('div', { class: 'qc-life' }, q.life),
      ] : [
        h('div', { class: 'qc-src' }, q.source),
        hint ? h('div', { class: 'qc-hint' }, `🔒 ${hint}`) : null,
      ])
  }

  function entryRow(name, sanscr, sub, quoteId) {
    return h('div', { class: 'entry', onclick: () => showQuote(quoteId) },
      h('div', { class: 'entry-head' },
        h('span', { class: 'e-name' }, name),
        sanscr ? h('span', { class: 'e-sanscr sanscr' }, sanscr) : null),
      sub ? h('div', { class: 'e-desc' }, sub) : null)
  }

  show(h('div', { class: 'screen active comp-screen' },
    h('button', { class: 'btn ghost small', onclick: showTitle }, '← Назад'),
    h('div', { class: 'display chakra-title' }, 'Грантха'),
    h('div', { class: 'chakra-sub' }, 'знание переживает смерть'),
    h('div', { class: 'comp-tabs' },
      COMP_TABS.map((t) => h('button', { class: `btn ${t === tab ? 'primary' : 'ghost'}`, onclick: () => showCompendium(t) }, t))),
    tab === 'Цитаты'
      ? h('input', { class: 'letter-ta', placeholder: 'Поиск по термину или цитате…',
          oninput: (e) => { search = e.target.value; renderTab('Цитаты') } })
      : null,
    listEl,
  ))
  renderTab(tab)
}

function showQuote(quoteId) {
  const q = quoteById(quoteId)
  if (!q) return
  // Активное припоминание (§исследование): «сначала спроси, потом покажи» —
  // эффект тестирования закрепляет память в 2–3 раза лучше пассивного чтения.
  if (!app.meta.recalled || !app.meta.recalled[quoteId]) {
    showRecall(quoteId)
    return
  }
  showQuoteCard(quoteId)
}

// Вопрос «Что означает термин?» — без штрафа за ошибку, только припоминание.
function showRecall(quoteId) {
  const q = quoteById(quoteId)
  if (!q) return
  const options = recallOptions(q)
  const optsEl = h('div', { class: 'choices' })
  let answered = false
  function answer(opt) {
    if (answered) return
    answered = true
    app.meta.recalled = app.meta.recalled || {}
    app.meta.recalled[quoteId] = Date.now() // для SRS-спейсинга (интервал повторения)
    // Випра-ментальность (знание): припоминание — пища различения (viveka).
    if (opt.correct) gainMentality('vipra', 1)
    saveMeta(app.meta)
    if (opt.correct) { sfx.unlock(); haptics.notify('success') } else { sfx.play() }
    showQuoteCard(quoteId, { wrong: !opt.correct })
  }
  mount(optsEl, options.map((opt) =>
    h('div', { class: 'choice', onclick: () => answer(opt) },
      h('div', { class: 'c-main' }, opt.text))))
  show(h('div', { class: 'screen active' },
    h('button', { class: 'btn ghost small', onclick: showCompendium }, '← Грантха'),
    h('div', { class: 'display chakra-title mt' }, 'Память'),
    h('div', { class: 'chakra-sub' }, 'прежде чем показать — вспомните'),
    h('p', { class: 'hint mt' }, `Что означает «${q.term}»?`),
    optsEl,
  ))
}

// Варианты ответа: правильное значение + 2 чужих (интерливинг из других терминов).
function recallOptions(q) {
  const others = Object.values(QUOTES).filter((x) => x !== q && x.meaning)
  const wrong = []
  const seen = new Set([q.meaning])
  let guard = 0
  while (wrong.length < 2 && guard < 60 && others.length) {
    guard++
    const o = others[Math.floor(Math.random() * others.length)]
    if (!seen.has(o.meaning)) { seen.add(o.meaning); wrong.push(o.meaning) }
  }
  const options = [{ text: q.meaning, correct: true }, ...wrong.map((m) => ({ text: m }))]
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[options[i], options[j]] = [options[j], options[i]]
  }
  return options
}

function showQuoteCard(quoteId, opts = {}) {
  const q = quoteById(quoteId)
  if (!q) return
  const revealed = isQuoteLived(app.meta, quoteId)
  show(h('div', { class: 'screen active' },
    h('button', { class: 'btn ghost small', onclick: showCompendium }, '← Грантха'),
    opts.wrong ? h('div', { class: 'hint center mt', style: 'color:var(--gold-soft)' },
      `Правильный ответ — ${q.term}: ${q.meaning}. Запомните — это якорь.`) : null,
    h('div', { class: 'mt' }, quoteBox(quoteId, { onClose: showCompendium, revealed })),
    revealed && q.original ? h('div', { class: 'panel mt' },
      h('div', { class: 'hint' }, 'Оригинал:'),
      h('div', { class: 'hint mt', style: 'font-style:italic;color:var(--ink-dim)' }, q.original)) : null,
  ))
}

function showDiary() {
  const { meta } = app
  show(h('div', { class: 'screen active comp-screen' },
    h('button', { class: 'btn ghost small', onclick: showTitle }, '← Назад'),
    h('div', { class: 'display chakra-title' }, 'Дневник практики'),
    h('div', { class: 'chakra-sub' }, 'игра работает на жизнь'),
    letterBlock(),
    h('p', { class: 'hint mt' }, 'Когда игра совпала с настоящим состоянием ума и вы ответили практикой — рождается якорь. Вот они:'),
    meta.practiceDiary.length === 0
      ? h('p', { class: 'hint center mt' }, 'Пока якорей нет. Сыграйте кииртану при унынии — и связь останется с вами.')
      : meta.practiceDiary.map((a) =>
          h('div', { class: 'anchor-entry' },
            h('div', { class: 'a-item' }, `${a.strong ? '★ ' : ''}${a.situation}`),
            h('div', { class: 'a-arrow' }, '↓'),
            h('div', { class: 'a-item', style: 'color:var(--gold-soft)' }, a.practice),
            a.strong
              ? h('div', { class: 'hint center mt', style: 'color:var(--sat)' }, 'Сильный якорь: вы устояли через него — и победили.')
              : h('div', { class: 'hint center mt' }, 'Попробуйте сегодня: правда работает.'))),
    anchorRemindBlock(),
  ))
}

/**
 * Напоминания о якорях (§11.2). Честно показываем, работают они или нет.
 *
 * Если сервера нет, здесь написано «не отправляются» — а не тишина. Иначе
 * игрок решит, что напоминаний не бывает, и никогда об этом не узнает.
 */
function anchorRemindBlock() {
  const meta = app.meta
  const sent = (meta.practiceDiary || []).reduce((a, x) => a + ((x.reminded || []).filter(Boolean).length), 0)
  const can = !!pushSender()
  return h('div', { class: 'panel mt' },
    h('div', { class: 'hint' }, 'Напоминания'),
    h('p', { class: 'hint center mt' },
      'Якорь возвращается трижды — через 1, 3 и 7 дней. Больше не нужно: это шум.'),
    h('p', { class: 'hint center', style: can ? 'color:var(--sat)' : 'color:#ffb787' },
      can ? 'Напоминания включены.' : 'Напоминания не отправляются: нет сервера. Якоря остаются здесь.'),
    sent ? h('p', { class: 'hint center mt' }, `доставлено напоминаний: ${sent}`) : null,
  )
}

// «Письмо себе» (§исследование, проспективная память): написал «зачем практикую» —
// через 7 дней письмо возвращается, напоминая о намерении (как time-capsule).
function letterBlock() {
  const l = app.meta.letter || {}
  if (!l.text) {
    const ta = h('textarea', { class: 'letter-ta', rows: 3, placeholder: 'Зачем я практикую? Напишите письмо себе — оно вернётся через неделю.' })
    const btn = h('button', { class: 'btn primary mt', onclick: () => {
      const text = (ta.value || '').trim()
      if (!text) { toast('Напишите хотя бы пару строк', 'danger'); return }
      app.meta.letter = { text, at: Date.now(), shownAt: 0 }
      saveMeta(app.meta)
      sfx.peace()
      showDiary()
    } }, 'Сохранить письмо')
    return h('div', { class: 'panel mt' },
      h('div', { class: 'hint' }, 'Письмо себе'),
      ta,
      btn)
  }
  const DAY = 86400000
  const daysLeft = Math.max(0, Math.ceil((7 * DAY - (Date.now() - l.at)) / DAY))
  const matured = daysLeft === 0
  if (matured && !l.shownAt) { l.shownAt = Date.now(); saveMeta(app.meta) }
  return h('div', { class: `panel mt letter-${matured ? 'returned' : 'waiting'}` },
    h('div', { class: 'hint' }, matured ? 'Письмо себе вернулось' : 'Письмо себе · ждёт'),
    h('div', { class: 'letter-text' }, `«${l.text}»`),
    matured
      ? h('div', { class: 'hint center mt' }, 'Семь дней прошли. Вы — тот, кто это написал, и тот, кто стал дальше.')
      : h('div', { class: 'hint center mt' }, `Вернётся через ${daysLeft} дн.`))
}

// ─────────────────────────────────────────────────────────────
// Переходы между узлами
// ─────────────────────────────────────────────────────────────

function afterNode() {
  const run = app.run
  if (run.status !== 'active') return showTitle()
  if (floorComplete(run)) {
    if (run.floor >= run.floors.length - 1) return showMap()
    app.shop = rollShop(run)
    showShop()
    return
  }
  showMap()
}

// ─────────────────────────────────────────────────────────────
// Лавка Садхака
// ─────────────────────────────────────────────────────────────

function showShop() {
  const run = app.run
  const shop = app.shop || rollShop(run)
  app.shop = shop
  const disc = shopDiscount(run)

  const pranaEl = h('div', { class: 'hint center', style: 'font-size:14px;color:var(--gold-soft);font-weight:800' }, `Прана: ${run.prana}`)
  const discEl = disc > 0
    ? h('div', { class: 'hint center mt', style: 'color:var(--gold-soft);font-size:11px' },
        `Мудрость вайшьи: скидка −${disc} ⚡ на всё`)
    : null

  const row = (title, sub, price, onclick, disabled) =>
    h('div', { class: `shop-item ${disabled ? 'disabled' : ''}`, onclick: disabled ? null : onclick },
      h('div', {},
        h('div', { class: 'si-name' }, title),
        sub ? h('div', { class: 'si-desc' }, sub) : null),
      h('div', { class: 'si-price' }, price))

  show(h('div', { class: 'screen active node-screen' },
    h('div', { class: 'node-icon' }, '❖'),
    h('div', { class: 'node-title display' }, 'Лавка Садхака'),
    h('p', { class: 'node-text' }, 'Между чакрами — привал. Здесь Прана возвращается как жертва: карты в ум, очищение, память.'),
    pranaEl,
    discEl,
    runSynergiesLine(run),

    h('div', { class: 'hint mt' }, 'Карты в колоду (ум)'),
    h('div', { class: 'choices' },
      shop.cards.map((id) => {
        const c = CARDS[id]
        return row(`${c.name} · ${c.sanskrit || ''}`, c.desc, `${shopPrice(run, 'card')} ⚡`, () => doBuy(() => buyShopCard(run, id), id))
      })),

    h('div', { class: 'hint mt' }, 'Отпустить карту-овку'),
    h('div', { class: 'choices' },
      shop.removable.length === 0
        ? h('div', { class: 'hint center' }, 'В уме нет оков.')
        : shop.removable.map((id) =>
            row(`Сжечь: ${CARDS[id].name}`, '', `${shopPrice(run, 'remove')} ⚡`, () => doBuy(() => buyShopRemove(run, id), id)))),

    shop.relic
      ? h('div', { class: 'hint mt' }, 'Память (реликвия)')
      : null,
    shop.relic
      ? h('div', { class: 'choices' },
          row(`${RELICS[shop.relic].name}`, RELICS[shop.relic].desc, `${shopPrice(run, 'relic')} ⚡`, () => doBuy(() => buyShopRelic(run, shop.relic), shop.relic)))
      : null,

    h('div', { class: 'btn-row mt' },
      h('button', { class: 'btn primary', onclick: () => { app.shop = null; advanceFloor(run); showMap() } }, 'В путь →')),
  ))
}

function doBuy(fn, id) {
  const before = computeSynergies(app.run.deck, CARDS)
  const res = fn()
  if (!res.ok) {
    toast(res.reason, 'danger')
    return
  }
  sfx.buy()
  notifySynergy(before, computeSynergies(app.run.deck, CARDS))
  markSeen(app.meta, 'cards', id)
  markSeen(app.meta, 'relics', id)
  // Вайшья-ментальность (мудрость ресурсов): осознанная трата Праны — навык,
  // а не накопление (Human Society Part 2: vaeshya = деньги как мера всего).
  gainMentality('vaeshya', 1)
  saveMeta(app.meta)
  showShop()
}

// Включение/выключение вибрации (настройка в мете, §исследование: хаптика по флагу)
function toggleHaptics() {
  app.meta.settings = app.meta.settings || {}
  app.meta.settings.haptics = app.meta.settings.haptics === false
  setHaptics(app.meta.settings.haptics !== false)
  saveMeta(app.meta)
  showTitle()
}

function toast(text, cls) {
  const el = h('div', { class: `log-line ${cls || ''}` }, text)
  document.body.append(el)
  el.style.position = 'fixed'
  el.style.left = '50%'
  el.style.top = '40%'
  el.style.transform = 'translateX(-50%)'
  el.style.zIndex = 99
  setTimeout(() => el.remove(), 2200)
}

function typeRu(card) {
  return { curse: 'мусор', vritti: 'овка', practice: 'практика', mantra: 'мантра', kiirtana: 'кииртан', seva: 'служение' }[card.type]
}

window.addEventListener('load', boot)
if (document.readyState === 'complete' || document.readyState === 'interactive') boot()
