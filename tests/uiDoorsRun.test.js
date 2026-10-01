// ЗАБЕГ ЧЕРЕЗ ДВЕРИ, КАЖДЫЙ ВИД ОДИН РАЗ — по настоящим экранам.
//
// Первый прогон (`uiFullRun.test.js`) на незнакомом экране жал ПЕРВУЮ кнопку,
// а первая дверь — всегда дверь боя. То есть лавка, покой, дар и хаос-путь
// через двери не проходились ни разу: экран был нарисован, а шагать по нему
// было нечем. Хуже всего это проверяется не чтением кода, а проходом.
//
// Здесь наоборот: на экране дверей выбирается по очереди каждый вид, и забег
// обязан дойти до конца. Это ровно то, что делает игрок, который ходит не
// только в оковы.
//
// Отдельный файл, а не второй `it` в том же: два теста делят одно состояние
// игры и один модуль, и второй начинал бы не с начала забега.

import { describe, it, expect, beforeAll } from 'vitest'
import { installDom, textOf, clickables } from './helpers/dom.js'

let dom
beforeAll(() => {
  dom = installDom()
  return import('@webapp/js/main.js')
})

const screen = () => dom.root.childNodes[dom.root.childNodes.length - 1]
const targets = () => clickables(screen())
const here = () => textOf(screen())
const field = () => globalThis.window.__field

/**
 * Закончить комнату: снять оков и войти в дверь. Комната кончается не «сама»,
 * а когда садхака входит в дверь, — поэтому шаг один и тот же, что и в игре.
 */
function clearRoom() {
  const s = field()
  if (!s) return null
  for (const f of s.foes) {
    if (!f.dead && !f.pacified) f.pacified = true
  }
  s.pacified = s.foes.filter((f) => f.pacified).length
  s.player.x = s.door.x
  s.player.y = s.door.y
  for (let i = 0; i < 8; i++) dom.flushRaf(1)
  return field()
}

function expectClean(label) {
  const t = here()
  expect(t.length, `${label}: экран пуст`).toBeGreaterThan(3)
  const bad = ['NaN', 'undefined', '[object Object]'].filter((b) => t.includes(b))
  expect(bad, `${label}: мусор ${bad.join(', ')} → ${t.slice(0, 160)}`).toEqual([])
  expect(/<[a-z]+[ >]/i.test(t), `${label}: сырый HTML`).toBe(false)
}

describe('забег через двери: каждый вид двери один раз', () => {
  // Первый прогон жал первую кнопку на незнакомом экране, а первая дверь —
  // всегда дверь боя. То есть лавка, покой, дар и хаос-путь через двери не
  // проходились НИ РАЗУ: экран был нарисован, а шагать по нему было нечем.
  //
  // Здесь наоборот: на экране дверей выбирается по очереди каждый вид, и
  // забег обязан дойти до конца. Это ровно то, что делает игрок, который
  // ходит не только в оковы.
  it('все пять обычных дверей проходятся, и забег доходит до финала', () => {
    const seenDoors = new Set()
    let rooms = 0
    let guard = 0
    const problems = []

    // вход: город → оружие → фонтан → первая чакра
    for (let i = 0; i < 10; i++) {
      const back = targets().find((x) => /← /.test(textOf(x)))
      if (!back) break
      back.dispatch('click')
    }
    if (/Понятно/.test(here())) find(/Понятно/).dispatch('click')
    if (/Кем ты идёшь/.test(here())) find(/Шудра/).dispatch('click')
    if (/Почерк/i.test(here())) {
    const a = targets().find((x) => /wsel-card/.test(x.className || ''))
    expect(a, 'на экране почерка нет карточек').toBeTruthy()
    a.dispatch('click')
  }
  const jade = targets().filter((x) => /jade-card/.test(x.className || ''))
    jade[0].dispatch('click')
    const first = targets().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
    first.dispatch('click')
    expect(field(), 'бой начался').toBeTruthy()

    while (guard++ < 600) {
      const t = here()

      // ── ЭКРАН ДВЕРЕЙ: по очереди каждый вид ─────────────────────
      if (/Двери/i.test(t)) {
        try { expectClean('двери') } catch (e) { problems.push(e.message) }
        const cards = targets().filter((x) => /door-card/.test(x.className || ''))
        expect(cards.length, 'на экране дверей нет ни одной двери').toBeGreaterThan(1)
        const kinds = cards.map((c) => (c.className.match(/d-(\w+)/) || [])[1]).filter(Boolean)
        // по очереди: сначала каждая невыбранная дверь, потом бой
        const next = ['shop', 'rest', 'boon', 'chaos', 'elite', 'boss', 'room']
          .find((k) => kinds.includes(k) && !seenDoors.has(k))
        const pick = next || 'room'
        seenDoors.add(pick)
        const card = cards.find((c) => new RegExp(`d-${pick}\\b`).test(c.className || ''))
        expect(card, `нет двери ${pick} (есть: ${kinds.join(',')})`).toBeTruthy()
        card.dispatch('click')
        continue
      }

      // ── в бою ───────────────────────────────────────────────────
      if (field() && !field().outcome) {
        const before = field()
        const after = clearRoom()
        rooms++
        if (after === before && !before.roomCleared) {
          problems.push('комната не открылась')
          break
        }
        continue
      }
      if (/Вершина Света/i.test(t)) break

      try { expectClean(`экран #${guard}`) } catch (e) { problems.push(e.message) }
      if (/Дары чакры|выбери дар/i.test(t)) { find(/Дар|Сева|Кииртан/i).dispatch('click'); continue }
      if (/Лавка/i.test(t)) {
        const leave = targets().find((x) => /уйти/.test(textOf(x)))
        if (leave) { leave.dispatch('click'); continue }
      }
      if (/Комната покоя/i.test(t)) {
        const card = targets().find((x) => /boon-card/.test(x.className || ''))
        if (card) { card.dispatch('click'); continue }
      }
      const world = targets().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
      if (world) { world.dispatch('click'); continue }
      const back = targets().find((x) => /← /.test(textOf(x)))
      if (back) { back.dispatch('click'); continue }
      const any = targets()[0]
      if (any) { any.dispatch('click'); continue }

      problems.push('застряли на экране без единой кнопки: ' + t.slice(0, 120))
      break
    }

    expect(problems, 'экраны не должны падать и заедать').toEqual([])
    expect(dom.errors.map((e) => e.message), 'ни один кадр не должен бросать').toEqual([])
    for (const k of ['shop', 'rest', 'boon', 'chaos', 'elite', 'room']) {
      expect(seenDoors.has(k), `дверь ${k} не пройдена`).toBe(true)
    }
    expect(rooms, 'комнат пройдено').toBeGreaterThan(20)
  }, 120000)
})

function find(re) {
  const t = targets().find((x) => re.test(textOf(x)))
  if (!t) {
    throw new Error(
      `не нашёл «${re}».\n  есть: ${targets().map((x) => textOf(x).slice(0, 18)).join(' / ')}\n  экран: ${here().slice(0, 160)}`,
    )
  }
  return t
}
