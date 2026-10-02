// ВОЗВРАТ ЧЕРЕЗ НАСТОЯЩИЙ ЭКРАН СМЕРТИ.
//
// Механика читается в коде и в тестах по строкам, но одно не проверяется
// строками: **появляется ли кнопка и работает ли она**. В проекте уже было так
// с лавкой — экран был написан, ни одна ветка его не звала, и он не
// показывался ни разу за игру.
//
// Здесь игрок умирает по-настоящему: жизни снимается в бою, игра доходит до
// экрана смерти, и на нём должна быть третья кнопка. Нажатие обязано вернуть
// его в тот же забег с половиной жизни и БЕЗ нефрита.

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

/** Пройти путь до первого боя: город → оружие → фонтан → чакра. */
function enterFirstFight() {
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
  const first = targets().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
  first.dispatch('click')
  chooseLordIfShown(targets())
  expect(field(), 'бой начался').toBeTruthy()
}

describe('возврат из смерти на настоящем экране', () => {
  it('умер — появилась третья кнопка, и она вернула в забег', () => {
    enterFirstFight()

    // Снять жизнь по-настоящему: состояние боя само должно увидеть ноль.
    const st = field()
    st.player.hp = 0
    st.player.alive = false
    for (let i = 0; i < 12; i++) dom.flushRaf(1)

    const t = here()
    expect(/Тьма накрыла/.test(t), `экран смерти не показан: ${t.slice(0, 120)}`).toBe(true)

    const revive = targets().find((x) => /вернуться/.test(textOf(x)))
    expect(revive, `на экране смерти нет возврата: ${t.slice(0, 160)}`).toBeTruthy()
    expect(textOf(revive), 'возврат не называет свою цену').toMatch(/нефрит/)

    // Нажатие: игрок снова в бою, с половиной жизни.
    revive.dispatch('click')
    const st2 = field()
    expect(st2, 'после возврата снова бой').toBeTruthy()
    expect(st2.player.alive, 'после возврата игрок жив').toBe(true)
    const half = Math.ceil((st2.player.maxHp || 60) / 2)
    expect(st2.player.hp, 'после возврата жизнь — ровно половина').toBe(half)
  }, 120000)

  it('второго возврата в том же забеге нет — кнопки не будет', () => {
    // Возвращаемся ещё раз: нефрит уже отдан, поэтому кнопка обязана исчезнуть
    // сама. Если бы она осталась, она была бы кнопкой, которая ничего не
    // делает.
    const st = field()
    expect(st.player.alive, 'идём из боя, где уже вернулись').toBe(true)
    st.player.hp = 0
    st.player.alive = false
    for (let i = 0; i < 12; i++) dom.flushRaf(1)

    const t = here()
    expect(/Тьма накрыла/.test(t), `экран смерти не показан: ${t.slice(0, 120)}`).toBe(true)
    const revive = targets().find((x) => /вернуться/.test(textOf(x)))
    expect(revive, 'второй раз вернуться можно — значит, это не «раз за забег»').toBeFalsy()
    // «Ещё раз» — остаётся: смерть по-прежнему путём.
    expect(targets().find((x) => /ещё раз/.test(textOf(x))), 'смерть перестала быть путём').toBeTruthy()
  }, 120000)
})