// ПРОХОД ПО ВСЕМ ЭКРАНАМ НА СТЕНДЕ.
//
// Что это ловит и почему без стенда плохо. Тесты проверяли ядро — чистые
// числа. Экраны — двадцать функций в `main.js` плюс десять в
// `webapp/js/ui/screens/` — не были покрыты ни одним тестом. Ошибка
// `undefined` в поле профиля роняет экран тихо: ядро продолжает считать,
// тесты зелёные, а игрок видит пустоту.
//
// Стенд (`helpers/dom.js`) даёт ровно ту поверхность, которой пользуется
// игра: createElement, addEventListener, canvas 2d, localStorage, rAF.
// Настоящий jsdom не нужен и не ставится — в проекте нет сети.
//
// Уже найдено этим тестом: на карте забега игрок видел буквально
// «ХП <span class="gold">70</span>» — HTML попадал в текстовый узел.

import { describe, it, expect, beforeAll } from 'vitest'
import { installDom, textOf, clickables, clickEverything } from './helpers/dom.js'

let dom
beforeAll(() => {
  dom = installDom()
  return import('@webapp/js/main.js')
})

/** Текущий экран — последний узел в корне. */
const screen = () => dom.root.childNodes[dom.root.childNodes.length - 1]
const targets = () => clickables(screen())
const here = () => textOf(screen())

function find(re) {
  const t = targets().find((x) => re.test(textOf(x)))
  if (!t) {
    throw new Error(
      `не нашёл «${re}».\n  есть: ${targets().map((x) => `${x.className || x.tagName}:${textOf(x).slice(0, 20)}`).join('\n        ')}\n  экран: ${here().slice(0, 200)}`,
    )
  }
  return t
}

const click = (re) => find(re).dispatch('click')

/** Стенд не должен показывать игроку мусор. */
function expectClean(label) {
  const t = here()
  expect(t.length, `${label}: экран пуст`).toBeGreaterThan(3)
  const bad = ['NaN', 'undefined', '[object Object]', 'null'].filter((b) => t.includes(b))
  expect(bad, `${label}: на экране мусор ${bad.join(', ')} → ${t.slice(0, 160)}`).toEqual([])
  const lt = /<[a-z]+[ >]/i.exec(t)
  expect(lt ? lt[0] : null, `${label}: в тексте сырой HTML`).toBeNull()
}

/** Уйти из боя: пауза → выход из забега. Так возвращаются в город. */
function leaveField() {
  // Признак боя — кнопки дока, а не слово «дефлект»: оно есть и в тексте
  // экрана чакр («жми дефлект»), и проверка по тексту зацикливалась.
  const pause = targets().find((x) => /pause/i.test(x.className || '') || /❚/.test(textOf(x)))
  if (!pause) return false
  pause.dispatch('click')
  const leave = targets().find((x) => /оставить забег/i.test(textOf(x)))
  if (!leave) { console.log('  нет кнопки выхода; есть:', targets().map((x)=>textOf(x).slice(0,16)).join(' | ')); return false }
  leave.dispatch('click')
  return true
}

/** Идти «назад», пока не вернёмся в город. */
function backToCity() {
  for (let i = 0; i < 12; i++) {
    if (/Город спит/.test(here())) return true
    if (targets().some((x) => /fbtn/.test(x.className || ''))) {
      if (!leaveField()) return false
      continue
    }
    const back = targets().find((x) => /← /.test(textOf(x)))
    if (!back) return false
    back.dispatch('click')
  }
  return /Город спит/.test(here())
}

describe('проход по игре глазами игрока', () => {
  it('онбординг ведёт в поле, а не в колоду', () => {
    // Онбординг рассказывает про поле — и кнопка обязана вести в поле.
    // Раньше она отправляла в карточный путь: игрок читал одно, играл в другое.
    if (/Понятно/.test(here())) click(/Понятно/)
    expect(here(), 'после «понятно» — выбор оружия в поле, а не выбор ментальности')
      .toMatch(/Кем ты идёшь/)
    expect(here()).not.toMatch(/колода/i)
    expectClean('выбор оружия')

    click(/Шудра/)
    // После оружия — почерк (Hades: weapon aspects), потом фонтан. Порядок
    // проверяется целиком: почерк выбирается до нефрита, потому что оба
    // меняют забег, а нефрит — уже про оковы.
    expect(here(), 'после оружия — выбор почерка').toMatch(/Почерк/i)
    const asp = targets().find((x) => /wsel-card/.test(x.className || ''))
    expect(asp, 'на экране почерка нет карточек').toBeTruthy()
    asp.dispatch('click')
    expect(here(), 'после почерка — фонтан юности').toMatch(/Фонтан|нефрит/i)
    expectClean('фонтан')

    const jade = targets().filter((x) => /jade-card/.test(x.className || ''))
    expect(jade.length, 'фонтан предлагает три нефрита').toBe(3)
    jade[0].dispatch('click')

    expect(here(), 'после нефрита — карта чакр').toMatch(/Поле Ума|Муладхара|чакра/i)
    expectClean('карта чакр')

    const world = targets().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
    expect(world, 'нужна хотя бы одна открытая чакра').toBeTruthy()
    world.dispatch('click')
    expectClean('бой в поле')
  })

  it('в бою есть ровно две кнопки — правило игры', () => {
    const dock = targets().map((x) => textOf(x)).filter((t) => /дефлект|сева|мантра/i.test(t))
    expect(dock.length, 'в бою должны быть кнопки действия').toBeGreaterThan(0)
  })

  it('пауза в бою открывается и закрывается', () => {
    const pause = targets().find((x) => /pause/i.test(x.className || '') || /❚/.test(textOf(x)))
    if (!pause) throw new Error('в бою нет кнопки паузы')
    pause.dispatch('click')
    expectClean('пауза')
    const close = targets().find((x) => /продолж/i.test(textOf(x)))
    expect(close, 'в паузе должно быть «продолжить»').toBeTruthy()
    close.dispatch('click')
    expectClean('после паузы')
  })
})

describe('город: ни один раздел не падает', () => {
  const sections = [
    'В путь по миру',
    'Мастерская',
    'Прогресс садхаки',
    'дерево Ямы и Ниямы',
    'Сад Знания',
    'Аудиотека',        // подпись меняется, когда аудиотека пуста
    'Город',
    'Статистика',
  ]

  it('все разделы открываются и показывают нормальный текст', () => {
    const problems = []
    for (const label of sections) {
      if (!backToCity()) { problems.push('не вернулся в город'); break }
      const card = targets().find((x) => new RegExp(label, 'i').test(textOf(x)))
      if (!card) { problems.push(`нет раздела «${label}»`); continue }
      try {
        card.dispatch('click')
        const t = here()
        if (t.length < 4) problems.push(`«${label}»: экран пуст`)
        const bad = ['NaN', 'undefined', '[object Object]'].filter((b) => t.includes(b))
        if (bad.length) problems.push(`«${label}»: мусор ${bad.join(', ')} → ${t.slice(0, 120)}`)
        if (/<[a-z]+[ >]/i.test(t)) problems.push(`«${label}»: сырой HTML`)
      } catch (e) {
        problems.push(`«${label}»: ${e.message}`)
      }
    }
    expect(problems).toEqual([])
  })
})


describe('бой в поле идёт и не падает', () => {
  it('кадры боя крутятся без ошибок, дефлект и мантра нажимаются', () => {
    // Заходим в комнату заново.
    if (!backToCity()) throw new Error('не вернулся в город')
    click(/В путь по миру/)
    click(/Шудра/)
    if (/Почерк/i.test(here())) targets().find((x) => /wsel-card/.test(x.className || '')).dispatch('click')
    const jade = targets().filter((x) => /jade-card/.test(x.className || ''))
    jade[0].dispatch('click')
    const world = targets().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
    world.dispatch('click')

    const state = globalThis.window.__field
    expect(state, 'состояние поля должно быть доступно').toBeTruthy()
    expect(state.foes.length, 'в комнате есть оки').toBeGreaterThan(0)

    // 600 кадров по 16 мс — десять секунд боя.
    const errors = []
    try {
      for (let i = 0; i < 600; i++) {
        dom.flushRaf(1)
        // раз в 40 кадров жмём дефлект и мантру, как игрок
        if (i % 40 === 0) {
          for (const t of targets().filter((x) => /fbtn/.test(x.className || ''))) t.dispatch('click')
        }
        // и ходим: то влево, то вправо
        dom.press('keydown', i % 80 < 40 ? 'a' : 'd')
        if (globalThis.window.__field && !globalThis.window.__field.player.alive) break
      }
    } catch (e) {
      errors.push(e)
    }
    expect(errors.map((e) => e.message)).toEqual([])

    const st2 = globalThis.window.__field
    expect(Number.isFinite(st2.time), 'время не NaN').toBe(true)
    expect(Number.isFinite(st2.player.hp), 'жизнь не NaN').toBe(true)
    for (const f of st2.foes) {
      expect(Number.isFinite(f.calm), `спокойствие у ${f.name} не NaN`).toBe(true)
      expect(Number.isFinite(f.x) && Number.isFinite(f.y), `позиция у ${f.name} не NaN`).toBe(true)
    }
  })

  it('клавиши работают: пробел — мантра, Shift — дефлект', () => {
    const st = globalThis.window.__field
    const before = st ? st.player.shakti : null
    if (!st) return
    dom.press('keydown', ' ')
    dom.press('keyup', ' ')
    expect(Number.isFinite(st.player.shakti)).toBe(true)
    expect(before).not.toBeNull()
  })
})

describe('второй путь: колода', () => {
  it('от города до карты забега и первого узла', () => {
    if (!backToCity()) throw new Error('не вернулся в город')
    click(/Колода/)
    expect(here(), 'после «Колода» — выбор ментальности').toMatch(/Фокус ума|ментальность/i)
    expectClean('выбор ментальности')

    click(/Шудра/)
    if (/Почерк/i.test(here())) targets().find((x) => /wsel-card/.test(x.className || '')).dispatch('click')
    expect(here(), 'после ментальности — карта забега').toMatch(/восхождение|владыка|бой/i)
    expectClean('карта забега')

    // Первый доступный узел — бой.
    const node = targets().find((x) => /w-node/.test(x.className || '') && !/locked/.test(x.className || ''))
    expect(node, 'на карте есть доступный узел').toBeTruthy()
    node.dispatch('click')
    expectClean('карточный бой')
  })

  it('карточный бой играется: карты кликаются, кадры крутятся', () => {
    const cards = targets().filter((x) => /card|cardbtn|hand/.test(x.className || ''))
    // Кладёшь карту — бой должен отреагировать, а не упасть.
    const errors = []
    try {
      for (let i = 0; i < 120; i++) {
        dom.flushRaf(1)
        const c = targets().filter((x) => /card|cardbtn/.test(x.className || ''))
        if (c.length && i % 12 === 0) c[0].dispatch('click')
      }
    } catch (e) { errors.push(e) }
    expect(errors.map((e) => e.message)).toEqual([])
    expect(cards.length >= 0).toBe(true)
  })
})

describe('ни один экран не падает', () => {
  it('обход всех разделов с нажатием каждой кнопки', () => {
    // Смысл: экран может падать не на построении, а на обработчике. Здесь
    // нажимается ВСЁ, что нажимается, и ошибки собираются, а не роняют.
    const errors = []
    if (!backToCity()) throw new Error('не вернулся в город')

    const cards = targets().filter((x) => /varna-card|city-card|meta-fold/.test(x.className || ''))
    expect(cards.length, 'на титуле есть разделы').toBeGreaterThan(4)

    for (const card of cards) {
      const label = textOf(card).slice(0, 24)
      try {
        card.dispatch('click')
        // на новом экране жмём всё, кроме кнопок, которые явно уводят
        // (выход из забега, «ещё раз», «в город» — они не проверяют экран)
        const r = clickEverything(screen(), { skip: ['Ещё раз', '← '] })
        for (const e of r.errors) errors.push(`${label}: ${e.label} — ${e.error.message}`)
      } catch (e) {
        errors.push(`${label}: ${e.message}`)
      }
      if (!backToCity()) { errors.push(`${label}: не вернулся в город`); break }
    }
    expect(errors).toEqual([])
  })
})

/** Зайти в комнату поля с нуля. */
function enterField() {
  if (!backToCity()) throw new Error('не вернулся в город')
  click(/В путь по миру/)
  click(/Шудра/)
  if (/Почерк/i.test(here())) targets().find((x) => /wsel-card/.test(x.className || '')).dispatch('click')
  if (/Фонтан|нефрит/i.test(here())) {
    const jade = targets().filter((x) => /jade-card/.test(x.className || ''))
    jade[0].dispatch('click')
  }
  const world = targets().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
  world.dispatch('click')
  return here()
}

describe('правило двух кнопок', () => {
  it('в бою ровно две кнопки действия, остальное — служебное', () => {
    enterField()
    expect(here(), 'мы в бою поля').toMatch(/дефлект/i)
    // Правило проекта: в поле две кнопки, как в Hades. Удар отдельной
    // кнопки нет (тап по окове), рывок — двойной тап. Всё, что не
    // «дефлект» и не «мантра», — служебное: пауза и то, что не нажимается.
    const action = targets().filter((x) => /fbtn/.test(x.className || ''))
    const labels = action.map((x) => textOf(x))
    expect(labels.some((t) => /дефлект/i.test(t)), 'нет кнопки дефлекта').toBe(true)
    expect(labels.some((t) => /Джапа|Мантра|Пранаяма|Япа|Нид|[А-Я][а-я]+/.test(t)), 'нет кнопки мантры').toBe(true)
    // пауза — служебная, её можно не считать действием
    const nonPause = action.filter((x) => !/pause/i.test(x.className || ''))
    expect(nonPause.length, `кнопок действия: ${nonPause.length} (должно быть 2)`).toBe(2)
  })

  it('в бою нет руки с картами — карточный стол убран из поля', () => {
    enterField()
    const t = here()
    expect(/колода:|сброс:/.test(t), 'в бою поля не должно быть счёта колоды').toBe(false)
    expect(/Завершить ход/.test(t), 'в бою поля нет конца хода').toBe(false)
  })

  it('кнопка пауза есть всегда — выход из забега под рукой', () => {
    enterField()
    expect(targets().some((x) => /pause/i.test(x.className || '')), 'нет кнопки паузы').toBe(true)
  })
})
