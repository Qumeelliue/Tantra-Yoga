import { describe, it, expect } from 'vitest'
import { createRun, startCombatAtNode, finishCombat, currentNode, isNodeDone, floorComplete, advanceFloor, rollShop, buyShopCard, buyShopRemove, buyShopRelic } from '@webapp/js/core/run.js'
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

  it('джанма «Воин» добавляет агрессивные карты и снижает ХП', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(1), options: { janna: 'warrior' } })
    expect(run.deck.filter((id) => id === 'tapah').length).toBe(1)
    expect(run.maxHp).toBe(55)
    expect(run.gunaStart).toEqual({ s: 3, r: 3, t: 3 })
  })

  it('джанма «Торговец» даёт перекос раджаса и Прану', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(1), options: { janna: 'trader' } })
    expect(run.prana).toBe(10)
    expect(run.gunaStart).toEqual({ s: 3, r: 5, t: 3 })
    expect(run.deck.filter((id) => id === 'lobha').length).toBeGreaterThan(2)
  })

  it('джанма «Садху» даёт саттву и очищение', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(1), options: { janna: 'sadhu' } })
    expect(run.gunaStart).toEqual({ s: 5, r: 3, t: 3 })
    expect(run.deck.filter((id) => id === 'shaoca').length).toBe(1)
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
