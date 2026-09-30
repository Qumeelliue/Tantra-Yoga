// Сохранения: новая игра и старая должны вести себя одинаково.
// Поле Ума принёс в мета новые поля (деньги, дары, мастерская, чакры,
// нефрит-профиль), и если их не объявить в схеме — каждый забег ловит
// «undefined» в самый неподходящий момент.

import { describe, it, expect, beforeAll } from 'vitest'
import { EMPTY_META, migrateMeta, loadMeta, saveMeta } from '@webapp/js/core/save.js'

// В node нет localStorage — даём минимальную замену, чтобы проверить
// настоящий цикл «записал → прочитал», а не только чистые функции.
beforeAll(() => {
  const mem = new Map()
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
  }
})

describe('Схема сохранений: Поле Ума', () => {
  it('новая игра сразу содержит все поля забега', () => {
    const m = EMPTY_META()
    expect(m.coins).toBe(0)
    expect(m.boons).toEqual([])
    expect(m.upgrades).toEqual([])
    expect(m.fieldFloor).toBe(0)
    expect(m.focusVarna).toBe('shudra')
    expect(m.hpBonus).toBe(0)
    expect(m.krpaFell).toBe(0)
    expect(m.krpaMissed).toBe(0)
  })

  it('старое сохранение без этих полей мигрирует без ошибок', () => {
    const old = { onboarded: true, varnas: { shudra: 3 } }
    const m = migrateMeta(old)
    expect(m.onboarded).toBe(true)
    expect(m.varnas.shudra).toBe(3)
    expect(m.boons).toEqual([])
    expect(m.upgrades).toEqual([])
    expect(m.coins).toBe(0)
    expect(m.focusVarna).toBe('shudra')
  })

  it('битые значения не проходят дальше как NaN или «не число»', () => {
    const m = migrateMeta({ coins: NaN, hpBonus: 'много', fieldFloor: null, boons: 'нет', upgrades: 5 })
    expect(m.coins).toBe(0)
    expect(m.hpBonus).toBe(0)
    expect(m.fieldFloor).toBe(0)
    expect(m.boons).toEqual([])
    expect(m.upgrades).toEqual([])
  })

  it('миграция не выбрасывает уже записанные деньги и дары', () => {
    const m = migrateMeta({ coins: 42, boons: ['dharma-megha'], upgrades: ['yama'], fieldFloor: 3, focusVarna: 'vipra' })
    expect(m.coins).toBe(42)
    expect(m.boons).toEqual(['dharma-megha'])
    expect(m.upgrades).toEqual(['yama'])
    expect(m.fieldFloor).toBe(3)
    expect(m.focusVarna).toBe('vipra')
  })

  it('сохранение переживает цикл запись → чтение', () => {
    const m = EMPTY_META()
    m.coins = 77
    m.boons = ['prana']
    m.fieldFloor = 5
    saveMeta(m)
    const back = loadMeta()
    expect(back.coins).toBe(77)
    expect(back.boons).toEqual(['prana'])
    expect(back.fieldFloor).toBe(5)
  })

  it('отсутствие сохранения — это новая игра, а не ошибка', () => {
    localStorage.clear()
    const m = loadMeta()
    expect(m.boons).toEqual([])
    expect(typeof m.coins).toBe('number')
    expect(m.onboarded).toBe(false)
  })
})
