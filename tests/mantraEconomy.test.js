// ЭКОНОМИКА ЦИ: мантры не могут обойти дефлект.
//
// Петля Nine Sols: дефлект → Ци → талисман. Если Ци можно получить иначе,
// петля ломается и дефлект становится необязательным. Два бага, оба
// найденные прогоном забегов, а не тестами.

import { describe, it, expect } from 'vitest'
import { createField, stepField, parry, castMantra, MANTRAS } from '@webapp/js/core/field.js'

function field(foes = [], opts = {}) {
  return createField({ player: { x: 100, y: 200, hp: 60 }, foes, rng: () => 0.5, opts })
}
function foe(over = {}) {
  return { id: 'krodha', name: 'Кродха', x: 100, y: 300, calmMax: 3, ...over }
}
function mk(opts = {}, n = 1) {
  const list = []
  for (let i = 0; i < n; i++) list.push(foe({ x: 100 + i * 70 }))
  return field(list, opts)
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

// ── Джапа больше не даёт Ци ────────────────────────────────────────────
describe('Джапа', () => {
  it('бесплатна, но Ци не даёт', () => {
    const st = mk()
    st.player.psychic = 4
    castMantra(st)
    expect(st.player.psychic).toBe(4)          // не выросло
    expect(st.player.psychicMax).toBeGreaterThan(0)
  })

  it('гасит неведение и прибавляет саттву — она всё же что-то делает', () => {
    const st = mk()
    st.avidya = 40
    const s0 = st.player.guna.s
    castMantra(st)
    expect(st.avidya).toBeLessThan(40)
    expect(st.player.guna.s).toBeGreaterThan(s0)
  })

  it('бесплатная Джапа не превращает Ци в бесконечность', () => {
    const st = mk({ mantraId: 'japa' })
    st.player.psychic = 0
    for (let i = 0; i < 200; i++) { st.player.parryCd = 0; castMantra(st) }
    expect(st.player.psychic).toBe(0)
  })

  it('Ци приходит только из игры: за возврат удара и севу', () => {
    const st = mk({ mantraId: 'japa' })
    stage(st)
    const before = st.player.psychic
    parry(st)
    expect(st.player.psychic).toBeGreaterThan(before)
  })
})

// ── Упаваса не отменяет работу, а дожигает начатое ──────────────────────
describe('Упаваса', () => {
  it('стоит дороже и не снимает свежую окову', () => {
    const st = mk({ mantraId: 'upavasa' })
    st.player.psychic = 12
    st.foes[0].calm = 0
    castMantra(st)
    expect(st.foes[0].pacified).toBe(false)
  })

  it('снимает окову, уже наполовину размягченную дефлектами', () => {
    const st = mk({ mantraId: 'upavasa' })
    st.player.psychic = 12
    st.foes[0].calm = st.foes[0].calmMax * 0.6
    castMantra(st)
    expect(st.foes[0].pacified).toBe(true)
  })

  it('комнату нельзя вычистить тремя мантрами — дефлект остаётся нужным', () => {
    const st = mk({ mantraId: 'upavasa' }, 5)
    st.player.psychic = 12
    for (let i = 0; i < 3; i++) { st.player.mantraCd = 0; castMantra(st) }
    expect(st.foes.filter((f) => f.pacified).length).toBe(0)
  })

  it('всё равно даёт щит, даже если окову снять не вышло', () => {
    const st = mk({ mantraId: 'upavasa' })
    st.player.psychic = 12
    const sh0 = st.player.shield
    castMantra(st)
    expect(st.player.shield).toBeGreaterThan(sh0)
  })
})

// ── Ни одна мантра не даёт бесплатного снятия оковы ───────────────────
describe('Мантры не обходят дефлект', () => {
  it('ни одна мантра не снимает окову с нулевым спокойствием', () => {
    for (const m of MANTRAS) {
      const st = mk({ mantraId: m.id })
      st.player.psychic = 30
      st.foes.forEach((f) => { f.calm = 0 })
      castMantra(st)
      expect(st.foes.filter((f) => f.pacified).length, m.name).toBe(0)
    }
  })

  it('каждая мантра объявлена и стоит сколько-то', () => {
    for (const m of MANTRAS) {
      expect(typeof m.cost, m.name).toBe('number')
      expect(m.cost, m.name).toBeGreaterThanOrEqual(0)
      expect(m.quoteId, m.name).toBeTruthy()
    }
  })

  it('бесплатна только одна — Джапа, и она не даёт Ци', () => {
    const free = MANTRAS.filter((m) => m.cost === 0)
    expect(free.map((m) => m.id)).toEqual(['japa'])
    expect(free[0].apply.toString()).not.toMatch(/psychic\s*[-+]=\s*[1-9]/)
  })
})
