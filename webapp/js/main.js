// Точка входа: маршрутизация экранов, забег, узлы, Грантха, дневник.
import { h, mount } from './ui/dom.js'
import { initFx, sfx, setTint, playLibrarySound } from './ui/fx.js'
import { setHaptics, haptics } from './ui/haptics.js'
import { quoteBox, cardEl } from './ui/widgets.js'
import { combatScreen } from './ui/screens/combat.js'
import { meditationScreen } from './ui/screens/meditation.js'
import { CARDS, ENEMIES, RELICS, EVENTS, QUOTES, MENTALITIES, MENTALITY_ORDER, CHALLENGES, TRIALS, quoteLiveHint, isQuoteLived, AUDIO_LIBRARY, soundForCard, CITY_TEACHERS, WORLDS, WORLD_PATH } from './core/data.js'
import { computeSynergies } from './core/engine.js'
import {
  createRun, currentNode, currentEnemyId, startCombatAtNode, finishCombat,
  takeCardReward, gainRelic,
  eventOptions, resolveEventChoice, isNodeDone, markNodeDone,
  floorComplete, advanceFloor, CHAKRAS, LEPESTKI,
  rollShop, buyShopCard, buyShopRemove, buyShopRelic, SHOP_COSTS, shopPrice, shopDiscount,
  challengeFulfilled,
} from './core/run.js'
import {
  loadMeta, saveMeta, markSeen, addAnchor, recordRunEnd, recordDeath, resetMeta, quoteById, cloudSync,
  markVisit, progressDaily, varnaState, addVarnaPoints, isSadvipra,
  unlockCard, trialsProgress, markLived, gardenState, recordSound, soundState,
  cityBlessingBonus, setVarnaBranch,
} from './core/save.js'

const appEl = document.getElementById('app')

let app = null
let booted = false

function boot() {
  if (booted) return
  booted = true
  initFx()
  try {
    window.Telegram?.WebApp?.ready()
    window.Telegram?.WebApp?.expand()
  } catch {}
  app = { meta: loadMeta(), run: null, combat: null }
  app.onCombatEnd = onCombatEnd
  setHaptics(app.meta.settings?.haptics !== false)
  const { event } = markVisit(app.meta)
  saveMeta(app.meta)
  if (event && (event.kind === 'increase' || event.kind === 'break' || event.kind === 'grace')) {
    app.bootEvent = event
  }
  showHome()
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

  show(h('div', { class: 'screen active title-screen' },
    h('div', { class: 'mandala-wrap' },
      h('div', { class: 'mandala' }),
      h('div', { class: 'mandala core' }),
      h('div', { class: 'om-glyph', style: 'position:absolute' }, 'ॐ')),
    h('div', { class: 'game-title' }, 'Tantra: The Game'),
    h('div', { class: 'game-sub' }, 'игра-учение · колода — это ум'),
    h('p', { class: 'hint', style: 'max-width:300px' }, cityText),
    cityDots,
    teachers,

    progressBlock,

    metaFoldBlock,
    h('div', { class: 'panel city-card' },
      h('div', { class: 'row between', style: 'font-size:12px;color:var(--muted)' },
        h('span', {}, 'путь города'),
        h('span', {}, 'освобождено оков'),
        h('span', {}, 'Грантха')),
      h('div', { class: 'gauges' }, gauges),
      best,

      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', onclick: startNewRun }, 'Начать забег'),
        h('button', { class: 'btn', onclick: () => showCompendium() }, `Грантха (${compCount})`)),
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
      h('div', { class: 'hint mt' },
        'Ваша колода — это ум. В ней — оковы и вртти (лента, гнев, жадность). Убирайте их медитацией и мантрами, добавляйте практики.'),
      h('div', { class: 'hint mt' },
        'Вместо маны — три гуны: саттва (ясность), раджас (действие), тамас (покой). Держите равновесие — прама даёт бонус. Перекос — штраф.'),
      h('div', { class: 'hint mt' },
        'Каждого врага можно победить силой… или успокоить ахимсой (сыграть N карт «Ахимса» при его ХП ≤ 50%). Мирный путь — истинный финал.'),
      h('div', { class: 'hint mt' },
        'На высоких этажах встречаются восемь оков-паш (страх, стыд, ненависть, сомнение…). Им сопротивляются правильной практикой: страх успокаивается Тапасом, стыд — Севой.'),
      h('div', { class: 'hint mt' },
        'Узлы «Испытание» просят победить, не сыграв ни одной оковки; узлы «Воспоминание» — вспомнить открытые термины. Дисциплина и память дают бонус.'),
      h('div', { class: 'hint mt' },
        'Каждая карта и враг — подлинный термин Шастры. Первая встреча открывает карточку в Грантхе. Знание переживает смерть.'),
    ),
    h('button', { class: 'btn primary mt', onclick: startNewRun }, 'Понятно, начнём'),
  ))
}

// ── Первый запуск (§онбординг): короткий рассказ о том, что за игра и где геймплей.
// Показывается один раз, до первого забега. Язык — игровой, без жаргона.

const ONBOARDING_STEPS = [
  { e: '🗺', t: 'Путь — вверх по 7 чакрам', d: 'На карте забега кликайте узлы: бой, медитация, событие, воспоминание. В конце каждого этажа — владыка чакры. Узлы сверкают — они ждут вашего шага.' },
  { e: '🃏', t: 'Колода — это ваш ум', d: 'Карты-практики (медитация, мантра, кииртан, сева) — инструменты. Оковки (лень, гнев, жадность) — мусор: они кормят неведение. В бою просто нажимайте карту, чтобы сыграть её.' },
  { e: '☯', t: 'Вместо маны — три гуны', d: 'Саттва (ясность), раджас (действие), тамас (покой). Держите их в равновесии — прама даёт бонусы. Перекос — штраф. Следите за тремя кружками над врагом.' },
  { e: '🕊', t: 'Врага можно не убивать', d: 'Соберите 3+ карты Ахимсы и успокойте врага, когда его ХП ≤ 50%: окову освобождают, а не давят. Мирный путь — истинный финал (как прощение в Undertale).' },
  { e: '♻️', t: 'Смерть — это перерождение', d: 'Знание (цитаты в Грантхе) переживает смерть и остаётся навсегда. Каждый забег делает ум мудрее — так и растёт ваш «хаб» между жизнями.' },
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
      startNewRun()
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
          talked
            ? h('div', { class: 'city-area-talked' }, '✓ благословение взято')
            : h('button', { class: 'btn small mt', onclick: () => talkToTeacher(t) }, 'Поговорить с учителем'))
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
      h('div', { class: 'hint mt' }, 'Благословение применяется в начале забега, как милость учителей. Возьмите его, выбрав «Начать забег» на титуле.'))
  ))
}

// Разговор с учителем: первый раз — цитата проживается (знание вручено) и
// благословение записывается (+1 саттва к старту следующего забега).
function talkToTeacher(t) {
  const meta = app.meta
  const spoken = meta.citySpoken || (meta.citySpoken = [])
  if (spoken.includes(t.id)) return

  const wasLived = isQuoteLived(meta, t.quoteId)
  if (!wasLived) markLived(meta, t.quoteId)
  if (meta.quotesUnlocked && !meta.quotesUnlocked[t.quoteId]) meta.quotesUnlocked[t.quoteId] = true
  spoken.push(t.id)
  saveMeta(meta)

  const q = QUOTES[t.quoteId]
  const quoteBlock = q
    ? quoteBox(t.quoteId, { revealed: true })
    : null
  show(h('div', { class: 'screen active comp-screen' },
    h('button', { class: 'btn ghost small', onclick: showCity }, '← Город'),
    h('div', { class: 'display chakra-title' }, t.name),
    h('div', { class: 'chakra-sub' }, t.epithet),
    h('div', { class: 'panel mt city-story' },
      h('p', { class: 'hint' }, t.story),
      h('p', { class: 'hint mt', style: 'color:var(--gold-soft)' }, t.advice)),
    quoteBlock,
    h('div', { class: 'panel mt' },
      h('div', { class: 'row between' },
        h('span', { class: 'hint' }, 'благословение учителя'),
        h('span', { style: 'color:var(--sat);font-weight:800' }, '+1 саттва к следующему забегу')),
      h('button', { class: 'btn primary mt', onclick: showCity }, 'Вернуться в Город')),
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
      h('button', { class: 'btn primary', onclick: startNewRun }, 'Новый забег ▶')),
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
  const chakra = CHAKRAS[Math.min(run.floor, CHAKRAS.length - 1)]
  const biome = Math.min(run.floor, CHAKRAS.length - 1)

  // Призраки прошлых жизней (§10.3): последняя смерть на этаже оставляет урок
  const deathsByFloor = {}
  for (const d of (app.meta.deathLog || [])) deathsByFloor[d.floor] = d

  // ── мир: гора-путь вверх по чакрам ────────────────────────────────────
  const sceneEl = h('div', { class: 'world-scene' })
  const sunEl = h('div', { class: 'world-sun' })
  const decor = []
  for (let k = 0; k < 5; k++) {
    const dx = Math.round((0.06 + Math.random() * 0.86) * 100)
    const dy = Math.round((0.10 + Math.random() * 0.80) * 100)
    decor.push(h('div', { class: `w-dec w-dec-${k % 3}`, style: `left:${dx}%;top:${dy}%` }))
  }
  const worldEl = h('div', { class: 'world world-map' })
  const pathEl = h('div', { class: 'world-path' })
  const sadhu = sadhuEl()
  pathEl.append(sadhu)

  // Подсказка первого входа: что это за место и что делать
  run._worldHinted = run._worldHinted || false
  const showHint = !run._worldHinted
  let hintEl = null
  if (showHint) {
    hintEl = h('div', { class: 'w-hint' },
      h('span', {}, 'Перед тобой гора-путь: внизу Муладхара, вверху — Сахасрара. Тапни по светящемуся месту силы — садхака пойдёт туда. Мерцающий ✦ откроет знание.'),
      h('button', { class: 'btn ghost small w-hint-ok', onclick: () => { run._worldHinted = true; hintEl.remove() } }, 'Понятно'))
  }
  const arrowEl = h('div', { class: 'w-arrow', style: 'display:none' }, '▼')
  pathEl.append(arrowEl)

  // Свободная ходьба: тап по свободному месту — садхака идёт туда
  pathEl.addEventListener('click', (e) => {
    if (app._walkBusy) return
    if (e.target.closest('.w-node') || e.target.closest('.w-spark')) return
    const pr = pathEl.getBoundingClientRect()
    const x = Math.min(Math.max(e.clientX - pr.left - sadhu.offsetWidth / 2, 0), pr.width - sadhu.offsetWidth)
    const y = Math.min(Math.max(e.clientY - pr.top - sadhu.offsetHeight, 0), pr.height - sadhu.offsetHeight)
    sadhu.style.left = x + 'px'
    sadhu.style.top = y + 'px'
  })

  const markers = {}
  run.floors.forEach((floor, f) => {
    const future = f > run.floor
    const row = h('div', { class: `world-floor ${future ? 'future' : ''}` },
      h('div', { class: 'w-floor-tag' },
        future
          ? `этаж ${f + 1} · впереди`
          : run.floor > f
            ? `этаж ${f + 1} · пройдено`
            : `этаж ${f + 1} · ${CHAKRAS[f]}`),
      h('div', { class: 'world-floor-row' }))
    const rowBox = row.children[1]
    floor.forEach((node, i) => {
      const done = run.floor > f || isNodeDone(run, i)
      const available = f === run.floor && !done
      const mk = h('div', {
        class: `w-node ${done ? 'done' : ''} ${available ? 'available' : ''} ${node.type === 'boss' ? 'boss' : ''} ${future ? 'future' : ''}`,
        onclick: available ? () => walkTo(mk, i) : null,
      },
        h('span', { class: 'w-glyph' }, future ? '·' : NODE_GLYPH[node.type]),
        h('span', { class: 'w-label' }, future ? '' : NODE_LABEL[node.type]))
      markers[f + '_' + i] = mk
      rowBox.append(mk)
    })
    const ghost = deathsByFloor[f]
    if (ghost && f === run.floor) {
      rowBox.append(h('div', { class: 'ghost w-ghost', onclick: () => showGhostLesson(ghost) }, '👻'))
    }
    pathEl.append(row)
  })

  // Спрятанные слоги (§16.2): на текущем этаже в мире мерцают знаки знания.
  // Нашёл — открыл цитату из Шастр (как спрятанные сутры в A Short Hike).
  run._found = run._found || {}
  const sparkles = []
  const SPARK_X = [0.06, 0.94]
  const sparkCount = 1 + (Math.random() < 0.6 ? 1 : 0)
  for (let k = 0; k < sparkCount; k++) {
    const key = run.floor + '_' + k
    const sp = h('div', {
      class: `w-spark ${run._found[key] ? 'found' : ''}`,
      onclick: () => findSparkle(key, sp),
    }, '✦')
    sparkles.push({ sp, x: SPARK_X[k % SPARK_X.length] })
    pathEl.append(sp)
  }

  show(h('div', { class: 'screen active map-screen' },
    h('div', { class: 'btn-row', style: 'justify-content:space-between' },
      h('button', { class: 'btn ghost small', onclick: showTitle }, '← Город'),
      h('button', { class: 'btn ghost small', onclick: showWorldLore }, '📜 о мире')),
    h('div', { class: 'display chakra-title mt' }, chakra),
    h('div', { class: 'chakra-sub' }, 'восхождение'),
    h('div', { class: 'run-bar' },
      h('div', { class: 'chip' }, `ХП <span class="gold">${run.hp}</span>`),
      h('div', { class: 'chip' }, `Прана <span class="gold">${run.prana}</span>`),
      h('div', { class: 'chip' }, `колода <span class="gold">${run.deck.length}</span>`),
      h('div', { class: 'chip' }, `реликвии <span class="gold">${run.relics.length}</span>`)),
    hintEl,
    worldEl,
    runSynergiesLine(run),
    run.relics.length > 0 ? h('div', { class: 'hint center mt' }, 'реликвии: ' + run.relics.map((r) => RELICS[r].name).join(' · ')) : null,
  ))
  worldEl.append(sceneEl, sunEl, ...decor, pathEl)

  // позиции после монтирования: садхака у текущего этажа, гора показывает путь вверх
  requestAnimationFrame(() => {
    const pathRect = pathEl.getBoundingClientRect()
    let target = null
    const curRow = run.floors[run.floor]
    if (curRow) {
      for (let i = 0; i < curRow.length; i++) {
        const mk = markers[run.floor + '_' + i]
        if (mk && !isNodeDone(run, i)) { target = mk; break }
      }
      if (!target) target = markers[run.floor + '_0'] || null
    }
    if (target) placeSadhu(sadhu, target, pathRect)
    if (showHint && target) {
      const tr = target.getBoundingClientRect()
      arrowEl.style.display = 'block'
      arrowEl.style.left = (tr.left - pathRect.left + tr.width / 2 - 8) + 'px'
      arrowEl.style.top = (tr.top - pathRect.top - 28) + 'px'
    }
    // спрятанные слоги — вдоль ряда текущего этажа
    const curFloorEl = markers[run.floor + '_0'] ? markers[run.floor + '_0'].closest('.world-floor-row') : null
    const rr = (curFloorEl && curFloorEl.getBoundingClientRect()) || pathRect
    for (const { sp, x } of sparkles) {
      sp.style.left = (rr.left - pathRect.left + rr.width * x - 10) + 'px'
      sp.style.top = (rr.top - pathRect.top - 36) + 'px'
    }
    // текущий этаж — внизу видимой области, гора возвышается вверх
    worldEl.scrollTop = worldEl.scrollHeight
  })
  setTimeout(() => { worldEl.scrollTop = worldEl.scrollHeight }, 120)

  function walkTo(mk, i) {
    if (app._walkBusy) return
    run._worldHinted = true
    if (hintEl) hintEl.remove()
    arrowEl.style.display = 'none'
    app._walkBusy = true
    const pathRect = pathEl.getBoundingClientRect()
    placeSadhu(sadhu, mk, pathRect)
    setTimeout(() => {
      app._walkBusy = false
      enterNode(i)
    }, 520)
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
  show(combatScreen(app))
}

function onCombatEnd(combat) {
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

    h('div', { class: 'hint center' }, 'Выберите карту в колоду (ум)'),
    h('div', { class: 'reward-cards' },
      result.cardChoices.map((id) => cardEl(CARDS[id], { onPlay: () => pickRewardCard(id), glow: CARDS[id].rarity === 'rare', hint: rewardSynergyHint(id) }))),
  ))
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
  show(meditationScreen(app, { onDone: (res) => {
    if (res && res.quality >= 3) progressDaily(app.meta, 'meditate_q3', 1)
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
  const RIPU_IDS = ['krodha', 'lobha', 'nidra', 'kama', 'mada', 'matsarya']
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
  ))
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
