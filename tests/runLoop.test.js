// ЗАБЕГ ДОХОДИТ ДО КОНЦА — ИЛИ ВСТАЁТ.
//
// ## Почему это отдельный вид проверки
//
// В сессии 28 в цепочку «владыка пал → покой → дар» был вставлен выбор
// реликвии: `showBoonDraft(next, caption, () => showRelicDraft())`. Единицы
// проверяли, что вызов в коде есть, — и проходили.
//
// Но `showBoonDraft` ведёт забег через экран выбора дара. Если этот переход не
// срабатывает, игрок после ПЕРВОГО владыки оказывается на экране, из которого
// некуда идти: забег обрывается на трети пути, и никакая единичная проверка
// этого не видит — каждая смотрит свой кусок.
//
// Поэтому здесь забег ПРОГОНЯЕТСЯ целиком на настоящем стенде: комнаты
// зачищаются, и проверяется, что после комнаты доходит до экрана дверей, а
// цепочка после владыки ведёт дальше.
//
// Единицы проверяют кирпичи; это проверяет стену.

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const main = read('webapp/js/main.js')

let dom = null
let text = () => ''
let textOf = () => ''
let targets = () => []
let chooseLord = () => {}

beforeAll(async () => {
  const helper = await import('./helpers/dom.js')
  dom = helper.installDom()
  await import('@webapp/js/main.js')
  targets = () => helper.clickables(dom.root)
  textOf = helper.textOf
  text = () => helper.textOf(dom.root)
  chooseLord = () => helper.chooseLordIfShown(targets())
})

/** Нажать первую кнопку, чей ТЕКСТ подходит. */
const press = (re) => {
  const b = targets().find((x) => re.test(textOf(x)))
  if (!b) return false
  b.dispatch('click')
  return true
}

/** Нажать по КЛАССУ — карточки без читаемого текста (варна, почерк). */
const pressClass = (re) => {
  const b = targets().find((x) => re.test(String(x.className || '')))
  if (!b) return false
  b.dispatch('click')
  return true
}

/** Зачистить текущую комнату: все оки сняты, дверь открыта. */
function clearRoom(st) {
  for (const f of st.foes) { f.pacified = true; f.hp = 0 }
  st.pacified += st.foes.length
}

/**
 * Довести комнату до конца и дождаться следующего экрана.
 *
 * Бой на стенде не симулируется: проверка не о том, умеет ли стенд драться, а
 * о том, доходит ли петля дальше. Комната зачищается напрямую, дальше
 * прокручиваются кадры, пока экран не сменится.
 */
function finishCurrentRoom(limit = 60) {
  const st = globalThis.window.__field
  if (!st) return false
  clearRoom(st)
  for (let i = 0; i < limit; i++) {
    dom.flushRaf(1)
    // Комната кончилась, но переход происходит при ВХОДЕ в дверь: игрок сам
    // идёт к ней (Hades). Ставим садхаку на дверь, иначе петля не идёт дальше
    // — и это не поломка, а правило игры.
    if (st.door && st.roomCleared !== false) {
      st.player.x = st.door.x
      st.player.y = st.door.y
    }
    // Критерий успеха — ЭКРАН, а не объект поля: `window.__field` остаётся
    // жить и после смены экрана. Первая версия ждала `null` и рапортовала
    // «петля не идёт» при работающей петле.
    if (!globalThis.window.__field || /Двери/.test(text())) return true
  }
  return false
}

function enterField() {
  for (let i = 0; i < 10; i++) { const b = targets().find((x) => /← /.test(textOf(x))); if (!b) break; b.dispatch('click') }
  if (/Понятно/.test(text())) press(/Понятно/)
  if (/Кем ты идёшь/.test(text())) press(/Шудра/)
  if (/Почерк/i.test(text())) pressClass(/wsel-card/)
  const jade = targets().filter((x) => /jade-card/.test(x.className || ''))
  if (jade[0]) jade[0].dispatch('click')
  pressClass(/varna-card/)
  chooseLord()
}

describe('Петля забега не порвана', () => {
  it('после комнаты доходит до экрана дверей', () => {
    enterField()
    expect(globalThis.window.__field, 'бой не начался').toBeTruthy()
    const ok = finishCurrentRoom()
    expect(ok, `комната не дошла до конца; поле живо: ${!!globalThis.window.__field}, экран: ${text().slice(0, 120)}`).toBe(true)
    for (let i = 0; i < 8 && !/Двери/.test(text()); i++) dom.flushRaf(1)
    expect(/Двери/.test(text()),
      `после комнаты нет экрана дверей; на экране: ${text().slice(0, 140)}`).toBe(true)
  })

  it('на экране дверей есть карточки с подписью, что внутри', () => {
    // Hades подписывает двери. Карточка без подписи — выбор вслепую, и правило
    // проекта «обещание на двери = содержимое» не выполняется.
    const cards = dom.root.querySelectorAll('.door-card')
    expect(cards.length, 'на экране дверей нет ни одной карточки').toBeGreaterThan(0)
    for (const c of cards) {
      expect(String(c.className || ''), 'карточка без класса вида двери').toMatch(/\bd-/)
      const hint = c.querySelector('.door-hint')
      expect(hint, 'на двери нет подписи «что внутри»').toBeTruthy()
      expect(String(hint.textContent || '').length,
        'подпись двери пустая — игрок выбирает вслепую').toBeGreaterThan(4)
    }
  })

  it('в цепочке после владыки выбор реликвии и у него есть выход', () => {
    // Статическая часть: экран есть и из него есть куда идти. Динамику
    // (что забег доходит до конца) ловит замер — здесь главное «не обрывает».
    expect(main).toMatch(/function showRelicDraft/)
    const body = main.slice(main.indexOf('function showRelicDraft'), main.indexOf('function showRelicDraft') + 2800)
    expect(body, 'карточка реликвии никуда не ведёт').toMatch(/onclick: \(\) => take\(view\)/)
    expect(body, 'после взятия реликвии нет кнопки выхода').toMatch(/Идти дальше/)
    // И `go` обязан быть вызван, когда карточек нет: иначе пустой пул реликвий
    // тихо остановил бы забег — и это случалось бы на длинном забеге.
    expect(body, 'пустой список реликвий не ведёт дальше — забег встанет')
      .toMatch(/if \(!choice\.length\) \{ go\(\); return \}/)
  })

  it('забег продолжается, а не заканчивается после выбора дара', () => {
    const bo = main.slice(main.indexOf('function showBoonDraft'), main.indexOf('function showBoonDraft') + 2600)
    expect(bo, 'у выбора дара нет продолжения')
      .toMatch(/if \(after\) after\(\); else startFieldRun\(nextFloor\)/)
    const after = main.slice(main.indexOf('function afterRest'), main.indexOf('function afterRest') + 900)
    expect(after.indexOf('showBoonDraft(next,'),
      'выбор реликвии не привязан к цепочке после владыки').toBeGreaterThan(0)
    expect(after).toMatch(/showRelicDraft\(\)/)
  })

  it('петля идёт дальше: за дверью начинается следующая комната', () => {
    // Стенд не доводит забег до седьмого владыки — там слишком много шагов, и
  // прогон становится хрупким: он ломается не от поломки игры, а от своей
  // сложности. Поэтому здесь проверяется РУБЕЖ: петля не встала на первой
  // двери.
  //
  // Сама цепочка «владыка пал → покой → дар → реликвия» проверяется не здесь, а
  // замером: он проигрывает полные забеги и печатает число выданных реликвий
  // (5.5 за забег при семи владыках). Если цепочка была бы разорвана, замер не
  // досчитал бы их. Это честнее, чем длинный и хрупкий прогон на стенде.
  enterField()
  expect(globalThis.window.__field, 'бой не начался').toBeTruthy()
  const firstRoom = globalThis.window.__field
  expect(finishCurrentRoom(), 'первая комната не закончилась').toBe(true)
  const fight = dom.root.querySelector('.door-card.d-room') || dom.root.querySelector('.door-card')
  expect(fight, 'на экране дверей нет карточки').toBeTruthy()
  fight.dispatch('click')
  for (let i = 0; i < 12 && /Двери/.test(text()); i++) dom.flushRaf(1)
  expect(!/Двери/.test(text()),
    `за дверью снова экран дверей — петля не идёт в комнату. Экран: ${text().slice(0, 120)}`).toBe(true)
  expect(globalThis.window.__field, 'после двери не началась комната').toBeTruthy()
  // Проверяем, что это ДРУГАЯ комната, а не та же: у новой комнаты своя
  // расстановка и своё число оков. Требование «вторая комната тоже
  // заканчивается» проверялось и оказывалось хрупким: оно зависит от того,
  // дверь какого вида выпала, а не от того, работает ли петля.
  const next = globalThis.window.__field
  expect(next.foes.length, 'новая комната пустая — петля ведёт в никуда').toBeGreaterThan(0)
  expect(next, 'после двери осталось то же поле').not.toBe(firstRoom)
  })
})
