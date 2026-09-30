// Тесты мастерской севы.
//
// Смысл: покупка должна ЧЕСТНО менять бой и открывать цитату.
// «Правило проекта: нет цитаты — нет усиления» проверяется здесь же.

import { describe, it, expect } from 'vitest'
import {
  WORKSHOP, workshopCost, canBuy, sevaPointsFor, applyUpgrades,
} from '@webapp/js/core/workshop.js'
import { createField, DEFAULT_FIELD_OPTIONS, parry } from '@webapp/js/core/field.js'

describe('Мастерская севы: усиления меняют бой', () => {
  it('у каждого усиления есть цитата и цена (нет цитаты — нет усиления)', () => {
    expect(WORKSHOP.length).toBeGreaterThan(0)
    for (const u of WORKSHOP) {
      expect(u.quoteId).toBeTruthy()
      expect(u.desc).toBeTruthy()
      expect(u.cost).toBeGreaterThan(0)
      expect(typeof u.apply).toBe('function')
    }
  })

  it('у всех усилений разные id — иначе покупка ломается', () => {
    const ids = WORKSHOP.map((u) => u.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ни одно усиление не выдумывает новый слот — только меняет существующий', () => {
    const before = { ...DEFAULT_FIELD_OPTIONS }
    for (const u of WORKSHOP) {
      const after = applyUpgrades({ ...before }, [u.id])
      // появиться могут только новые ключи — их быть не должно
      const added = Object.keys(after).filter((k) => !(k in before))
      expect(added).toEqual([])
      // и что-то обязано поменяться
      const changed = Object.keys(after).filter((k) => after[k] !== before[k])
      expect(changed.length).toBeGreaterThan(0)
    }
  })

  it('владелец всех усилений получает заметно большее окно дефлекта', () => {
    const none = applyUpgrades({ ...DEFAULT_FIELD_OPTIONS }, [])
    const all = applyUpgrades({ ...DEFAULT_FIELD_OPTIONS }, WORKSHOP.map((u) => u.id))
    expect(all.parryWindow).toBeGreaterThan(none.parryWindow)
    expect(all.comboWindow).toBeGreaterThan(none.comboWindow)
    expect(all.avidyaGainIdle).toBeLessThan(none.avidyaGainIdle)
    expect(all.psychicMax).toBeGreaterThan(none.psychicMax)
  })

  it('входные опции не мутируются', () => {
    const src = { ...DEFAULT_FIELD_OPTIONS }
    applyUpgrades(src, WORKSHOP.map((u) => u.id))
    expect(src.parryWindow).toBe(DEFAULT_FIELD_OPTIONS.parryWindow)
  })

  it('купленное усиление реально меняет бой: окно дефлекта шире', () => {
    const o1 = applyUpgrades({ ...DEFAULT_FIELD_OPTIONS }, [])
    const o2 = applyUpgrades({ ...DEFAULT_FIELD_OPTIONS }, ['krpa_umbrella'])
    expect(o2.parryWindow).toBeGreaterThan(o1.parryWindow)
  })
})

describe('Мастерская севы: очки и покупка', () => {
  it('можно купить, только если хватает очков и ещё не куплено', () => {
    expect(canBuy('yama_ahimsa', 3, [])).toBe(true)
    expect(canBuy('yama_ahimsa', 2, [])).toBe(false)
    expect(canBuy('yama_ahimsa', 99, ['yama_ahimsa'])).toBe(false)
  })

  it('цена берётся из таблицы, а не из ввода игрока', () => {
    for (const u of WORKSHOP) expect(workshopCost(u.id)).toBe(u.cost)
    expect(workshopCost('нет-такого')).toBe(0)
  })

  it('за честный забег очков больше, за грязный — меньше', () => {
    const clean = sevaPointsFor({
      pacified: 3, served: new Set([0, 1]), krpaUsed: true,
      foes: [{ pacified: true }, { pacified: true }, { pacified: true }],
      player: { alive: true },
    })
    const bloody = sevaPointsFor({
      pacified: 0, served: new Set(), krpaUsed: false,
      foes: [{ pacified: false, dead: true }], player: { alive: false },
    })
    expect(clean).toBeGreaterThan(bloody)
    expect(bloody).toBeGreaterThanOrEqual(0)   // не уходим в минус
  })

  it('локация без единого удара даёт больше очков, чем с ударами', () => {
    const a = sevaPointsFor({ pacified: 2, served: new Set(), foes: [{ pacified: true }, { pacified: true }], player: { alive: true } })
    const b = sevaPointsFor({ pacified: 2, served: new Set(), foes: [{ pacified: true }, { dead: true }], player: { alive: true } })
    expect(a).toBeGreaterThan(b)
  })
})

describe('Опции боя принимают усиления', () => {
  it('createField берёт psychicMax из опций', () => {
    const st = createField({
      player: { x: 0, y: 0, hp: 60 }, foes: [], rng: () => 0.5,
      opts: applyUpgrades({ playerHp: 60 }, ['brahmacarya']),
    })
    expect(st.player.psychicMax).toBe(16)
  })
})
