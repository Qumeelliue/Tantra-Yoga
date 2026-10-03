// ТРОНЫ ЧАКРЫ: выбор владыки из трёх (Slay the Spire) — BASE-GAME, МЕХАНИКА 58.
//
// Проверяется то, из-за чего троны нужны и то, чем они опасны:
//
//   1. **три кандидата показаны ДО этапа** — игрок строит путь, зная, кто ждёт;
//   2. **выбирает игрок**, и выбор живёт до смерти — как в StS, где босс виден
//      с начала акта и не переставляется посреди него;
//   3. **кто выбран — тот и в комнате** (а не владыка по умолчанию) и его же
//      имя на двери: обещание и содержимое должны совпадать;
//   4. **ни одно имя не выдумано** — каждый владыка либо уже был оковой в
//      комнатах, либо назван в Шастрах, и у него есть цитата с источником;
//   5. **розыгрыш идёт через `rng`** — иначе замер мерил бы не тот забег.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  rollLords, lordPool, lordFor, stageHasLord, allLordIds, lordName, lordChakra, LORD_CHOICES,
} from '@webapp/js/core/lords.js'
import { buildFieldFloor, stageHasBoss, DEFAULT_FIELD_SIZE } from '@webapp/js/core/fieldBuild.js'
import { rollDoors, hasCombatDoor } from '@webapp/js/core/doors.js'
import { ENEMIES, QUOTES, WORLDS, CITY_TEACHERS, worldForFloor } from '@webapp/js/core/data.js'
import { LORD_QUOTES, lordChain, nextLordQuote, reachableQuoteIds, brokenTeaching } from '@webapp/js/core/teaching.js'
import teaching from '@content/teaching.json'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const main = read('webapp/js/main.js')
const base = read('design/BASE-GAME.md')
const spec = read('SPEC.md')

const mk = (seed = 1) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const floors = [0, 1, 2, 3, 4, 5, 6]

describe('Троны чакры: три кандидата на этап', () => {
  it('у каждой чакры ровно три трона, и все три — существующие владыки', () => {
    for (const f of floors) {
      const pool = lordPool(f)
      expect(pool.length, `чакра ${f}: тронов`).toBe(LORD_CHOICES)
      for (const id of pool) {
        expect(ENEMIES[id], `чакра ${f}: нет владыки ${id}`).toBeTruthy()
        expect(ENEMIES[id].isBoss, `${id} должен быть владыкой`).toBe(true)
        expect(ENEMIES[id].chakra, `${id} с чужой чакры`).toBe(f)
      }
    }
  })

  it('владык 21, и ни один не встречается дважды', () => {
    const all = allLordIds()
    expect(all).toHaveLength(21)
    expect(new Set(all).size, 'один владыка сидит на двух тронах').toBe(21)
  })

  it('владыка по умолчанию остаётся прежним — старые сохранения не ломаются', () => {
    // `lordId` в `content/worlds.json` — это владыка, которого мир называл до
    // тронов. Он остаётся первым в пуле, поэтому мир без выбора (старый
    // забег, сохранённый экран) ведёт себя ровно как раньше.
    for (const f of floors) {
      const w = worldForFloor(f)
      expect(lordPool(f)[0], `чакра ${f}`).toBe(w.lordId)
      expect(ENEMIES[w.lordId], `чакра ${f}: владыка по умолчанию`).toBeTruthy()
    }
    expect(stageHasBoss(0)).toBe(true)
    expect(stageHasLord(0)).toBe(true)
  })

  it('названия тронов не выдуманы: 9 — оковы из комнат, 5 — термины Шастр', () => {
    // Проверка на подмену: если бы кто-то вписал «Владыка Тьмы» или
    // «Король Нибрйи», такой id не нашёлся бы ни среди оков комнат, ни среди
    // семи владык по умолчанию, и набор это увидел бы.
    //
    // Имена — не id: `lord_bhaya` и ока `bhaya_pasha` различаются только
    // префиксом. Сверяется ИМЯ, потому что именно имя видит игрок.
    const roomNames = new Set(Object.values(ENEMIES).filter((e) => !e.isBoss).map((e) => e.name))
    const known = new Set([
      ...roomNames,
      ...Object.values(WORLDS).filter((w) => w && w.lordId).map((w) => ENEMIES[w.lordId].name),
      // пять терминов, названных в Шастрах и в лоре самой игры
      'Кулакундалини', 'Самкальпа', 'Викальпа', 'Картта', 'Санчара',
    ])
    const unknown = allLordIds().map((id) => ENEMIES[id].name).filter((n) => !known.has(n))
    expect(unknown, `неизвестные владыки: ${unknown.join(', ')}`).toEqual([])
    // И все деванагари непустые: термин без деванагари читается как опечатка.
    for (const id of allLordIds()) {
      expect(ENEMIES[id].sanskrit, `${id}: нет деванагари`).toMatch(/[ऀ-ॿ]/)
    }
    // У каждого нового владыки — своя цитата с источником.
    for (const id of allLordIds()) {
      const q = ENEMIES[id].quoteId
      expect(QUOTES[q], `${id}: цитата ${q} есть в корпусе`).toBeTruthy()
      expect(QUOTES[q].source, `${id}: у цитаты ${q} нет источника`).toBeTruthy()
    }
  })

  it('у каждого владыки есть строка «чем он держит мир» — по ней и выбирают', () => {
    // Три одинаковых «страшных владыки» — это не выбор, а украшение. Текст
    // берётся из источника и говорит, что именно этот термин делает.
    for (const id of allLordIds()) {
      const hold = ENEMIES[id].hold || ''
      expect(hold.length, `${id}: нечем выбирать`).toBeGreaterThan(20)
    }
    // И у трёх владык одной чакры строки РАЗНЫЕ: иначе троны взаимозаменяемы.
    for (const f of floors) {
      const holds = lordPool(f).map((id) => ENEMIES[id].hold)
      expect(new Set(holds).size, `чакра ${f}: строки тронов совпали`).toBe(3)
    }
  })

  it('розыгрыш идёт через переданный rng — без него падение', () => {
    expect(() => rollLords(0)).toThrow()
    // Один и тот же seed — один и тот же порядок тронов (ежедневный путь).
    expect(rollLords(2, mk(77))).toEqual(rollLords(2, mk(77)))
    // Разные seed — порядок розыгрыша может отличаться.
    const orders = new Set()
    for (let seed = 1; seed <= 40; seed++) orders.add(rollLords(3, mk(seed)).join(','))
    expect(orders.size, 'порядок тронов всегда один и тот же').toBeGreaterThan(1)
  })

  it('в тронах нет повторов — три карточки одного владыки это не выбор', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const f of floors) {
        const ids = rollLords(f, mk(seed * 31 + f))
        expect(new Set(ids).size, `seed ${seed}, чакра ${f}`).toBe(ids.length)
        for (const id of ids) expect(lordPool(f)).toContain(id)
      }
    }
  })

  it('тасуется КОПИЯ пула: розыгрыш не переставляет сам контент', () => {
    const before = floors.map((f) => lordPool(f).join(','))
    for (let seed = 1; seed <= 30; seed++) for (const f of floors) rollLords(f, mk(seed + f))
    expect(floors.map((f) => lordPool(f).join(','))).toEqual(before)
  })
})

describe('Выбор влияет на забег', () => {
  it('в комнату приходит ТОТ владыка, которого назвали', () => {
    const F = { ...DEFAULT_FIELD_SIZE }
    for (const f of floors) {
      for (const id of lordPool(f)) {
        const built = buildFieldFloor(f, { field: F, room: 3, lordId: id })
        expect(built.boss, `чакра ${f}: владыка не собралась`).toBeTruthy()
        expect(built.boss.id, `чакра ${f}: в комнате не тот владыка`).toBe(id)
        expect(built.boss.isBoss).toBe(true)
        // Владыка чужой чакры в комнату не пускается: числа и цитаты не его.
        const alien = lordPool((f + 3) % 7).find((x) => !lordPool(f).includes(x))
        const other = buildFieldFloor(f, { field: F, room: 3, lordId: alien })
        expect(other.boss.id, `чакра ${f}: пустил чужого владыку`).toBe(lordPool(f)[0])
        expect(lordFor(f, alien)).toBe(lordPool(f)[0])
        expect(lordFor(f, null)).toBe(lordPool(f)[0])
      }
    }
  })

  it('приёмы и порог 50 % у новых владык — из контента, а не из кода', () => {
    for (const id of allLordIds()) {
      const d = ENEMIES[id]
      expect(Array.isArray(d.moves) && d.moves.length >= 3, `${id}: приёмов мало`).toBe(true)
      for (const m of d.moves) {
        expect(m.name, `${id}: приём без имени`).toBeTruthy()
        expect(Array.isArray(m.effects), `${id}/${m.name}: нет эффектов`).toBe(true)
      }
      expect(d.onThreshold, `${id}: без порога`).toBeTruthy()
      expect(d.onThreshold.trigger).toBe('hp_lte_50')
      expect(d.onThreshold.log.length, `${id}: порог без слов`).toBeGreaterThan(10)
      expect(d.calmMax, `${id}: запас спокойствия`).toBeGreaterThan(0)
      expect(d.maxHp, `${id}: запас жизни`).toBeGreaterThan(0)
    }
  })

  it('дверь владыки пишет имя выбранного, а дверь боя есть всегда', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = mk(seed)
      const f = seed % 7
      const chosen = rollLords(f, rng)[0]
      const doors = rollDoors({
        room: 2, hasBoss: true, rng: mk(seed * 7 + 1), lordName: lordName(chosen),
      })
      const boss = doors[doors.length - 1]
      expect(boss.kind, `seed ${seed}: дверь владыки не последняя`).toBe('boss')
      expect(boss.name, `seed ${seed}: имя владыки на двери`).toBe(ENEMIES[chosen].name)
      expect(boss.hint.length).toBeGreaterThan(5)
      expect(hasCombatDoor(doors), `seed ${seed}: не осталось боя`).toBe(true)
    }
  })

  it('без выбора дверь остаётся прежней — «Владыка»', () => {
    const doors = rollDoors({ room: 2, hasBoss: true, rng: mk(5) })
    expect(doors[doors.length - 1].name).toBe('Владыка')
  })

  it('владыка чакры известен по имени и по чакре', () => {
    for (const id of allLordIds()) {
      expect(lordName(id)).toBe(ENEMIES[id].name)
      expect(lordChakra(id)).toBe(ENEMIES[id].chakra)
    }
    expect(lordName('нет-такого')).toBe('')
    expect(lordChakra('нет-такого')).toBe(null)
  })
})

describe('Что происходит в игре (по коду экрана)', () => {
  it('троны спрашиваются ОДИН раз на этап, а не на каждой комнате', () => {
    // `stage === 'room' && room === 0` — это ровно «начало этапа». Если бы
    // условие было шире, игрок «выбирал» бы владыку четыре раза на чакру.
    expect(main).toContain("if (stage === 'room' && room === 0 && app.runLordFloor !== floor && stageHasLord(floor))")
    expect(main).toContain('app.runLordFloor = floor')
  })

  it('выбор не переживает смерть и «оставил забег»', () => {
    expect(main, 'троны должны обнуляться на новом забеге')
      .toMatch(/app\.runLord = null; app\.runLordFloor = null/g)
  })

  it('выбранный владыка идёт в сборку комнаты', () => {
    expect(main).toContain('lordId: app.runLord || null')
    expect(read('webapp/js/core/fieldBuild.js')).toContain('const chosenLord = includeBoss ? lordFor(floor, lordId) : null')
  })

  it('на троне видно имя, эпитет, чем держит и приёмы', () => {
    const fn = main.slice(main.indexOf('function showLordChoice'))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    for (const piece of ["d.name", "d.epithet", "d.hold", 'moves']) {
      expect(body, `на троне нет ${piece}`).toContain(piece)
    }
  })

  it('в ежедневном пути троны одинаковы у всех — тот же seed, что у комнат', () => {
    expect(main).toContain('dailyRng(`${daily.dayKey}|lord|${floor}`)')
  })

  it('замер выбирает трон тем же путём, что игра', () => {
    // Правило проекта: измеритель собирает сцену тем же путём, что игра.
    // Если бы замер молча ставил владыку по умолчанию, все проценты проходимости
    // после тронов считались бы по бою, которого в игре больше нет.
    const sim = read('scripts/fieldBalance.mjs')
    expect(sim).toContain('import { rollLords, lordPool }')
    expect(sim).toContain('lordId: lord,')
    expect(sim).toMatch(/if \(stage === 'room' && room === 0\) lord = pickLord\(floor, rng\)/)
  })
})

describe('Площадь в Городе зажигается чакрой, а не именем', () => {
  it('учитель ищется по чакре встреченного владыки', () => {
    expect(main).toContain('function teacherForName(name)')
    expect(main).toContain('function teachersLit(meta)')
    // Привязка по имени дала бы «8/7 площадей»: успокоив двух владык одной
    // чакры, игрок получал две площади из семи.
    expect(main).toContain('Object.values(CITY_TEACHERS).find((t) => t.chakra === lord.chakra)')
  })

  it('у каждого владыки своя цепочка цитат, и она не пустая', () => {
    for (const id of allLordIds()) {
      const chain = lordChain(id, null)
      expect(chain.length, `${id}: цепочка пустая`).toBeGreaterThanOrEqual(1)
      for (const q of chain) expect(QUOTES[q], `${id}/${q}`).toBeTruthy()
    }
    // 14 новых владык получили цепочки отдельные: у них не было учителя.
    for (const id of Object.keys(LORD_QUOTES)) {
      expect(lordPool(0).concat(...floors.map(lordPool)).length, 'пул').toBeGreaterThan(0)
      expect(allLordIds(), `${id}: цепочка от владыки, которого нет в игре`).toContain(id)
    }
    // И не пустая проверка: цитаты цепочек должны быть достижимы.
    for (const chain of Object.values(LORD_QUOTES)) for (const q of chain) expect(reachableQuoteIds()).toContain(q)
    expect(brokenTeaching()).toEqual([])
  })

  it('владыка без цепочки отдаёт цепочку учителя — старые сохранения живы', () => {
    expect(lordChain('нет-такого', 'moha')).toEqual(teaching.teachers.moha)
    expect(nextLordQuote('нет-такого', 'moha', {})).toBe(teaching.teachers.moha[0])
  })

  it('у каждого владыки своя первая цитата в городе', () => {
    // Иначе все троны Анахаты говорили бы одно и то же.
    for (const f of floors) {
      const first = lordPool(f).map((id) => lordChain(id, null)[0])
      expect(new Set(first).size, `чакра ${f}: первые цитаты совпали`).toBe(3)
    }
  })
})

describe('Правило проекта: механика записана, а не только сделана', () => {
  it('МЕХАНИКА 58 в BASE-GAME с источником', () => {
    expect(base).toContain('МЕХАНИКА 58')
    expect(base).toMatch(/МЕХАНИКА 58[\s\S]{0,900}Slay the Spire/)
  })

  it('SPEC описывает троны и говорит, что пул — три', () => {
    expect(spec).toMatch(/ТРОНЫ ЧАКРЫ/i)
    expect(spec).toMatch(/[Тт]ри владыки|трёх владык|трона/)
  })

  it('счётчик цитат не расходится с корпусом', () => {
    expect(Object.keys(QUOTES).filter((k) => !k.startsWith('_'))).toHaveLength(104)
  })
})