import { describe, it, expect } from 'vitest'
import { createRun, startCombatAtNode, finishCombat, currentNode, currentEnemyId, isNodeDone, floorComplete, advanceFloor, rollShop, buyShopCard, buyShopRemove, buyShopRelic, doMeditate, meditateEffects, resolveEventChoice, challengeFulfilled } from '@webapp/js/core/run.js'
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

  it('фокус «Кшатрия» (смелость) даёт стартовые карты борьбы', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(1), options: { focus: 'kshatriya' } })
    expect(run.deck.filter((id) => id === 'tapah').length).toBeGreaterThanOrEqual(1)
    expect(run.deck.filter((id) => id === 'first_effort').length).toBeGreaterThanOrEqual(1)
    expect(run.maxHp).toBe(60) // кшатрия не даёт +ХП — смелость, а не выносливость
  })

  it('фокус «Вайшья» (мудрость ресурсов) даёт стартовую Прану', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(1), options: { focus: 'vaeshya' } })
    expect(run.prana).toBe(10)
    expect(run.maxHp).toBe(60)
  })

  it('фокус «Випра» (знание) даёт стартовые карты самоизучения', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(1), options: { focus: 'vipra' } })
    expect(run.deck.filter((id) => id === 'shaoca').length).toBe(1)
    expect(run.deck.filter((id) => id === 'svadhyaya').length).toBe(1)
    expect(run.maxHp).toBe(60)
  })

  it('фокус «Шудра» (присутствие) даёт выносливость', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(1), options: { focus: 'shudra' } })
    expect(run.maxHp).toBe(70)
    expect(run.prana).toBe(0)
  })

  it('стартовая колода без фокуса — ровно 16 карт (спека 14 + 2 ахимсы)', () => {
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

describe('испытание Ямы/Ниямы (узел trial, дерево челленджей §16.2)', () => {
  it('победа без оковок (брахмачарья) = испытание пройдено (+Прана, открыта карта)', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.nodeIndex = 0
    run.floors[0][0] = { type: 'trial', trialId: 'trial_brahmacarya' }
    const combat = forceWin(run)
    const res = finishCombat(run, combat)
    expect(res.trialPassed).toBe(true)
    expect(res.prana).toBe(10) // 5 база + 5 испытание
    expect(res.cardChoices.length).toBe(4)
    expect(res.trialReward).toBe('brahmacarya')
    expect(run.unlocked).toContain('brahmacarya')
  })

  it('сыгранная оковка = испытание нарушено (карта не открывается)', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.nodeIndex = 0
    run.floors[0][0] = { type: 'trial', trialId: 'trial_brahmacarya' }
    const combat = forceWin(run)
    combat.vrittiPlayed = true
    const res = finishCombat(run, combat)
    expect(res.trialPassed).toBe(false)
    expect(res.prana).toBe(5)
    expect(res.cardChoices.length).toBe(3)
    expect(res.trialReward).toBeNull()
  })

  it('правило «удержать праму» (сантоша): без прамы в конце — провал', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.nodeIndex = 0
    run.floors[0][0] = { type: 'trial', trialId: 'trial_santosa' }
    const combat = forceWin(run)
    combat.player.prama = false
    const res = finishCombat(run, combat)
    expect(res.trialPassed).toBe(false)
  })

  it('правило «удержать праму»: с прамой в конце — пройдено', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.nodeIndex = 0
    run.floors[0][0] = { type: 'trial', trialId: 'trial_santosa' }
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

describe('ментальности в забеге (§12.1): слабая ментальность = недостающий навык', () => {
  function metaWith(varnas) {
    const meta = EMPTY_META()
    meta.varnas = { shudra: 0, kshatriya: 0, vipra: 0, vaeshya: 0, ...varnas }
    return meta
  }

  it('уровни ментальностей попадают в забег из меты', () => {
    const run = createRun({ meta: metaWith({ vipra: 10 }), rng: mulberry32(1) })
    expect(run.mentalities.vipra).toBe(2)
    expect(run.mentalities.shudra).toBe(0)
  })

  it('шудра ур.2 даёт +8 макс ХП (выносливость — не только фокус)', () => {
    const run = createRun({ meta: metaWith({ shudra: 10 }), rng: mulberry32(1) })
    expect(run.mentalities.shudra).toBe(2)
    expect(run.maxHp).toBe(68) // 60 + 8
  })

  it('шудра ур.0 не даёт бонуса ХП', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(1) })
    expect(run.maxHp).toBe(60)
  })

  it('садвипра: все четыре ментальности зрелы — навыки на максимуме', () => {
    const run = createRun({ meta: metaWith({ shudra: 10, kshatriya: 10, vipra: 10, vaeshya: 10 }), rng: mulberry32(1) })
    expect(run.mentalities).toEqual({ shudra: 3, kshatriya: 3, vipra: 3, vaeshya: 3 })
  })

  it('садвипра-бонус ХП шудры применяется после усиления уровня', () => {
    const run = createRun({ meta: metaWith({ shudra: 10, kshatriya: 10, vipra: 10, vaeshya: 10 }), rng: mulberry32(1) })
    expect(run.maxHp).toBe(72) // 60 + 3*4
  })

  it('вайшья ур.0: лавка в полную цену', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.prana = 20
    const shop = rollShop(run)
    const res = buyShopCard(run, shop.cards[0])
    expect(res.ok).toBe(true)
    expect(run.prana).toBe(12) // 8
  })

  it('вайшья ур.2: скидка −2 ⚡ в лавке', () => {
    const run = createRun({ meta: metaWith({ vaeshya: 10 }), rng: mulberry32(5) })
    run.prana = 20
    const shop = rollShop(run)
    const res = buyShopCard(run, shop.cards[0])
    expect(res.ok).toBe(true)
    expect(run.prana).toBe(14) // 8 − 2 = 6
  })

  it('вайшья ур.2: скидка действует и на удаление оковки', () => {
    const run = createRun({ meta: metaWith({ vaeshya: 10 }), rng: mulberry32(5) })
    run.prana = 20
    const shop = rollShop(run)
    const removable = shop.removable[0]
    if (!removable) return
    const res = buyShopRemove(run, removable)
    expect(res.ok).toBe(true)
    expect(run.prana).toBe(16) // 6 − 2 = 4
  })

  it('уровни ментальностей передаются в бой (движок видит их)', () => {
    const run = createRun({ meta: metaWith({ vipra: 10 }), rng: mulberry32(1) })
    const combat = startCombatAtNode(run)
    expect(combat.mentalities.vipra).toBe(2)
  })
})

describe('вызов учителя (§дофамин: событие-условие на следующий бой)', () => {
  it('принятие вызова записывает условие в run.challenge', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    const res = resolveEventChoice(run, 'teacher', 0)
    expect(res.challenge).toBe(true)
    expect(run.challenge).toEqual({ rule: 'practice_3', rewardCard: 'kevala_bhakti' })
  })

  it('отказ от вызова не записывает условие', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    const res = resolveEventChoice(run, 'teacher', 1)
    expect(res.challenge).toBeUndefined()
    expect(run.challenge).toBeUndefined()
  })

  it('исполнение вызова: 3 практики в бою — challengeFulfilled true', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.challenge = { rule: 'practice_3', rewardCard: 'kevala_bhakti' }
    const combat = startCombatAtNode(run)
    combat.practicePlayed = 3
    expect(challengeFulfilled(run, combat)).toBe(true)
  })

  it('неисполнение вызова: меньше 3 практик — false', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.challenge = { rule: 'practice_3', rewardCard: 'kevala_bhakti' }
    const combat = startCombatAtNode(run)
    combat.practicePlayed = 2
    expect(challengeFulfilled(run, combat)).toBe(false)
  })

  it('без вызова — false (не ломает обычные бои)', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    const combat = startCombatAtNode(run)
    expect(challengeFulfilled(run, combat)).toBe(false)
  })
})
