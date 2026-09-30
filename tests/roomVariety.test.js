// РАЗНООБРАЗИЕ ЗАБЕГА: поле не должно быть одной и той же комнатой.
//
// Зачем. Это самая «помойковая» поломка, которую можно представить: игра
// работает, красивая, проходимая — и на девятый забег игрок знает наизусть,
// где стоит каждая ока. Состав комнаты брался по индексу `(floor * 2 + k)`,
// то есть был одинаковым ВСЕГДА: десятый побег — копия первого. Плюс
// раскладка бралась по номеру комнаты, и вид комнаты тоже повторялся.
//
// Источник механики — Hades: набор врагов и вид комнаты розыгрываются на
// каждом побеге, поэтому десятый побег не похож на первый. Смысл подстановки
// тот же: «новый побег — новая местность».
//
// Проверяем не «как красиво», а три вещи, которые можно сломать:
//   1) два забега подряд не совпадают комнатами;
//   2) один и тот же seed даёт ту же комнату (симулятор должен повторяться);
//   3) внутри комнаты ока не повторяется, а пул остаётся правильным для
//      чакры (ранние — рипу, поздние — паши, §9.5).

import { describe, it, expect } from 'vitest'
import { buildFieldFloor, calmMulFor } from '../webapp/js/core/fieldBuild.js'
import { ENEMIES } from '../webapp/js/core/data.js'

/** Случай с seed — тот же, что у симулятора. */
function seeded(seed) {
  let t = seed >>> 0
  return () => {
    t ^= t << 13; t >>>= 0
    t ^= t >>> 17
    t ^= t << 5; t >>>= 0
    return (t >>> 0) / 4294967296
  }
}

const ids = (b) => b.foes.map((f) => f.id).sort().join(',')
const ROOMS = 3
const FLOORS = 7

describe('поле: розыгрыш комнат', () => {
  it('два забега подряд не совпадают', () => {
    const run = (seed) => {
      const rng = seeded(seed)
      const rooms = []
      for (let f = 0; f < FLOORS; f++) {
        for (let r = 0; r < ROOMS; r++) rooms.push(ids(buildFieldFloor(f, { room: r, rng })))
      }
      return rooms
    }
    const a = run(11).join('|')
    const b = run(999).join('|')
    expect(a, 'два забега не должны быть комната в комнату одинаковыми').not.toBe(b)
    const same = run(11).join('|')
    expect(same, 'тот же seed — та же местность (симулятор повторяем)').toBe(a)
  })

  it('внутри комнаты ока не повторяется', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = seeded(seed * 977)
      for (let f = 0; f < FLOORS; f++) {
        for (let r = 0; r < ROOMS; r++) {
          const b = buildFieldFloor(f, { room: r, rng })
          const list = b.foes.map((x) => x.id)
          expect(new Set(list).size, `чакра ${f}, комната ${r}, seed ${seed}: ${list.join(',')}`)
            .toBe(list.length)
        }
      }
    }
  })

  it('пул оков остаётся правильным для чакры', () => {
    // Ранние чакры — рипу (внутренние), поздние — паши (внешние). Розыгрыш
    // не имеет права тащить пашу на первую чакру.
    for (let seed = 1; seed <= 12; seed++) {
      const rng = seeded(seed * 131)
      for (let f = 0; f < FLOORS; f++) {
        for (let r = 0; r < ROOMS; r++) {
          const b = buildFieldFloor(f, { room: r, rng })
          for (const foe of b.foes) {
            expect(ENEMIES[foe.id], `${foe.id} есть в контенте`).toBeTruthy()
            expect(foe.kind).toBe(f >= 3 ? 'pasha' : 'ripu')
            expect(foe.calmMax, 'запас спокойствия растёт с глубиной')
              .toBeGreaterThan(0)
          }
          expect(b.wares.length, 'просящий есть в каждой комнате').toBeGreaterThan(0)
        }
      }
    }
  })

  it('комната не пуста и не переполнена', () => {
    const rng = seeded(7)
    for (let f = 0; f < FLOORS; f++) {
      for (let r = 0; r < ROOMS; r++) {
        const b = buildFieldFloor(f, { room: r, rng })
        const count = 2 + Math.min(3, r) + Math.min(2, Math.floor(f / 2))
        expect(b.foes.length, `чакра ${f}, комната ${r}`).toBe(count)
        // Комнат на этапе три (stageRoute), оков в комнате — до шести.
        expect(count).toBeLessThanOrEqual(6)
        // Позиции разные: две оки в одной точке — это не комната, а куча.
        const pts = b.foes.map((x) => `${Math.round(x.x)},${Math.round(x.y)}`)
        expect(new Set(pts).size).toBe(pts.length)
      }
    }
  })

  it('к��аждая комната кладётся на поле', () => {
    // Ока за краем поля — её не видно и не достать: «бесплатный» побег.
    const rng = seeded(31337)
    const field = { w: 412, h: 600 }
    for (let f = 0; f < FLOORS; f++) {
      for (let r = 0; r < ROOMS; r++) {
        const b = buildFieldFloor(f, { room: r, rng, field })
        for (const foe of b.foes) {
          expect(foe.x, `${foe.id} x`).toBeGreaterThan(0)
          expect(foe.x, `${foe.id} x`).toBeLessThan(field.w)
          expect(foe.y, `${foe.id} y`).toBeGreaterThan(0)
          expect(foe.y, `${foe.id} y`).toBeLessThan(field.h)
        }
        for (const w of b.wares) {
          expect(w.x).toBeGreaterThan(0)
          expect(w.y).toBeGreaterThan(0)
        }
      }
    }
  })

  it('сложность чакры растёт', () => {
    expect(calmMulFor(0)).toBeLessThan(calmMulFor(6))
  })
})
