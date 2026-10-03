// ДЕНЬГИ В ПОЛЕ: падают, подбираются, тратятся.
//
// Отдельный тест от `uiFullRun` — и не по вкусу, а по существу. Там
// комнаты «зачищаются» руками (проверка за экраны), и монеты при этом не
// падают: падают они внутри `pacifyFoe`. Здесь — на ядре, где видно всё.
//
// Что проверяется:
//   1. снятая ока роняет монеты, владыка — шесть;
//   2. монеты подбираются подходом, а не сами;
//   3. крипа снимает оковы и тоже роняет деньги;
//   4. лавка достижима: её зовёт `afterRest`, а не мёртвая ветка.

import { describe, it, expect } from 'vitest'
import {
  createField, stepField, parry, checkKrpa, DEFAULT_FIELD_OPTIONS,
} from '@webapp/js/core/field.js'
import { buildFieldFloor } from '@webapp/js/core/fieldBuild.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const main = readFileSync(join(root, 'webapp/js/main.js'), 'utf8')

const mk = (foes = 2) => {
  const built = buildFieldFloor(0, { room: 0, rng: () => 0.5 })
  return createField({
    player: { x: built.field.w * 0.5, y: built.field.h * 0.72, hp: 60, maxHp: 60 },
    foes: built.foes.slice(0, foes),
    // Арена — та, которую вернул строитель, а не своя копия.
    //
    // Третий случай одного класса за день: размер арены был написан в
    // симуляторе дважды и здесь, и каждый раз расходился с игрой молча. Здесь
    // вышло так, что ока строились в арене 780×1120, а поле объявляло
    // 412×600 — монеты падали за границей, и проверка «все монеты подобраны»
    // падала не потому, что игра сломалась, а потому, что у проверки было другое
    // представление о комнате.
    field: built.field,
    opts: { ...DEFAULT_FIELD_OPTIONS },
  })
}

describe('монеты падают', () => {
  it('снятая ока роняет монеты на своём месте', () => {
    const st = mk(2)
    expect(st.coins.length, 'до снятия монет нет').toBe(0)
    // Снимаем окову настоящим путём: крипа при полном спокойствии.
    for (const f of st.foes) f.calm = f.calmMax
    st.player.hp = 5
    st.avidya = 0
    st.samskaraPressure = 0
    const used = checkKrpa(st, [])
    expect(used, 'крипа сработала').toBe(true)
    expect(st.coins.length, 'монеты упали').toBeGreaterThan(0)
    expect(st.coins[0].x, 'монеты падают там, где была ока').toBeGreaterThan(0)
  })

  it('монеты подбираются подходом, а не сами', () => {
    const st = mk(2)
    for (const f of st.foes) f.calm = f.calmMax
    st.player.hp = 5
    st.avidya = 0
    st.samskaraPressure = 0
    checkKrpa(st, [])
    expect(st.coinsTaken, 'ни одной не подобрано — игрок стоит в стороне').toBe(0)

    // Снятие оковы ставит заморозку удара: пока она стоит, мир не идёт и
    // монеты не берутся. Это так и должно быть — сначала «дожимаем» удар.
    for (let i = 0; i < 20 && st.freeze > 0; i++) stepField(st, 0.016, {})

    // Подходим к каждой монете, как игрок.
    for (const c of st.coins) {
      st.player.x = c.x
      st.player.y = c.y
      stepField(st, 0.016, {})
    }
    expect(st.coinsTaken, 'все монеты подобраны').toBe(st.coins.length)
  })

  it('монеты не подбираются, если стоять далеко', () => {
    const st = mk(2)
    for (const f of st.foes) f.calm = f.calmMax
    st.player.hp = 5
    st.avidya = 0
    st.samskaraPressure = 0
    checkKrpa(st, [])
    st.player.x = 5
    st.player.y = 5
    for (let i = 0; i < 40; i++) stepField(st, 0.016, {})
    expect(st.coinsTaken, 'стоя в углу, монеты не берутся').toBe(0)
  })

  it('владыка роняет больше оки', () => {
    const built = buildFieldFloor(0, { includeBoss: true, rng: () => 0.5 })
    const st = createField({
      player: { x: 206, y: 430, hp: 6, maxHp: 60 },
      foes: [],
      field: { w: 412, h: 600 },
      opts: { ...DEFAULT_FIELD_OPTIONS },
    })
    st.foes.push(built.boss)
    built.boss.calm = built.boss.calmMax
    st.avidya = 0
    st.samskaraPressure = 0
    const before = st.coins.length
    checkKrpa(st, [])
    expect(st.coins.length, 'владыка роняет шесть монет').toBe(before + 6)
  })

  it('множитель монет работает (варна вайшьи и нефрит апариграхи)', () => {
    const st = mk(1)
    st.o.coinMul = 2
    st.foes[0].calm = st.foes[0].calmMax
    st.player.hp = 5
    st.avidya = 0
    st.samskaraPressure = 0
    checkKrpa(st, [])
    // одна ока = 2 монеты, с множителем 2 → 4
    expect(st.coins.length).toBe(4)
  })
})

describe('лавка достижима', () => {
  it('её зовёт afterRest, а не мёртвая ветка в onNext', () => {
    // Мёртвая ветка стояла ПОСЛЕ проверок маршрута, из которых она
    // недостижима: nextStage возвращает только room / boss / done, и ни
    // один из них сюда не доходил. Монеты копились, а тратить их было негде.
    expect(main).toContain('function afterRest(')
    expect(main).toMatch(/app\.fieldShopBought = \{\}[^\n]*\n\s*showFieldShop\(st, next\)/)
    // из покоя
    expect(main).toContain('afterRest(meta, next, st)')
    // и в мёртвой ветке её больше нет
    expect(main).not.toMatch(/if \(\(nextFloor % 2\) === 1\)/)
  })

  it('полки лавки одноразовые', () => {
    expect(main).toContain('if (app.fieldShopBought[key]) return')
    expect(main).toContain('disabled: taken || cost > purse')
  })
})

describe('комната воспроизводима', () => {
  it('одинаковый rng даёт одинаковую комнату', () => {
    // Раньше просящие и их «долг» брались из Math.random() напрямую, минуя
    // rng: одна и та же комната собиралась по-разному, и симулятор не мог
    // повторить прогоны. Теперь случай идёт через rng.
    const a = buildFieldFloor(2, { room: 1, rng: seeded(7) })
    const b = buildFieldFloor(2, { room: 1, rng: seeded(7) })
    expect(JSON.stringify(a.wares)).toBe(JSON.stringify(b.wares))
    expect(a.wares.length).toBeGreaterThan(0)
  })

  it('разный rng даёт разные комнаты (а не один и тот же мир)', () => {
    // Два розыгрыша на два броска — слишком мало, чтобы обязательно
    // разойтись, поэтому смотрим на двести seed-ов: у разных seed-ов
    // просящие и их «долг» должны отличаться.
    const seen = new Set()
    for (let i = 0; i < 200; i++) {
      seen.add(JSON.stringify(buildFieldFloor(2, { room: 1, rng: seeded(i) }).wares))
    }
    expect(seen.size, 'просящие не варьируются — rng не влияет').toBeGreaterThan(1)
  })

  it('просящий у стены иногда просит «с расчётом» — сева мимо', () => {
    let debts = 0
    for (let i = 0; i < 200; i++) {
      const b = buildFieldFloor(1, { room: 0, rng: seeded(i) })
      for (const w of b.wares) if (w.debt) debts++
    }
    expect(debts, 'за двести комнат должен встретиться хоть один «расчёт»').toBeGreaterThan(0)
  })
})

/** Простой детерминированный генератор — чтобы повторять прогоны. */
function seeded(seed) {
  let x = (seed * 2654435761) >>> 0
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0
    return x / 4294967296
  }
}
