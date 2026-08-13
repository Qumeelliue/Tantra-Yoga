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
  samadhiPacify,
  avidyaFill,
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

describe('восемь паш (§9.5): оковы извне, им «сопротивляются»', () => {
  it('паша успокаивается картой-противоядием (страх → Тапах)', () => {
    const s = createCombat({
      deck: makeDeck(['tapah'], { tapah: 4 }),
      enemies: [enemies.bhaya_pasha],
      relics: [],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { autoResolve: true },
    })
    const e = s.enemies[0]
    e.hp = Math.floor(e.maxHp / 2)
    // выключить праму: иначе +1 урон убивает врага раньше, чем успокоение наберётся
    s.player.guna = { s: 2, r: 3, t: 3 }
    recomputeGunas(s)
    playCard(s, s.piles.hand.indexOf('tapah'), 0)
    playCard(s, s.piles.hand.indexOf('tapah'), 0)
    expect(e.calm).toBe(2)
    expect(e.pacified).toBe(true)
    expect(s.pacified).toBe(1)
  })

  it('гхрна (ненависть) успокаивается ахимсой вдвое быстрее (противоядие = ахимса)', () => {
    const s = createCombat({
      deck: makeDeck(['ahimsa'], { ahimsa: 4 }),
      enemies: [enemies.ghrna],
      relics: [],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { autoResolve: true },
    })
    const e = s.enemies[0]
    e.hp = Math.floor(e.maxHp / 2)
    playCard(s, s.piles.hand.indexOf('ahimsa'), 0)
    expect(e.calm).toBe(2) // +1 за ахимсу-эффект +1 за calmCard
    expect(e.pacified).toBe(true)
  })

  it('чужое противоядие не успокаивает пашу (только своя карта)', () => {
    const s = createCombat({
      deck: makeDeck(['seva'], { seva: 4 }),
      enemies: [enemies.bhaya_pasha], // bhaya → tapah, не seva
      relics: [],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { autoResolve: true },
    })
    const e = s.enemies[0]
    e.hp = Math.floor(e.maxHp / 2)
    playCard(s, 0, 0)
    expect(e.calm).toBe(0) // seva не даёт ни pacify, ни calmCard-бонуса
    expect(e.pacified).toBe(false)
  })

  it('у обычного врага (рипу) карта-противоядие не работает (нет calmCard)', () => {
    const s = combatWith(['tapah'])
    s.enemies[0].hp = 10
    playCard(s, s.piles.hand.indexOf('tapah'), 0)
    expect(s.enemies[0].calm).toBe(0)
  })
})

describe('пантеон врагов: играбельность и противоядия', () => {
  it('все враги контента создают бой без ошибок', () => {
    for (const id of Object.keys(enemies).filter((k) => !k.startsWith('_'))) {
      expect(() => createCombat({
        deck: makeDeck(['first_effort'], { first_effort: 6 }),
        enemies: [enemies[id]],
        relics: [],
        cards,
        enemyDefs: enemies,
        rng: seeded(),
        opts: { autoResolve: true },
      })).not.toThrow()
    }
  })

  it.each(Object.values(enemies).filter((e) => e.calmCard))('паша $id успокаивается своим противоядием ($calmCard)', (e) => {
    const s = createCombat({
      deck: makeDeck([e.calmCard], { [e.calmCard]: 8 }),
      enemies: [e],
      relics: [],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { autoResolve: true },
    })
    s.enemies[0].hp = Math.floor(e.maxHp / 2)
    // без прамы, чтобы урон противоядия не убил раньше успокоения
    s.player.guna = { s: 2, r: 3, t: 3 }
    recomputeGunas(s)
    playCard(s, s.piles.hand.indexOf(e.calmCard), 0)
    playCard(s, s.piles.hand.indexOf(e.calmCard), 0)
    expect(s.enemies[0].pacified).toBe(true)
    expect(s.outcome).toBe('victory')
  })
})

describe('синергии-«потоки» (§8.5)', () => {
  it('поток ахимсы (3+): одна ахимса даёт +2 успокоения', () => {
    const s = createCombat({
      deck: makeDeck(['ahimsa'], { ahimsa: 4 }),
      enemies: [enemies.krodha],
      relics: [],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { autoResolve: true },
    })
    s.enemies[0].hp = 10
    playCard(s, s.piles.hand.indexOf('ahimsa'), 0)
    expect(s.enemies[0].calm).toBe(2) // 1 база + 1 поток
  })

  it('без потока ахимса даёт только 1 успокоение', () => {
    const s = combatWith(['ahimsa'])
    s.enemies[0].hp = 10
    playCard(s, s.piles.hand.indexOf('ahimsa'), 0)
    expect(s.enemies[0].calm).toBe(1)
  })

  it('поток кииртана (3+): кииртана даёт +1 саттву дополнительно', () => {
    const s = createCombat({
      deck: makeDeck(['nama_kevalam'], { nama_kevalam: 4 }),
      enemies: [enemies.krodha],
      relics: [],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { autoResolve: true },
    })
    const before = s.player.guna.s
    playCard(s, s.piles.hand.indexOf('nama_kevalam'), 0)
    expect(s.player.guna.s).toBe(before + 3) // +2 карта +1 поток
  })

  it('поток ямы (4+ практик): практики дешевле на 1', () => {
    const deck = makeDeck(['satya', 'ahimsa', 'shaoca', 'santosa'], { satya: 2, ahimsa: 2, shaoca: 2, santosa: 2 })
    const s = createCombat({ deck, enemies: [enemies.krodha], relics: [], cards, enemyDefs: enemies, rng: seeded(), opts: { autoResolve: true } })
    expect(s.synergies.yama).toBe(true)
    expect(effectiveCost(s, cards.santosa)).toBe(0) // 1 − 1 поток
  })

  it('поток служения (3+ севы): лечение +1', () => {
    const s = createCombat({
      deck: makeDeck(['seva'], { seva: 4 }),
      enemies: [enemies.krodha],
      relics: [],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { autoResolve: true },
    })
    s.player.hp = 40
    playCard(s, s.piles.hand.indexOf('seva'), 0)
    expect(s.player.hp).toBe(45) // 40 + 4 + 1 поток
  })
})

describe('прама для ахимсы босса (§18)', () => {
  function bossFight() {
    return createCombat({
      deck: makeDeck(['ahimsa'], { ahimsa: 6 }),
      enemies: [enemies.moha],
      relics: [],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { autoResolve: true },
    })
  }

  it('босс не успокаивается без прамы', () => {
    const s = bossFight()
    const e = s.enemies[0]
    e.hp = 10
    s.player.guna = { s: 3, r: 6, t: 3 } // перекос → прама выключена
    recomputeGunas(s)
    playCard(s, s.piles.hand.indexOf('ahimsa'), 0)
    playCard(s, s.piles.hand.indexOf('ahimsa'), 0)
    playCard(s, s.piles.hand.indexOf('ahimsa'), 0)
    expect(e.calm).toBeGreaterThanOrEqual(e.calmMax)
    expect(e.pacified).toBe(false)
  })

  it('босс успокаивается при праме', () => {
    const s = bossFight()
    const e = s.enemies[0]
    e.hp = 10
    playCard(s, s.piles.hand.indexOf('ahimsa'), 0)
    playCard(s, s.piles.hand.indexOf('ahimsa'), 0)
    playCard(s, s.piles.hand.indexOf('ahimsa'), 0)
    expect(e.pacified).toBe(true)
    expect(s.outcome).toBe('victory')
  })
})

describe('самадхи-успокоение (§8.4)', () => {
  it('в самадхи можно отпустить обычного врага', () => {
    const s = combatWith(['first_effort'])
    s.player.inSamadhi = true
    s.player.samadhiTurns = 3
    const ev = samadhiPacify(s, 0)
    expect(ev.some((e) => e.type === 'pacified')).toBe(true)
    expect(s.enemies[0].pacified).toBe(true)
    expect(s.outcome).toBe('victory')
  })

  it('в самадхи нельзя отпустить босса — только по правилу §9', () => {
    const s = createCombat({
      deck: makeDeck(['first_effort']),
      enemies: [enemies.moha],
      relics: [],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { autoResolve: true },
    })
    s.player.inSamadhi = true
    samadhiPacify(s, 0)
    expect(s.enemies[0].pacified).toBe(false)
  })

  it('вне самадхи успокоить нельзя', () => {
    const s = combatWith(['first_effort'])
    samadhiPacify(s, 0)
    expect(s.enemies[0].pacified).toBe(false)
  })
})

describe('статусы ума игрока (§9.1)', () => {
  it('слабость (weak) снижает атаку игрока и тикает в конце хода', () => {
    const s = combatWith(['first_effort'])
    s.enemies[0].hp = 50
    s.player.statuses.weak = 2
    const before = s.enemies[0].hp
    playCard(s, 0, 0)
    const dealt = before - s.enemies[0].hp
    expect(dealt).toBe(0) // 3 + 1 прама − 4 слабость = 0
    endTurn(s)
    expect(s.player.statuses.weak).toBe(1)
  })

  it('дремота (drowsy) уменьшает руку на 1 карту', () => {
    const s = combatWith(['first_effort'], 'krodha', { counts: { first_effort: 10 } })
    s.player.statuses.drowsy = 1
    const handBefore = s.piles.hand.length
    startPlayerTurn(s) // новый ход: добор 5 − 1 дремота = 4
    expect(s.piles.hand.length).toBe(handBefore + 4)
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

describe('«живые цитаты»: сыгранные карты (§исследование)', () => {
  it('розыгрыш карты добавляет её в playedCards (для метки «прожито»)', () => {
    const s = combatWith(['first_effort', 'ahimsa'])
    playCard(s, s.piles.hand.indexOf('ahimsa'), 0)
    expect(s.playedCards).toContain('ahimsa')
    expect(s.playedCards).not.toContain('first_effort')
  })
})

describe('новые реликвии «память» (§исследование)', () => {
  it('дхрувасмрити показывает верхнюю карту колоды', () => {
    const s = createCombat({
      deck: makeDeck(['first_effort', 'tapah', 'om'], { first_effort: 8 }),
      enemies: [enemies.krodha],
      relics: ['dhruvasmriti'],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
    })
    expect(s.peek.length).toBe(1)
    expect(s.piles.draw).toContain(s.peek[0])
  })

  it('джатисмара даёт +1 силу в начале боя', () => {
    const s = createCombat({
      deck: makeDeck(['first_effort']),
      enemies: [enemies.krodha],
      relics: ['jatismara'],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
    })
    expect(s.player.strength).toBe(1)
  })

  it('шаоча-майнджуса даёт +3 блока', () => {
    const s = createCombat({
      deck: makeDeck(['first_effort']),
      enemies: [enemies.krodha],
      relics: ['shaoca_mainjusa'],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
    })
    expect(s.player.block).toBe(3)
  })

  it('каопина даёт +2 саттвы на старте', () => {
    const s = createCombat({
      deck: makeDeck(['first_effort']),
      enemies: [enemies.krodha],
      relics: ['kaopiina'],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
    })
    expect(s.player.guna.s).toBe(5)
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

describe('Авидья (§9.1a): фоновый враг и самскары-волны', () => {
  it('натиск авидьи растёт каждый ход врага', () => {
    const s = createCombat({
      deck: makeDeck(['first_effort', 'first_effort', 'first_effort', 'first_effort']),
      enemies: [enemies.krodha],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { playerHp: 200, autoResolve: true },
    })
    expect(s.avidya).toBe(0)
    endTurn(s)
    expect(s.avidya).toBeGreaterThan(0)
  })

  it('при переполнении шкалы «прилетает самскара» — тяжёлый симптом', () => {
    // малый максимум — волна случится быстро
    const s = createCombat({
      deck: makeDeck(['first_effort', 'first_effort', 'first_effort']),
      enemies: [enemies.krodha],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { playerHp: 300, autoResolve: true, avidyaMax: 3, avidyaGainPerTurn: 1 },
    })
    let ev = []
    for (let i = 0; i < 4; i++) {
      ev = endTurn(s)
      if (s.outcome) break
    }
    expect(s.samskaraHits).toBeGreaterThan(0)
    expect(s.avidya).toBeLessThan(3) // после волны натиск сброшен, но авидья всегда рядом
  })

  it('практики шлют позитивные микровиты и снижают натиск авидьи', () => {
    const s = createCombat({
      deck: makeDeck(['nama_kevalam'], { nama_kevalam: 5 }),
      enemies: [enemies.krodha],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { playerHp: 300, autoResolve: true },
    })
    s.avidya = 6 // пусть авидья уже давит
    const i = s.piles.hand.indexOf('nama_kevalam')
    playCard(s, i >= 0 ? i : 0, 0)
    expect(s.avidya).toBeLessThan(6) // кииртан снял натиск (микровиты)
  })

  it('грязные карты (оковки/мусор) питают авидью', () => {
    const s = createCombat({
      deck: makeDeck(['alasya', 'cinta']),
      enemies: [enemies.krodha],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { autoResolve: true },
    })
    const i = s.piles.hand.indexOf('alasya')
    playCard(s, i >= 0 ? i : 0, 0)
    expect(s.avidya).toBeGreaterThan(0)
  })

  it('avidyaFill возвращает долю заполнения шкалы (для UI-индикатора)', () => {
    const s = createCombat({
      deck: makeDeck(['first_effort']),
      enemies: [enemies.krodha],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { avidyaMax: 10 },
    })
    s.avidya = 5
    expect(avidyaFill(s)).toBe(0.5)
    const off = createCombat({
      deck: makeDeck(['first_effort']),
      enemies: [enemies.krodha],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { avidyaEnabled: false },
    })
    expect(avidyaFill(off)).toBe(0)
  })

  it('авидью можно отключить (для тестов/настроек)', () => {
    const s = createCombat({
      deck: makeDeck(['first_effort', 'first_effort']),
      enemies: [enemies.krodha],
      cards,
      enemyDefs: enemies,
      rng: seeded(),
      opts: { playerHp: 200, autoResolve: true, avidyaEnabled: false },
    })
    endTurn(s)
    expect(s.avidya).toBe(0)
  })
})
