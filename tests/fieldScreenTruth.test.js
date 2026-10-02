// ЧТО ИМЕННО ВИДНО НА ЭКРАНЕ ПОЛЯ УМА.
//
// Проверки этого файла отличаются от остальных в проекте принципиально: они
// **собирают настоящий экран** и спрашивают у собранного дерева, есть ли в нём
// нужный узел. Остальные проверки смотрят в исходник.
//
// ## Почему так
//
// Найдено в этой же сессии, в моей собственной правке. Левая колонка поля
// (`field-left`) была собрана — гуны, кошелёк с монетами, счётчик севы, список
// реликвий — и **не была вставлена в экран**:
//
//     const left = h('div', { class: 'field-left' }, gunas, purse, sevaPurse, relicRow)
//     root.append(cv, …, head, oathChip, top, log, …)   // ← `left` тут нет
//
// Счётчик монет в Поле Ума не отображался НИКОГДА. Счётчик севы, добавленный
// двумя часами ранее, — тоже. Оба проходили проверки, потому что проверки
// спрашивали исходник: «есть ли `id: 'fp-s'`» — да; «есть ли строка, которая им
// заполняется» — да; «есть ли он на экране» — этот вопрос не задавался.
//
// Это тот же класс, что самадхи в коде без события и флаг, который не включал
// сам себя: **сообщение есть, а сообщить нечем.** Проверка, которая смотрит в
// исходник, не может этого увидеть в принципе.

import { describe, it, expect, beforeAll } from 'vitest'

let dom = null
let bootError = null

beforeAll(async () => {
  const { installDom, clickables, chooseLordIfShown, textOf } = await import('./helpers/dom.js')
  dom = installDom()
  await import('@webapp/js/main.js')
  const targets = () => clickables(dom.root)
  const here = () => textOf(dom.root)
  try {
    for (let i = 0; i < 10; i++) {
      const b = targets().find((x) => /← /.test(textOf(x)))
      if (!b) break
      b.dispatch('click')
    }
    if (/Понятно/.test(here())) targets().find((x) => /Понятно/.test(textOf(x))).dispatch('click')
    if (/Кем ты идёшь/.test(here())) targets().find((x) => /Шудра/.test(textOf(x))).dispatch('click')
    if (/Почерк/i.test(here())) targets().find((x) => /wsel-card/.test(x.className || '')).dispatch('click')
    const jade = targets().filter((x) => /jade-card/.test(x.className || ''))
    if (jade[0]) jade[0].dispatch('click')
    const card = targets().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
    if (card) card.dispatch('click')
    chooseLordIfShown(targets())
  } catch (e) {
    bootError = e
  }
})

const q = (sel) => dom.root.querySelector(sel)

describe('Поле Ума собрано и показано', () => {
  it('бой начался', () => {
    if (bootError) throw bootError
    expect(globalThis.window.__field, 'бой не начался — проверять нечего').toBeTruthy()
  })
})

describe('Левая колонка Поля Ума действительно на экране', () => {
  it('колонка собрана И вставлена', () => {
    expect(q('.field-left'), 'левая колонка собрана, но на экране её нет').toBeTruthy()
  })

  it('кошелёк с монетами на экране', () => {
    expect(q('.field-purse'),
      'счётчик монет в Поле Ума не отображался никогда — колонка не была вставлена').toBeTruthy()
  })

  it('счётчик севы на экране', () => {
    expect(q('#fp-s'), 'счётчик севы собран, но не показан игроку').toBeTruthy()
  })

  it('список реликвий на экране', () => {
    expect(q('#frelics'), 'реликвии собираются в экран, но не вставлены').toBeTruthy()
  })

  it('цифра щита на экране', () => {
    expect(q('#fshield-n'), 'щит обещан числом, а числа на экране нет').toBeTruthy()
  })

  it('гуны по-прежнему на экране — перенос в колонку их не потерял', () => {
    expect(q('.field-guna'), 'гуны исчезли при переносе в левую колонку').toBeTruthy()
  })
})

describe('Каждый счётчик стоит там, где обещан, и только один раз', () => {
  it('кошелёк не задвоился переносом', () => {
    // Двойной счётчик хуже отсутствующего: игрок увидит две разные цифры
    // про одно и то же и перестанет доверять экрану.
    expect(dom.root.querySelectorAll('.field-purse').length,
      'счётчиков монет/севы больше одного — значит, одна и та же цифра показана дважды').toBe(2)
  })

  it('счётчик севы и счётчик монет — разные узлы', () => {
    expect(q('#fp-n')).toBeTruthy()
    expect(q('#fp-s')).toBeTruthy()
    expect(q('#fp-n')).not.toBe(q('#fp-s'))
  })
})
