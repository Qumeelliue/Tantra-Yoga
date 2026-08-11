// Управление забегом: карта пути, узлы, награды, смерть/перерождение.
import { CARDS, ENEMIES, RELICS, EVENTS, starterDeck, starterDeckFor, JANMAS, cardRewardPool } from './data.js'
import { createCombat, mulberry32 } from './engine.js'

export const CHAKRAS = [
  'Муладхара',
  'Свадхистхана',
  'Манипура',
  'Анахата',
  'Вишуддха',
  'Аджна',
  'Сахасрара',
]

export const CHAKRA_BOSS = {
  0: 'moha',
  1: 'kama_raja',
  2: 'krodha_maharaja',
  3: 'mada_natha',
  4: 'matsarya_kala',
  5: 'lobha_pati',
  6: 'ahankara',
}

export function createRun({ meta, rng, options = {} }) {
  const rand = typeof rng === 'function' ? rng : mulberry32(rng || (Date.now() >>> 0))
  const janna = options.janna || null
  const j = janna && JANMAS[janna] ? JANMAS[janna] : null
  const run = {
    deck: starterDeckFor(janna),
    hp: (options.hp || 60) + (j ? j.hp : 0),
    maxHp: (options.hp || 60) + (j ? j.hp : 0),
    prana: j ? j.prana : 0,
    relics: [],
    floors: [],
    done: [],
    floor: 0,
    nodeIndex: 0,
    status: 'active',
    outcome: null,
    bossPacified: false,
    bossesPacified: 0,
    janna,
    gunaStart: j ? j.gunaStart : { s: 3, r: 3, t: 3 },
    rand,
  }
  buildMap(run)
  return run
}

// Карта: 7 чакр (этажей) × [бой/элита, случайный узел] + босс чакры в конце этажа.
function buildMap(run) {
  const floors = []
  const pool = ['meditate', 'event', 'relic']
  for (let f = 0; f < CHAKRAS.length; f++) {
    const second = pool[Math.floor(run.rand() * pool.length)]
    const firstType = run.rand() < 0.3 ? 'elite' : 'combat'
    floors.push([
      { type: firstType },
      { type: second },
      { type: 'boss', chakra: f },
    ])
  }
  run.floors = floors
  run.done = floors.map((f) => f.map(() => false))
}

// Текущий узел
export function currentNode(run) {
  const floor = run.floors[run.floor]
  if (!floor) return null
  return floor[run.nodeIndex] || null
}

export function currentEnemyId(run) {
  const node = currentNode(run)
  if (!node) return null
  if (node.type === 'boss') return CHAKRA_BOSS[run.floor] || 'moha'
  const pool = ['krodha', 'lobha', 'nidra', 'kama', 'mada', 'matsarya']
  return pool[Math.floor(run.rand() * pool.length)]
}

// ─────────────────────────────────────────────────────────────
// Начало боя на узле
// ─────────────────────────────────────────────────────────────

export function startCombatAtNode(run) {
  const node = currentNode(run)
  const enemyId = currentEnemyId(run)
  const def = { ...ENEMIES[enemyId] }
  if (node.type === 'elite') {
    def.maxHp = Math.round(def.maxHp * 1.4)
    def.epithet = 'Элитный ' + (def.epithet || '')
  }
  // масштабирование босса по этажу: ранние боссы слабее номинала
  if (node.type === 'boss') {
    const t = run.floor / (run.floors.length - 1)
    def.maxHp = Math.round(def.maxHp * (0.75 + 0.25 * t))
  }
  return createCombat({
    deck: run.deck,
    enemies: [def],
    relics: run.relics,
    cards: CARDS,
    enemyDefs: ENEMIES,
    rng: run.rand,
    opts: {
      playerHp: run.hp,
      gunaStart: run.gunaStart || { s: 3, r: 3, t: 3 },
    },
  })
}

// Результат боя: обновить забег, выдать награды, вернуть данные для экрана награды.
export function finishCombat(run, combat) {
  const node = currentNode(run)
  const isBoss = node.type === 'boss'
  const allPacified = combat.pacified > 0 && combat.kills === 0
  const pacifyReward = allPacified && combat.pacified > 0

  run.hp = combat.player.hp
  if (run.hp <= 0) return handleDeath(run, combat)

  // награды
  const rewards = {
    prana: pacifyReward ? (isBoss ? 15 : 8) : isBoss ? 10 : 5,
    pacified: pacifyReward,
    sattvaGain: pacifyReward ? 3 : 0,
    knowledge: pacifyReward ? 1 : 0,
    cardChoices: null,
    relic: null,
    bossHeal: 0,
  }
  if (isBoss) {
    const finalFloor = run.floor === run.floors.length - 1
    // босс чакры даёт восстановление: переход на следующую чакру
    rewards.bossHeal = finalFloor ? 0 : 8
    run.hp = Math.min(run.maxHp, run.hp + rewards.bossHeal)
    if (combat.bossPacified) {
      run.bossPacified = true
      run.bossesPacified += 1
    }
    if (finalFloor) {
      run.status = 'victory'
      // истинный финал «Пробуждение»: успокоены все 7 владык чакр
      run.outcome = run.bossesPacified >= CHAKRAS.length ? 'awakening' : 'strength'
    } else {
      rewards.cardChoices = pickCardChoices(run, 3)
    }
  } else {
    rewards.cardChoices = pickCardChoices(run, 3)
  }
  run.prana += rewards.prana
  if (rewards.sattvaGain > 0) {
    run.hp = Math.min(run.maxHp, run.hp + 2)
  }
  return rewards
}

function handleDeath(run, combat) {
  run.status = 'dead'
  run.outcome = 'death'
  const enemy = combat.enemies.find((e) => !e.dead && !e.pacified) || combat.enemies[0]
  return {
    dead: true,
    killedBy: enemy ? enemy.name : 'неведение',
    lastIntent: enemy ? enemy.intentName : null,
    hpAtDeath: 0,
  }
}

function pickCardChoices(run, n) {
  const pool = cardRewardPool()
  const chosen = new Set()
  while (chosen.size < n && pool.length > 0) {
    chosen.add(pool[Math.floor(run.rand() * pool.length)].id)
  }
  return [...chosen]
}

export function takeCardReward(run, cardId) {
  run.deck.push(cardId)
  return cardId
}

export function gainRelic(run, relicId) {
  run.relics.push(relicId)
  return relicId
}

// ─────────────────────────────────────────────────────────────
// Медитация (очистка ума)
// ─────────────────────────────────────────────────────────────

export function meditatableCards(run) {
  return run.deck.filter((id) => CARDS[id].type === 'curse' || CARDS[id].type === 'vritti')
}

export function doMeditate(run, burnIds) {
  for (const id of burnIds) {
    const i = run.deck.indexOf(id)
    if (i >= 0) run.deck.splice(i, 1)
  }
  run.hp = Math.min(run.maxHp, run.hp + 5)
  return { burned: burnIds.length, healed: 5 }
}

// ─────────────────────────────────────────────────────────────
// События
// ─────────────────────────────────────────────────────────────

export function eventOptions(run) {
  const ids = Object.keys(EVENTS)
  const id = ids[Math.floor(run.rand() * ids.length)]
  return { id, event: EVENTS[id] }
}

export function resolveEventChoice(run, eventId, choiceIndex) {
  const ev = EVENTS[eventId]
  if (!ev) return { anchors: [], knowledge: 0 }
  const choice = ev.choices[choiceIndex]
  if (!choice) return { anchors: [], knowledge: 0 }
  const results = { anchors: [], knowledge: 0 }
  for (const fx of choice.effects) {
    if (fx.kind === 'add_card') run.deck.push(fx.cardId)
    else if (fx.kind === 'heal') run.hp = Math.min(run.maxHp, run.hp + fx.amount)
    else if (fx.kind === 'prana') run.prana += fx.amount
    else if (fx.kind === 'guna') results.sattvaGain = (results.sattvaGain || 0) + fx.amount
    else if (fx.kind === 'knowledge') results.knowledge += fx.amount
    else if (fx.kind === 'anchor') results.anchors.push(fx)
  }
  return results
}

// ─────────────────────────────────────────────────────────────
// Продвижение по карте
// ─────────────────────────────────────────────────────────────

export function isNodeDone(run, i) {
  return !!(run.done[run.floor] && run.done[run.floor][i])
}

export function markNodeDone(run, i = run.nodeIndex) {
  if (run.done[run.floor]) run.done[run.floor][i] = true
}

export function floorComplete(run) {
  const row = run.done[run.floor]
  return row ? row.every(Boolean) : false
}

export function advanceFloor(run) {
  run.floor += 1
  run.nodeIndex = 0
  if (run.floor >= run.floors.length) return false
  return true
}
