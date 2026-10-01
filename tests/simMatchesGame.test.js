// Замер и игра обязаны собирать сцену ОДНИМ путём.
//
// Шестая находка сессии 24, класса «замер врал» (список исходных — в
// `design/BASE-GAME.md`, МЕХАНИКА 43).
//
// Что было: `scripts/fieldBalance.mjs` собирал комнату как
//   `buildFieldFloor(floor, { opts: { calmMul: DEFAULT_FIELD_OPTIONS.foeCalmMul } })`
// а игра — как
//   `buildFieldFloor(floor, { room })`
// Внутри при отсутствии `calmMul` применяется `calmMulFor(floor)` = 1.5…2.25 по
// чакрам. Замер подставлял константу 1.5 и ПЕРЕКРЫВАЛ рост. Итог: седьмая
// чакра в замере была легче настоящей, и лестница рассеянности описывала
// игру, которой нет.
//
// Правило, которое здесь защищается: **подставленная в измеритель опция — это
// не «точность», а отдельная игра.** Измеритель не имеет права собирать сцену
// иначе, чем игра.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { calmMulFor, buildFieldFloor } from '@webapp/js/core/fieldBuild.js'
import { DEFAULT_FIELD_OPTIONS } from '@webapp/js/core/field.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const simSrc = read('scripts/fieldBalance.mjs')
const mainSrc = read('webapp/js/main.js')
const fieldSrc = read('webapp/js/core/field.js')

/**
 * Код БЕЗ комментариев.
 *
 * Пятый раз за сессию проверку обманывает комментарий: разбор вызова
 * захватил поясняющий текст внутри аргументов, где было упомянуто
 * `calmMulFor`. Помощник общий не случайно: то же делают `plain()` в
 * `copyingRule.test.js` и `code()` в `roadWidth.test.js` / `determinism.test.js`.
 * Проверка обязана видеть то, что утверждает, а не разметку и не пояснения
 * вокруг утверждения.
 */
const stripCode = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

/** Код вызова `buildFieldFloor` в файле. */
function buildCalls(src) {
  const clean = stripCode(src)
  const out = []
  let i = 0
  for (;;) {
    const at = clean.indexOf('buildFieldFloor(', i)
    if (at < 0) break
    const args = clean.slice(at + 'buildFieldFloor('.length)
    let depth = 1
    let j = 0
    while (j < args.length && depth > 0) {
      if (args[j] === '(') depth++
      else if (args[j] === ')') depth--
      j++
    }
    out.push(args.slice(0, j - 1))
    i = at + 1
  }
  return out
}

describe('Сцена собирается одинаково в игре и в замере', () => {
  it('замер не подставляет calmMul', () => {
    // Точное место поломки. Проверка ищет не «слово calmMul вообще» (оно
    // законно в объяснении), а подставку в вызове.
    for (const args of buildCalls(simSrc)) {
      expect(args, `замер подставляет calmMul: buildFieldFloor(${args})`).not.toMatch(/calmMul\s*:/)
    }
  })

  it('и игра тоже — иначе это не «один путь», а совпадение', () => {
    for (const args of buildCalls(mainSrc)) {
      expect(args, `игра подставляет calmMul: buildFieldFloor(${args})`).not.toMatch(/calmMul\s*:/)
    }
  })

  it('рост спокойствия по чакрам — единственный источник правды', () => {
    // Рост обязан быть в `fieldBuild`, а не в наборе опций отладки. Иначе
    // появятся два числа, и одно из них будет мёртвым.
    expect(calmMulFor(0)).toBeLessThan(calmMulFor(6))
    const build = read('webapp/js/core/fieldBuild.js')
    expect(build).toContain('opts.calmMul ?? calmMulFor(floor)')
  })

  it('мёртвой константы больше нет', () => {
    // `foeCalmMul` жила только ради собственного измерения: поле её не
    // читало. `audit:impact` такое не ловит — он проверяет награды, а не
    // опции отладки. Проверяем явно, потому что «вернём на всякий случай» —
    // это ровно тот путь, которым величина там и оказалась.
    expect(fieldSrc, 'foeCalmMul вернулась в набор опций — она мёртвая').not.toMatch(/^\s*foeCalmMul\s*:/m)
  })

  it('спокойствие реально растёт по чакрам в настоящей сборке', () => {
    // Доказательство, а не обещание: собираем комнату 1-й и 7-й чакры и
    // смотрим `calmMax`. Если бы роста не было, все разговоры о сложности
    // последних чакр были бы выдумкой.
    const first = buildFieldFloor(0, { field: { w: 412, h: 600 }, room: 0 })
    const last = buildFieldFloor(6, { field: { w: 412, h: 600 }, room: 0 })
    const avg = (b) => b.foes.reduce((a, f) => a + (f.calmMax || 0), 0) / (b.foes.length || 1)
    expect(avg(last), 'на 7-й чакре оки требуют не больше спокойствия, чем на 1-й')
      .toBeGreaterThan(avg(first))
  })
})

describe('Обещание замера честно', () => {
  const base = read('design/BASE-GAME.md')

  it('находка записана как находка, а не вычеркнута', () => {
    // Шесть находок класса «замер врал». Если шестую не записать, через
    // месяц её повторят и решат, что она придумана впервые.
    expect(base).toContain('МЕХАНИКА 43')
    expect(base).toContain('ЗАМЕР ПОДСТАВЛЯЛ СВОЙ')
  })

  it('прежние числа помечены неверными, а не просто заменены', () => {
    // Замена числа без пометки — это выдумка: потом никто не поймёт, откуда
    // взялось новое и почему оно другое.
    expect(base).toContain('неверны')
  })

  it('правило сформулировано для будущих измерителей', () => {
    expect(base).toContain('замер обязан собирать сцену тем же')
  })
})
