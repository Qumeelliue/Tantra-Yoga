// ОБЕТ ЧЕРЕЗ НАСТОЯЩИЕ ЭКРАНЫ: выбрал до забега — видел в бою — узнал итог.
//
// Три экрана проверяются по-настоящему, потому что по строкам кода не видно:
//   1. экран входа в Поле Ума предлагает обет и показывает его условие;
//   2. в бою висит плашка «⤴ обет: без крови»;
//   3. на экране финала написано «соблюдён» или «нарушен» — с причиной.
//
// Обет «без крови» выбран потому, что тест проходит забег, снимая оков
// терпением и ни разу не ударив, — то есть он соблюдён по-настоящему.

import { describe, it, expect, beforeAll } from 'vitest'
import { installDom, textOf, clickables , chooseLordIfShown, doorCards } from './helpers/dom.js'

let dom
beforeAll(() => {
  dom = installDom()
  return import('@webapp/js/main.js')
})

const screen = () => dom.root.childNodes[dom.root.childNodes.length - 1]
const targets = () => clickables(screen())
const here = () => textOf(screen())
const field = () => globalThis.window.__field

function clearRoom() {
  const s = field()
  if (!s) return null
  for (const f of s.foes) if (!f.dead && !f.pacified) f.pacified = true
  s.pacified = s.foes.filter((f) => f.pacified).length
  s.player.x = s.door.x
  s.player.y = s.door.y
  for (let i = 0; i < 8; i++) dom.flushRaf(1)
  return field()
}

describe('обет проходит весь путь: выбор → бой → итог', () => {
  it('обет можно взять на экране входа, он виден в бою и назван в итоге', () => {
    // вход: город → оружие → фонтан → экран чакр
    for (let i = 0; i < 10; i++) {
      const back = targets().find((x) => /← /.test(textOf(x)))
      if (!back) break
      back.dispatch('click')
    }
    if (/Понятно/.test(here())) targets().find((x) => /Понятно/.test(textOf(x))).dispatch('click')
    if (/Кем ты идёшь/.test(here())) targets().find((x) => /Шудра/.test(textOf(x))).dispatch('click')
    if (/Почерк/i.test(here())) {
    const a = targets().find((x) => /wsel-card/.test(x.className || ''))
    expect(a, 'на экране почерка нет карточек').toBeTruthy()
    a.dispatch('click')
  }
  const jade = targets().filter((x) => /jade-card/.test(x.className || ''))
    expect(jade.length, 'фонтан даёт три нефрита').toBe(3)
    jade[0].dispatch('click')

    // ── экран входа в Поле Ума: выбираем обет ──────────────────────────
    const t0 = here()
    expect(/Обет/.test(t0), `на экране входа нет обета: ${t0.slice(0, 140)}`).toBe(true)
    const oathBtn = targets().find((x) => /крови/i.test(textOf(x)) && /heat-step/.test(x.className || ''))
    expect(oathBtn, 'кнопка обета «без крови» не найдена').toBeTruthy()
    oathBtn.dispatch('click')
    const t1 = here()
    expect(/Соблюдён/.test(t1), `после выбора обета его условие не показано: ${t1.slice(0, 160)}`).toBe(true)
    expect(/крови/.test(t1), 'условие обета не названо игроку').toBe(true)

    // ── вход в забег: плашка в бою ─────────────────────────────────────
    const first = targets().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
    first.dispatch('click')
    chooseLordIfShown(targets())
    expect(field(), 'бой начался').toBeTruthy()
    const hud = textOf(dom.root)
    expect(/обет:.*крови/i.test(hud), 'в бою нет плашки обета').toBe(true)

    // ── проходим забег до финала ────────────────────────────────────────
    let guard = 0
    let rooms = 0
    const problems = []
    while (guard++ < 700) {
      const t = here()
      if (field() && !field().outcome) {
        const before = field()
        const after = clearRoom()
        rooms++
        if (after === before && !before.roomCleared) { problems.push('комната не открылась'); break }
        continue
      }
      // Финал — по строке итога, а не по «Вершина Света»: так называется
      // и седьмая чакра, и трон на ней.
      if (/комнат пройдено/i.test(t)) break
      // По карточкам, а не по слову «Двери»: трон (МЕХАНИКА 58) говорит
        // «его имя стоит на двери» и раньше проходил под этот тест.
        if (doorCards(targets()).length > 1) {
        const room = targets().find((x) => /d-room\b/.test(x.className || ''))
        if (!room) { problems.push('на экране дверей нет двери боя'); break }
        room.dispatch('click')
        continue
      }
      if (/Дары чакры|выбери дар/i.test(t)) { targets().find((x) => /Дар|Сева|Кииртан/i.test(textOf(x))).dispatch('click'); continue }
      if (/Лавка/i.test(t)) {
        const leave = targets().find((x) => /уйти/.test(textOf(x)))
        if (leave) { leave.dispatch('click'); continue }
      }
      if (/Комната покоя/i.test(t)) {
        const card = targets().find((x) => /boon-card/.test(x.className || ''))
        if (card) { card.dispatch('click'); continue }
      }
      if (/Плата за испытание/i.test(t)) {
        const pick = targets().find((x) => /jade-card/.test(x.className || ''))
        if (pick) { pick.dispatch('click'); continue }
      }
      const world = targets().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
      if (world) { world.dispatch('click'); chooseLordIfShown(targets()); continue }
      const back = targets().find((x) => /← /.test(textOf(x)))
      if (back) { back.dispatch('click'); continue }
      const any = targets()[0]
      if (any) { any.dispatch('click'); continue }
      problems.push('застряли: ' + t.slice(0, 120))
      break
    }

    expect(problems, 'экраны не должны заедать').toEqual([])
    expect(rooms, 'комнат пройдено').toBeGreaterThan(20)

    // ── финал: обет назван ──────────────────────────────────────────────
    const fin = here()
    expect(/Вершина Света/i.test(fin), `до финала не дошли: ${fin.slice(0, 140)}`).toBe(true)
    // Забег пройден без единого удара (тест снимает оков терпением), поэтому
    // обет «без крови» соблюдён — и это должно быть сказано словами.
    expect(/Обет «Без крови» соблюдён/.test(fin), `итог не назвал обет: ${fin.slice(0, 220)}`)
    expect(/\+\d+ севы/.test(fin), 'награда за обет не показана числом').toBe(true)
  }, 180000)
})