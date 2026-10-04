// ГЛАВНЫЕ МОМЕНТЫ БОЯ ДОЛЖНЫ ЗВУЧАТЬ.
//
// ## Что случилось
//
// У поля был свой звук — и он был хорош: дефлект гремел, оковление звенело,
// владыка рычал. Но три самых важных момента боя **молчали**:
//
//   `hit`         — удар игрока по оке. Событие доходило до экрана, `say`
//                   писала «попадание», и всё.
//   `strike_ripu` — удар по рипу, то есть главный урок игры проходил беззвучно.
//   `shaken`      — удар по самому игроку: садхака терял жизнь без звука.
//
// Итог: игрок слышал, что **защитился**, и не слышал, что **попал** и что
// **получил урон**. Это переворачивало смысл боя на слух: главное действие было
// тише второстепенного.
//
// ## Почему проверка именно такая
//
// Звук нельзя проверить «по коду» — можно только услышать, а в vitest нет ушей.
// Поэтому проверка подменяет методы `fieldSfx` на счётчики и смотрит, что
// событие боя действительно **позвало** звук. Это проверка связи «событие →
// звук», а не проверка того, что звук написан.
//
// ## Чего здесь нет
//
// Не проверяется, что звук приятен. Это ухо автора, а не тест.

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { installDom, clickables, textOf, chooseLordIfShown } from './helpers/dom.js'
let fieldSfx = null   // см. beforeAll: модуль звука трогает document при загрузке

let dom
beforeAll(async () => {
  dom = installDom({ fresh: true })
  dom.setProfile({ width: 390, height: 844, dpr: 3, touch: true })
  // Модуль звука читает `document` при загрузке, поэтому он берётся ПОСЛЕ
  // стенда. Статический импорт сверху падал с «document is not defined» —
  // и это выглядело как поломка проверки, а не как «стенд не готов».
  fieldSfx = (await import('../webapp/js/ui/fx.js')).fieldSfx
  await import('@webapp/js/main.js')
})

const scr = () => dom.root.childNodes[dom.root.childNodes.length - 1]
const here = () => textOf(scr())
const targets = () => clickables(scr())
const st = () => globalThis.window.__field

/** Счётчики вызовов звуков вместо самих звуков. */
function spySounds() {
  const calls = []
  const keys = ['hit', 'blocked', 'hurt', 'die', 'parry', 'parryMiss', 'pacify', 'bossHit']
  const saved = {}
  for (const k of keys) {
    saved[k] = fieldSfx[k]
    fieldSfx[k] = (...a) => { calls.push(k) }
  }
  return {
    calls,
    restore() { for (const k of keys) fieldSfx[k] = saved[k] },
  }
}

function enterField() {
  for (let i = 0; i < 12; i++) {
    if (/Город светится/.test(here())) break
    const onboard = targets().find((x) => /Понятно/.test(textOf(x)))
    if (onboard) { onboard.dispatch('click'); continue }
    if (targets().some((x) => /fbtn/.test(x.className || ''))) {
      const pause = targets().find((x) => /pause/i.test(x.className || '') || /❚/.test(textOf(x)))
      if (!pause) break
      pause.dispatch('click')
      const leave = targets().find((x) => /оставить забег/i.test(textOf(x)))
      if (!leave) break
      leave.dispatch('click')
      continue
    }
    const back = targets().find((x) => /← /.test(textOf(x)))
    if (!back) break
    back.dispatch('click')
  }
  for (const re of [/В путь по миру/]) {
    const b = targets().find((x) => re.test(textOf(x)))
    if (b) b.dispatch('click')
  }
  dom.flushRaf(3)
  const w = targets().find((x) => /Шудра/.test(textOf(x)))
  if (w) w.dispatch('click')
  dom.flushRaf(3)
  if (/Почерк/i.test(here())) {
    const a = targets().find((x) => /wsel-card/.test(x.className || ''))
    if (a) a.dispatch('click')
  }
  if (/Фонтан|нефрит/i.test(here())) {
    const j = targets().filter((x) => /jade-card/.test(x.className || ''))
    if (j[0]) j[0].dispatch('click')
  }
  const world = targets().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
  if (!world) throw new Error(`нет открытой чакры. экран: ${here().slice(0, 200)}`)
  world.dispatch('click')
  chooseLordIfShown(targets())
  if (!st()) throw new Error('бой не открылся')
  return st()
}

/** Прогнать боевые события напрямую и собрать, какие звуки прозвучали. */
function soundsFor(events) {
  const spy = spySounds()
  try {
    for (const e of events) {
      const before = spy.calls.length
      // Экран разбирает события внутри кадра, поэтому отдаём их через поле:
      // кладём в очередь и просим кадр.
      const s = st()
      s.__probe = (s.__probe || []).concat(e)
      dom.flushRaf(2)
      if (spy.calls.length === before) break
    }
  } finally {
    spy.restore()
  }
  return spy.calls
}

describe('Звук есть у каждого главного момента боя', () => {
  it('в библиотеке поля есть звуки для удара, блока и урона', () => {
    // Звуки, которых не было вообще. Проверка на существование — чтобы
    // следующая не нашлась в коде вызов несуществующего метода.
    for (const k of ['hit', 'blocked', 'hurt', 'die']) {
      expect(typeof fieldSfx[k], `звука «${k}» нет в fieldSfx`).toBe('function')
    }
  })

  it('удар по оке на настоящем экране звучит', () => {
    // Первая версия проверки выдумывала событие (`__lastEvents`) и подсовывала
    // его в состояние. Экран его, конечно, не читал — проверка требовала
    // несуществующего поля и падала бы на любом коде. Теперь удар настоящий:
    // садхака встаёт вплотную к оке и бьёт, а экран разбирает события сам.
    enterField()
    const s = st()
    // В первой комнате только рипу: паши появляются с четвёртой чакры. Проверка
    // бьёт ту оку, что есть, и ждёт звук, соответствующий её виду: по паше —
    // «попадание», по рипу — «удар не прошёл». Раньше проверка искала только пашу
    // и падала с «бить нечем» на совершенно нормальной комнате.
    const pasha = s.foes.find((f) => !f.dead && !f.pacified && f.kind === 'pasha')
    const foe = pasha || s.foes.find((f) => !f.dead && !f.pacified)
    expect(foe, 'в комнате нет ни одной живой оки').toBeTruthy()
    const sound = pasha ? 'hit' : 'blocked'

    // Бьём так, как бьёт игрок: касанием по оке. Прямой вызов `strike()` из
    // проверки события создавал, но никто их не передавал экрану — то есть
    // проверка мерила не тот путь, по которому играет человек.
    s.player.strikeCd = 0
    s.player.x = foe.x - 18
    s.player.y = foe.y
    dom.flushRaf(2)
    const cv = dom.lastCanvas()
    expect(cv, 'холст боя не найден — нечем бить').toBeTruthy()
    const p = dom.worldPoint(cv, foe.x, foe.y)
    const spy = spySounds()
    try {
      dom.fingerTap(cv, p.x, p.y, { id: 1 })
      dom.flushRaf(4)
      expect(spy.calls, `удар по оке (${foe.kind}) прошёл без звука: игрок слышит, что `
        + 'защитился, и не слышит, что попал или что удар не прошёл').toContain(sound)
    } finally {
      spy.restore()
    }
  })
})

describe('Тишина в бою — это тоже поломка, если не задумано', () => {
  it('ни одно из главных событий не остаётся без звука в коде экрана', () => {
    // Проверка по исходнику — сознательно грубая, как страховка: она ловит
    // случай «обработчик есть, а звук в нём забыли». Поведенческая проверка
    // выше ловит случай «звук есть, но никто его не зовёт».
    const src = readFileSync(new URL('../webapp/js/ui/screens/field.js', import.meta.url), 'utf8')
    const pairs = [
      ['hit', /case 'hit':[\s\S]{0,240}fieldSfx\.hit\(\)/],
      ['strike_ripu', /case 'strike_ripu':[\s\S]{0,320}fieldSfx\.blocked\(\)/],
      ['shaken', /case 'shaken':[\s\S]{0,320}fieldSfx\.hurt\(\)/],
      ['killed', /case 'killed':[\s\S]{0,240}fieldSfx\.die\(\)/],
    ]
    for (const [name, re] of pairs) {
      expect(re.test(src),
        `событие «${name}» разбирается без звука. Проверка поведения этого не поймает, `
        + 'потому что звук есть, но его не зовут').toBe(true)
    }
  })
})