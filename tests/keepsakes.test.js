// Нефрит = «хранилище» в Hades (keepsake) и «нефритовый слот» в Nine Sols.
// Проверяем главное: это второй источник силы рядом с дарами, выбор один
// на побег, и ни один нефрит не заводит новых слотов в бою.

import { describe, it, expect } from 'vitest'
import { KEEPSAKES, KEEPSAKE_BY_ID, rollKeepsakes, applyKeepsake } from '@webapp/js/core/keepsakes.js'
import { DEFAULT_FIELD_OPTIONS } from '@webapp/js/core/field.js'
import { QUOTES } from '@webapp/js/core/data.js'

const base = () => ({ ...DEFAULT_FIELD_OPTIONS })

describe('Нефрит (Hades: keepsake)', () => {
  it('восемь нефритов, у всех уникальные id', () => {
    expect(KEEPSAKES.length).toBeGreaterThanOrEqual(8)
    const ids = KEEPSAKES.map((k) => k.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('у каждого нефрита есть настоящая цитата из корпуса', () => {
    for (const k of KEEPSAKES) {
      expect(QUOTES[k.quoteId], `${k.name} → ${k.quoteId}`).toBeTruthy()
    }
  })

  it('у каждого нефрита есть название, подзаголовок и описание', () => {
    for (const k of KEEPSAKES) {
      expect(k.name.length).toBeGreaterThan(1)
      expect(k.sub.length).toBeGreaterThan(1)
      expect(k.desc.length).toBeGreaterThan(15)
    }
  })

  it('нефрит НЕ заводит новых полей в бою — только меняет существующие', () => {
    const before = base()
    for (const k of KEEPSAKES) {
      const after = applyKeepsake(before, k.id)
      expect(Object.keys(after).filter((x) => !(x in before))).toEqual([])
      const changed = Object.keys(after).filter((x) => after[x] !== before[x])
      expect(changed.length, k.name).toBeGreaterThan(0)
    }
  })

  it('входные опции не мутируются', () => {
    const src = base()
    applyKeepsake(src, 'prana')
    expect(src.psychicMax).toBe(DEFAULT_FIELD_OPTIONS.psychicMax)
  })

  it('неизвестный нефрит не ломает бой', () => {
    const o = applyKeepsake(base(), 'нефрита-нет')
    expect(o.parryWindow).toBe(DEFAULT_FIELD_OPTIONS.parryWindow)
  })

  it('три нефрита на выбор, без повторов', () => {
    const picks = rollKeepsakes(Math.random, 3)
    expect(picks).toHaveLength(3)
    expect(new Set(picks.map((k) => k.id)).size).toBe(3)
  })

  it('выборка не зависит от генератора случайных чисел', () => {
    const picks = rollKeepsakes(() => 0, 3)
    expect(picks.map((k) => k.id)).toEqual(['prama', 'viveka', 'ahankara'])
  })

  it('Прама: окно прама шире и потолок силы выше', () => {
    const o = applyKeepsake(base(), 'prama')
    expect(o.pramaWindow).toBeGreaterThan(DEFAULT_FIELD_OPTIONS.pramaWindow)
    expect(o.shaktiMax).toBeGreaterThan(DEFAULT_FIELD_OPTIONS.shaktiMax)
  })

  it('Вивека: дефлект сильнее — плата тоже есть', () => {
    const o = applyKeepsake(base(), 'viveka')
    expect(o.deflectCalm).toBeGreaterThan(DEFAULT_FIELD_OPTIONS.deflectCalm)
    expect(o.avidyaGainIdle).toBeGreaterThan(DEFAULT_FIELD_OPTIONS.avidyaGainIdle)
  })

  it('Аханкара: больше жизни, но удар вреднее', () => {
    const o = applyKeepsake(base(), 'ahankara')
    expect(o.playerHp).toBeGreaterThan(DEFAULT_FIELD_OPTIONS.playerHp)
    expect(o.avidyaGainStrike).toBeGreaterThan(DEFAULT_FIELD_OPTIONS.avidyaGainStrike)
  })

  it('Пранаяма: мантра дешевле', () => {
    const o = applyKeepsake(base(), 'pranayama')
    expect(o.mantraCostCut).toBeGreaterThan(DEFAULT_FIELD_OPTIONS.mantraCostCut)
  })

  it('Апариграха: больше монет, накопление неведения медленнее', () => {
    const o = applyKeepsake(base(), 'aparigraha')
    expect(o.coinMul).toBeGreaterThan(1)
    expect(o.avidyaGainIdle).toBeLessThan(DEFAULT_FIELD_OPTIONS.avidyaGainIdle)
  })

  it('Дхьяна: рывок чаще, окно прама шире', () => {
    const o = applyKeepsake(base(), 'dhyana')
    expect(o.dashCooldown).toBeLessThan(DEFAULT_FIELD_OPTIONS.dashCooldown)
    expect(o.pramaWindow).toBeGreaterThan(DEFAULT_FIELD_OPTIONS.pramaWindow)
  })

  it('Мудра севы: сева прикрывает', () => {
    const o = applyKeepsake(base(), 'mudra')
    expect(o.sevaShield).toBeGreaterThan(DEFAULT_FIELD_OPTIONS.sevaShield)
  })

  it('Прана: потолок Ци выше', () => {
    const o = applyKeepsake(base(), 'prana')
    expect(o.psychicMax).toBeGreaterThan(DEFAULT_FIELD_OPTIONS.psychicMax)
  })

  it('реестр нефритов совпадает с самим списком', () => {
    for (const k of KEEPSAKES) expect(KEEPSAKE_BY_ID[k.id]).toBe(k)
  })
})

// ── Цепочка опций никогда не даёт NaN ──────────────────────────────────
// Это была настоящая поломка: `undefined + 0.1` превращалось в NaN, и вся
// самадхи/прама молча переставала считаться. Поэтому проверяем всю цепочку
// сразу, на самом хрупком месте.
describe('Цепочка усилений: варна → нефрит → дары → мастерская', () => {
  it('ни один нефрит не ломает числа, даже если опции неполные', () => {
    for (const k of KEEPSAKES) {
      const o = applyKeepsake({ varna: 'vipra' }, k.id)   // намеренно неполные опции
      for (const key of Object.keys(o)) {
        if (typeof o[key] === 'number') expect(Number.isFinite(o[key]), `${k.name} → ${key}`).toBe(true)
      }
    }
  })

  it('нефрит на пустых опциях даёт те же числа, что на полных', () => {
    for (const k of KEEPSAKES) {
      const thin = applyKeepsake({}, k.id)
      const full = applyKeepsake(base(), k.id)
      for (const key of Object.keys(full)) {
        if (typeof full[key] === 'number') expect(thin[key], `${k.name} → ${key}`).toBe(full[key])
      }
    }
  })
})
