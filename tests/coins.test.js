// Тесты монет и лавки — копия петли Hades.
//
// В Hades из снятого врага падает монета, монеты собираются подходом,
// тратятся в лавке между комнатами и **живут между забегами**.

import { describe, it, expect } from 'vitest'
import {
  createField, stepField, parry, DEFAULT_FIELD_OPTIONS,
} from '@webapp/js/core/field.js'

function field(foes = [], opts = {}) {
  return createField({
    player: { x: 100, y: 200, hp: 60 }, foes, rng: () => 0.5, opts,
  })
}

function foe(over = {}) {
  return { id: 'krodha', name: 'Кродха', x: 100, y: 300, calmMax: 0.5, ...over }
}

function stage(st, i = 0) {
  const f = st.foes[i]
  f.state = 'telegraph'
  f.timer = st.o.parryWindow * 0.5
  f.charge = 1
  f.stun = 0
  f.cooldown = 0
  st.player.x = f.x
  st.player.y = f.y + 14
  st.player.parryCd = 0
  return f
}

function run(st, seconds, dt = 1 / 60) {
  const ev = []
  for (let i = 0; i < Math.round(seconds / dt); i++) ev.push(...stepField(st, dt, {}))
  return ev
}

describe('Монеты (драхмы) — как в Hades', () => {
  it('из снятой оковы падают монеты', () => {
    const st = field([foe()])
    expect(st.coins).toHaveLength(0)
    stage(st)
    parry(st)
    expect(st.foes[0].pacified).toBe(true)
    expect(st.coins.length).toBeGreaterThan(0)
  })

  it('из владыки падает больше, чем из обычной оковы', () => {
    const a = field([foe()]); stage(a); parry(a)
    // у владыки запас ×3, поэтому calmMax ниже, чтобы хватило одного дефлекта
    const b = field([foe({ isBoss: true, hp: 30, calmMax: 0.2 })]); stage(b); parry(b)
    expect(b.coins.length).toBeGreaterThan(a.coins.length)
  })

  it('монеты не подбираются сами — надо подойти', () => {
    const st = field([foe()])
    stage(st)
    parry(st)
    st.player.x = 40; st.player.y = 40        // ушёл далеко
    run(st, 0.5)
    expect(st.coinsTaken).toBe(0)
    expect(st.coins.every((c) => !c.taken)).toBe(true)
  })

  it('подошёл — подобрал', () => {
    const st = field([foe()])
    stage(st)
    parry(st)
    const c = st.coins[0]
    st.player.x = c.x; st.player.y = c.y
    // после дефлекта мир на долю секунды стоит (вес удара) — ждём, пока
    // заморозка пройдёт, иначе монета ещё не «считается»
    run(st, 0.3)
    expect(st.coinsTaken).toBeGreaterThan(0)
  })

  it('монета подбирается один раз', () => {
    const st = field([foe()])
    stage(st)
    parry(st)
    st.coins.forEach((c) => { st.player.x = c.x; st.player.y = c.y; run(st, 0.3) })
    const n = st.coinsTaken
    run(st, 0.5)
    expect(st.coinsTaken).toBe(n)
  })

  it('монеты из разных оков не дублируются', () => {
    const st = field([foe({ x: 100, y: 300 }), foe({ x: 200, y: 300 })])
    stage(st, 0); parry(st)
    stage(st, 1); parry(st)
    const total = st.coins.length
    const takenBefore = st.coinsTaken
    st.player.x = 400; st.player.y = 500
    run(st, 0.3)
    expect(st.coinsTaken).toBe(takenBefore)
    expect(total).toBeGreaterThan(3)
  })
})

describe('Кошелёк переживает забег', () => {
  it('монеты в кошельке — это опция боя, а не состояние забега', () => {
    const st = field([foe()], { coins: 17 })
    expect(st.o.coins).toBe(17)
    // новый забег создаётся с тем же кошельком
    const again = field([foe()], { coins: 17 })
    expect(again.o.coins).toBe(17)
  })

  it('без монет по умолчанию ноль', () => {
    expect(DEFAULT_FIELD_OPTIONS.coins).toBe(0)
  })
})
