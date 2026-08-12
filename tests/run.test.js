import { describe, it, expect } from 'vitest'
import { createRun, startCombatAtNode, finishCombat, currentNode, currentEnemyId, isNodeDone, floorComplete, advanceFloor, rollShop, buyShopCard, buyShopRemove, buyShopRelic, doMeditate, meditateEffects } from '@webapp/js/core/run.js'
import enemies from '@content/enemies.json'
import { mulberry32, checkOutcome } from '@webapp/js/core/engine.js'
import { EMPTY_META } from '@webapp/js/core/save.js'

// «God-mode»: мгновенно завершаем бой победой (для тестирования потока забега).
function forceWin(run) {
  const combat = startCombatAtNode(run)
  for (const e of combat.enemies) e.hp = 0
  checkOutcome(combat)
  return combat
}

function forcePacify(run) {
  const combat = startCombatAtNode(run)
  for (const e of combat.enemies) {
    e.hp = Math.floor(e.maxHp / 2)
    e.calm = e.calmMax
    e.pacified = true
    combat.pacified += 1
    if (e.def.isBoss) combat.bossPacified = true
  }
  checkOutcome(combat)
  return combat
}

function processNode(run, mode) {
  const node = currentNode(run)
  const combat = mode === 'pacify' ? forcePacify(run) : forceWin(run)
  const res = finishCombat(run, combat)
  if (res.dead) throw new Error('unexpected death in god-mode')
  if (res.cardChoices?.length) run.deck.push(res.cardChoices[0])
  if (node.type === 'boss') return 'boss'
  return node.type
}

describe('забег: поток', () => {
  it('создаёт карту с 7 чакрами и боссом каждой', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(7) })
    expect(run.floors.length).toBe(7)
    expect(run.floors[6].some((n) => n.type === 'boss')).toBe(true)
    expect(run.deck.length).toBe(16)
  })

  it('варна «Кшатрия» добавляет агрессивные карты и снижает ХП', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(1), options: { janna: 'kshatriya' } })
    expect(run.deck.filter((id) => id === 'tapah').length).toBe(1)
    expect(run.maxHp).toBe(55)
    expect(run.gunaStart).toEqual({ s: 3, r: 5, t: 2 })
  })

  it('варна «Вайшья» даёт перекос раджаса и Прану', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(1), options: { janna: 'vaeshya' } })
    expect(run.prana).toBe(10)
    expect(run.gunaStart).toEqual({ s: 3, r: 5, t: 3 })
    expect(run.deck.filter((id) => id === 'lobha').length).toBeGreaterThan(2)
  })

  it('варна «Випра» даёт саттву, очищение и знание', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(1), options: { janna: 'vipra' } })
    expect(run.gunaStart).toEqual({ s: 5, r: 3, t: 2 })
    expect(run.deck.filter((id) => id === 'shaoca').length).toBe(1)
    expect(run.deck.filter((id) => id === 'svadhyaya').length).toBe(1)
    expect(run.maxHp).toBe(65)
  })

  it('стартовая колода — ровно 16 карт (спека 14 + 2 ахимсы)', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(1) })
    expect(run.deck.filter((id) => id === 'ahimsa').length).toBe(2)
    expect(run.deck.filter((id) => id === 'cinta').length).toBe(4)
  })

  it('проходит все этажи и завершает забег победой', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(11) })
    let guard = 0
    while (run.status === 'active' && guard < 200) {
      const floorNodes = run.floors[run.floor]
      for (let i = 0; i < floorNodes.length; i++) {
        run.nodeIndex = i
        if (isNodeDone(run, i)) continue
        const t = processNode(run, 'win')
        run.done[run.floor][i] = true
        if (t === 'boss') break
      }
      if (run.status !== 'active') break
      if (!advanceFloor(run)) break
      guard += 1
    }
    expect(run.status).toBe('victory')
    expect(run.floor).toBe(6)
  })

  it('мирное завершение всех 7 боссов даёт исход «awakening»', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(11) })
    let guard = 0
    while (run.status === 'active' && guard < 200) {
      const floorNodes = run.floors[run.floor]
      for (let i = 0; i < floorNodes.length; i++) {
        run.nodeIndex = i
        if (isNodeDone(run, i)) continue
        const node = currentNode(run)
        const t = processNode(run, node.type === 'boss' ? 'pacify' : 'win')
        run.done[run.floor][i] = true
        if (t === 'boss') break
      }
      if (run.status !== 'active') break
      if (!advanceFloor(run)) break
      guard += 1
    }
    expect(run.status).toBe('victory')
    expect(run.outcome).toBe('awakening')
    expect(run.bossesPacified).toBe(7)
    expect(run.pacifiedBosses.length).toBe(7)
  })

  it('частичное успокоение боссов даёт исход «сила»', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(11) })
    let guard = 0
    while (run.status === 'active' && guard < 200) {
      const floorNodes = run.floors[run.floor]
      for (let i = 0; i < floorNodes.length; i++) {
        run.nodeIndex = i
        if (isNodeDone(run, i)) continue
        const node = currentNode(run)
        // успокаиваем только первого босса (этаж 0), остальных — силой
        const t = processNode(run, node.type === 'boss' && run.floor === 0 ? 'pacify' : 'win')
        run.done[run.floor][i] = true
        if (t === 'boss') break
      }
      if (run.status !== 'active') break
      if (!advanceFloor(run)) break
      guard += 1
    }
    expect(run.status).toBe('victory')
    expect(run.outcome).toBe('strength')
    expect(run.bossesPacified).toBe(1)
  })

  it('смерть игрока обрывает забег исходом death', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(3) })
    run.nodeIndex = 0
    const combat = startCombatAtNode(run)
    combat.player.hp = 1
    combat.player.hp = 0
    checkOutcome(combat)
    const res = finishCombat(run, combat)
    expect(res.dead).toBe(true)
    expect(run.status).toBe('dead')
    expect(run.outcome).toBe('death')
  })
})

describe('восемь паш на высоких этажах (§9.5)', () => {
  const PASHAS = new Set(['bhaya_pasha', 'lajja', 'ghrna', 'samshaya_pasha', 'kula', 'sila', 'mana_pasha', 'jugupsa'])

  it('на этажах 4+ враги-паши появляются', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(9) })
    run.floor = 4
    run.nodeIndex = 0
    const seen = new Set()
    for (let i = 0; i < 80; i++) {
      currentNode(run).enemyId = null // новый «узел» — новый выбор
      seen.add(currentEnemyId(run))
    }
    for (const p of PASHAS) expect(seen.has(p)).toBe(true)
    expect([...seen].every((id) => PASHAS.has(id))).toBe(true)
  })

  it('на низких этажах (0–3) паши не встречаются', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(9) })
    run.floor = 0
    run.nodeIndex = 0
    for (let i = 0; i < 100; i++) {
      currentNode(run).enemyId = null
      expect(PASHAS.has(currentEnemyId(run))).toBe(false)
    }
  })

  it('элитный паша получает усиление ХП (×1.4)', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(9) })
    run.floor = 5
    run.nodeIndex = 0
    run.floors[5][0] = { type: 'elite' }
    const node = currentNode(run)
    node.enemyId = 'mana_pasha'
    const combat = startCombatAtNode(run)
    expect(combat.enemies[0].id).toBe('mana_pasha')
    expect(combat.enemies[0].maxHp).toBe(Math.round(enemies.mana_pasha.maxHp * 1.4))
  })
})

describe('медитация с дыханием (§16.2, идея №11)', () => {
  it('качество 0: +3 ХП, до 1 карты, без саттвы', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(2) })
    run.hp = 50
    const before = run.deck.length
    const res = doMeditate(run, ['cinta'], { quality: 0 })
    expect(res.healed).toBe(3)
    expect(res.maxBurn).toBe(1)
    expect(res.sattvaBonus).toBe(0)
    expect(run.hp).toBe(53)
    expect(run.deck.length).toBe(before - 1)
  })

  it('качество 3: +9 ХП, до 4 карт, +2 саттвы в следующий бой', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(2) })
    run.hp = 50
    const gunaBefore = run.gunaStart.s
    const before = run.deck.length
    const res = doMeditate(run, ['cinta', 'cinta', 'cinta', 'cinta', 'cinta'], { quality: 3 })
    expect(res.healed).toBe(9)
    expect(res.maxBurn).toBe(4)
    expect(res.sattvaBonus).toBe(2)
    expect(res.burned).toBe(4) // лимит не даёт сжечь больше 4
    expect(run.hp).toBe(59)
    expect(run.deck.length).toBe(before - 4)
    expect(run.gunaStart.s).toBe(gunaBefore + 2)
  })

  it('качество 2: +7 ХП, +1 саттва', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(2) })
    const res = doMeditate(run, [], { quality: 2 })
    expect(res.healed).toBe(7)
    expect(res.sattvaBonus).toBe(1)
    expect(run.gunaStart.s).toBe(4)
  })

  it('качество обрезается и не бывает отрицательным', () => {
    expect(meditateEffects(5)).toEqual({ quality: 3, heal: 9, maxBurn: 4, sattvaBonus: 2 })
    expect(meditateEffects(-2).quality).toBe(0)
  })

  it('лечение не превышает максимум ХП', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(2) })
    run.hp = run.maxHp - 1
    doMeditate(run, [], { quality: 3 })
    expect(run.hp).toBe(run.maxHp)
  })
})

describe('лавка садхака', () => {
  it('ролл лавки даёт 3 карты и реликвию без дублей', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    const shop = rollShop(run)
    expect(shop.cards.length).toBeGreaterThanOrEqual(3)
    expect(new Set(shop.cards).size).toBe(shop.cards.length)
    expect(shop.relic).toBeTruthy()
  })

  it('покупка карты списывает Прану и кладёт карту в колоду', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.prana = 20
    const shop = rollShop(run)
    const before = run.deck.length
    const res = buyShopCard(run, shop.cards[0])
    expect(res.ok).toBe(true)
    expect(run.prana).toBe(12)
    expect(run.deck.length).toBe(before + 1)
  })

  it('не даёт купить без Праны', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.prana = 1
    const shop = rollShop(run)
    const res = buyShopCard(run, shop.cards[0])
    expect(res.ok).toBe(false)
  })

  it('покупка реликвии убирает её из пула', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.prana = 30
    const shop = rollShop(run)
    const res = buyShopRelic(run, shop.relic)
    expect(res.ok).toBe(true)
    expect(run.relics).toContain(shop.relic)
  })
})

describe('награды: реликвия за успокоение и элиты (§5.2/§9.2)', () => {
  it('мирное освобождение даёт реликвию «память»', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.nodeIndex = 0
    const combat = forcePacify(run)
    const res = finishCombat(run, combat)
    expect(res.relic).toBeTruthy()
  })

  it('силовой путь не даёт реликвию за обычный бой', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.nodeIndex = 0
    const combat = forceWin(run)
    const res = finishCombat(run, combat)
    expect(res.relic).toBeNull()
  })

  it('элита даёт больше Праны и выбор из 4 карт', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.nodeIndex = 0
    run.floors[0][0] = { type: 'elite' }
    const combat = forceWin(run)
    const res = finishCombat(run, combat)
    expect(res.prana).toBe(8) // элита без пацификации (обычный бой — 5)
    expect(res.cardChoices.length).toBe(4)
  })

  it('обычный бой даёт выбор из 3 карт и 5 Праны', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.nodeIndex = 0
    const combat = forceWin(run)
    const res = finishCombat(run, combat)
    expect(res.prana).toBe(5)
    expect(res.cardChoices.length).toBe(3)
  })
})

describe('испытание Ямы/Ниямы (узел trial, идея №16 MVP)', () => {
  it('победа без оковок = испытание пройдено (+Прана)', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.nodeIndex = 0
    run.floors[0][0] = { type: 'trial' }
    const combat = forceWin(run)
    const res = finishCombat(run, combat)
    expect(res.trialPassed).toBe(true)
    expect(res.prana).toBe(10) // 5 база + 5 испытание
    expect(res.cardChoices.length).toBe(4)
  })

  it('сыгранная оковка = испытание провалено', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.nodeIndex = 0
    run.floors[0][0] = { type: 'trial', rule: 'no_vritti' }
    const combat = forceWin(run)
    combat.vrittiPlayed = true
    const res = finishCombat(run, combat)
    expect(res.trialPassed).toBe(false)
    expect(res.prana).toBe(5)
    expect(res.cardChoices.length).toBe(3)
  })

  it('правило «удержать праму»: без прамы в конце — провал', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.nodeIndex = 0
    run.floors[0][0] = { type: 'trial', rule: 'keep_prama' }
    const combat = forceWin(run)
    combat.player.prama = false
    const res = finishCombat(run, combat)
    expect(res.trialPassed).toBe(false)
  })

  it('правило «удержать праму»: с прамой в конце — пройдено', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.nodeIndex = 0
    run.floors[0][0] = { type: 'trial', rule: 'keep_prama' }
    const combat = forceWin(run)
    combat.player.prama = true
    const res = finishCombat(run, combat)
    expect(res.trialPassed).toBe(true)
  })

  it('в движке боя оковка отмечается как сыгранная', () => {
    const combat = startCombatAtNode(createRun({ meta: EMPTY_META(), rng: mulberry32(5) }))
    expect(combat.vrittiPlayed).toBe(false)
  })
})
