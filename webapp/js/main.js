// Точка входа: маршрутизация экранов, забег, узлы, Грантха, дневник.
import { h, mount } from './ui/dom.js'
import { initFx, sfx, setTint } from './ui/fx.js'
import { setHaptics, haptics } from './ui/haptics.js'
import { quoteBox, cardEl } from './ui/widgets.js'
import { combatScreen } from './ui/screens/combat.js'
import { meditationScreen } from './ui/screens/meditation.js'
import { CARDS, ENEMIES, RELICS, EVENTS, QUOTES, JANMAS, CHALLENGES, VARNA_ORDER, TRIALS } from './core/data.js'
import { computeSynergies } from './core/engine.js'
import {
  createRun, currentNode, currentEnemyId, startCombatAtNode, finishCombat,
  takeCardReward, gainRelic,
  eventOptions, resolveEventChoice, isNodeDone, markNodeDone,
  floorComplete, advanceFloor, CHAKRAS, LEPESTKI,
  rollShop, buyShopCard, buyShopRemove, buyShopRelic, SHOP_COSTS,
} from './core/run.js'
import {
  loadMeta, saveMeta, markSeen, addAnchor, recordRunEnd, resetMeta, quoteById, cloudSync,
  markVisit, progressDaily, varnaIndex, varnaProgress, addVarnaPoints,
  unlockCard, trialsProgress,
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
  setHaptics(app.meta.settings?.haptics !== false)
  const { event } = markVisit(app.meta)
  saveMeta(app.meta)
  if (event && (event.kind === 'increase' || event.kind === 'break' || event.kind === 'grace')) {
    app.bootEvent = event
  }
  showTitle()
  // фаза 2 (§17.1): синк через Telegram CloudStorage — побеждает свежее сохранение
  cloudSync(app.meta).then((fresh) => {
    if (fresh) {
      app.meta = fresh
      const { event: e2 } = markVisit(app.meta)
      if (e2 && e2.kind !== 'none') app.bootEvent = e2
      saveMeta(app.meta)
      showTitle()
    }
  })
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

  show(h('div', { class: 'screen active title-screen' },
    h('div', { class: 'mandala-wrap' },
      h('div', { class: 'mandala' }),
      h('div', { class: 'mandala core' }),
      h('div', { class: 'om-glyph', style: 'position:absolute' }, 'ॐ')),
    h('div', { class: 'game-title' }, 'Tantra Yoga'),
    h('div', { class: 'game-sub' }, 'игра-учение · колода — это ум'),
    h('p', { class: 'hint', style: 'max-width:300px' }, cityText),
    cityDots,
    teachers,

    streakBlock,
    challengeBlock,
    varnaBlock,
    trialsBlock,

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

// Варна — ступень социального цикла (§12.1). Показывает текущую варну и прогресс
// до следующей. Очки варны растут мирными освобождениями.
function varnaCard(meta) {
  const vp = varnaProgress(meta)
  const cur = JANMAS[VARNA_ORDER[vp.index]]
  if (!cur) return null
  const next = vp.nextId ? JANMAS[vp.nextId] : null
  const pct = Math.max(4, Math.round(vp.progress * 100))
  return h('div', { class: 'varna-card' },
    h('div', { class: 'varna-head' },
      h('div', {},
        h('div', { class: 'varna-label' }, 'варна · социальный цикл'),
        h('div', { class: 'varna-name', style: `color:${cur.color}` }, `${cur.name} · ${cur.sanskrit}`)),
      next ? h('div', { class: 'varna-next' }, `до ${next.name}`) : h('div', { class: 'varna-next done' }, 'цикл пройден')),
    h('div', { class: 'varna-bar' }, h('div', { class: 'varna-fill', style: `width:${pct}%;background:${cur.color}` })),
    next
      ? h('div', { class: 'varna-hint' }, `освобождайте владык ахимсой · ${vp.points}${vp.nextCost != null ? '/' + vp.nextCost : ''} очков`)
      : h('div', { class: 'varna-hint done' }, 'вы достигли высшей варны'))
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


// ─────────────────────────────────────────────────────────────
// Забег: карта
// ─────────────────────────────────────────────────────────────

function startNewRun() {
  app.meta.stats.runs += 1
  saveMeta(app.meta)
  showJanna()
}

function showJanna() {
  const currentIdx = varnaIndex(app.meta)
  show(h('div', { class: 'screen active node-screen' },
    h('div', { class: 'node-icon' }, 'ॐ'),
    h('div', { class: 'node-title display' }, 'Джанма'),
    h('p', { class: 'node-text' }, 'Как вы родились в этот раз? Варна — это психология ума, а не каста: каждый забег — новая жизнь, и вы растёте по социальному циклу.'),
    h('div', { class: 'choices' },
      Object.values(JANMAS).map((j) => {
        const locked = j.varnaIdx > currentIdx
        return h('div', {
          class: `choice ${locked ? 'locked' : ''}`,
          onclick: locked ? null : () => beginRun(j.id),
        },
          h('div', { class: 'c-main' }, `${j.name} · ${j.sanskrit}`),
          h('div', { class: 'c-sub' }, locked ? '🔒 Освободите владык, чтобы родиться в этой варне' : j.desc))
      })),
  ))
}

function beginRun(jannaId) {
  app.run = createRun({ meta: app.meta, options: { janna: jannaId } })
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

  const nodes = []
  run.floors.forEach((floor, f) => {
    if (f > run.floor) return
    nodes.push(h('div', { class: 'floor-lbl' }, f < run.floor ? 'пройденный этаж' : `этаж ${f + 1} · ${f === run.floors.length - 1 ? 'вершина' : ''}`))
    nodes.push(h('div', { class: 'row', style: 'justify-content:center;gap:18px;margin:6px 0' },
      floor.map((node, i) => {
        const done = run.floor > f || isNodeDone(run, i)
        const available = f === run.floor && !done
        return h('div', { class: `node ${done ? 'done' : ''} ${available ? 'available' : ''}`,
            onclick: available ? () => enterNode(i) : null },
          h('span', { class: 'glyph' }, NODE_GLYPH[node.type]),
          h('span', { class: 'node-label' }, NODE_LABEL[node.type]))
      })))
    if (f < run.floors.length - 1 && f < run.floor) nodes.push(h('div', { class: 'connector' }))
  })

  show(h('div', { class: 'screen active map-screen' },
    h('button', { class: 'btn ghost small', onclick: showTitle }, '← Город'),
    h('div', { class: 'display chakra-title mt' }, chakra),
    h('div', { class: 'chakra-sub' }, 'восхождение'),
    petalsBlock(run),
    sageTrace(run),
    h('div', { class: 'run-bar' },
      h('div', { class: 'chip' }, `ХП <span class="gold">${run.hp}</span>`),
      h('div', { class: 'chip' }, `Прана <span class="gold">${run.prana}</span>`),
      h('div', { class: 'chip' }, `колода <span class="gold">${run.deck.length}</span>`),
      h('div', { class: 'chip' }, `реликвии <span class="gold">${run.relics.length}</span>`)),
    h('div', { class: 'path' }, nodes),
    runSynergiesLine(run),
    run.relics.length > 0 ? h('div', { class: 'hint center mt' }, 'реликвии: ' + run.relics.map((r) => RELICS[r].name).join(' · ')) : null,
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
  markSeen('enemies', node.enemyId)
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
    }
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

  // варны (§12.1): мирный путь — освобождения питают социальный цикл
  if (combat.pacified > 0) {
    const gained = combat.bossPacified ? 2 : 1
    const level = addVarnaPoints(app.meta, gained)
    if (level.leveled) app.varnaLevel = level
  }

  // «Учителя города» (§14.1, Undertale: враг → друг): успокоенные владыки остаются в Городе
  if (combat.bossPacified && combat.enemies[0] && combat.enemies[0].def) {
    const name = combat.enemies[0].def.name
    const list = app.meta.pacifiedBosses || (app.meta.pacifiedBosses = [])
    if (!list.includes(name)) list.push(name)
  }

  if (result.dead) {
    recordRunEnd(app.meta, 'death')
    app.meta.stats.kills += combat.kills
    app.meta.stats.pacified += combat.pacified
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
      markSeen('cards', result.trialReward)
      const c = CARDS[result.trialReward]
      app.trialUnlockToast = c ? `Карта открыта: ${c.name} — она теперь в наградах` : null
      sfx.unlock()
    }
  }
  // §9.2: мирное освобождение дарит «память»-реликвию
  if (result.relic) {
    gainRelic(run, result.relic)
    markSeen('relics', result.relic)
  }

  if (isFinalBoss) {
    recordRunEnd(app.meta, run.outcome === 'awakening' ? 'awakening' : 'victory')
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
      result.cardChoices.map((id) => cardEl(CARDS[id], { onPlay: () => pickRewardCard(id) }))),
  ))
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

// Строка о подъёме варны (§12.1), если он случился в этом бою.
function varnaLevelLine() {
  const lv = app.varnaLevel
  app.varnaLevel = null
  if (!lv) return null
  const from = JANMAS[VARNA_ORDER[lv.from]]
  const to = JANMAS[VARNA_ORDER[lv.to]]
  sfx.unlock()
  return h('div', { class: 'varna-up' },
    `⬆ Варна: ${from.name} → ${to.name}. Ум вырос по социальному циклу — новая джанма открыта.`)
}

function pickRewardCard(id) {
  const before = computeSynergies(app.run.deck, CARDS)
  takeCardReward(app.run, id)
  notifySynergy(before, computeSynergies(app.run.deck, CARDS))
  markSeen('cards', id)
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
  markSeen('events', id)
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
  markSeen('relics', id)
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
  show(h('div', { class: 'screen active end-screen' },
    h('div', { class: 'end-om' }, 'ॐ'),
    h('div', { class: 'game-title', style: 'font-size:30px' }, 'Перерождение'),
    h('p', { class: 'node-text' }, 'Тело ушло — ум унёс свои самскары. В следующей жизни сохранится только знание.'),
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
      h('div', { class: 'k-chip' }, `Грантха: <b>${Object.keys(app.meta.compendium.cards).length}</b>`),
      h('div', { class: 'k-chip' }, `цитат: <b>${Object.keys(app.meta.quotesUnlocked).length}</b>`),
      h('div', { class: 'k-chip' }, `якорей: <b>${app.meta.practiceDiary.length}</b>`)),
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
    if (ripu === RIPU_IDS.length && !meta.quotesUnlocked.sadripu) { meta.quotesUnlocked.sadripu = true; key = 'sadripu' }
    if (pasha === PASHA_IDS.length && !meta.quotesUnlocked.pasha) { meta.quotesUnlocked.pasha = true; key = key || 'pasha' }
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
        ? qs.filter((q) => `${q.term} ${q.meaning} ${q.quote}`.toLowerCase().includes(search.toLowerCase()))
        : qs
      mount(listEl, filtered.length === 0
        ? h('p', { class: 'hint center' }, search ? 'Ничего не найдено.' : 'Цитаты открываются по мере игры.')
        : filtered.map((q) => quoteCard(q)))
    }
  }

  function quoteCard(q) {
    if (!q) return null
    const lived = app.meta.lived && app.meta.lived[q.id]
    return h('div', { class: 'quote-card' },
      h('div', { class: 'qc-term sanscr' },
        `${q.term} · ${q.sanskrit}`,
        lived ? h('span', { style: 'color:var(--sat);font-size:11px;margin-left:6px' }, '✓ прожито') : null),
      h('div', { class: 'qc-quote' }, `«${q.quote}»`),
      h('div', { class: 'qc-src' }, q.source),
      h('div', { class: 'qc-life' }, q.life))
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
  show(h('div', { class: 'screen active' },
    h('button', { class: 'btn ghost small', onclick: showCompendium }, '← Грантха'),
    opts.wrong ? h('div', { class: 'hint center mt', style: 'color:var(--gold-soft)' },
      `Правильный ответ — ${q.term}: ${q.meaning}. Запомните — это якорь.`) : null,
    h('div', { class: 'mt' }, quoteBox(quoteId, { onClose: showCompendium })),
    q.original ? h('div', { class: 'panel mt' },
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

  const pranaEl = h('div', { class: 'hint center', style: 'font-size:14px;color:var(--gold-soft);font-weight:800' }, `Прана: ${run.prana}`)

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
    runSynergiesLine(run),

    h('div', { class: 'hint mt' }, 'Карты в колоду (ум)'),
    h('div', { class: 'choices' },
      shop.cards.map((id) => {
        const c = CARDS[id]
        return row(`${c.name} · ${c.sanskrit || ''}`, c.desc, `${SHOP_COSTS.card} ⚡`, () => doBuy(() => buyShopCard(run, id), id))
      })),

    h('div', { class: 'hint mt' }, 'Отпустить карту-овку'),
    h('div', { class: 'choices' },
      shop.removable.length === 0
        ? h('div', { class: 'hint center' }, 'В уме нет оков.')
        : shop.removable.map((id) =>
            row(`Сжечь: ${CARDS[id].name}`, '', `${SHOP_COSTS.remove} ⚡`, () => doBuy(() => buyShopRemove(run, id), id)))),

    shop.relic
      ? h('div', { class: 'hint mt' }, 'Память (реликвия)')
      : null,
    shop.relic
      ? h('div', { class: 'choices' },
          row(`${RELICS[shop.relic].name}`, RELICS[shop.relic].desc, `${SHOP_COSTS.relic} ⚡`, () => doBuy(() => buyShopRelic(run, shop.relic), shop.relic)))
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
  markSeen('cards', id)
  markSeen('relics', id)
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

app.onCombatEnd = onCombatEnd

window.addEventListener('load', boot)
if (document.readyState === 'complete' || document.readyState === 'interactive') boot()
