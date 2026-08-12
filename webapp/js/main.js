// Точка входа: маршрутизация экранов, забег, узлы, Грантха, дневник.
import { h, mount } from './ui/dom.js'
import { initFx, sfx, setTint } from './ui/fx.js'
import { quoteBox, cardEl } from './ui/widgets.js'
import { combatScreen } from './ui/screens/combat.js'
import { meditationScreen } from './ui/screens/meditation.js'
import { CARDS, ENEMIES, RELICS, EVENTS, QUOTES, JANMAS, CHALLENGES, VARNA_ORDER } from './core/data.js'
import {
  createRun, currentNode, currentEnemyId, startCombatAtNode, finishCombat,
  takeCardReward, gainRelic,
  eventOptions, resolveEventChoice, isNodeDone, markNodeDone,
  floorComplete, advanceFloor, CHAKRAS,
  rollShop, buyShopCard, buyShopRemove, buyShopRelic, SHOP_COSTS,
} from './core/run.js'
import {
  loadMeta, saveMeta, markSeen, addAnchor, recordRunEnd, resetMeta, quoteById, cloudSync,
  markVisit, progressDaily, varnaIndex, varnaProgress, addVarnaPoints,
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
  const { event } = markVisit(app.meta)
  saveMeta(app.meta)
  if (event && (event.kind === 'increase' || event.kind === 'break')) {
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

    streakBlock,
    challengeBlock,
    varnaBlock,

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
      h('button', { class: 'btn ghost small', style: 'width:auto', onclick: () => showHowto() }, '?')),
    )
  ))

  if (bootEvent) {
    const messages = {
      increase: `Серия дней: ${meta.streak.current}. Ум укрепляется.`,
      start: 'Начата серия дней. Завтра возвращайтесь — серия растёт.',
      freeze_used: 'Фриз спас серию — день пропущен без потери.',
      break: 'Серия оборвалась. Не расстраивайтесь — каждый день начинается заново.',
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
        'Каждая карта и враг — подлинный термин Шастры. Первая встреча открывает карточку в Грантхе. Знание переживает смерть.'),
    ),
    h('button', { class: 'btn primary mt', onclick: startNewRun }, 'Понятно, начнём'),
  ))
}

// ─────────────────────────────────────────────────────────────
// Стрики (§15) и ежедневный вызов (§16.2) на титуле
// ─────────────────────────────────────────────────────────────

function streakCard(meta) {
  const s = meta.streak || { current: 0, best: 0, freeze: 0 }
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
      h('div', {},
        h('div', { class: 'streak-label' }, 'серия дней'),
        h('div', { class: 'streak-num' }, `${s.current}${s.best > s.current ? ` · рекорд ${s.best}` : ''}`)),
      h('div', { class: 'streak-freeze' }, `🛡 фриз: ${s.freeze}`)),
    h('div', { class: 'streak-dots' }, dots))
}

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
  markSeenMany('cards', app.run.deck)
  // открываем врагов заранее в этом забеге нельзя — откроются при встрече
  showMap()
}

const NODE_GLYPH = { combat: '⚔', elite: '⚔', meditate: 'ॐ', event: '✧', relic: '❖', boss: '◉' }
const NODE_LABEL = { combat: 'бой', elite: 'элита', meditate: 'медитация', event: 'событие', relic: 'реликвия', boss: 'владыка' }

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
    h('div', { class: 'run-bar' },
      h('div', { class: 'chip' }, `ХП <span class="gold">${run.hp}</span>`),
      h('div', { class: 'chip' }, `Прана <span class="gold">${run.prana}</span>`),
      h('div', { class: 'chip' }, `колода <span class="gold">${run.deck.length}</span>`),
      h('div', { class: 'chip' }, `реликвии <span class="gold">${run.relics.length}</span>`)),
    h('div', { class: 'path' }, nodes),
    run.relics.length > 0 ? h('div', { class: 'hint center mt' }, 'реликвии: ' + run.relics.map((r) => RELICS[r].name).join(' · ')) : null,
  ))
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
  }
}

// ─────────────────────────────────────────────────────────────
// Бой
// ─────────────────────────────────────────────────────────────

function enterCombat() {
  const run = app.run
  const enemyId = currentEnemyId(run)
  markSeen('enemies', enemyId)
  saveMeta(app.meta)
  app.combat = startCombatAtNode(run)
  show(combatScreen(app))
}

function onCombatEnd(combat) {
  const run = app.run
  const node = currentNode(run)
  const isFinalBoss = node.type === 'boss' && run.floor === run.floors.length - 1
  const result = finishCombat(run, combat)

  // якоря
  for (const a of combat.anchors) addAnchor(app.meta, a)

  // ежедневный вызов (§16.2): прогресс по метрикам боя
  trackDaily(combat, node.type === 'boss')

  // варны (§12.1): мирный путь — освобождения питают социальный цикл
  if (combat.pacified > 0) {
    const gained = combat.bossPacified ? 2 : 1
    const level = addVarnaPoints(app.meta, gained)
    if (level.leveled) app.varnaLevel = level
  }

  if (result.dead) {
    recordRunEnd(app.meta, 'death')
    app.meta.stats.kills += combat.kills
    app.meta.stats.pacified += combat.pacified
    saveMeta(app.meta)
    showDeath(result)
    return
  }

  app.meta.stats.pacified += combat.pacified
  app.meta.stats.kills += combat.kills
  if (result.knowledge > 0) unlockRandomQuote()

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
    h('p', { class: 'node-text' },
      result.pacified
        ? 'Враг распался в свет. Вы не убили — вы освободили. Так оковы становятся учителями.'
        : 'Враг повержен. Но помните: сила порождает силу — самскара вернётся.'),

    h('div', { class: 'panel' },
      h('div', { class: 'row between' },
        h('span', { class: 'hint' }, 'Прана'),
        h('span', { style: 'color:var(--gold-soft);font-weight:800' }, `+${result.prana}`)),
      result.pacified ? h('div', { class: 'row between mt' },
        h('span', { class: 'hint' }, 'Саттва · Знание'),
        h('span', { style: 'color:var(--sat);font-weight:800' }, '+3 · +1')) : null,
    ),

    result.pacified ? quoteBox('ahimsa') : null,

    varnaLevelLine(),

    h('div', { class: 'hint center' }, 'Выберите карту в колоду (ум)'),
    h('div', { class: 'reward-cards' },
      result.cardChoices.map((id) => cardEl(CARDS[id], { onPlay: () => pickRewardCard(id) }))),
  ))
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
  takeCardReward(app.run, id)
  markSeen('cards', id)
  saveMeta(app.meta)
  sfx.unlock()
  markNodeDone(app.run)
  afterNode()
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
    h('div', { class: 'knowledge-kept' },
      h('div', { class: 'k-chip' }, `Грантха: <b>${Object.keys(app.meta.compendium.cards).length}</b>`),
      h('div', { class: 'k-chip' }, `цитат: <b>${Object.keys(app.meta.quotesUnlocked).length}</b>`),
      h('div', { class: 'k-chip' }, `якорей: <b>${app.meta.practiceDiary.length}</b>`)),
    h('button', { class: 'btn primary', onclick: () => { setTint(null); showTitle() } }, 'Вернуться в Город'),
  ))
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

  function renderTab(t) {
    if (t === 'Карты') {
      const ids = Object.keys(meta.compendium.cards)
      mount(listEl, ids.length === 0
        ? h('p', { class: 'hint center' }, 'Пока пусто — карточки откроются при встрече.')
        : ids.map((id) => entryRow(CARDS[id].name, CARDS[id].sanskrit, typeRu(CARDS[id]), CARDS[id].quoteId)))
    } else if (t === 'Враги') {
      const ids = Object.keys(meta.compendium.enemies)
      mount(listEl, ids.length === 0
        ? h('p', { class: 'hint center' }, 'Пока пусто — враги откроются при встрече.')
        : ids.map((id) => entryRow(`${ENEMIES[id].name} — ${ENEMIES[id].epithet}`, ENEMIES[id].sanskrit, '', ENEMIES[id].quoteId)))
    } else if (t === 'Реликвии') {
      const ids = Object.keys(meta.compendium.relics)
      mount(listEl, ids.length === 0
        ? h('p', { class: 'hint center' }, 'Пока пусто — реликвии открываются при получении.')
        : ids.map((id) => entryRow(RELICS[id].name, '', '', RELICS[id].quoteId)))
    } else {
      const ids = Object.keys(meta.quotesUnlocked)
      mount(listEl, ids.length === 0
        ? h('p', { class: 'hint center' }, 'Цитаты открываются по мере игры.')
        : ids.map((id) => quoteCard(quoteById(id))))
    }
  }

  function quoteCard(q) {
    if (!q) return null
    return h('div', { class: 'quote-card' },
      h('div', { class: 'qc-term sanscr' }, `${q.term} · ${q.sanskrit}`),
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
    listEl,
  ))
  renderTab(tab)
}

function showQuote(quoteId) {
  const q = quoteById(quoteId)
  if (!q) return
  show(h('div', { class: 'screen active' },
    h('button', { class: 'btn ghost small', onclick: showCompendium }, '← Грантха'),
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
    h('p', { class: 'hint mt' }, 'Когда игра совпала с настоящим состоянием ума и вы ответили практикой — рождается якорь. Вот они:'),
    meta.practiceDiary.length === 0
      ? h('p', { class: 'hint center mt' }, 'Пока якорей нет. Сыграйте кииртану при унынии — и связь останется с вами.')
      : meta.practiceDiary.map((a) =>
          h('div', { class: 'anchor-entry' },
            h('div', { class: 'a-item' }, a.situation),
            h('div', { class: 'a-arrow' }, '↓'),
            h('div', { class: 'a-item', style: 'color:var(--gold-soft)' }, a.practice),
            h('div', { class: 'hint center mt' }, 'Попробуйте сегодня: правда работает.'))),
  ))
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
  const res = fn()
  if (!res.ok) {
    toast(res.reason, 'danger')
    return
  }
  sfx.buy()
  markSeen('cards', id)
  markSeen('relics', id)
  saveMeta(app.meta)
  showShop()
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
