// ЗДОРОВЬЕ ЖИВЁТ ВЕСЬ ПОБЕГ (Hades: HP переносится из комнаты в комнату).
//
// Два настоящих бага, найденных прогоном забегов:
//
// 1. Каждая комната начиналась с полной жизни. Выходишь из боя на двух
//    жизнях — в следующей снова шестьдесят. Весь забег превращался в
//    бесконечный сброс: напряжения не было, а фонтан амбросии и комната
//    покоя теряли смысл.
// 2. `maxHp` копировался из текущего `hp`. Из-за этого полоса жизни всегда
//    была полной, а лечение не могло поднять выше «полной» — то есть
//    не лечило ничего.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createField, stepField, DEFAULT_FIELD_OPTIONS } from '@webapp/js/core/field.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const main = readFileSync(join(root, 'webapp/js/main.js'), 'utf8')

describe('Здоровье живёт весь побег', () => {
  it('максимум не копируется из текущего — иначе лечить нечем', () => {
    const st = createField({
      player: { x: 0, y: 0, hp: 20, maxHp: 60 },
      rng: () => 0.5, foes: [],
    })
    expect(st.player.hp).toBe(20)
    expect(st.player.maxHp).toBe(60)
  })

  it('если максимум не передан, он равен текущему — обратной ошибки нет', () => {
    const st = createField({ player: { x: 0, y: 0, hp: 33 }, rng: () => 0.5, foes: [] })
    expect(st.player.maxHp).toBe(33)
  })

  it('амбросия поднимает жизнь до максимума, но не выше', () => {
    const st = createField({
      player: { x: 0, y: 0, hp: 10, maxHp: 60 },
      rng: () => 0, foes: [], opts: { spring: true },
    })
    st.player.x = st.spring.x
    st.player.y = st.spring.y
    for (let i = 0; i < 20; i++) stepField(st, 1 / 60, {})
    expect(st.player.hp).toBeGreaterThan(10)
    expect(st.player.hp).toBeLessThanOrEqual(60)
  })

  it('здоровье переносится из комнаты в комнату', () => {
    // В коде: app.runHp запоминается при выходе и читается при входе
    expect(main).toContain('if (st2?.player) app.runHp = st2.player.hp')
    // Строка поменяла форму из-за возврата из смерти (МЕХАНИКА 49): вход
    // может идти с половиной жизни, и проверка искала бы старую форму кода,
    // а не смысл. Смысл проверяется по обеим веткам.
    expect(main).toContain('hp: entryHp, maxHp: fullHp')
    expect(main, 'жизнь из комнаты в комнату не переносится')
      .toMatch(/app\.runHp == null \? fullHp : Math\.max\(1, Math\.min\(fullHp, app\.runHp\)\)/)
  })

  it('при смерти жизни сбрасываются — как в Hades, новая попытка с полной', () => {
    expect(main).toContain('app.runHp = null')
  })

  it('комната покоя реально лечит забег, а не только показывает цифру', () => {
    expect(main).toContain('app.runHp = run.maxHp')
  })

  it('в бою по умолчанию максимум равен шестидесяти', () => {
    const st = createField({ player: { x: 0, y: 0 }, rng: () => 0.5, foes: [] })
    expect(st.player.maxHp).toBe(DEFAULT_FIELD_OPTIONS.playerHp)
  })
})
