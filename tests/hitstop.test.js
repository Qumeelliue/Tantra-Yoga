// ВЕС УДАРА — то, что делает дефлект ударом, а не щелчком.
//
// В Hades и Nine Sols возврат удара: доля секунды мир стоит, картинку
// подбрасывает, врага отбрасывает. Без этого бой читается как калькулятор:
// все числа правильные, а попадания не чувствуется.

import { describe, it, expect } from 'vitest'
import {
  createField, stepField, parry, strike, DEFAULT_FIELD_OPTIONS,
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

describe('Вес удара (Hades: hitstop + shake + knockback)', () => {
  it('в бою без ударов ничего не трясётся', () => {
    const st = field([foe({ calmMax: 99 })])
    run(st, 1)
    expect(st.freeze).toBe(0)
    expect(st.shake).toBe(0)
  })

  it('возврат удара ставит мир на долю секунды', () => {
    const st = field([foe({ calmMax: 99 })])
    stage(st)
    parry(st)
    expect(st.freeze).toBeGreaterThan(0)
    expect(st.freeze).toBeLessThan(0.2)          // не «вечная» заморозка
  })

  it('во время заморозки мир действительно стоит', () => {
    const st = field([foe({ calmMax: 99 })])
    stage(st)
    parry(st)
    const before = { ...st.player }
    run(st, st.o.hitStopDeflect * 0.5)
    expect(st.player.x).toBe(before.x)
    expect(st.player.y).toBe(before.y)
  })

  it('заморозка кончается сама — бой не встаёт', () => {
    const st = field([foe({ calmMax: 99 })])
    stage(st)
    parry(st)
    run(st, 0.4)
    expect(st.freeze).toBe(0)
  })

  it('возврат удара отбрасывает оку', () => {
    const st = field([foe({ calmMax: 99 })])
    const f = stage(st)
    const x0 = f.x, y0 = f.y
    parry(st)
    expect(Math.hypot(f.x - x0, f.y - y0)).toBeGreaterThan(10)
  })

  it('отдача не выбрасывает оку из комнаты и не уводит под стену', () => {
    const st = field([foe({ x: 8, y: 195, calmMax: 99 })])
    const f = stage(st)
    parry(st)
    run(st, 0.5)
    expect(f.x).toBeGreaterThanOrEqual(40)
    expect(f.y).toBeGreaterThanOrEqual(190)
    expect(f.x).toBeLessThanOrEqual(st.field.w - 40)
  })

  it('снятие оковы весит тяжелее, чем просто дефлект', () => {
    // мягкий — ока выдержала дефлект (запас спокойствия огромный)
    const soft = field([foe({ calmMax: 99 })])
    stage(soft); parry(soft)
    // жёсткий — ока снята, это награда, и она должна звучать иначе
    const hard = field([foe({ calmMax: 0.4 })])
    stage(hard); parry(hard)
    expect(hard.freeze).toBeGreaterThan(soft.freeze)
    expect(hard.shake).toBeGreaterThan(soft.shake)
  })

  it('тряска сходит на нет сама', () => {
    const st = field([foe({ calmMax: 0.4 })])
    stage(st); parry(st)
    expect(st.shake).toBeGreaterThan(0)
    run(st, 1.2)
    expect(st.shake).toBe(0)
  })

  it('тебя больно — тоже трясёт', () => {
    const st = field([foe({ kind: 'pasha', calmMax: 99, hp: 40, attack: 8 })])
    const f = st.foes[0]
    f.state = 'telegraph'; f.timer = 0.01; f.charge = 1; f.cooldown = 0
    st.player.x = f.x; st.player.y = f.y
    const hp0 = st.player.hp
    run(st, 0.3)
    expect(st.player.hp).toBeLessThan(hp0)
    expect(st.shake).toBeGreaterThan(0)
  })

  it('срыв порога владыки — самая тяжёлая точка боя', () => {
    const st = field([foe({ isBoss: true, hp: 40, calmMax: 1 })])
    const f = st.foes[0]
    stage(st)
    parry(st)
    // Порог владыки ставится при создании (половина запаса), поэтому опускаем
    // его под текущее спокойствие — иначе нужно много дефлектов подряд.
    f.thresholdAt = f.calm * 0.5
    run(st, 0.1)                    // порог проверяется в шаге боя
    expect(f.phase).toBe(2)
    expect(st.shake).toBeGreaterThanOrEqual(DEFAULT_FIELD_OPTIONS.shakeBossBreak)
  })

  it('все величины заморозки и тряски — из настроек, не зашитые', () => {
    for (const key of ['hitStopDeflect', 'hitStopPacify', 'hitStopHurt',
      'shakeDeflect', 'shakePacify', 'shakeHurt', 'shakeBossBreak', 'knockDeflect']) {
      expect(typeof DEFAULT_FIELD_OPTIONS[key], key).toBe('number')
      expect(DEFAULT_FIELD_OPTIONS[key], key).toBeGreaterThan(0)
    }
  })

  it('без настроек отдачи дефлект всё равно работает, только без толчка', () => {
    const st = field([foe({ calmMax: 99 })], { knockDeflect: 0 })
    const f = stage(st)
    const x0 = f.x
    const ev = parry(st)
    expect(f.x).toBe(x0)
    expect(ev.some((e) => e.type === 'deflect')).toBe(true)
  })
})
