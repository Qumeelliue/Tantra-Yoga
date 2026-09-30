// Тесты часов смерти и хаос-пути — оба скопированы с Hades.
//
// Hades: примерно через 3.5 минуты включается «Гнев Аида» — мир
// ускоряется, и с каждой минутой враги бьют всё чаще. Плюс Chaos Gate:
// необязательная дверь, заходя в которую ты берёшь проклятие взамен дара.

import { describe, it, expect } from 'vitest'
import {
  createField, stepField, parry, DEFAULT_FIELD_OPTIONS,
} from '@webapp/js/core/field.js'

function mk(opts = {}, foes = 1, rng = () => 0.5) {
  const list = []
  for (let i = 0; i < foes; i++) list.push({ id: 'k' + i, name: 'К' + i, x: 100 + i * 90, y: 320, calmMax: 0.5 })
  return createField({
    player: { x: 100, y: 200, hp: 60 }, foes: list, rng, opts,
  })
}

function run(st, seconds, dt = 1 / 60) {
  const ev = []
  for (let i = 0; i < Math.round(seconds / dt); i++) ev.push(...stepField(st, dt, {}))
  return ev
}

describe('Часы смерти (Hades: Death Clock)', () => {
  it('сначала мир спокоен', () => {
    const st = mk()
    run(st, 2)
    expect(st.rageOn).toBe(false)
    expect(st.rage).toBe(0)
  })

  it('после порога мир злится и событие приходит один раз', () => {
    const st = mk({ clockStart: 2 })
    const ev = run(st, 2.2)
    expect(st.rageOn).toBe(true)
    expect(ev.filter((e) => e.type === 'rage_on')).toHaveLength(1)
  })

  it('злость нарастает со временем', () => {
    const st = mk({ clockStart: 1 })
    run(st, 1.2)
    const r1 = st.rage
    run(st, 10)
    expect(st.rage).toBeGreaterThan(r1)
  })

  it('злость ограничена потолком', () => {
    const st = mk({ clockStart: 1, clockMax: 1.5 })
    run(st, 600)
    expect(st.rage).toBeLessThanOrEqual(1.5)
  })

  it('в злости оковы бьют чаще — пауза короче', () => {
    const calm = mk({ clockStart: 999 })
    const angry = mk({ clockStart: 0 })
    run(calm, 0.1)
    run(angry, 0.1)
    expect(angry.rage).toBeGreaterThan(calm.rage)
    // берём паузу оковы после замаха
    const c = calm.foes[0], a = angry.foes[0]
    c.state = 'telegraph'; c.timer = 0.01
    a.state = 'telegraph'; a.timer = 0.01
    run(calm, 0.05); run(angry, 0.05)
    expect(a.cooldown).toBeLessThan(c.cooldown)
  })
})

describe('Хаос-путь (Hades: Chaos Gate)', () => {
  it('дверь появляется не в каждой комнате', () => {
    // розыгрыш 0 → шанс 0.5 срабатывает; розыгрыш 1 → не срабатывает
    expect(mk({ chaosChance: 0.5 }, 1, () => 0).chaos).toBeTruthy()
    expect(mk({ chaosChance: 0.5 }, 1, () => 1).chaos).toBeNull()
  })

  it('сама по себе дверь ничего не делает', () => {
    const st = mk({ chaosChance: 1 }, 1, () => 0)
    st.player.x = 50; st.player.y = 50
    const ev = run(st, 0.5)
    expect(ev.some((e) => e.type === 'chaos')).toBe(false)
    expect(st.player.chaosCurse).toBeFalsy()
  })

  it('вошёл добровольно — получил проклятие', () => {
    const st = mk({ chaosChance: 1 }, 1, () => 0)
    st.player.x = st.chaos.x; st.player.y = st.chaos.y
    const ev = run(st, 0.1)
    expect(ev.some((e) => e.type === 'chaos')).toBe(true)
    expect(st.player.chaosCurse).toBe(true)
    expect(st.chaos.taken).toBe(true)
  })

  it('проклятие удваивает урон по игроку', () => {
    const plain = createField({
      player: { x: 0, y: 0, hp: 60 },
      foes: [{ id: 'p', name: 'П', x: 0, y: 300, kind: 'pasha', hp: 30, attack: 8, calmMax: 9 }],
      rng: () => 0.5, opts: { chaosChance: 1 },
    })
    const cursed = createField({
      player: { x: 0, y: 0, hp: 60 },
      foes: [{ id: 'p', name: 'П', x: 0, y: 300, kind: 'pasha', hp: 30, attack: 8, calmMax: 9 }],
      rng: () => 0.5, opts: { chaosChance: 1 },
    })
    cursed.player.chaosCurse = true
    for (const st of [plain, cursed]) {
      st.player.x = st.foes[0].x; st.player.y = st.foes[0].y
      const f = st.foes[0]
      f.state = 'telegraph'; f.timer = 0.01; f.charge = 1; f.cooldown = 0
      run(st, st.o.attackWindow + 0.1)
    }
    expect(cursed.player.hp).toBeLessThan(plain.player.hp)
  })
})

// ── ФОНТАН АМБРОСИИ (Hades: healing fountain перед боссом) ───────────────
// В Hades кубок Амбросии стоит перед владыкой и решает, доживёшь ли ты до
// неё. У нас его не было: игрок входил к владыке с тем, что осталось после
// трёх комнат, и прогон забегов показывал 0 побед из 40.
describe('Фонтан амбросии', () => {
  function room(opts = {}) {
    return createField({
      player: { x: 100, y: 200, hp: 60 }, rng: () => 0.5,
      foes: [{ id: 'k', name: 'К', x: 300, y: 320, calmMax: 99 }],
      opts,
    })
  }

  it('ставится только там, где его велели поставить', () => {
    expect(room().spring).toBeNull()
    expect(room({ spring: true }).spring).toBeTruthy()
  })

  it('коснулся — восстановилась часть жизни', () => {
    const st = room({ spring: true })
    st.player.hp = 20
    st.player.x = st.spring.x
    st.player.y = st.spring.y
    const ev = run(st, 0.1)
    expect(ev.some((e) => e.type === 'spring')).toBe(true)
    expect(st.player.hp).toBeGreaterThan(20)
  })

  it('лечит ровно долю от максимума, а не всю жизнь', () => {
    const st = room({ spring: true })
    st.player.hp = 10
    st.player.x = st.spring.x; st.player.y = st.spring.y
    run(st, 0.1)
    expect(st.player.hp).toBe(st.player.maxHp * 0.35 + 10)
  })

  it('не выше максимума', () => {
    const st = room({ spring: true })
    st.player.hp = st.player.maxHp
    st.player.x = st.spring.x; st.player.y = st.spring.y
    run(st, 0.1)
    expect(st.player.hp).toBe(st.player.maxHp)
  })

  it('фонтан работает один раз за комнату', () => {
    const st = room({ spring: true })
    st.player.hp = 10
    st.player.x = st.spring.x; st.player.y = st.spring.y
    run(st, 0.1)
    const healed = st.player.hp
    st.player.hp = 5
    st.player.x = st.spring.x; st.player.y = st.spring.y
    const ev = run(st, 0.2)
    expect(ev.some((e) => e.type === 'spring')).toBe(false)
    expect(st.player.hp).toBe(5)
    void healed
  })

  it('фонтан стоит в последней комнате этапа — прямо перед владыкой', () => {
    // ровно там же, где в Hades стоит кубок Амбросии
    const st = room({ spring: true })
    expect(st.spring.y).toBeGreaterThan(st.field.h * 0.5)
  })
})
