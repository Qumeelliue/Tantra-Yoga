import { describe, it, expect } from 'vitest'
import { TRIALS, TRIAL_REWARD_CARDS, CARDS, availableTrials, cardRewardPool } from '@webapp/js/core/data.js'
import { EMPTY_META, unlockCard, trialsProgress } from '@webapp/js/core/save.js'
import { createCombat } from '@webapp/js/core/engine.js'
import { createRun, finishCombat, trialRulePassed } from '@webapp/js/core/run.js'
import { mulberry32 } from '@webapp/js/core/engine.js'

// ─────────────────────────────────────────────────────────────
// Контент дерева: 10 испытаний, все правила и карты валидны
// ─────────────────────────────────────────────────────────────

describe('дерево челленджей: контент (§16.2)', () => {
  it('ровно 10 испытаний — по одному на Яма/Нияма-карту', () => {
    expect(Object.keys(TRIALS).length).toBe(10)
    expect(new Set(TRIAL_REWARD_CARDS).size).toBe(10)
  })

  it('каждая награда — существующая Яма/Нияма-карта (practice)', () => {
    for (const id of TRIAL_REWARD_CARDS) {
      expect(CARDS[id]).toBeTruthy()
      expect(CARDS[id].type).toBe('practice')
    }
  })

  it('у каждого испытания валидное правило, ветвь, порядок и minFloor', () => {
    const rules = ['pacify', 'no_vritti', 'no_curse', 'no_damage', 'no_heal', 'block_10', 'keep_prama', 'practice_3', 'scry_2', 'samadhi']
    for (const t of Object.values(TRIALS)) {
      expect(rules).toContain(t.rule)
      expect(['yama', 'niyama']).toContain(t.branch)
      expect(typeof t.order).toBe('number')
      expect(typeof t.minFloor).toBe('number')
      expect(t.minFloor).toBeGreaterThanOrEqual(0)
      expect(t.minFloor).toBeLessThan(7)
      expect(typeof t.desc).toBe('string')
      expect(typeof t.source).toBe('string')
    }
  })

  it('в обеих ветвях по 5 испытаний, порядок и minFloor растут от 0', () => {
    for (const branch of ['yama', 'niyama']) {
      const list = Object.values(TRIALS).filter((t) => t.branch === branch).sort((a, b) => a.order - b.order)
      expect(list.length).toBe(5)
      expect(list[0].order).toBe(0)
      // minFloor не убывает внутри ветви: сложность нарастает по восхождению
      for (let i = 1; i < list.length; i++) {
        expect(list[i].minFloor).toBeGreaterThanOrEqual(list[i - 1].minFloor)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────
// Пул наград фильтрует закрытые карты
// ─────────────────────────────────────────────────────────────

describe('дерево челленджей: пул наград', () => {
  it('без открытых карт Яма/Нияма в наградах нет', () => {
    const pool = cardRewardPool([])
    const ids = pool.map((c) => c.id)
    for (const id of TRIAL_REWARD_CARDS) expect(ids).not.toContain(id)
  })

  it('открытая испытанием карта попадает в пул (в т.ч. стартовая Ахимса)', () => {
    const pool = cardRewardPool(['ahimsa'])
    expect(pool.map((c) => c.id)).toContain('ahimsa')
  })

  it('не-Яма/Нияма карты доступны сразу, стартовые — нет', () => {
    const pool = cardRewardPool([])
    const ids = pool.map((c) => c.id)
    expect(ids).toContain('seva')
    expect(ids).toContain('nama_kevalam')
    expect(ids).not.toContain('cinta')
    expect(ids).not.toContain('first_effort')
  })
})

// ─────────────────────────────────────────────────────────────
// Доступность испытаний: ветви открываются по порядку
// ─────────────────────────────────────────────────────────────

describe('дерево челленджей: доступность ветвей и этажей', () => {
  it('без открытых на этаже 0 — доступны первые испытания обеих ветвей', () => {
    const avail = availableTrials([], 0)
    expect(avail.length).toBe(2)
    const ids = avail.map((t) => t.id).sort()
    expect(ids).toEqual(['trial_ahimsa', 'trial_shaoca'].sort())
  })

  it('открытие первой карты ветви открывает следующую этой ветви', () => {
    const avail = availableTrials(['ahimsa'], 1)
    const yama = avail.filter((t) => t.branch === 'yama')
    expect(yama.length).toBe(1)
    expect(yama[0].id).toBe('trial_brahmacarya')
  })

  it('minFloor не пускает испытание на ранний этаж (прогрессивная сложность)', () => {
    // Брахмачарья (minFloor 1) недоступна на этаже 0, даже если Ахимса открыта
    const early = availableTrials(['ahimsa'], 0)
    expect(early.filter((t) => t.id === 'trial_brahmacarya').length).toBe(0)
    const later = availableTrials(['ahimsa'], 1)
    expect(later.some((t) => t.id === 'trial_brahmacarya')).toBe(true)
  })

  it('жёсткие правила (самадхи/без урона/без лечения) не выпадают на ранних этажах', () => {
    for (let floor = 0; floor < 3; floor++) {
      const avail = availableTrials([], floor)
      for (const t of avail) {
        expect(['pacify', 'no_vritti', 'no_curse', 'keep_prama', 'block_10', 'practice_3']).toContain(t.rule)
      }
    }
  })

  it('на этаже 4+ доступны и жёсткие испытания (по мере открытия ветвей)', () => {
    // открываем первые 4 Ниямы — доступным становится последнее (самадхи, этаж 4)
    const open = ['shaoca', 'santosa', 'tapah', 'svadhyaya']
    const avail = availableTrials(open, 4)
    const niyama = avail.filter((t) => t.branch === 'niyama')
    expect(niyama.length).toBe(1)
    expect(niyama[0].rule).toBe('samadhi')
  })

  it('открытие всех карт ветви убирает её из доступных', () => {
    const allYama = Object.values(TRIALS).filter((t) => t.branch === 'yama').map((t) => t.rewardCard)
    const avail = availableTrials(allYama, 6)
    expect(avail.filter((t) => t.branch === 'yama').length).toBe(0)
    expect(avail.some((t) => t.branch === 'niyama')).toBe(true)
  })

  it('при полном дереве доступных испытаний нет', () => {
    expect(availableTrials(TRIAL_REWARD_CARDS, 6).length).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// Мета-прогресс: unlockCard и прогресс дерева
// ─────────────────────────────────────────────────────────────

describe('дерево челленджей: мета-прогресс', () => {
  it('unlockCard открывает карту один раз', () => {
    const meta = EMPTY_META()
    expect(unlockCard(meta, 'ahimsa')).toBe(true)
    expect(unlockCard(meta, 'ahimsa')).toBe(false)
    expect(meta.unlockedCards).toEqual(['ahimsa'])
  })

  it('trialsProgress считает открытое', () => {
    const meta = EMPTY_META()
    expect(trialsProgress(meta).unlockedCount).toBe(0)
    unlockCard(meta, 'ahimsa')
    unlockCard(meta, 'shaoca')
    const p = trialsProgress(meta)
    expect(p.unlockedCount).toBe(2)
    expect(p.yamaDone).toBe(1)
    expect(p.niyamaDone).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────
// Правила проверяются трекерами движка
// ─────────────────────────────────────────────────────────────

describe('дерево челленджей: правила боя', () => {
  function combatWith(deck, extra = {}) {
    return createCombat({
      deck,
      enemies: [{ id: 'e', name: 'враг', epithet: '', glyph: 'x', maxHp: 30, moves: [{ name: 'удар', damage: 3, effects: [] }] }],
      cards: CARDS,
      enemyDefs: { e: {} },
      rng: mulberry32(1),
      opts: {},
      ...extra,
    })
  }

  it('pacify: успокоение врага', () => {
    const c = combatWith(['ahimsa', 'ahimsa'])
    c.pacified = 1
    expect(trialRulePassed(c, 'pacify')).toBe(true)
    c.pacified = 0
    expect(trialRulePassed(c, 'pacify')).toBe(false)
  })

  it('no_vritti: без сыгранных оковок', () => {
    const c = combatWith([])
    expect(trialRulePassed(c, 'no_vritti')).toBe(true)
    c.vrittiPlayed = true
    expect(trialRulePassed(c, 'no_vritti')).toBe(false)
  })

  it('no_curse: без сыгранного мусора', () => {
    const c = combatWith([])
    expect(trialRulePassed(c, 'no_curse')).toBe(true)
    c.cursePlayed = true
    expect(trialRulePassed(c, 'no_curse')).toBe(false)
  })

  it('no_damage: без полученного урона', () => {
    const c = combatWith([])
    expect(trialRulePassed(c, 'no_damage')).toBe(true)
    c.player.damageTaken = 3
    expect(trialRulePassed(c, 'no_damage')).toBe(false)
  })

  it('no_heal: без лечения', () => {
    const c = combatWith([])
    expect(trialRulePassed(c, 'no_heal')).toBe(true)
    c.healUsed = true
    expect(trialRulePassed(c, 'no_heal')).toBe(false)
  })

  it('block_10: накоплено 10+ блока', () => {
    const c = combatWith([])
    expect(trialRulePassed(c, 'block_10')).toBe(false)
    c.player.blockGained = 10
    expect(trialRulePassed(c, 'block_10')).toBe(true)
  })

  it('keep_prama: прама в конце боя', () => {
    const c = combatWith([])
    c.player.prama = false
    expect(trialRulePassed(c, 'keep_prama')).toBe(false)
    c.player.prama = true
    expect(trialRulePassed(c, 'keep_prama')).toBe(true)
  })

  it('practice_3: сыграно 3+ практик', () => {
    const c = combatWith([])
    expect(trialRulePassed(c, 'practice_3')).toBe(false)
    c.practicePlayed = 3
    expect(trialRulePassed(c, 'practice_3')).toBe(true)
  })

  it('scry_2: посмотрено 2+ карты', () => {
    const c = combatWith([])
    expect(trialRulePassed(c, 'scry_2')).toBe(false)
    c.player.scryUsed = 2
    expect(trialRulePassed(c, 'scry_2')).toBe(true)
  })

  it('samadhi: достигнуто самадхи', () => {
    const c = combatWith([])
    expect(trialRulePassed(c, 'samadhi')).toBe(false)
    c.samadhiReached = true
    expect(trialRulePassed(c, 'samadhi')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────
// Забег: узел испытания выбирает неоткрытое испытание
// ─────────────────────────────────────────────────────────────

describe('дерево челленджей: узел испытания в забеге', () => {
  it('при пустом дереве узел trial выбирает доступное испытание', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(1) })
    const trialNodes = run.floors.flat().filter((n) => n.type === 'trial')
    expect(trialNodes.length).toBeGreaterThan(0)
    for (const n of trialNodes) {
      expect(TRIALS[n.trialId]).toBeTruthy()
      expect(['yama', 'niyama']).toContain(TRIALS[n.trialId].branch)
    }
  })

  it('при полном дереве узел trial не появляется (заменён на memory)', () => {
    const meta = EMPTY_META()
    meta.unlockedCards = [...TRIAL_REWARD_CARDS]
    const run = createRun({ meta, rng: mulberry32(1) })
    const types = run.floors.flat().map((n) => n.type)
    expect(types).not.toContain('trial')
  })

  it('каждый trial-узел на своём этаже уважает minFloor испытания', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(1) })
    run.floors.forEach((floor, f) => {
      floor.forEach((node) => {
        if (node.type === 'trial') {
          const t = TRIALS[node.trialId]
          expect(t.minFloor).toBeLessThanOrEqual(f)
        }
      })
    })
  })

  it('прохождение испытания открывает карту в мете через run.unlocked', () => {
    const run = createRun({ meta: EMPTY_META(), rng: mulberry32(5) })
    run.nodeIndex = 0
    run.floors[0][0] = { type: 'trial', trialId: 'trial_ahimsa' }
    const combat = startCombatFor(run)
    combat.pacified = 1
    combat.kills = 0
    const res = finishCombat(run, combat)
    expect(res.trialPassed).toBe(true)
    expect(res.trialReward).toBe('ahimsa')
    expect(run.unlocked).toContain('ahimsa')
  })
})

function startCombatFor(run) {
  // минимальный combat-стенд: нужны только поля, что читает finishCombat/trialRulePassed
  return {
    player: { hp: 50, prama: true, damageTaken: 0, blockGained: 0, scryUsed: 0, inSamadhi: false },
    pacified: 0,
    kills: 1,
    vrittiPlayed: false,
    cursePlayed: false,
    healUsed: false,
    practicePlayed: 0,
    samadhiReached: false,
  }
}
