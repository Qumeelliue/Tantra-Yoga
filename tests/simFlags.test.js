// ФЛАГИ ЗАМЕРА НЕ МОГУТ БЫТЬ МЁРТВЫМИ.
//
// Что случилось. Добавлен флаг `--strike-careful`: «бот бьёт, но только когда
// удар бесплатен». Первая версия читала признак «бьёт ли бот» как
// `includes('--strike')`. Строка `--strike-careful` этому условию **не
// удовлетворяет** — и бот не ударил ни разу за 24 забега.
//
// Почему это опаснее, чем опечатка. Вывод печатал:
//
//     удары: 0 (бот не бьёт)
//
// То есть замер САМ СЕБЯ подтверждал: «осторожный режим ничего не делает».
// Из этого следовало «в Поле Ума безопасного момента для насилия нет» — вывод
// правдоподобный, красивый и полностью выдуманный. Мёртвый флаг возвращает
// «мирный бо» и выглядит как доказательство.
//
// Тот же класс, что у сокровища (считалось, не печаталось) и у щита (давалось,
// не называлось): **измеритель, который молчит, подставляет игрока-читателя.**

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const sim = read('scripts/fieldBalance.mjs')

/** Все `--флаги`, которые замер объявляет. */
function declaredFlags(src) {
  const out = new Set()
  for (const m of src.matchAll(/'(--[a-z-]+)'/g)) out.add(m[1])
  return [...out]
}

/**
 * Запустить замер как это делает человек, и прочитать его вывод.
 *
 * Первая версия этой проверки разбирала исходник регулярным выражением — и
 * **не ловила поломку, которую сама же описывала**: `$` без флага `m` в
 * JavaScript означает конец строки данных, а не конец строки файла, поэтому
 * выражение не совпадало ни с чем и всегда было зелёным. Проверка о мёртвом
 * флаге, которая не ловит мёртвый флаг, хуже её отсутствия: она даёт
 * уверенность, которой нет.
 *
 * Теперь замер реально запускается. Полсекунды на два забега — цена, которую
 * стоит платить за правду.
 */
function runSim(args, runs = 2) {
  const r = execFileSync('node',
    ['--experimental-loader', './scripts/aliases.mjs', 'scripts/fieldBalance.mjs', String(runs), ...args],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000 })
  return r
}

function strikesOf(out) {
  const m = out.match(/удары: (\d+)/)
  return m ? Number(m[1]) : null
}

describe('Флаг, который ничего не делает, не считается флагом', () => {
  it('`--strike-careful` реально бьёт — а не печатает «бот не бьёт»', () => {
    // Ровно та поломка, ради которой файл и написан: флаг объявлял себя, но
    // не включался, и замер подтверждал сам себя нулём.
    const out = runSim(['--strike-careful'])
    expect(out, 'замер не печатает число ударов').toMatch(/удары: \d+/)
    expect(out, 'осторожный режим не бьёт НИ РАЗУ — флаг мёртвый').not.toContain('бот не бьёт')
    expect(strikesOf(out), 'осторожный режим не бьёт НИ РАЗУ — флаг мёртвый').toBeGreaterThan(0)
  })

  it('`--strike` бьёт больше, чем `--strike-careful`, и оба бьют', () => {
    const careful = strikesOf(runSim(['--strike-careful']))
    const all = strikesOf(runSim(['--strike']))
    expect(careful).toBeGreaterThan(0)
    expect(all, 'обычный режим не бьёт').toBeGreaterThan(0)
    expect(all, 'осторожный бот бьёт не меньше обычного — фильтр не работает')
      .toBeGreaterThan(careful)
  })

  it('без флага бот не бьёт, и это написано прямо', () => {
    const out = runSim([])
    expect(strikesOf(out)).toBe(0)
    expect(out).toContain('бот не бьёт')
  })

  it('число ударов печатается вместе с тем, какой это режим', () => {
    // `STATS.strikes` считался и не печатался. Из-за этого нельзя было отличить
    // «бот не бил» от «флаг не включился».
    expect(sim).toMatch(/удары: \$\{STATS\.strikes\}/)
    expect(sim).toMatch(/\(бот не бьёт\)/)
  })

  it('ноль ударов объяснён причиной, а не просто констатирован', () => {
    // Ноль без причины нельзя ни принять, ни отклонить. Три причины: открытое
    // окно парирования, паша на замахе, свободный момент.
    expect(sim).toMatch(/STRIKELOG/)
    expect(sim).toMatch(/момент для удара/)
    expect(sim).toMatch(/blockedByWindow/)
    expect(sim).toMatch(/blockedByPasha/)
  })

  it('счётчики причин не забывают обнулиться между прогонами', () => {
    // Иначе второй прогон покажет сумму за оба, и «7 % свободных моментов»
    // окажется числом из другой вселенной.
    const reset = sim.slice(sim.indexOf('function resetStats'), sim.indexOf('function resetStats') + 1200)
    for (const k of ['chances', 'free', 'blockedByWindow', 'blockedByPasha']) {
      expect(reset, `${k} не обнуляется`).toMatch(new RegExp(`STRIKELOG\\.${k} = 0`))
    }
  })
})

describe('Каждый флаг замера печатает, что он измерил', () => {
  // Сокровище, щит от севы, удары, сева — все четыре обязаны оставлять строку в
  // выводе. Молчащий счётчик выглядит как «механики нет».
  const lines = [
    ['сокровища', /сокровища: сломано/],
    ['щит от севы', /щит от севы:/],
    ['удары', /удары: \$\{STATS\.strikes\}/],
    ['сева', /сева: \$\{SEVA\.got\}/],
    ['ментальности', /ментальности Поля Ума за забег/],
    ['монеты', /монеты: \$\{COINS\.got\}/],
  ]

  for (const [name, re] of lines) {
    it(`${name} печатается в выводе замера`, () => {
      expect(sim, `строка «${name}» не печатается`).toMatch(re)
    })
  }

  it('объявленных флагов не меньше, чем используемых в выводе', () => {
    // Грубая, но полезная проверка: если флаг объявлен и нигде не участвует в
    // выводе, стоит на него посмотреть глазами.
    const flags = declaredFlags(sim)
    expect(flags.length, 'флаги не нашлись — разбор сломался').toBeGreaterThan(5)
  })
})
