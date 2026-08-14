// Управление забегом: карта пути, узлы, награды, смерть/перерождение.
import { CARDS, ENEMIES, RELICS, EVENTS, starterDeck, starterDeckForFocus, MENTALITIES, MENTALITY_ORDER, mentalityLevel, SADVIPRA_MIN_LEVEL, cardRewardPool, TRIALS, availableTrials } from './data.js'
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

// Четыре лепестка чакры (§5.3): Кама → Артха → Дхарма → Мокша. Правило «не оседать»:
// каждый лепесток — урок, но застревать в нём нельзя (застревание = перекос гун).
export const LEPESTKI = ['Кама', 'Артха', 'Дхарма', 'Мокша']

export function createRun({ meta, rng, options = {} }) {
  const rand = typeof rng === 'function' ? rng : mulberry32(rng || (Date.now() >>> 0))
  // Фокус ментальности (§12.2): какую ментальность ума тренируем в этой жизни —
  // личный выбор садхаки, не «рождение в варне». Все четыре растут параллельно.
  const focus = options.focus || null
  const f = focus && MENTALITIES[focus] ? MENTALITIES[focus] : null
  // Уровни ментальностей (§12.1): слабая ментальность = недостающий навык.
  // Уровни приходят из меты (растут между забегами) и дают навыки в бою и лавке.
  const levels = {}
  let sadvipra = true
  for (const id of MENTALITY_ORDER) {
    const lv = mentalityLevel((meta && meta.varnas && meta.varnas[id]) || 0)
    levels[id] = lv
    if (lv < SADVIPRA_MIN_LEVEL) sadvipra = false
  }
  // Путь садвипры (§12.3): все четыре ментальности зрелы — каждый навык на максимуме
  // (мудрость зрелого ума, а не «усиление одной»).
  if (sadvipra) {
    for (const id of MENTALITY_ORDER) levels[id] = Math.min(3, (levels[id] || 0) + 1)
  }
  const shudraHp = (levels.shudra || 0) * 4 // выносливость присутствия (Human Society 2)
  // Ветви мастерства (§12.1, варны-деревья): выбор направления на уровне 3.
  // Применяются в run (ХП/прана) и в бою (через mentalities → engine).
  const branches = { ...((meta && meta.varnaBranches) || {}) }
  let hpBonus = 0
  let pranaBonus = 0
  if (branches.shudra === 'endurance') hpBonus += 8
  if (branches.vaeshya === 'giver') pranaBonus += 5
  const run = {
    deck: starterDeckForFocus(focus),
    hp: (options.hp || 60) + (f ? f.focusHp || 0 : 0) + shudraHp + hpBonus,
    maxHp: (options.hp || 60) + (f ? f.focusHp || 0 : 0) + shudraHp + hpBonus,
    prana: (f ? f.focusPrana || 0 : 0) + pranaBonus,
    relics: [],
    floors: [],
    done: [],
    floor: 0,
    nodeIndex: 0,
    status: 'active',
    outcome: null,
    bossPacified: false,
    bossesPacified: 0,
    pacifiedBosses: [],
    focus,
    gunaStart: { s: 3, r: 3, t: 3 },
    unlocked: (meta && meta.unlockedCards) ? [...meta.unlockedCards] : [],
    mentalities: levels,
    branches,
    rand,
  }
  buildMap(run)
  return run
}

// Карта: 7 чакр (этажей) × [бой/элита, случайный узел] + босс чакры в конце этажа.
function buildMap(run) {
  const floors = []
  // «Воспоминание» (SRS-узел, §исследование), «Испытание» (дерево Ямы/Ниямы, §16.2)
  // и обычные узлы. Если все испытания пройдены — «Испытание» не появляется.
  const pool = ['meditate', 'event', 'relic', 'memory', 'trial']
  for (let f = 0; f < CHAKRAS.length; f++) {
    const secondType = pool[Math.floor(run.rand() * pool.length)]
    const second = { type: secondType }
    if (secondType === 'trial') {
      // «Испытание» (дерево Ямы/Ниямы): случайное из доступных на этом этаже
      // (первые неоткрытые ветвей + minFloor — прогрессивная сложность, §7.2a)
      const openTrials = availableTrials(run.unlocked, f)
      if (openTrials.length > 0) {
        const picked = openTrials[Math.floor(run.rand() * openTrials.length)]
        second.trialId = picked.id
        second.rule = picked.rule
      } else {
        second.type = 'memory' // на этом этаже нет доступных испытаний — узел воспоминания
      }
    }
    const firstType = run.rand() < 0.3 ? 'elite' : 'combat'
    floors.push([
      { type: firstType },
      second,
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
  // враг узла фиксируется при входе (чтобы markSeen и бой совпадали)
  if (node.enemyId) return node.enemyId
  // Паши (§9.5) — оковы извне, им «сопротивляются»: встречаются на высоких этажах
  // (Вишуддха, Аджна, Сахасрара). Освобождаются не только ахимсой, но и картой-противоядием.
  if (run.floor >= 4) {
    const pashas = ['bhaya_pasha', 'lajja', 'ghrna', 'samshaya_pasha', 'kula', 'sila', 'mana_pasha', 'jugupsa']
    node.enemyId = pashas[Math.floor(run.rand() * pashas.length)]
    return node.enemyId
  }
  const pool = ['krodha', 'lobha', 'nidra', 'kama', 'mada', 'matsarya']
  node.enemyId = pool[Math.floor(run.rand() * pool.length)]
  return node.enemyId
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
      mentalities: run.mentalities,
      varnaBranches: run.branches,
    },
  })
}

// Проверка правила испытания Ямы/Ниямы по трекерам движка (дерево челленджей, §16.2).
export function trialRulePassed(combat, rule) {
  const p = combat.player
  switch (rule) {
    case 'pacify': return combat.pacified > 0
    case 'no_vritti': return !combat.vrittiPlayed
    case 'no_curse': return !combat.cursePlayed
    case 'no_damage': return (p.damageTaken || 0) === 0
    case 'no_heal': return !combat.healUsed
    case 'block_10': return (p.blockGained || 0) >= 10
    case 'keep_prama': return p.prama
    case 'practice_3': return (combat.practicePlayed || 0) >= 3
    case 'scry_2': return (p.scryUsed || 0) >= 2
    case 'samadhi': return combat.samadhiReached || p.inSamadhi
    default: return false
  }
}

// Результат боя: обновить забег, выдать награды, вернуть данные для экрана награды.
export function finishCombat(run, combat) {
  const node = currentNode(run)
  const isBoss = node.type === 'boss'
  const isElite = node.type === 'elite'
  const isTrial = node.type === 'trial'
  const allPacified = combat.pacified > 0 && combat.kills === 0
  const pacifyReward = allPacified && combat.pacified > 0

  run.hp = combat.player.hp
  if (run.hp <= 0) return handleDeath(run, combat)

  // Мирный путь копится в забеге (§13.1): «награда за мирный путь больше».
  run.pacified = (run.pacified || 0) + combat.pacified

  // Испытание Ямы/Ниямы (§16.2, идея №16): победа по правилу открывает карту навсегда.
  let trialPassed = false
  let trialReward = null
  let trialRule = null
  if (isTrial) {
    const t = (node.trialId && TRIALS[node.trialId]) ? TRIALS[node.trialId] : null
    const rule = t ? t.rule : node.rule || 'no_vritti'
    trialRule = rule
    trialPassed = trialRulePassed(combat, rule)
    if (trialPassed && t && !run.unlocked.includes(t.rewardCard)) {
      run.unlocked.push(t.rewardCard)
      trialReward = t.rewardCard
    }
  }

  // награды: элиты (§5.2) дают больше Праны и выбор из 4 карт
  const rewards = {
    prana: pacifyReward ? (isBoss ? 15 : isElite ? 12 : 8) : isBoss ? 10 : isElite ? 8 : 5,
    pacified: pacifyReward,
    sattvaGain: pacifyReward ? 3 : 0,
    knowledge: pacifyReward ? 1 : 0,
    cardChoices: null,
    relic: null,
    bossHeal: 0,
    trialPassed,
    trialRule,
    trialReward,
  }
  if (trialPassed) rewards.prana += 5
  // §9.2: мирное освобождение дарит «память» — реликвию, которой ещё нет.
  // Это делает ахимсу экономически выгодной, а не просто «добрым» путём.
  if (pacifyReward) {
    const lockedRelics = Object.keys(RELICS).filter((id) => !run.relics.includes(id))
    if (lockedRelics.length > 0) {
      rewards.relic = lockedRelics[Math.floor(run.rand() * lockedRelics.length)]
    }
  }
  if (isBoss) {
    const finalFloor = run.floor === run.floors.length - 1
    // босс чакры даёт восстановление: переход на следующую чакру
    rewards.bossHeal = finalFloor ? 0 : 8
    run.hp = Math.min(run.maxHp, run.hp + rewards.bossHeal)
    if (combat.bossPacified) {
      run.bossPacified = true
      run.bossesPacified += 1
      // бывшие оковы становятся учителями (§14.1): помним их имена
      const bossId = CHAKRA_BOSS[run.floor]
      if (bossId && !run.pacifiedBosses.includes(bossId)) run.pacifiedBosses.push(bossId)
    }
    if (finalFloor) {
      run.status = 'victory'
      // истинный финал «Пробуждение»: успокоены все 7 владык чакр
      run.outcome = run.bossesPacified >= CHAKRAS.length ? 'awakening' : 'strength'
    } else {
      rewards.cardChoices = pickCardChoices(run, isElite ? 4 : 3)
    }
  } else {
    rewards.cardChoices = pickCardChoices(run, isElite || trialPassed ? 4 : 3)
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
    killedById: enemy ? enemy.def.id : null,
    lastIntent: enemy ? enemy.intentName : null,
    hpAtDeath: 0,
  }
}

function pickCardChoices(run, n) {
  const pool = cardRewardPool(run.unlocked)
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

// Эффекты медитации по глубине дыхания (quality 0..3, §16.2 идея №11).
// Чем глубже дыхание, тем больше ХП и саттвы, и тем больше карт можно отпустить.
export function meditateEffects(quality = 0) {
  const q = Math.max(0, Math.min(3, Math.floor(quality) || 0))
  return {
    quality: q,
    heal: 3 + q * 2, // 0→3, 1→5, 2→7, 3→9
    maxBurn: 1 + q, // 0→1, 1→2, 2→3, 3→4
    sattvaBonus: q >= 3 ? 2 : q >= 2 ? 1 : 0,
  }
}

export function doMeditate(run, burnIds, { quality = 0 } = {}) {
  const fx = meditateEffects(quality)
  const toBurn = (burnIds || []).slice(0, fx.maxBurn)
  for (const id of toBurn) {
    const i = run.deck.indexOf(id)
    if (i >= 0) run.deck.splice(i, 1)
  }
  run.hp = Math.min(run.maxHp, run.hp + fx.heal)
  if (fx.sattvaBonus > 0) {
    const base = run.gunaStart || { s: 3, r: 3, t: 3 }
    run.gunaStart = { ...base, s: base.s + fx.sattvaBonus }
  }
  return { burned: toBurn.length, healed: fx.heal, maxBurn: fx.maxBurn, sattvaBonus: fx.sattvaBonus, quality: fx.quality }
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
    // Вызов учителя (§дофамин): условие на следующий бой, награда при исполнении
    else if (fx.kind === 'challenge') {
      run.challenge = { rule: fx.rule, rewardCard: fx.rewardCard }
      results.challenge = true
    }
  }
  return results
}

// Вызов учителя (§дофамин): исполнен в бою? Проверяется в onCombatEnd ПОСЛЕ боя.
export function challengeFulfilled(run, combat) {
  if (!run.challenge || !run.challenge.rule) return false
  return trialRulePassed(combat, run.challenge.rule)
}

// ─────────────────────────────────────────────────────────────
// Лавка Садхака (магазин между чакрами, §13.1/§13.3)
// ─────────────────────────────────────────────────────────────

export const SHOP_COSTS = { card: 8, remove: 6, relic: 20 }

// Скидка вайшьи (§12.1, Human Society Part 2: vaeshya = деньги как мера всего):
// мудрое распоряжение Праной — цены в лавке падают на уровень ментальности (до −3).
export function shopDiscount(run) {
  const lv = (run && run.mentalities && run.mentalities.vaeshya) || 0
  let disc = Math.min(3, lv)
  // Ветвь вайшьи «Купец» (§12.1): мудрость торгуется с миром — ещё −1 ⚡.
  if (run && run.branches && run.branches.vaeshya === 'merchant') disc += 1
  return disc
}

export function shopPrice(run, kind) {
  return Math.max(1, (SHOP_COSTS[kind] || 0) - shopDiscount(run))
}

export function rollShop(run) {
  const pool = cardRewardPool(run.unlocked)
  const cards = []
  const seen = new Set()
  while (cards.length < 3 && pool.length > 0) {
    const c = pool[Math.floor(run.rand() * pool.length)]
    if (!seen.has(c.id)) {
      seen.add(c.id)
      cards.push(c.id)
    }
  }
  const lockedRelics = Object.keys(RELICS).filter((id) => !run.relics.includes(id))
  const relic = lockedRelics.length > 0
    ? lockedRelics[Math.floor(run.rand() * lockedRelics.length)]
    : null
  const removable = run.deck.filter((id) => CARDS[id].type === 'curse' || CARDS[id].type === 'vritti')
  return { cards, relic, removable: [...new Set(removable)] }
}

export function buyShopCard(run, cardId) {
  const price = shopPrice(run, 'card')
  if (run.prana < price) return { ok: false, reason: 'Не хватает Праны' }
  run.prana -= price
  run.deck.push(cardId)
  return { ok: true, card: cardId }
}

export function buyShopRemove(run, cardId) {
  const price = shopPrice(run, 'remove')
  if (run.prana < price) return { ok: false, reason: 'Не хватает Праны' }
  const i = run.deck.indexOf(cardId)
  if (i < 0) return { ok: false, reason: 'Карта не найдена' }
  run.prana -= price
  run.deck.splice(i, 1)
  return { ok: true, card: cardId }
}

export function buyShopRelic(run, relicId) {
  const price = shopPrice(run, 'relic')
  if (run.prana < price) return { ok: false, reason: 'Не хватает Праны' }
  if (run.relics.includes(relicId)) return { ok: false, reason: 'Уже есть' }
  run.prana -= price
  run.relics.push(relicId)
  return { ok: true, relic: relicId }
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
