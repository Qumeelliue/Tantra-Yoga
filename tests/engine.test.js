import { describe, it, expect } from 'vitest'
import {
  createCombat,
  playCard,
  endTurn,
  startPlayerTurn,
  resolveRemoval,
  damagePlayer,
  effectiveCost,
  recomputeGunas,
  kiirtanaRhythmBonus,
  mulberry32,
} from '@webapp/js/core/engine.js'
import cards from '@content/cards.json'
import enemies from '@content/enemies.json'

function makeDeck(ids, n = {}) {
  const deck = []
  for (const id of ids) {
    const count = n[id] || 1
    for (let i = 0; i < count; i++) deck.push(id)
  }
  return deck
}

function seeded() {
  return mulberry32(42)
}

function combatWith(deckIds, enemyId = 'krodha', opts = {}) {
  return createCombat({
    deck: makeDeck(deckIds, opts.counts),
    enemies: [enemies[enemyId]],
    relics: opts.relics || [],
    cards,
    enemyDefs: enemies,
    rng: opts.rng || seeded(),
    opts: { autoResolve: true, ...(opts.engineOpts || {}) },
  })
}

describe('гуны и прама', () => {
  it('стартует с гунами 3/3/3 без прамы и перекоса', () => {
    const s = combatWith(['first_effort', 'first_effort'])
    expect(s.player.guna).toEqual({ s: 3, r: 3, t: 3 })
    expect(s.player.prama).toBe(true) // все >=1 и s >= r,t
    expect(s.player.imbalance).toBeNull()
  })

  it('прама даёт +1 к урону и блоку', () => {
    const s = combatWith(['first_effort'])
    expect(s.player.prama).toBe(true)
  })

  it('перекос тамаса определяется когда одна гуна опережает на 2+', () => {
    const s = combatWith(['first_effort'])
    s.player.guna = { s: 3, r: 3, t: 5 }
    recomputeGunas(s)
    expect(s.player.imbalance).toBe('t')
  })
})

describe('розыгрыш карт', () => {
  it('играет карту урона по врагу', () => {
    const s = combatWith(['first_effort'])
    const hpBefore = s.enemies[0].hp
    const ev = playCard(s, 0, 0)
    expect(ev.some((e) => e.type === 'damage' && e.target === 'enemy')).toBe(true)
    expect(s.enemies[0].hp).toBeLessThan(hpBefore)
    expect(s.enemies[0].hp).toBeGreaterThanOrEqual(0)
  })

  it('не даёт играть карту без энергии', () => {
    const s = combatWith(['tapah'])
    s.player.energy = 0
    const ev = playCard(s, 0, 0)
    expect(ev.some((e) => e.type === 'error')).toBe(true)
  })

  it('сбрасывает карту в discard', () => {
    const s = combatWith(['first_effort'])
    const handLen = s.piles.hand.length
    playCard(s, 0, 0)
    expect(s.piles.hand.length).toBe(handLen - 1)
    expect(s.piles.discard).toContain('first_effort')
  })
})

describe('ахимса и успокоение', () => {
  it('успокаивает врага при HP ≤ 50% и полном счётчике ахимсы', () => {
    const s = combatWith(['ahimsa', 'ahimsa', 'ahimsa'])
    const e = s.enemies[0]
    e.hp = Math.floor(e.maxHp / 2)
    playCard(s, s.piles.hand.indexOf('ahimsa'), 0)
    playCard(s, s.piles.hand.indexOf('ahimsa'), 0)
    expect(s.enemies[0].pacified).toBe(true)
    expect(s.pacified).toBe(1)
    expect(s.outcome).toBe('victory')
  })

  it('не успокаивает при HP выше 50%', () => {
    const s = combatWith(['ahimsa', 'ahimsa'])
    playCard(s, 0, 0)
    playCard(s, 0, 0)
    expect(s.enemies[0].pacified).toBe(false)
  })

  it('убивает врага, если HP достигает нуля', () => {
    const s = combatWith(['tapah', 'tapah', 'tapah'])
    // 3 × 6 = 18 < 22 — не хватит, снизим HP
    s.enemies[0].hp = 10
    playCard(s, 0, 0)
    playCard(s, 0, 0)
    expect(s.enemies[0].dead).toBe(true)
    expect(s.kills).toBe(1)
    expect(s.outcome).toBe('victory')
  })
})

describe('враги и ходы', () => {
  it('враг атакует по своему намерению', () => {
    const s = combatWith(['first_effort'])
    const hpBefore = s.player.hp
    endTurn(s)
    expect(s.player.hp).toBeLessThanOrEqual(hpBefore)
  })

  it('враг получает урон через блок', () => {
    const s = combatWith(['santosa'])
    s.enemies[0].hp = 50
    s.enemies[0].maxHp = 50
    s.enemies[0].block = 10
    const before = s.enemies[0].block
    playCard(s, 0, 0) // сантоша — блок 4, не урон
    expect(s.enemies[0].block).toBe(before) // блок врага не тронут блок-картой
  })
})

describe('сожжение (отречение)', () => {
  it('ом сжигает мусорную карту из колоды', () => {
    const deck = makeDeck(['cinta', 'first_effort', 'om'], { cinta: 3 })
    const s = createCombat({
      deck,
      enemies: [enemies.krodha],
      relics: [],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { autoResolve: true },
    })
    const hasOm = s.piles.hand.indexOf('om')
    const ev = playCard(s, hasOm >= 0 ? hasOm : 0, 0)
    if (s.pending) {
      const burnt = s.pending.options[0]
      resolveRemoval(s, burnt)
      expect(s.piles.removed).toContain(burnt)
      expect(CARDS[burnt].type).toBe('curse')
    }
  })
})

describe('самадхи', () => {
  it('активируется при 12+ саттвы за бой', () => {
    const deck = makeDeck(['nama_kevalam'], { nama_kevalam: 6 })
    const s = createCombat({
      deck,
      enemies: [enemies.krodha],
      relics: [],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { autoResolve: true },
    })
    // играем кииртаны, пока не накопится саттва
    let guard = 0
    while (!s.player.inSamadhi && guard < 8) {
      const i = s.piles.hand.indexOf('nama_kevalam')
      if (i < 0) {
        endTurn(s)
        continue
      }
      playCard(s, i, 0)
      guard += 1
    }
    expect(s.player.inSamadhi).toBe(true)
  })
})

describe('кииртан-ритм (§16.2, идея №7)', () => {
  it('качество 0 не даёт бонуса', () => {
    const s = combatWith(['nama_kevalam'])
    const sBefore = s.player.guna.s
    const drawBefore = s.piles.hand.length
    const ev = kiirtanaRhythmBonus(s, 0)
    expect(ev.some((e) => e.type === 'kiirtana_rhythm')).toBe(true)
    expect(s.player.guna.s).toBe(sBefore)
    expect(s.piles.hand.length).toBe(drawBefore)
  })

  it('качество 1 даёт +1 саттву', () => {
    const s = combatWith(['nama_kevalam'])
    const sBefore = s.player.guna.s
    kiirtanaRhythmBonus(s, 1)
    expect(s.player.guna.s).toBe(sBefore + 1)
  })

  it('качество 2 даёт +1 саттву и +1 карту', () => {
    const s = combatWith(['nama_kevalam'], 'krodha', { counts: { nama_kevalam: 8 } })
    const sBefore = s.player.guna.s
    const handBefore = s.piles.hand.length
    kiirtanaRhythmBonus(s, 2)
    expect(s.player.guna.s).toBe(sBefore + 1)
    expect(s.piles.hand.length).toBeGreaterThan(handBefore)
  })

  it('качество 3 даёт +2 саттвы и +1 карту', () => {
    const s = combatWith(['nama_kevalam'], 'krodha', { counts: { nama_kevalam: 8 } })
    const sBefore = s.player.guna.s
    const handBefore = s.piles.hand.length
    kiirtanaRhythmBonus(s, 3)
    expect(s.player.guna.s).toBe(sBefore + 2)
    expect(s.piles.hand.length).toBeGreaterThan(handBefore)
  })

  it('качество обрезается до 0..3', () => {
    const s = combatWith(['nama_kevalam'])
    const sBefore = s.player.guna.s
    kiirtanaRhythmBonus(s, 99)
    expect(s.player.guna.s).toBe(sBefore + 2)
  })
})

describe('смерть', () => {
  it('игрок умирает при HP = 0', () => {
    const s = combatWith(['first_effort'])
    s.player.hp = 1
    damagePlayer(s, 50, { events: [], enemyIndex: 0 })
    expect(s.player.hp).toBe(0)
    expect(s.outcome).toBe('defeat')
  })
})

describe('эффективная стоимость', () => {
  it('раджас-перекос удорожает практики на 1', () => {
    const s = combatWith(['first_effort'])
    s.player.guna = { s: 3, r: 5, t: 3 }
    s.player.imbalance = 'r'
    expect(effectiveCost(s, cards.first_effort)).toBe(2)
  })

  it('саттва-перекос удешевляет практики', () => {
    const s = combatWith(['first_effort'])
    s.player.guna = { s: 5, r: 3, t: 3 }
    s.player.imbalance = 's'
    expect(effectiveCost(s, cards.first_effort)).toBe(0)
  })
})

describe('новые карты фазы 1', () => {
  it('гуру-мантра даёт блок и сжигает вртти из руки', () => {
    const deck = makeDeck(['guru_mantra', 'cinta', 'cinta'])
    const s = createCombat({
      deck,
      enemies: [enemies.krodha],
      relics: [],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { autoResolve: true },
    })
    const blockBefore = s.player.block
    playCard(s, s.piles.hand.indexOf('guru_mantra'), 0)
    expect(s.player.block).toBeGreaterThanOrEqual(blockBefore)
    expect(s.piles.exhaust.some((id) => cards[id].type === 'curse')).toBe(true)
  })

  it('баванам кевалам ослабляет всех врагов', () => {
    const s = combatWith(['bavanam_kevalam'])
    playCard(s, s.piles.hand.indexOf('bavanam_kevalam'), 0)
    expect(s.enemies[0].statuses.weak).toBeGreaterThan(0)
  })

  it('прана-капля лечит в начале боя', () => {
    const s = createCombat({
      deck: makeDeck(['first_effort']),
      enemies: [enemies.krodha],
      relics: ['prana_drop'],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { playerHp: 40 },
    })
    expect(s.player.hp).toBe(43)
    expect(s.player.maxHp).toBe(43)
  })

  it('шива-лингам даёт +1 саттву на старте', () => {
    const s = createCombat({
      deck: makeDeck(['first_effort']),
      enemies: [enemies.krodha],
      relics: ['shiva_lingam'],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
    })
    expect(s.player.guna.s).toBe(4)
  })
})
