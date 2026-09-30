// КАРТОЧНЫЙ ПУТЬ ДО КОНЦА, ЧЕРЕЗ НАСТОЯЩИЕ ЭКРАНЫ.
//
// Второй путь игры (колода против оков) до сих пор не был пройден ни одним
// тестом: его экраны — карточный бой, выбор награды, узлы, победа, смерть —
// открываются только в середине забега, и упасть там можно тихо.
//
// Здесь забег доводится до конца: узлы отмечаются выполненными, бои
// выигрываются состоянием, а все экраны — настоящие.

import { describe, it, expect, beforeAll, vi } from 'vitest'
import { installDom, textOf, clickables } from './helpers/dom.js'

let dom
beforeAll(() => {
  dom = installDom()
  return import('@webapp/js/main.js')
})

const screen = () => dom.root.childNodes[dom.root.childNodes.length - 1]
const targets = () => clickables(screen())
const here = () => textOf(screen())

function find(re) {
  const t = targets().find((x) => re.test(textOf(x)))
  if (!t) throw new Error(`не нашёл «${re}». есть: ${targets().map((x) => textOf(x).slice(0, 16)).join(' | ')}\nэкран: ${here().slice(0, 140)}`)
  return t
}

function expectClean(label) {
  const t = here()
  expect(t.length, `${label}: экран пуст`).toBeGreaterThan(3)
  const bad = ['NaN', 'undefined', '[object Object]'].filter((b) => t.includes(b))
  expect(bad, `${label}: мусор ${bad.join(', ')} → ${t.slice(0, 140)}`).toEqual([])
  const raw = /<[a-z]+[ >][^<]*/i.exec(t)
  if (raw) {
    const at = raw.index
    console.log(`HTML в «${label}»: …${t.slice(Math.max(0, at - 60), at + 90)}…`)
  }
  expect(raw, `${label}: сырой HTML`).toBeFalsy()
}

const run = () => globalThis.window.__run

describe('карточный забег', () => {
  it('стартует, проходит узлы и доходит до финала', () => {
    vi.useFakeTimers()
    // В город, если мы не там
    for (let i = 0; i < 10; i++) {
      const back = targets().find((x) => /← /.test(textOf(x)))
      if (!back) break
      back.dispatch('click')
    }
    // Онбординг ведёт в поле, поэтому карточный путь берётся из города —
    // он и назван «Колода — второй путь», чтобы не путать.
    if (/Понятно/.test(here())) find(/Понятно/).dispatch('click')
    if (/Кем ты идёшь/.test(here())) find(/← Назад/).dispatch('click')
    if (!/Город спит/.test(here())) throw new Error('не дошёл до города: ' + here().slice(0, 80))
    find(/Колода/).dispatch('click')
    expect(here(), 'после «Колода» — выбор ментальности').toMatch(/Фокус ума|ментальность/i)
    find(/Шудра/).dispatch('click')
    expect(here(), 'после ментальности — карта забега').toMatch(/восхождение/i)
    expectClean('карта забега')

    const problems = []
    const seen = new Set()
    const repeats = {}
    let reachedFinale = false
    let guard = 0

    while (guard++ < 1500) {
      const t = here()
      seen.add(t.slice(0, 30))

      // Финал забега. «Победа» после боя — это НЕ финал: экран боевого
      // выигрыша называется так же, и забег после него идёт дальше.
      if (/одолели Владыку|пелена рассеется/i.test(t)) { reachedFinale = true; break }

      const r = run()
      if (!r) { problems.push('забег потерялся на экране: ' + t.slice(0, 80)); break }
      if (r.status === 'victory') break
      if (r.status === 'dead') { problems.push('забег оборвался смертью — проверка финала не дошла: ' + t.slice(0, 60)); break }

      // Узел на карте
      // Узел доступен, когда на нём класс available — и только тогда он
      // вообще нажимается (onclick = available ? ... : null).
      const node = targets().find((x) => /w-node/.test(x.className || '') && /available/.test(x.className || ''))
      if (node) {
        node.dispatch('click')
        // Садхака идёт до цели через setTimeout(480) — реальные часы
        // ждать нельзя (400 узлов × 480 мс = три минуты теста), поэтому
        // часы подменены, а шаг прокручивается вручную.
        vi.advanceTimersByTime(600)
        dom.flushRaf(2)
        try { expectClean('после узла') } catch (e) { problems.push(e.message) }
        continue
      }

      // Карточный бой: выигрываем состоянием — окову снимаем, как будто
      // доиграли. Экран сам поймёт, что враг не в силах, и закончит бой.
      const c = globalThis.window.__combat
      if (c) {
        try {
          for (const e of c.enemies || []) { if (!e.dead && !e.pacified) { e.hp = 0 } }
          // Экран пересчитывает исход только после действия игрока, поэтому
          // «убили» окову и жмём «Завершить ход» — как настоящий игрок.
          const end = targets().find((x) => /Завершить ход/.test(textOf(x)))
          if (end) end.dispatch('click')
          for (let i = 0; i < 6; i++) { dom.flushRaf(1); vi.advanceTimersByTime(60) }
        } catch (e) { problems.push('бой: ' + e.message); break }
        continue
      }

      // Медитация: сжечь оковки, затем завершить.
      if (/Медитация/.test(t)) {
        for (const c of targets().filter((x) => /med-burn/.test(x.className || ''))) c.dispatch('click')
        // После выбора оков кнопка называется «Отпустить (N)», до выбора —
        // «Завершить медитацию». Берём любую из трёх подписей.
        const next = targets().find((x) => /med-next|Завершить|Отпустить/.test((x.className || '') + textOf(x)))
        if (!next) { problems.push('медитация: нет кнопки завершения'); break }
        next.dispatch('click')
        for (let i = 0; i < 6; i++) { dom.flushRaf(1); vi.advanceTimersByTime(60) }
        continue
      }

      // Всё остальное — кнопки
      const btn = targets().find((x) => /btn|card|choice|reward/.test(x.className || ''))
      if (btn) {

        btn.dispatch('click'); continue
      }

      problems.push('застряли на экране без единой кнопки: ' + t.slice(0, 100))
      break
    }

    vi.useRealTimers()
    expect(problems).toEqual([])
    // Забег обязан дойти до финала, а не «где-то там остановиться».
    expect(reachedFinale, 'забег дошёл до экрана финала').toBe(true)
    // И пройти разные типы экранов, а не один и тот же двадцать раз.
    expect(seen.size, 'экранов пройдено').toBeGreaterThan(8)
    // Карта забега случайна, поэтому конкретный набор узлов (событие,
    // лавка, испытание) от прогона к прогону меняется. Требуем только то,
    // что обязано случиться при любой карте: победа в бою и финал.
    for (const k of ['Победа', 'одолели Владыку']) {
      expect([...seen].some((x) => x.includes(k)), `не пройден экран «${k}»`).toBe(true)
    }
  })
})
