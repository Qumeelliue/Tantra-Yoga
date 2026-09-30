// Баланс-прогон: умный ИИ играет N забегов, считаем винрейт и статистику.
import { createRun, startCombatAtNode, finishCombat, currentNode, floorComplete, advanceFloor, resolveEventChoice, rollBoonChoices, rollShop, buyShopCard, buyShopRemove } from '../webapp/js/core/run.js'
import { mulberry32, playCard, endTurn, resolveRemoval, effectiveCost } from '../webapp/js/core/engine.js'
import { CARDS, EVENTS, RELICS, TRIAL_REWARD_CARDS } from '../webapp/js/core/data.js'
import { EMPTY_META } from '../webapp/js/core/save.js'

// Симуляция играет как игрок с полностью открытым деревом Ямы/Ниямы: карты практик
// доступны в наградах. Иначе симулятор не сможет построить колоду ахимсы/практик.
function simMeta() {
  const meta = EMPTY_META()
  meta.unlockedCards = [...TRIAL_REWARD_CARDS]
  return meta
}

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

/** Сколько урона наносит карта. Считаем из контента, а не по списку id. */
function cardDamage(card) {
  if (!card || !Array.isArray(card.effects)) return 0
  return card.effects.reduce((a, x) => a + (x.kind === 'damage' ? (x.amount || 0) : 0), 0)
}

function score(card, combat, p, e, pacifist = false) {
  // меньше = лучше (приоритет)
  let s = 1000
  if (!card) return 5000
  const isCurse = card.type === 'curse'
  if (isCurse) return 5000 // мусор не играем
  // Пасифист: не кормит вртти (гнев, жадность, страх…) — оковки питают авидью
  // и ломают равновесие гун (§9.1a/§8.2). Мирный путь = не играть их в принципе.
  if (pacifist && card.type === 'vritti') return 5000
  if (card.id === 'bhaya' || card.id === 'alasya') return 5000 // чистый урон от себя
  // Микровиты (§9.1b): девайоны не бьют — они растворяют окову светом.
  // Сила не тратит на них энергию (5000); пасифист шлёт микровит, только когда
  // окову уже ослабили до ≤50% (условие успокоения) — как ахимсу.
  if (card.id === 'vidyadhara' || card.id === 'siddha') {
    if (!pacifist) return 5000
    if (e.hp <= e.maxHp * 0.55) return 2
    return 4000
  }
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
  // Пасифист: Ишвара-пранидхана — баланс гун: успокоение босса требует прамы
  // (§8.2). Играем при перекосе, чтобы вернуть равновесие (впустую не тратим).
  if (pacifist && card.id === 'ishvara_pranidhana') {
    return p.imbalance ? 3 : 9000
  }
  // Пасифист: не добиваем, копим ахимсу.
  //
  // Правило «не добивать» держится на УРОНЕ карты, а не на списке id.
  // Раньше здесь стояло `if (card.id === 'tapah' || card.id === 'krodha')` —
  // то есть охранялись ровно две карты, а `first_effort` (3 урона),
  // `samyama` (8), `tandava` (5), `tapasyah` (4) и `dvesha` (5) проходили
  // свободно. Бот, который «играет за мир», из 56 провалов 29 закончил
  // тем, что УБИЛ владыку в первой чакре: «осталось 0 % жизни».
  // Любая новая карта с уроном пробивала бы правило снова, поэтому
  // проверка идёт по сумме урона, а не по именам.
  if (pacifist) {
    if (card.id === 'ahimsa' && e.hp <= e.maxHp * 0.55) return 0
    // Условие успокоения — HP ≤ половины (engine.js `pacifyReady`). Ниже
    // этой отметки бить нельзя: либо ока не дойдёт до порога, либо её
    // нечем будет успокаивать. Выше — можно, это и есть «снимать понемногу».
    //
    // Урон считаем ВСЕМ, что карта реально наносит. Кроме самого эффекта
    // есть «Дар Тапаха» (+1 урона к любой практике, engine.js:409) — он бьёт
    // даже карту без урона в контенте, и без него проверка по карте была бы
    // дырявой: бот «за мир» всё равно убивал владыку (6 провалов).
    const hits = cardDamage(card) + (combat.boonMods && combat.boonMods.tapahDamage > 0 && card.type === 'practice' ? combat.boonMods.tapahDamage : 0)
    if (hits > 0 && e.hp - hits < e.maxHp / 2) return 9000
    return s + 30
  }
  if (card.id === 'first_effort' || card.id === 'santosa') {
    if (threat >= 6 && p.block === 0 && p.hp < p.maxHp * 0.8) s = 1
  }
  return s
}

/**
 * Выбор дара после боя — ровно как на экране (`main.js`: `rollBoonChoices` →
 * `pickBoon`). Раньше этого шага в замере не было вовсе: симулятор звал
 * `finishCombat` напрямую и никогда не выбирал дар, хотя игра предлагает
 * три после каждого боя. То есть замер шёл по колоде без единого дара.
 */
const BOON_PREFERENCE_PEACE = ['ahimsa', 'seva', 'satya', 'aparigraha', 'svadhyaya', 'kiirtana', 'mantra', 'pranayama']
const BOON_PREFERENCE_FORCE = ['kiirtana', 'tapah', 'svadhyaya', 'mantra', 'pranayama', 'seva', 'ahimsa', 'aparigraha']

function pickBoon(run, pacifist = false) {
  const choices = rollBoonChoices(run, run.rand)
  if (!choices.length) return null
  const order = pacifist ? BOON_PREFERENCE_PEACE : BOON_PREFERENCE_FORCE
  for (const id of order) if (choices.includes(id)) { run.boons.push(id); return id }
  run.boons.push(choices[0])
  return choices[0]
}

function pickReward(run, choices, pacifist = false) {
  if (pacifist) {
    // Микровиты (§9.1b): девайоны vidyadhara/siddha — второй путь успокоения.
    // Их берём после ахимсы и защиты: свет растворяет окову, но не кормит.
    // Ишвара-пранидхана — баланс гун: успокоение босса требует прамы (§8.2).
    for (const id of ['ahimsa', 'om', 'seva', 'santosa', 'ishvara_pranidhana', 'vidyadhara', 'siddha']) if (choices.includes(id)) return id
  }
  for (const id of choices) if (id === 'om' || id === 'seva' || id === 'tapah') return id
  for (const id of GOOD_REWARD) if (choices.includes(id)) return id
  // Сила не берёт микровит-карты (они не бьют, §9.1b) — предпочитаем любой другой
  // вариант. Пасифист их уже разобрал в своей ветке выше.
  const rest = choices.filter((id) => id !== 'vidyadhara' && id !== 'siddha')
  return rest[0] || choices[0]
}

function runOnce(seed, pacifist = false) {
  const run = createRun({ meta: simMeta(), rng: mulberry32(seed) })
  // «Насколько близко» — то, чего в отчёте не было вообще. Винрейт сам по
  // себе ничего не значит: 98 % могут означать и «прошёл невредимым», и «умер
  // на седьмом владыке и дотянул». Поэтому запоминаем самое низкое здоровье
  // за забег и здоровье перед каждым владыкой.
  const agg = { fightPacified: 0, fightKills: 0, minHp: 100, bossHp: [], boons: [] }
  let guard = 0
  const hpPct = () => Math.round((run.hp / run.maxHp) * 100)
  while (run.status === 'active' && guard < 40) {
    const floorNodes = run.floors[run.floor]
    for (let i = 0; i < floorNodes.length; i++) {
      run.nodeIndex = i
      if (run.done[run.floor][i]) continue
      const node = currentNode(run)
      if (node.type === 'combat' || node.type === 'boss' || node.type === 'elite' || node.type === 'trial') {
        if (node.type === 'boss') agg.bossHp[run.floor] = hpPct()
        const combat = simFight(run, pacifist)
        agg.fightPacified += combat.pacified
        agg.fightKills += combat.kills
        if (node.type === 'boss') {
          const e = combat.enemies[0]
          if (combat.outcome !== 'defeat') {
            bossStats.total++
            bossStats.calm += e.calm
            bossStats.hpPct.push(Math.round((e.hp / e.maxHp) * 100))
            bossStats.ahimsaInDeck += run.deck.filter((id) => id === 'ahimsa').length
            if (e.pacified) bossStats.pacified++
            else if (pacifist) bossStats.failed.push({ floor: run.floor + 1, name: e.name, hp: Math.round((e.hp / e.maxHp) * 100), calm: e.calm, ahimsa: run.deck.filter((id) => id === 'ahimsa').length, kills: combat.kills, deck: run.deck.length })
          }
        }
        const killsBefore = agg.fightKills
        const res = finishCombat(run, combat)
        // ГДЕ именно бот кого-то убил. Раньше было видно только «убито за забег
        // 1», и нельзя было понять, в бою с владыкой это или с обычной окой.
        if (pacifist && agg.fightKills > killsBefore && node.type !== 'boss') {
          agg.peaceSlip = agg.peaceSlip || []
          agg.peaceSlip.push({ floor: run.floor + 1, type: node.type, name: e.name, hp: Math.round((e.hp / e.maxHp) * 100), ahimsa: run.deck.filter((id) => id === 'ahimsa').length })
        }
        agg.minHp = Math.min(agg.minHp, hpPct())
        if (res.dead) return { status: 'dead', floor: run.floor, hp: run.hp, killer: res.killedBy, ...agg }
        agg.boons.push(pickBoon(run, pacifist))
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
      } else if (node.type === 'memory') {
        run.done[run.floor][i] = true
      }
    }
    // Лавка между чакрами: тратим Прану на лучшие карты
    if (run.status === 'active' && run.floor < run.floors.length - 1) {
      const shop = rollShop(run)
      for (const id of shop.cards) {
        if (run.prana >= 8 && (id === 'om' || id === 'seva' || id === 'ahimsa' || id === 'santosa')) {
          buyShopCard(run, id)
        }
      }
    }
    if (run.status !== 'active') break
    if (!advanceFloor(run)) break
    guard += 1
  }
  return { status: run.status, floor: run.floor, pacified: run.outcome === 'awakening', ...agg }
}

const N = Number(process.argv[2] || 50)

/**
 * «Насколько близко» — то, чего в отчёте не было. Один винрейт ничего не
 * значит: 98 % — это и «прошёл невредимым», и «умер на седьмом владыке».
 * Читается только рядом с тем, где кончалось здоровье.
 */
function closeness(results) {
  const mins = results.map((r) => r.minHp).filter((n) => Number.isFinite(n))
  if (!mins.length) return '  насколько близко: нет данных'
  const avg = mins.reduce((a, b) => a + b, 0) / mins.length
  const low30 = mins.filter((n) => n < 30).length
  const low50 = mins.filter((n) => n < 50).length
  const out = [`  насколько близко: средний минимум жизни за забег ${Math.round(avg)}% · падало ниже 30 %: ${low30} забегов · ниже 50 %: ${low50} (из ${mins.length})`]
  const maxFloor = results.reduce((m, r) => Math.max(m, (r.bossHp || []).length - 1), 0)
  const boons = results.reduce((a, r) => a + (r.boons || []).filter(Boolean).length, 0)
  const out2 = [`  даров за забег: ${results.length ? Math.round((boons / results.length) * 10) / 10 : 0} (игра предлагает три после каждого боя)`]
  const byFloor = []
  for (let f = 0; f <= maxFloor; f++) {
    const vals = results.map((r) => (r.bossHp || [])[f]).filter((n) => Number.isFinite(n))
    if (vals.length) byFloor.push(`${f + 1}ч ${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}%`)
  }
  if (byFloor.length) out.push('  жизнь перед владыкой: ' + byFloor.join(' · '))
  out.push(...out2)
  return out.join('\n')
}

// ── СИЛА: агрессивный бот, который не играет ахимсу ───────────────────────
let wins = 0, deaths = 0, pacified = 0
const deathBy = {}
const bossStats = { total: 0, calm: 0, hpPct: [], pacified: 0, ahimsaInDeck: 0, failed: [] }
const strengthRuns = []
for (let s = 1; s <= N; s++) {
  const r = runOnce(s * 100 + 7)
  strengthRuns.push(r)
  if (r.status === 'victory') wins++
  else if (r.status === 'dead') {
    deaths++
    const key = `этаж${r.floor}:${r.killer}`
    deathBy[key] = (deathBy[key] || 0) + 1
  }
  if (r.pacified) pacified++
}
console.log(`[сила] Игр: ${N} | побед: ${wins} (${Math.round((wins / N) * 100)}%) | смертей: ${deaths} | мирных финалов: ${pacified}`)
console.log(closeness(strengthRuns))
console.log('Смерти по этажам/врагам:', deathBy)

// Проверяем, достижим ли мирный путь (ахимса): пасифистская стратегия
let pWins = 0, pPac = 0, pDead = 0, pFightPac = 0, pKills = 0
const pDeathBy = {}
const peaceRuns = []
for (let s = 1; s <= N; s++) {
  const r = runOnce(s * 100 + 7, true)
  peaceRuns.push(r)
  pFightPac += r.fightPacified
  pKills += r.fightKills
  if (r.status === 'victory') {
    pWins++
    if (r.pacified) pPac++
  } else if (r.status === 'dead') { pDead++; pDeathBy[`этаж${r.floor + 1}:${r.killer}`] = (pDeathBy[`этаж${r.floor + 1}:${r.killer}`] || 0) + 1 }
}
const avgHp = bossStats.hpPct.length ? Math.round(bossStats.hpPct.reduce((a, b) => a + b, 0) / bossStats.hpPct.length) : '-'
console.log(`[ахимса] Игр: ${N} | побед: ${pWins} (${Math.round((pWins / N) * 100)}%) | мирных финалов: ${pPac} | смертей: ${pDead}`)
console.log(closeness(peaceRuns))
console.log(`  успокоенных врагов за все забеги: ${pFightPac} | убитых: ${pKills}`)
console.log(`  мирных финалов: ${pPac} из ${pWins} побед (${pWins ? Math.round((pPac / pWins) * 100) : 0} %) — это бот, который ИГРАЕТ ЗА МИР`)
console.log(`  смерти пасифиста по этажам:`, pDeathBy)
console.log(`  босс: боёв=${bossStats.total} | успокоен=${bossStats.pacified} | сред. calm=${bossStats.total ? (bossStats.calm / bossStats.total).toFixed(2) : '-'}/${'3'} | сред. hp% на конце=${avgHp} | ахимса в колоде в среднем=${bossStats.total ? (bossStats.ahimsaInDeck / bossStats.total).toFixed(1) : '-'}`)
const slips = peaceRuns.reduce((a, r) => a.concat(r.peaceSlip || []), [])
if (slips.length) {
  console.log(`  бот-пасифист УБИЛ обычную оку: ${slips.length} раз — мирный путь сорван не у владыки`)
  for (const s of slips.slice(0, 5)) console.log(`    чакра ${s.floor} ${s.type} ${s.name}: осталось ${s.hp}% жизни, ахимсы ${s.ahimsa}`)
}
if (bossStats.failed.length) {
  // Где именно мирный путь ломается. Без этого «59 % мирных финалов» —
  // просто число, и не видно, что мешает оставшимся 41 %.
  const byFloor = {}
  for (const f of bossStats.failed) byFloor[f.floor] = (byFloor[f.floor] || 0) + 1
  console.log(`  НЕ успокоен (пасифист): ${bossStats.failed.length} — по чакрам ${JSON.stringify(byFloor)}`)
  for (const f of bossStats.failed.slice(0, 6)) {
    console.log(`    чакра ${f.floor} ${f.name}: осталось ${f.hp}% жизни, спокойствие ${f.calm}, ахимсы ${f.ahimsa}, убито за забег ${f.kills}, колода ${f.deck}`)
  }
}
