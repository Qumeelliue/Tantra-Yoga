// Баланс-прогон: умный ИИ играет N забегов, считаем винрейт и статистику.
import { createRun, startCombatAtNode, finishCombat, currentNode, floorComplete, advanceFloor, resolveEventChoice } from '../webapp/js/core/run.js'
import { mulberry32, playCard, endTurn, resolveRemoval, effectiveCost } from '../webapp/js/core/engine.js'
import { CARDS, EVENTS, RELICS } from '../webapp/js/core/data.js'
import { EMPTY_META } from '../webapp/js/core/save.js'

const PRIORITY = ['ishvara_pranidhana', 'om', 'shaoca', 'seva', 'ahimsa', 'tapah', 'first_effort', 'santosa', 'satya', 'bija', 'nama_kevalam', 'svadhyaya', 'asteya', 'brahmacarya']
const GOOD_REWARD = ['seva', 'om', 'tapah', 'ahimsa', 'santosa', 'ishvara_pranidhana', 'nama_kevalam', 'satya', 'bija', 'first_effort']

function simFight(run, pacifist = false) {
  const combat = startCombatAtNode(run)
  let guard = 0
  while (!combat.outcome && guard < 300) {
    if (combat.pending) { resolveRemoval(combat, combat.pending.options[0]); continue }
    const p = combat.player
    const e = combat.enemies[0]
    // играем ВСЕ полезные карты, пока есть энергия (как хороший игрок)
    let played = true
    while (played && !combat.outcome && !combat.pending && guard < 300) {
      played = false
      const sorted = combat.piles.hand
        .map((id, i) => ({ id, i, card: combat.cards[id], cost: effectiveCost(combat, combat.cards[id]) }))
        .filter((x) => x.cost <= p.energy)
        .sort((a, b) => score(a.card, combat, p, e, pacifist) - score(b.card, combat, p, e, pacifist))
      if (sorted.length > 0 && score(sorted[0].card, combat, p, e, pacifist) < 2000) {
        playCard(combat, sorted[0].i, 0)
        played = true
      }
      guard += 1
    }
    if (!combat.outcome && !combat.pending) endTurn(combat)
    guard += 1
  }
  return combat
}

function score(card, combat, p, e, pacifist = false) {
  // меньше = лучше (приоритет)
  let s = 1000
  if (!card) return 5000
  const isCurse = card.type === 'curse'
  if (isCurse) return 5000 // мусор не играем
  if (card.id === 'bhaya' || card.id === 'alasya') return 5000 // чистый урон от себя
  const idx = PRIORITY.indexOf(card.id)
  if (idx >= 0) s = idx * 5
  if (card.id === 'krodha') {
    if (p.guna.s <= 1) return 4000
    s = 15
  }
  if (card.id === 'lobha') {
    if (p.guna.s <= 1) return 4000
    s = 22
  }
  if (card.type === 'seva' && p.hp > p.maxHp * 0.6) s += 200 // не хилимся в полном ХП
  // блокируемся, если враг атакует и у нас мало ХП/нет блока
  const threat = e.intentDamage > 0 ? e.intentDamage : 0
  if (threat >= 5 && p.block < threat && p.hp < p.maxHp * 0.85) {
    if (card.type === 'defend' || card.id === 'santosa' || card.id === 'first_effort' || card.id === 'shaoca' || card.id === 'pranayama') s = Math.min(s, 1)
  }
  // пасифист: не добиваем, копим ахимсу
  if (pacifist) {
    if (card.id === 'ahimsa' && e.hp <= e.maxHp * 0.55) return 0
    if ((card.id === 'tapah' || card.id === 'krodha') && e.hp <= e.maxHp * 0.55) return 9000 // не бьём добивающим
    return s + 30
  }
  if (card.id === 'first_effort' || card.id === 'santosa') {
    if (threat >= 6 && p.block === 0 && p.hp < p.maxHp * 0.8) s = 1
  }
  return s
}

function pickReward(run, choices, pacifist = false) {
  if (pacifist) {
    for (const id of ['ahimsa', 'om', 'seva', 'santosa']) if (choices.includes(id)) return id
  }
  for (const id of choices) if (id === 'om' || id === 'seva' || id === 'tapah') return id
  for (const id of GOOD_REWARD) if (choices.includes(id)) return id
  return choices[0]
}

function runOnce(seed, pacifist = false) {
  const run = createRun({ meta: EMPTY_META(), rng: mulberry32(seed) })
  const agg = { fightPacified: 0, fightKills: 0 }
  let guard = 0
  while (run.status === 'active' && guard < 40) {
    const floorNodes = run.floors[run.floor]
    for (let i = 0; i < floorNodes.length; i++) {
      run.nodeIndex = i
      if (run.done[run.floor][i]) continue
      const node = currentNode(run)
      if (node.type === 'combat' || node.type === 'boss' || node.type === 'elite') {
        const combat = simFight(run, pacifist)
        agg.fightPacified += combat.pacified
        agg.fightKills += combat.kills
        if (node.type === 'boss' && pacifist) {
          const e = combat.enemies[0]
          if (combat.outcome !== 'defeat') {
            bossStats.total++
            bossStats.calm += e.calm
            bossStats.hpPct.push(Math.round((e.hp / e.maxHp) * 100))
            bossStats.ahimsaInDeck += run.deck.filter((id) => id === 'ahimsa').length
            if (e.pacified) bossStats.pacified++
          }
        }
        const res = finishCombat(run, combat)
        if (res.dead) return { status: 'dead', floor: run.floor, hp: run.hp, killer: res.killedBy, ...agg }
        if (res.cardChoices && res.cardChoices.length) run.deck.push(pickReward(run, res.cardChoices, pacifist))
        run.done[run.floor][i] = true
        if (node.type === 'boss') break
      } else if (node.type === 'meditate') {
        const curses = run.deck.filter((id) => CARDS[id].type === 'curse' || CARDS[id].type === 'vritti')
        const burn = [...new Set(curses)].slice(0, 2)
        for (const id of burn) {
          const j = run.deck.indexOf(id)
          if (j >= 0) run.deck.splice(j, 1)
        }
        run.hp = Math.min(run.maxHp, run.hp + 5)
        run.done[run.floor][i] = true
      } else if (node.type === 'event') {
        const ev = EVENTS[Object.keys(EVENTS)[Math.floor(run.rand() * Object.keys(EVENTS).length)]]
        resolveEventChoice(run, ev.id, 0)
        run.done[run.floor][i] = true
      } else if (node.type === 'relic') {
        const locked = Object.keys(RELICS).filter((id) => !run.relics.includes(id))
        const id = locked[Math.floor(run.rand() * locked.length)] || Object.keys(RELICS)[0]
        run.relics.push(id)
        run.done[run.floor][i] = true
      }
    }
    if (run.status !== 'active') break
    if (!advanceFloor(run)) break
    guard += 1
  }
  return { status: run.status, floor: run.floor, pacified: run.outcome === 'awakening', ...agg }
}

const N = 50
let wins = 0, deaths = 0, pacified = 0
const deathBy = {}
for (let s = 1; s <= N; s++) {
  const r = runOnce(s * 100 + 7)
  if (r.status === 'victory') wins++
  else if (r.status === 'dead') {
    deaths++
    const key = `этаж${r.floor}:${r.killer}`
    deathBy[key] = (deathBy[key] || 0) + 1
  }
  if (r.pacified) pacified++
}
console.log(`[сила] Игр: ${N} | побед: ${wins} (${Math.round((wins / N) * 100)}%) | смертей: ${deaths}`)
console.log('Смерти по этажам/врагам:', deathBy)

// Проверяем, достижим ли мирный путь (ахимса): пасифистская стратегия
let pWins = 0, pPac = 0, pDead = 0, pFightPac = 0, pKills = 0
const bossStats = { total: 0, calm: 0, hpPct: [], pacified: 0, ahimsaInDeck: 0 }
for (let s = 1; s <= N; s++) {
  const r = runOnce(s * 100 + 7, true)
  pFightPac += r.fightPacified
  pKills += r.fightKills
  if (r.status === 'victory') {
    pWins++
    if (r.pacified) pPac++
  } else if (r.status === 'dead') pDead++
}
const avgHp = bossStats.hpPct.length ? Math.round(bossStats.hpPct.reduce((a, b) => a + b, 0) / bossStats.hpPct.length) : '-'
console.log(`[ахимса] Игр: ${N} | побед: ${pWins} (${Math.round((pWins / N) * 100)}%) | мирных финалов: ${pPac} | смертей: ${pDead}`)
console.log(`  успокоенных врагов за все забеги: ${pFightPac} | убитых: ${pKills}`)
console.log(`  босс: боёв=${bossStats.total} | успокоен=${bossStats.pacified} | сред. calm=${bossStats.total ? (bossStats.calm / bossStats.total).toFixed(2) : '-'}/${'3'} | сред. hp% на конце=${avgHp} | ахимса в колоде в среднем=${bossStats.total ? (bossStats.ahimsaInDeck / bossStats.total).toFixed(1) : '-'}`)
