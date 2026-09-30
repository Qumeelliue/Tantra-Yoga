// ЧЕСТНОСТЬ БОЯ С ВЛАДЫКОЙ.
//
// Три поломки делали владыку принципиально непобедимым, и ни один тест их
// не ловил: они проявлялись только на длинной петле — двадцать секунд
// боя, а тесты проверяли один кадр. Найдены прогоном забегов
// (`npm run field-balance`), который водит бота от первой чакры до финала.

import { describe, it, expect } from 'vitest'
import {
  createField, stepField, parry, checkOutcome, DEFAULT_FIELD_OPTIONS,
} from '@webapp/js/core/field.js'
import { buildFieldFloor } from '@webapp/js/core/fieldBuild.js'
import { mkBossDef } from './helpers/foeFixtures.js'

const F = { w: 412, h: 600 }

function bossRoom(floor = 1) {
  const built = buildFieldFloor(floor, { field: F, room: 3 })
  return createField({
    player: { x: built.field.w * 0.5, y: built.field.h * 0.72, hp: 60 },
    foes: [built.boss], field: built.field, rng: () => 0.5, opts: {},
  })
}

describe('Владыка: стойкость сгорает (Slay the Spire: Block снимается в ходе)', () => {
  it('защитный приём не копит стойкость навсегда', () => {
    const st = bossRoom(0)                        // Моха: «Рокот» даёт Block 8
    const f = st.foes[0]
    // прогоняем 20 секунд боя — ровно столько, за что копился блок
    for (let i = 0; i < 20 * 60; i++) {
      st.player.hp = 60
      stepField(st, 1 / 60, {})
    }
    expect(f.block).toBeLessThanOrEqual(10)
  })

  it('перед новым приёмом стойкость обнуляется', () => {
    const st = bossRoom(0)
    const f = st.foes[0]
    f.block = 25
    f.state = 'idle'
    f.cooldown = 0
    f.timer = 0
    st.player.x = f.x          // владыка ждёт, пока ты подойдёшь
    st.player.y = f.y + 20
    stepField(st, 1 / 60, {})
    // либо владыка взял приём и обнулил, либо ещё не взял — но не «25 и выше»
    expect(f.block).toBeLessThan(25)
  })
})

describe('Владыка: «слабость» временная (Slay the Spire: Weak длится несколько ходов)', () => {
  it('стак слабости спадает сам', () => {
    const st = bossRoom(0)
    st.player.weak = 2
    for (let i = 0; i < DEFAULT_FIELD_OPTIONS.weakTurn * 130; i++) stepField(st, 1 / 60, {})
    expect(st.player.weak).toBe(0)
  })

  it('слабость не накапливается выше потолка', () => {
    const st = bossRoom(0)
    st.player.weak = 0
    for (let i = 0; i < 20 * 60; i++) stepField(st, 1 / 60, {})
    expect(st.player.weak).toBeLessThanOrEqual(DEFAULT_FIELD_OPTIONS.weakMax)
  })

  it('бесконечная слабость не делает бой невозможным', () => {
    // с настоящей слабостью дефлект снимает заметно меньше спокойствия
    const strong = bossRoom(0)
    const weak = bossRoom(0)
    weak.player.weak = 0
    for (let i = 0; i < 20 * 60; i++) stepField(weak, 1 / 60, {})
    for (const st of [strong, weak]) {
      const f = st.foes[0]
      f.state = 'telegraph'; f.timer = st.o.parryWindow * 0.5; f.charge = 1
      f.stun = 0; f.cooldown = 0; f.telegraphSpan = st.o.bossTelegraph
      st.player.x = f.x; st.player.y = f.y + 14; st.player.parryCd = 0
      parry(st)
    }
    // даже измотанный игрок должен двигать бой, а не стоять на месте
    expect(weak.foes[0].calm).toBeGreaterThan(0.1)
  })
})

describe('Владыка: «сила» не растёт бесконечно', () => {
  it('сила не превышает потолок за долгий бой', () => {
    const st = bossRoom(0)
    for (let i = 0; i < 40 * 60; i++) { st.player.hp = 60; stepField(st, 1 / 60, {}) }
    expect(st.foes[0].strength).toBeLessThanOrEqual(DEFAULT_FIELD_OPTIONS.bossStrengthMax)
  })

  it('урон владыки не растёт с каждой минутой', () => {
    const st = bossRoom(0)
    const dmgAt = (sec) => {
      const s2 = bossRoom(0)
      for (let i = 0; i < sec * 60; i++) { s2.player.hp = 999; stepField(s2, 1 / 60, {}) }
      return s2.foes[0].strength
    }
    expect(dmgAt(30)).toBeLessThanOrEqual(DEFAULT_FIELD_OPTIONS.bossStrengthMax)
    void st
  })
})

describe('Владыка снимается', () => {
  it('внимательный игрок снимает владыку', () => {
    const st = bossRoom(1)
    const f = st.foes[0]
    let t = 0
    const dt = 1 / 60
    while (!f.pacified && !f.dead && t < 180) {
      const p = st.player
      const d = Math.hypot(f.x - p.x, f.y - p.y) || 1
      if (d > 30) stepField(st, dt, { dx: (f.x - p.x) / d, dy: (f.y - p.y) / d })
      else {
        const hint = (() => {
          if (f.state !== 'telegraph' || f.stun > 0) return null
          return Math.hypot(p.x - f.x, p.y - f.y) <= st.o.parryRadius ? f : null
        })()
        if (hint && f.timer <= st.o.parryWindow) parry(st)
        else stepField(st, dt, {})
      }
      t += dt
    }
    expect(f.pacified || f.dead).toBe(true)
    checkOutcome(st, [])
  })

  it('запас владыки вдвое больше его собственного, а не втрое', () => {
    // тройной запас был нечестен: единственный источник силы — возврат
    // удара, а он ограничен темпом приёмов владыки
    // запас владыки = его собственная база × множитель чакры × масштаб владыки
    const built = buildFieldFloor(1, { field: F, room: 3 })
    const st = bossRoom(1)
    expect(st.foes[0].calmMax).toBe(built.boss.calmMax * DEFAULT_FIELD_OPTIONS.bossCalmScale)
    expect(DEFAULT_FIELD_OPTIONS.bossCalmScale).toBeLessThanOrEqual(2)
  })
})
