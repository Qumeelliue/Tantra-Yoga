// ПОЛНЫЙ ЗАБЕГ ЧЕРЕЗ ЭКРАНЫ — ПОЛЕ УМА.
//
// Что это ловит. Экраны между боями — выбор дара, лавка, комната после
// владыки, финал, смерть — открываются ТОЛЬКО в конце забега. До них обычный
// тест не доходит, а упасть они могут: там берутся поля последнего боя,
// которых в обычном бою ещё нет. Один такой экран — и игрок после семи чакр
// упирается в пустоту.
//
// Здесь забег доводится до конца через настоящие экраны: каждая комната
// «зачищается», садхака ставится в дверь, и игра сама решает, что комната
// кончилась. Дальше — настоящий экран и настоящая кнопка.
//
// Что нашлось этим тестом: лавка в поле была написана, но ни одна ветка
// кода её не звала — мёртвый экран, который не показывался ни разу.

import { describe, it, expect, beforeAll } from 'vitest'
import { installDom, textOf, clickables , chooseLordIfShown } from './helpers/dom.js'

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
 * Закончить комнату: снять оков и войти в дверь.
 * Возвращает новое состояние, если игра успела начать следующую комнату.
 */
function clearRoom() {
  const s = field()
  if (!s) return null
  for (const f of s.foes) {
    if (!f.dead && !f.pacified) f.pacified = true
  }
  s.pacified = s.foes.filter((f) => f.pacified).length
  // Комната кончается не «сама», а когда садхака входит в дверь.
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
  expect(/<[a-z]+[ >]/i.test(t), `${label}: сырой HTML`).toBe(false)
}

describe('забег до конца через настоящие экраны', () => {
  it('28 комнат, 7 владык, финал — без единого падения', () => {
    // ── старт: город → оружие → фонтан → первая чакра ──────────────
    for (let i = 0; i < 10; i++) {
      const back = targets().find((x) => /← /.test(textOf(x)))
      if (!back) break
      back.dispatch('click')
    }
    if (/Понятно/.test(here())) find(/Понятно/).dispatch('click')
    if (/Кем ты идёшь/.test(here())) find(/Шудра/).dispatch('click')
    // Экран «Почерк» (Hades: weapon aspects) стоит между выбором варны и
    // фонтаном. Без шага тест падал бы не из-за игры, а из-за забытого экрана.
    if (/Почерк/i.test(here())) targets().find((x) => /wsel-card/.test(x.className || '')).dispatch('click')
    const jade = targets().filter((x) => /jade-card/.test(x.className || ''))
    expect(jade.length, 'фонтан даёт три нефрита').toBe(3)
    jade[0].dispatch('click')

    // первая открытая чакра
    const first = targets().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
    expect(first, 'есть открытая чакра').toBeTruthy()
    first.dispatch('click')
    expect(chooseLordIfShown(targets()), 'на троне есть владыка').toBeTruthy()
    expect(field(), 'бой начался').toBeTruthy()

    const seen = new Set()
    const problems = []
    let seenShop = false
    let rooms = 0
    let guard = 0

    while (guard++ < 400) {
      const t = here()
      seen.add(t.slice(0, 30))

      // ── в бою ───────────────────────────────────────────────────
      if (field() && !field().outcome) {
        const before = field()
        const after = clearRoom()
        rooms++
        if (after === before && !before.roomCleared) {
          problems.push('комната не открылась: оков ' + before.foes.length +
            ', снято ' + before.pacified + ', кадров в очереди ' + dom.pendingRaf() +
            ', ошибки кадров: ' + dom.errors.map((e) => e.message).slice(0, 2).join('; '))
          break
        }
        continue
      }

      // ── финал ───────────────────────────────────────────────────
      // Финал ловим по ИТОГУ («комнат пройдено»), а не по слову «Вершина
      // Света»: так называется и седьмая чакра, и её трон (МЕХАНИКА 58), и
      // раньше тест выходил из забега, не дойдя до финала.
      if (/комнат пройдено/i.test(t)) break

      try { expectClean(`экран #${guard}`) } catch (e) { problems.push(e.message) }

      // ── между боями ─────────────────────────────────────────────
      if (/Дары чакры|выбери дар/i.test(t)) { find(/Дар|Сева|Кииртан/i).dispatch('click'); continue }
      if (/Лавка/i.test(t)) {
        seenShop = true
        const leave = targets().find((x) => /уйти/.test(textOf(x)))
        if (leave) { leave.dispatch('click'); continue }
      }
      if (/Комната покоя/i.test(t)) {
        const card = targets().find((x) => /boon-card/.test(x.className || ''))
        if (card) { card.dispatch('click'); continue }
      }
      // карта чакр — войти в следующую
      const world = targets().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
      if (world) { world.dispatch('click'); chooseLordIfShown(targets()); continue }
      // иначе — первая кнопка, потом «назад»
      const back = targets().find((x) => /← /.test(textOf(x)))
      if (back) { back.dispatch('click'); continue }
      const any = targets()[0]
      if (any) { any.dispatch('click'); continue }

      problems.push('застряли на экране без единой кнопки: ' + t.slice(0, 120))
      break
    }

    expect(problems, 'экраны не должны падать и заедать').toEqual([])
    expect(dom.errors.map((e) => e.message), 'ни один кадр не должен бросать').toEqual([])
    // Лавка обязана появляться: раньше ветка, которая её зовёт, была мёртвым
    // кодом, и экран не показывался ни разу за игру.
    expect(rooms, 'комнат пройдено').toBeGreaterThan(20)
    // Лавка обязана появляться: раньше ветка, которая её зовёт, была мёртвым
    // кодом, и экран не показывался ни разу за игру.
    expect(seenShop, `лавка показалась. Экраны: ${JSON.stringify([...seen].map((x) => x.slice(0, 18)))}`).toBe(true)
    expect(seen.size, 'разных экранов пройдено').toBeGreaterThan(4)
  })
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
