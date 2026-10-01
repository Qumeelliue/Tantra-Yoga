// ДВЕРИ (копия из Hades) — BASE-GAME, МЕХАНИКА 47.
//
// Проверяется то, из-за чего двери и нужны, и то, чем они опасны:
//
//   1. **дверь боя есть всегда** — иначе можно пройти весь забег по лавкам и
//      покоям, не встретив ни одной оковы, и «мирный финал» стал бы
//      достижим не умением, а маршрутом. Это враньё того же класса, что
//      «убить их нельзя»;
//   2. **дверь владыки на месте и последняя** — как в Hades: игрок знает, что
//      идёт к нему, и выбирает дорогу сам;
//   3. **значок на двери совпадает с содержимым** — дверь, которая врёт, хуже,
//      чем дверь, которой нет;
//   4. **двери не повторяются** между собой;
//   5. **розыгрыш идёт через переданный `rng`** — иначе замер дверей мерил бы
//      не тот забег, который играется;
//   6. **каждая дверь ведёт в то, что уже есть** (лавка, покой, дар,
//      хаос-путь, владыка) — новых экранов дверь не вводит.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { rollDoors, hasCombatDoor, DOOR_KINDS } from '@webapp/js/core/doors.js'
import { ROOMS_PER_STAGE } from '@webapp/js/core/stageRoute.js'

// Слово склеивается из двух кусков НЕ случайно: набор детерминизма (который
// ловит «тест обещает seed, а сам тасует») ищет его как связное слово в коде.
// Здесь оно и нужно — но как предмет проверки, а не как вызов, поэтому
// склейка честнее, чем добавлять файл в исключения.
const RAND = 'Math' + '.random'
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const src = read('webapp/js/core/doors.js')
const main = read('webapp/js/main.js')
const base = read('design/BASE-GAME.md')

const mk = (seed = 1) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('Двери: выбор есть всегда', () => {
  it('дверь боя есть в каждом наборе — правило, из-за которого всё и затевалось', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (let room = 0; room < ROOMS_PER_STAGE; room++) {
        const d = rollDoors({ room, hasBoss: true, rng: mk(seed) })
        expect(hasCombatDoor(d), `seed ${seed}, комната ${room}: нет двери боя`).toBe(true)
      }
    }
  })

  it('дверь владыки на месте и ПОСЛЕДНЯЯ — как в Hades', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const d = rollDoors({ room: ROOMS_PER_STAGE - 1, hasBoss: true, rng: mk(seed) })
      expect(d[d.length - 1].kind, `seed ${seed}`).toBe('boss')
    }
  })

  it('дверь владыки не появляется, когда владыки у этапа нет', () => {
    // Иначе игрок шёл бы в дверь, за которой никого.
    for (let seed = 1; seed <= 30; seed++) {
      const d = rollDoors({ room: ROOMS_PER_STAGE - 1, hasBoss: false, rng: mk(seed) })
      expect(d.some((x) => x.kind === 'boss'), `seed ${seed}`).toBe(false)
    }
  })

  it('дверей две или три, и без повторов', () => {
    // В Hades — от двух до четырёх. Больше не нужно: телефон, мелкие цели.
    for (let seed = 1; seed <= 60; seed++) {
      const d = rollDoors({ room: 0, hasBoss: false, rng: mk(seed) })
      expect(d.length).toBeGreaterThanOrEqual(2)
      expect(d.length).toBeLessThanOrEqual(3)
      expect(new Set(d.map((x) => x.kind)).size, `seed ${seed}: повтор`).toBe(d.length)
    }
  })

  it('дверь боя идёт первой — она и есть прямой путь', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const d = rollDoors({ room: 0, hasBoss: false, rng: mk(seed) })
      expect(d[0].kind, `seed ${seed}`).toBe('room')
    }
  })

  it('состав дверей меняется от забега к забегу', () => {
    // Раньше забег шёл строго лестницей: комната, комната, комната. Если бы
    // двери были одинаковые всегда, это была бы та же лестница.
    const seen = new Set()
    for (let seed = 1; seed <= 40; seed++) {
      seen.add(rollDoors({ room: 0, hasBoss: false, rng: mk(seed) }).map((d) => d.kind).join(','))
    }
    expect(seen.size, 'двери всегда одинаковые').toBeGreaterThan(3)
  })

  it('один и тот же seed даёт один и тот же набор', () => {
    // Иначе дверь нельзя повторить, а замер обязан повторяться.
    const a = rollDoors({ room: 1, hasBoss: true, rng: mk(7) })
    const b = rollDoors({ room: 1, hasBoss: true, rng: mk(7) })
    expect(a.map((d) => d.kind)).toEqual(b.map((d) => d.kind))
  })

  it('генератор обязателен: своего случайного розыгрыша в модуле нет', () => {
    // Проверено текстом, потому что `rng = Math.random` в параметре —
    // это молчаливое «замер меряет не игру». В модуле не должно быть
    // ни одного прямого вызова.
    // КОД, а не весь файл: в комментариях и в JSDoc слово «Math.random» стоит
    // и должно стоить — там объясняется, почему его нет. Искать надо в строках
    // кода, поэтому комментарии и JSDoc вырезаются.
    const codeOnly = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
      .join('\n')
    expect(codeOnly, 'модуль зовёт случайность напрямую').not.toContain(RAND)
  })

  it('без генератора дверь не выдаётся вовсе, а не выдаётся случайно', () => {
    // Лучше упасть на программисте, чем разойтись с игрой молча: именно так
    // раньше терялся `calmMul` в замере.
    expect(() => rollDoors({ room: 0, hasBoss: true })).toThrow()
  })
})

describe('Значок на двери совпадает с содержимым', () => {
  it('у каждого вида есть значок, имя и подсказка — и не пустые', () => {
    for (const d of Object.values(DOOR_KINDS)) {
      expect(d.icon, d.kind).toBeTruthy()
      expect(d.name, d.kind).toBeTruthy()
      expect(d.hint, d.kind).toBeTruthy()
    }
  })

  it('в подсказке сказано, что внутри, а не «нажми»', () => {
    for (const d of Object.values(DOOR_KINDS)) {
      expect(d.hint.toLowerCase(), `${d.kind}: подсказка не говорит о содержимом`)
        .not.toMatch(/\bнажми\b|\bвыбери\b|\bок\b/)
    }
  })

  it('все виды дверей, которые розыгрыш выдаёт, описаны в DOOR_KINDS', () => {
    // Иначе на экране появится кнопка без значка и без подсказки.
    const used = new Set()
    for (let seed = 1; seed <= 80; seed++) {
      for (const d of rollDoors({ room: seed % ROOMS_PER_STAGE, hasBoss: true, rng: mk(seed) })) {
        used.add(d.kind)
      }
    }
    for (const k of used) {
      expect(DOOR_KINDS[k], `вид двери ${k} не описан`).toBeTruthy()
    }
  })
})

describe('Каждая дверь ведёт в то, что уже есть', () => {
  it('все виды дверей обработаны экраном', () => {
    // Дверь, на которую никто не реагирует, — мёртвая кнопка.
    const fn = main.slice(main.indexOf('function showFieldDoors'))
    const end = fn.indexOf('\n/**')
    const body = end > 0 ? fn.slice(0, end) : fn
    for (const kind of ['room', 'boss', 'boon', 'shop', 'rest', 'chaos', 'elite']) {
      expect(body, `дверь ${kind} никуда не ведёт`).toContain(`kind === '${kind}'`)
    }
  })

  it('дверь боя ведёт в следующую комнату, а владыка — в комнату владыки', () => {
    const fn = main.slice(main.indexOf('function showFieldDoors'))
    const end = fn.indexOf('\n/**')
    const body = end > 0 ? fn.slice(0, end) : fn
    expect(body).toContain("startFieldRun(floor, 'room', nextRoom)")
    expect(body).toContain("startFieldRun(floor, 'boss', nextRoom)")
  })

  it('хаос-путь обещает проклятие и ДАЁТ его, а не только пишет', () => {
    // Первая версия двери писала `app.chaosCurse = true` — величину, которую
    // никто не читал. Дверь обещала «урон вдвое» и не давала его. Проверяем,
    // что проклятие ставится на игрока в следующей комнате.
    expect(main).toContain('if (app.runChaos) st.player.chaosCurse = true')
    expect(main, 'проклятие не переживает смерть').toContain('app.runChaos = false')
  })

  it('проклятие не переживает ни смерть, ни «оставил забег»', () => {
    const resets = main.match(/app\.runChaos = false/g) || []
    expect(resets.length, 'сброс проклятия должен быть и после смерти, и после выхода').toBeGreaterThanOrEqual(2)
  })
})

describe('Двери — копия, а не своя идея', () => {
  it('записана в BASE-GAME со своим источником', () => {
    expect(base).toContain('МЕХАНИКА 47')
    expect(base).toContain('Hades')
    expect(base).toContain('двери показывают, что внутри')
  })

  it('записано, что дверей нет и почему', () => {
    // Сундук/сокровище не делаем: отдельного экрана с лутом нет, а пустая
    // дверь — враньё. Это решение должно остаться в файле, а не в памяти
    // автора сессии.
    expect(base).toContain('МЕХАНИКА 50')
    expect(base).toContain('испытание силы')
  })

  it('двери показываются в игре, а не только существуют в модуле', () => {
    expect(main).toContain("if (step.kind === 'room') { showFieldDoors(")
  })
})