// Движок боя Tantra Yoga. Чистая логика без DOM — тестируется через Vitest.
// Колода = ум, гуны = ресурсы, прама = равновесие, ахимса = мирный путь.

export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const DEFAULT_OPTIONS = {
  playerHp: 50,
  energyPerTurn: 2,
  drawPerTurn: 5,
  gunaStart: { s: 3, r: 3, t: 3 },
  samadhiThreshold: 12,
  pramaBonus: 1,
}

const PRAXIS_TYPES = new Set(['practice', 'mantra', 'kiirtana', 'seva'])

// ─────────────────────────────────────────────────────────────
// Создание боя
// ─────────────────────────────────────────────────────────────

export function createCombat({ deck, enemies, relics = [], cards, enemyDefs, rng = Math.random, opts = {} }) {
  const o = { ...DEFAULT_OPTIONS, ...opts }
  const rand = typeof rng === 'function' ? rng : mulberry32(rng)
  const draw = [...deck]
  shuffle(draw, rand)

  const relicMods = aggregateRelics(relics)
  const synergies = computeSynergies(deck, cards)

  const state = {
    rand,
    cards,
    enemyDefs,
    relicMods,
    synergies,
    player: {
      hp: o.playerHp,
      maxHp: o.playerHp,
      block: 0,
      energy: 0,
      maxEnergy: o.energyPerTurn,
      guna: { ...o.gunaStart },
      strength: 0,
      statuses: {},
      samadhiGain: 0,
      inSamadhi: false,
      samadhiTurns: 0,
      prama: false,
      imbalance: null,
    },
    enemies: enemies.map((def) => makeEnemy(def)),
    piles: { draw, hand: [], discard: [], exhaust: [], removed: [] },
    turn: 0,
    phase: 'player',
    pending: null,
    outcome: null,
    kills: 0,
    pacified: 0,
    kiirtanaPlayed: 0,
    vrittiPlayed: false,
    playedCards: [],
    bossPacified: false,
    log: [],
    anchors: [],
    peek: null,
    o,
    autoResolve: opts.autoResolve === true,
  }

  // модификаторы реликвий: стартовые гуны, стартовая сила врага, стартовый хил
  if (relicMods.gunaStartS) state.player.guna.s += relicMods.gunaStartS
  if (relicMods.playerStartStrength) state.player.strength += relicMods.playerStartStrength
  if (relicMods.enemyStartStrength) {
    for (const e of state.enemies) e.strength += relicMods.enemyStartStrength
  }
  if (relicMods.combatStartHeal) {
    state.player.maxHp += relicMods.combatStartHeal
    state.player.hp += relicMods.combatStartHeal
  }

  recomputeGunas(state)
  rollIntents(state)
  gentleOpen(state)
  startPlayerTurn(state)
  // Стартовый блок (Шаоча-майнджуса) и память (Дхрувасмрити) — после startPlayerTurn,
  // иначе он их обнулит (блок) или сотрёт (peek)
  if (relicMods.combatStartBlock) state.player.block += relicMods.combatStartBlock
  if (relicMods.peekStart && state.piles.draw.length > 0) {
    state.peek = state.piles.draw.slice(-1)
  }
  return state
}

// Первый ход врага не должен быть самым тяжёлым — даём игроку разогнаться.
function gentleOpen(state) {
  for (const e of state.enemies) {
    if (e.dead || e.pacified) continue
    if (e.intentDamage >= 7) {
      const soft = e.def.moves.filter((m) => m.damage > 0 && m.damage < 7)
      if (soft.length > 0) setIntent(e, soft[Math.floor(state.rand() * soft.length)])
    }
  }
}

function makeEnemy(def) {
  return {
    def,
    id: def.id,
    name: def.name,
    epithet: def.epithet,
    glyph: def.glyph,
    maxHp: def.maxHp,
    hp: def.maxHp,
    block: 0,
    strength: 0,
    statuses: {},
    calm: 0,
    calmMax: def.calmMax,
    intentName: null,
    intentEffects: [],
    intentDamage: 0,
    intentIndex: 0,
    dead: false,
    pacified: false,
    halfTriggered: false,
  }
}

function aggregateRelics(relics) {
  const m = {
    pacifyBonus: 0,
    practiceCostMod: 0,
    pacifySattvaBonus: 0,
    tamasImmune: false,
    kiirtanaDraw: 0,
    gunaStartS: 0,
    enemyStartStrength: 0,
    combatStartHeal: 0,
    peekStart: false,
    playerStartStrength: 0,
    combatStartBlock: 0,
  }
  for (const id of relics || []) {
    if (id === 'pratik') m.pacifyBonus += 1
    if (id === 'tridanda') m.practiceCostMod -= 1
    if (id === 'shankha') m.pacifySattvaBonus += 1
    if (id === 'kambala') m.tamasImmune = true
    if (id === 'mahamantra_mala') m.kiirtanaDraw += 1
    if (id === 'shiva_lingam') m.gunaStartS += 1
    if (id === 'kalachakra') m.enemyStartStrength -= 1
    if (id === 'tulasi') m.tamasImmune = true
    if (id === 'prana_drop') m.combatStartHeal += 3
    if (id === 'guru_darshana') m.practiceCostMod -= 1
    if (id === 'dhruvasmriti') m.peekStart = true
    if (id === 'jatismara') m.playerStartStrength += 1
    if (id === 'shaoca_mainjusa') m.combatStartBlock += 3
    if (id === 'kaopiina') m.gunaStartS += 2
  }
  return m
}

// Синергии-«потоки» (§8.5): 3+ карты одной «школы» в колоде открывают пассивный
// бонус на забег. Колода = ум: собирая практики, игрок «становится» ими.
export function computeSynergies(deck, cards) {
  let ahimsa = 0
  let kiirtana = 0
  let practice = 0
  let seva = 0
  for (const id of deck) {
    const c = cards[id]
    if (!c) continue
    if (c.id === 'ahimsa' || (c.tags && c.tags.includes('pacify'))) ahimsa++
    if (c.type === 'kiirtana') kiirtana++
    if (c.type === 'practice') practice++
    if (c.type === 'seva') seva++
  }
  return {
    ahimsa: ahimsa >= 3,
    kiirtana: kiirtana >= 3,
    yama: practice >= 4,
    seva: seva >= 3,
    n: { ahimsa, kiirtana, practice, seva },
  }
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

// ─────────────────────────────────────────────────────────────
// Ходы
// ─────────────────────────────────────────────────────────────

export function startPlayerTurn(state) {
  const p = state.player
  state.turn += 1
  state.phase = 'player'
  state.pending = null
  state.peek = null

  p.block = 0
  for (const e of state.enemies) if (!e.dead && !e.pacified) e.block = 0

  if (p.inSamadhi) {
    p.samadhiTurns -= 1
    if (p.samadhiTurns <= 0) p.inSamadhi = false
  }

  p.energy = p.maxEnergy + (p.inSamadhi ? 1 : 0)

  const tamasPenalty = p.imbalance === 't' && !state.relicMods.tamasImmune
  // Дремота (drowsy): ум «спит» — рука на 1 карту меньше (тикает в конце хода, §9.1)
  let drawCount = state.o.drawPerTurn + (tamasPenalty ? -1 : 0) - (p.statuses.drowsy > 0 ? 1 : 0)
  if (drawCount < 0) drawCount = 0
  drawCards(state, drawCount)

  return [{ type: 'turn_start', turn: state.turn }]
}

export function playCard(state, handIndex, targetEnemy = 0) {
  const events = []
  const cardId = state.piles.hand[handIndex]
  if (!cardId) return events
  const card = state.cards[cardId]
  const cost = effectiveCost(state, card)

  if (state.player.energy < cost) {
    events.push({ type: 'error', message: 'Не хватает энергии' })
    return events
  }

  state.player.energy -= cost
  state.piles.hand.splice(handIndex, 1)
  const ctx = {
    source: 'player',
    targetEnemy,
    cardId,
    card,
    autoResolve: state.autoResolve,
    events,
  }
  applyEffects(state, card.effects, ctx)

  // Гуна-эффект карты
  applyGuna(state, card.guna, 'player', events)
  recomputeGunas(state)

  // Кииртан-якорь и доп. эффекты реликвий
  if (card.type === 'kiirtana') state.kiirtanaPlayed += 1
  // Испытание Ямы (§исследование): сыгранная оковка нарушает правило «не кормить вихри»
  if (card.type === 'vritti') state.vrittiPlayed = true
  // «Живые цитаты» (§исследование): применённая карта = прожитый термин
  if (!state.playedCards.includes(card.id)) state.playedCards.push(card.id)
  if (card.type === 'kiirtana' && state.relicMods.kiirtanaDraw > 0) {
    drawCards(state, state.relicMods.kiirtanaDraw, events)
  }
  // Поток Кииртана (§8.5): 3+ кииртаны в колоде — пение несёт больше саттвы
  if (card.type === 'kiirtana' && state.synergies.kiirtana) {
    applyGuna(state, { s: 1 }, 'player', events)
    recomputeGunas(state)
  }
  if (card.id === 'nama_kevalam') {
    maybeAnchor(state, 'despondency', events)
  }

  if (card.exhaust) {
    state.piles.exhaust.push(cardId)
  } else {
    state.piles.discard.push(cardId)
  }

  // Паши (§9.5): карта-противоядие (calmCard) успокаивает окову — не только ахимса.
  // Рипу «контролируются», пашам «сопротивляются» (PiaN 12/2): против страха — Тапах,
  // против стыда — Сева, против ненависти — Ахимса (двойной calm), и т.д.
  const pasha = state.enemies[ctx.targetEnemy]
  if (pasha && !pasha.dead && !pasha.pacified && pasha.def.calmCard && pasha.def.calmCard === card.id) {
    pasha.calm += 1
    events.push({ type: 'pacify_gain', enemy: ctx.targetEnemy, calm: pasha.calm })
    if (pacifyReady(state, pasha)) {
      pacifyEnemy(state, ctx.targetEnemy, events)
      // Якорь в жизнь (§11): пашу освободила правильная практика-противоядие.
      // «Страх → Тапах», «Стыд → Сева» — игрок уносит это в реальную жизнь.
      const a = { situation: pasha.name.toUpperCase(), practice: card.name.toUpperCase() }
      if (!state.anchors.some((x) => x.situation === a.situation && x.practice === a.practice)) {
        state.anchors.push(a)
        events.push({ type: 'anchor', ...a })
      }
    }
  }

  checkEnemies(state, events)
  checkOutcome(state, events)
  return events
}

// Бонус кииртан-ритма (§16.2, идея №7): точное пение усиливает кииртану.
// quality = 0..3 точных тапов по биту. 1→+1 саттва, 2→+1 саттва и +1 карта,
// 3→+2 саттвы и +1 карта. Вызывается из UI ПОСЛЕ playCard.
export function kiirtanaRhythmBonus(state, quality = 0) {
  const events = []
  const q = Math.max(0, Math.min(3, Math.floor(quality) || 0))
  if (q >= 1) {
    applyGuna(state, { s: q >= 3 ? 2 : 1 }, 'player', events)
    recomputeGunas(state)
  }
  if (q >= 2) {
    drawCards(state, 1, events)
  }
  events.push({ type: 'kiirtana_rhythm', quality: q, sattva: q >= 3 ? 2 : q >= 1 ? 1 : 0, drew: q >= 2 ? 1 : 0 })
  checkOutcome(state, events)
  return events
}

export function endTurn(state) {
  const events = []
  // вся рука в сброс
  state.piles.discard.push(...state.piles.hand)
  state.piles.hand = []
  state.phase = 'enemy'

  // Статусы ума игрока (§9.1): weak/drowsy отработали свой ход — тикают вниз,
  // пока враги действуют (как в Slay the Spire). Вновь наложенное останется на ход.
  if (state.player.statuses.weak > 0) state.player.statuses.weak -= 1
  if (state.player.statuses.drowsy > 0) state.player.statuses.drowsy -= 1

  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]
    if (e.dead || e.pacified) continue
    const ctx = { source: 'enemy', enemyIndex: i, targetEnemy: i, events }
    applyEffects(state, e.intentEffects, ctx)
    if (e.statuses.weak > 0) e.statuses.weak -= 1
    checkEnemies(state, events)
  }
  rollIntents(state)
  checkOutcome(state, events)
  if (!state.outcome) startPlayerTurn(state)
  return events
}

// ─────────────────────────────────────────────────────────────
// Эффекты
// ─────────────────────────────────────────────────────────────

export function applyEffects(state, effects, ctx) {
  for (const fx of effects || []) {
    const fn = EFFECTS[fx.kind]
    if (fn) fn(state, fx, ctx)
  }
}

const EFFECTS = {
  damage(state, fx, ctx) {
    const target = fx.target || (ctx.source === 'player' ? 'enemy' : 'player')
    if (target === 'player') {
      damagePlayer(state, fx.amount, ctx)
    } else if (target === 'self') {
      damagePlayer(state, fx.amount, ctx) // атака на игрока от врага ("self" не используется)
    } else {
      damageEnemy(state, ctx.targetEnemy, fx.amount, ctx)
    }
  },
  block(state, fx, ctx) {
    const target = fx.target === 'self' ? ctx.enemyIndex : null
    if (target != null && ctx.source === 'enemy') {
      const e = state.enemies[target]
      e.block += effectiveBlock(state, fx.amount)
    } else {
      state.player.block += effectiveBlock(state, fx.amount)
    }
    ctx.events.push({ type: 'block', target: target != null ? 'enemy' : 'player', amount: fx.amount })
  },
  heal(state, fx, ctx) {
    const target = fx.target === 'self' ? ctx.enemyIndex : null
    if (target != null) {
      const e = state.enemies[target]
      e.hp = Math.min(e.maxHp, e.hp + fx.amount)
    } else {
      // Поток Служения (§8.5): лечение игрока сильнее, когда в колоде 3+ севы
      const amount = fx.amount + (state.synergies.seva ? 1 : 0)
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount)
      ctx.events.push({ type: 'heal', target: 'player', amount })
    }
    ctx.events.push({ type: 'heal', target: target != null ? 'enemy' : 'player', amount: fx.amount })
  },
  draw(state, fx, ctx) {
    drawCards(state, fx.amount, ctx.events)
  },
  energy(state, fx, ctx) {
    state.player.energy = Math.max(0, state.player.energy + fx.amount)
    ctx.events.push({ type: 'energy', amount: fx.amount })
  },
  guna(state, fx, ctx) {
    const target = fx.target === 'player' ? 'player' : ctx.source === 'enemy' ? 'player' : 'player'
    applyGuna(state, { [fx.which]: fx.amount }, target, ctx.events)
    recomputeGunas(state)
  },
  strength(state, fx, ctx) {
    if (fx.target === 'self') {
      const e = state.enemies[ctx.enemyIndex]
      e.strength += fx.amount
      ctx.events.push({ type: 'buff', target: 'enemy', text: `сила ${fx.amount > 0 ? '+' : ''}${fx.amount}` })
    } else {
      state.player.strength += fx.amount
      ctx.events.push({ type: 'buff', target: 'player', text: `сила ${fx.amount > 0 ? '+' : ''}${fx.amount}` })
    }
  },
  status(state, fx, ctx) {
    if (fx.target === 'all_enemies') {
      for (const e of state.enemies) {
        if (e.dead || e.pacified) continue
        e.statuses[fx.status] = (e.statuses[fx.status] || 0) + fx.amount
      }
      ctx.events.push({ type: 'status', target: 'enemy', status: fx.status, amount: fx.amount })
    } else if (fx.target === 'player') {
      state.player.statuses[fx.status] = (state.player.statuses[fx.status] || 0) + fx.amount
      ctx.events.push({ type: 'status', target: 'player', status: fx.status, amount: fx.amount })
    } else if (ctx.source === 'player') {
      const e = state.enemies[ctx.targetEnemy]
      e.statuses[fx.status] = (e.statuses[fx.status] || 0) + fx.amount
      ctx.events.push({ type: 'status', target: 'enemy', status: fx.status, amount: fx.amount })
    }
  },
  pacify(state, fx, ctx) {
    const i = ctx.targetEnemy
    const e = state.enemies[i]
    if (!e || e.dead || e.pacified) return
    // Поток Ахимсы (§8.5): успокоение эффективнее, когда в колоде 3+ ахимсы
    const bonus = state.relicMods.pacifyBonus + (state.synergies.ahimsa ? 1 : 0)
    e.calm += fx.amount + bonus
    ctx.events.push({ type: 'pacify_gain', enemy: i, calm: e.calm })
    // успокоение по правилу: полный счётчик + HP ≤ 50% (для босса — ещё и прама, §18)
    if (pacifyReady(state, e)) {
      pacifyEnemy(state, i, ctx.events)
    }
  },
  discardFromHand(state, fx, ctx) {
    const idx = state.piles.hand.findIndex((id) => (state.cards[id].type) === fx.filter)
    if (idx >= 0) {
      const id = state.piles.hand.splice(idx, 1)[0]
      state.piles.discard.push(id)
      ctx.events.push({ type: 'discard', cardId: id })
    }
  },
  discardRandomFromHand(state, fx, ctx) {
    if (state.piles.hand.length === 0) return
    const idx = Math.floor(state.rand() * state.piles.hand.length)
    const id = state.piles.hand.splice(idx, 1)[0]
    state.piles.discard.push(id)
    ctx.events.push({ type: 'stolen', cardId: id })
  },
  removeFromDeck(state, fx, ctx) {
    const options = findCardsInDeck(state, fx.filter)
    if (options.length === 0) return
    if (ctx.autoResolve) {
      burnFromDeck(state, options[0])
      ctx.events.push({ type: 'burn', cardId: options[0] })
    } else {
      state.pending = { type: 'removal', options }
    }
  },
  addCurseToDeck(state, fx, ctx) {
    for (let k = 0; k < fx.amount; k++) {
      state.piles.draw.push(fx.cardId)
    }
    ctx.events.push({ type: 'curse_added', cardId: fx.cardId, amount: fx.amount })
  },
  shuffleHand(state, fx, ctx) {
    const n = state.piles.hand.length
    if (n === 0) return
    state.piles.draw.push(...state.piles.hand)
    state.piles.hand = []
    shuffle(state.piles.draw, state.rand)
    drawCards(state, n, ctx.events)
    ctx.events.push({ type: 'confused', amount: n })
  },
  scry(state, fx, ctx) {
    state.peek = state.piles.draw.slice(0, fx.amount)
    ctx.events.push({ type: 'scry', amount: fx.amount })
  },
  addCardToDraw(state, fx, ctx) {
    for (let k = 0; k < (fx.amount || 1); k++) {
      state.piles.draw.push(fx.cardId)
    }
    ctx.events.push({ type: 'card_added', cardId: fx.cardId, amount: fx.amount || 1 })
  },
  exhaustFromHand(state, fx, ctx) {
    const filters = Array.isArray(fx.filter) ? fx.filter : [fx.filter]
    const idx = state.piles.hand.findIndex((id) => {
      const c = state.cards[id]
      if (!c) return false
      return filters.length === 0 ? true : filters.some((f) => c.type === f || c.id === f)
    })
    if (idx >= 0) {
      const id = state.piles.hand.splice(idx, 1)[0]
      state.piles.exhaust.push(id)
      ctx.events.push({ type: 'burn', cardId: id })
    }
  },
  balance(state, fx, ctx) {
    let g = state.player.guna
    let guard = 0
    while (guard++ < 30) {
      const lead = leadingGuna(g)
      if (!lead) break
      const minKey = g.s <= g.r && g.s <= g.t ? 's' : g.r <= g.t ? 'r' : 't'
      g[lead] -= 1
      g[minKey] += 1
    }
    ctx.events.push({ type: 'balance' })
  },
}

function effectiveBlock(state, amount) {
  let a = amount
  if (state.player.prama) a += state.o.pramaBonus
  return Math.max(0, a)
}

function effectiveDamagePlayer(state, base, enemyIndex) {
  const e = state.enemies[enemyIndex]
  let dmg = base + (e ? e.strength : 0)
  if (state.player.prama) dmg -= state.o.pramaBonus
  if (state.player.imbalance === 't' && !state.relicMods.tamasImmune) dmg += 1
  if (e && e.statuses.weak > 0) dmg -= 2 * e.statuses.weak
  return Math.max(0, dmg)
}

function effectiveDamageEnemy(state, base) {
  const p = state.player
  let dmg = base + p.strength
  if (p.prama) dmg += state.o.pramaBonus
  if (p.imbalance === 's') dmg -= 1
  if (p.imbalance === 'r') dmg += Math.floor(state.rand() * 2)
  // слабость ума (weak): атаки садхаки притупляются
  if (p.statuses.weak > 0) dmg -= 2 * p.statuses.weak
  return Math.max(0, dmg)
}

export function damagePlayer(state, amount, ctx = { events: [] }) {
  const dmg = effectiveDamagePlayer(state, amount, ctx.enemyIndex)
  const absorbed = Math.min(state.player.block, dmg)
  state.player.block -= absorbed
  const hpLoss = Math.max(0, dmg - absorbed)
  state.player.hp -= hpLoss
  ctx.events.push({ type: 'damage', target: 'player', amount: dmg, absorbed, hp: state.player.hp })
  if (state.player.hp <= 0) {
    state.player.hp = 0
    ctx.events.push({ type: 'defeat' })
    checkOutcome(state, ctx.events)
  }
  return dmg
}

export function damageEnemy(state, i, amount, ctx = { events: [] }) {
  const e = state.enemies[i]
  if (!e || e.dead || e.pacified) return 0
  const dmg = effectiveDamageEnemy(state, amount)
  const absorbed = Math.min(e.block, dmg)
  e.block -= absorbed
  const hpLoss = Math.max(0, dmg - absorbed)
  e.hp -= hpLoss
  ctx.events.push({ type: 'damage', target: 'enemy', enemy: i, amount: dmg, absorbed, hp: e.hp })
  if (e.hp <= 0) {
    e.hp = 0
    e.dead = true
    state.kills += 1
    ctx.events.push({ type: 'kill', enemy: i })
  } else {
    triggerThreshold(state, e, ctx.events)
  }
  return dmg
}

function triggerThreshold(state, e, events) {
  const th = e.def.onThreshold
  if (!th || e.halfTriggered) return
  const hpPct = e.hp / e.maxHp
  if (th.trigger === 'hp_lte_50' && hpPct <= 0.5) {
    e.halfTriggered = true
    applyEffects(state, th.effects, { source: 'enemy', enemyIndex: state.enemies.indexOf(e), targetEnemy: state.enemies.indexOf(e), events })
    if (th.log) events.push({ type: 'log', text: th.log })
  }
}

// Успокоение готово? Полный счётчик Ахимсы + HP ≤ 50%. Босс чакры требует
// ещё и праму (§18): мирный путь против владыки — это равновесие ума, а не случай.
function pacifyReady(state, e) {
  if (e.calm < e.calmMax) return false
  if (e.hp > e.maxHp / 2) return false
  if (e.def.isBoss && !state.player.prama) return false
  return true
}

function pacifyEnemy(state, i, events) {
  const e = state.enemies[i]
  e.pacified = true
  state.pacified += 1
  if (e.def.isBoss) state.bossPacified = true
  // враг «распадается» в свет: +3 саттвы (+ бонус Шанкхи)
  const bonus = state.relicMods.pacifySattvaBonus
  applyGuna(state, { s: 3 + bonus }, 'player', events)
  recomputeGunas(state)
  events.push({ type: 'pacified', enemy: i, message: `${e.name} освобождён(а). +${3 + bonus} саттвы.` })
}

// Самадхи-действие (§8.4): в режиме ясности можно «отпустить» одного обычного врага.
// Боссов так нельзя — владык освобождают только по правилу §9 (Ахимса + прама).
export function samadhiPacify(state, i = 0) {
  const events = []
  const e = state.enemies[i]
  if (!state.player.inSamadhi) return events
  if (!e || e.dead || e.pacified || e.def.isBoss) return events
  pacifyEnemy(state, i, events)
  checkOutcome(state, events)
  return events
}

function checkEnemies(state, events) {
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]
    if (e.hp <= 0 && !e.dead) {
      e.dead = true
      state.kills += 1
      events.push({ type: 'kill', enemy: i })
    }
  }
}

export function checkOutcome(state, events = []) {
  const alive = state.enemies.filter((e) => !e.dead && !e.pacified)
  if (alive.length === 0) {
    state.outcome = 'victory'
    events.push({ type: 'victory', kills: state.kills, pacified: state.pacified })
  } else if (state.player.hp <= 0) {
    state.outcome = 'defeat'
    events.push({ type: 'defeat' })
  }
  return state.outcome
}

// ─────────────────────────────────────────────────────────────
// Гуны, прама, перекос
// ─────────────────────────────────────────────────────────────

export function applyGuna(state, delta, who = 'player', events = []) {
  const g = who === 'player' ? state.player.guna : state.player.guna
  if (delta.s) g.s += delta.s
  if (delta.r) g.r += delta.r
  if (delta.t) g.t += delta.t
  // Накопление саттвы за бой → самадхи
  if (who === 'player' && delta.s > 0) {
    state.player.samadhiGain += delta.s
    if (state.player.samadhiGain >= state.o.samadhiThreshold && !state.player.inSamadhi) {
      state.player.inSamadhi = true
      state.player.samadhiTurns = 3
      events.push({ type: 'samadhi', message: 'Самадхи: ясность! Практики бесплатны.' })
    }
  }
  events.push({ type: 'guna', who, delta: { ...delta } })
}

export function recomputeGunas(state) {
  const g = state.player.guna
  const p = state.player
  p.prama = g.s >= g.r && g.s >= g.t && g.s >= 1 && g.r >= 1 && g.t >= 1
  const lead = leadingGuna(g)
  if (lead && state.relicMods.tamasImmune && lead === 't') {
    p.imbalance = null
  } else {
    p.imbalance = lead
  }
  return p
}

export function leadingGuna(g) {
  const keys = ['s', 'r', 't']
  const vals = keys.map((k) => g[k])
  const sorted = [...vals].sort((a, b) => b - a)
  if (sorted[0] - sorted[1] >= 2) return keys[vals.indexOf(sorted[0])]
  return null
}

// ─────────────────────────────────────────────────────────────
// Колода / рука / стоимость
// ─────────────────────────────────────────────────────────────

export function drawCards(state, n, events = []) {
  for (let i = 0; i < n; i++) {
    if (state.piles.draw.length === 0) {
      if (state.piles.discard.length === 0) break
      state.piles.draw = shuffleArray([...state.piles.discard], state.rand)
      state.piles.discard = []
    }
    const cardId = state.piles.draw.pop()
    state.piles.hand.push(cardId)
    events.push({ type: 'draw', cardId })
  }
}

function shuffleArray(arr, rand) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function effectiveCost(state, card) {
  const p = state.player
  if (!card) return 0
  let cost = card.cost
  if (PRAXIS_TYPES.has(card.type)) {
    if (p.inSamadhi) return 0
    if (p.imbalance === 'r') cost += 1
    if (p.imbalance === 's') cost -= 1
    cost += state.relicMods.practiceCostMod
    // Поток Ямы (§8.5): 4+ практик в колоде — дисциплина удешевляет практики
    if (state.synergies.yama && card.type === 'practice') cost -= 1
  }
  return Math.max(0, cost)
}

export function findCardsInDeck(state, filter) {
  const found = []
  for (const id of state.piles.draw) {
    if (state.cards[id].type === filter) found.push(id)
  }
  if (found.length === 0) {
    for (const id of state.piles.discard) {
      if (state.cards[id].type === filter) found.push(id)
    }
  }
  return [...new Set(found)]
}

export function burnFromDeck(state, cardId) {
  const removeOne = (arr) => {
    const i = arr.indexOf(cardId)
    if (i >= 0) {
      arr.splice(i, 1)
      return true
    }
    return false
  }
  if (!removeOne(state.piles.draw)) removeOne(state.piles.discard)
  state.piles.removed.push(cardId)
  if (state.pending && state.pending.type === 'removal') state.pending = null
}

export function resolveRemoval(state, cardId) {
  if (!state.pending || state.pending.type !== 'removal') return []
  if (!state.pending.options.includes(cardId)) return []
  burnFromDeck(state, cardId)
  return [{ type: 'burn', cardId }]
}

// ─────────────────────────────────────────────────────────────
// Намерения врагов
// ─────────────────────────────────────────────────────────────

function rollIntents(state) {
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]
    if (e.dead || e.pacified) continue
    const moves = e.def.moves
    let idx
    if (moves.length === 1) {
      idx = 0
    } else {
      idx = Math.floor(state.rand() * moves.length)
      // не повторять тяжёлый ход дважды подряд
      if (idx === e.intentIndex && moves[idx].damage > 5 && moves.length > 1) {
        idx = (idx + 1) % moves.length
      }
    }
    setIntent(e, moves[idx])
  }
}

function setIntent(e, move) {
  e.intentName = move.name
  e.intentEffects = move.effects
  e.intentDamage = move.damage
  e.intentIndex = e.def.moves.indexOf(move)
}

// ─────────────────────────────────────────────────────────────
// Якоря (Дневник практики)
// ─────────────────────────────────────────────────────────────

export function maybeAnchor(state, kind, events) {
  const p = state.player
  const hpPct = p.hp / p.maxHp
  const anchors = []
  if (kind === 'despondency' && (hpPct < 0.35 || p.imbalance === 't')) {
    anchors.push({ situation: 'УНЫНИЕ', practice: 'КИИРТАН' })
  }
  if (p.imbalance === 'r') {
    anchors.push({ situation: 'ГНЕВ', practice: 'АХИМСА' })
  }
  if (hpPct < 0.3) {
    anchors.push({ situation: 'СТРАДАНИЕ', practice: 'СЛУЖЕНИЕ' })
  }
  for (const a of anchors) {
    if (!state.anchors.some((x) => x.situation === a.situation && x.practice === a.practice)) {
      state.anchors.push(a)
      events.push({ type: 'anchor', ...a })
    }
  }
}
