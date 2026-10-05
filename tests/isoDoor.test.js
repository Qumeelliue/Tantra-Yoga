// ДВЕРЬ — ЛИЦЕНЗИОННЫЙ ПРОЁМ В СТЕНЕ, А НЕ АРКА ИЗ КОДА.
//
// ## Зачем
//
// Дверь — первое, на что игрок смотрит, выходя из боя. Она была единственным
// оставшимся самодельным рисунком в комнате: арка, нарисованная в коде. После
// того как пол и стены стали лицензионными, она выглядела как чужеродная наклейка
// посреди ромба.
//
// ## Что проверяется
//
//   1. проём берётся из набора, а не рисуется командами;
//   2. он стоит В СТЕНЕ (на кромке дальнего ряда плиток), а не посреди пола;
//   3. на экране у двери есть пиксели выше кромки — то есть она выступает над
//      стеной, а не лежит на полу;
//   4. геометрия набора известна: 6 проёмов по 128×192, а не «128×192».
//
// ## Откат
//
// Если вернуть арку из кода (удалить блок с `drawImage`), проверка «проём берётся
// из набора» падает. Если сдвинуть дверь с кромки стены в середину комнаты,
// падает проверка «стоит в стене».

import { describe, it, expect, beforeAll } from 'vitest'
import { installDom, clickables, textOf, chooseLordIfShown } from './helpers/dom.js'
import { readPng } from '../scripts/pngReader.mjs'
import { roomIso, TILE_WORLD, ISO_W } from '../webapp/js/ui/iso.js'
import { isoDoorImage, ISO_DOOR_TILE, ISO_DOOR_WALL_H, ISO_DOOR_INDEX } from '../webapp/js/ui/fieldIso.js'
import { PLAYER_BOUNDS, DOOR_SPOT } from '../webapp/js/core/field.js'

let dom
let recs = []

beforeAll(async () => {
  dom = installDom({ fresh: true })
  const doc = globalThis.document
  const origCreate = doc.createElement
  doc.createElement = function (tag) {
    const el = origCreate.call(doc, tag)
    if (String(tag).toLowerCase() !== 'canvas') return el
    const ctx = el.getContext('2d')
    const rec = { calls: [], ctx }
    for (const key of Object.keys(ctx)) {
      const v = ctx[key]
      if (typeof v === 'function') ctx[key] = (...a) => { rec.calls.push({ m: key, a }); return v.apply(ctx, a) }
    }
    recs.push(rec)
    el.getContext = () => ctx
    return el
  }
  await import('@webapp/js/main.js')
})

const scr = () => dom.root.childNodes[dom.root.childNodes.length - 1]
const here = () => textOf(scr()).replace(/\s+/g, ' ').trim()
const tg = () => clickables(scr())
const st = () => globalThis.window.__field

function clickRe(re, what = '') {
  const el = tg().find((n) => re.test(textOf(n)))
  expect(el, `не нажалось: ${what}. экран: ${here().slice(0, 140)}`).toBeTruthy()
  el.dispatch('click')
  dom.flushRaf(3)
}

async function enterField() {
  for (let i = 0; i < 12; i++) {
    if (/Город спит/.test(here())) break
    const on = tg().find((x) => /Понятно/.test(textOf(x)))
    if (on) { on.dispatch('click'); continue }
    if (tg().some((x) => /fbtn/.test(x.className || ''))) {
      const p = tg().find((x) => /pause/i.test(x.className || '') || /❚/.test(textOf(x))); if (!p) break
      p.dispatch('click')
      const l = tg().find((x) => /оставить забег/i.test(textOf(x))); if (!l) break
      l.dispatch('click')
      continue
    }
    const b = tg().find((x) => /← /.test(textOf(x))); if (!b) break
    b.dispatch('click')
  }
  clickRe(/В путь по миру/, 'с титула')
  clickRe(/Шудра/, 'выбор оружия')
  if (/Почерк/i.test(here())) {
    const a = tg().find((x) => /wsel-card/.test(x.className || ''))
    if (a) a.dispatch('click')
  }
  if (/Фонтан|нефрит/i.test(here())) {
    const j = tg().filter((x) => /jade-card/.test(x.className || ''))
    if (j[0]) j[0].dispatch('click')
  }
  const world = tg().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
  if (!world) throw new Error(`нет открытой чакры. экран: ${here().slice(0, 180)}`)
  world.dispatch('click')
  chooseLordIfShown(tg())
  expect(!!dom.root.querySelector('.field-left'), `бой не открылся: ${here().slice(0, 180)}`).toBe(true)
  for (let i = 0; i < 6; i++) await Promise.resolve()
  return st()
}

describe('Дверь: лицензионный проём в стене', () => {
  let s = null
  beforeAll(async () => {
    s = await enterField()
    dom.flushRaf(2)
  })

  it('лист проёмов — шесть проёмов по 128×192, а не один', () => {
    // В `SOURCES.md` было написано «128×192», и это было неверно: 128×192 —
    // размер ОДНОГО проёма. Лист — 768×192, то есть шесть штук. Ошибка не
    // выглядела ошибкой, пока проём не нарисовали и он не оказался в шесть раз
    // шире комнаты.
    const png = readPng('webapp/public/assets/iso/door-sw.png')
    expect(png.w, `ширина листа ${png.w} — при 128 на проём это ${png.w / 128} проёмов`)
      .toBe(ISO_DOOR_TILE * 6)
    expect(png.h).toBe(192)
    expect(ISO_DOOR_WALL_H, 'высота стены проёма должна быть меньше листа')
      .toBeLessThan(png.h)
    expect(ISO_DOOR_INDEX, 'индекс проёма вне листа').toBeLessThan(6)
  })

  it('набор с дверью приехал', () => {
    expect(isoDoorImage(), 'проём не загрузился — дверь рисуется аркой из кода').toBeTruthy()
  })

  it('проём берётся из набора, а не рисуется командами', () => {
    // Проверка по КАДРУ. Если проём нарисован картинкой, в кадре есть `drawImage`
    // с его прямоугольником ИСТОЧНИКА (128×128 из листа 768×192). Арка из кода
    // такого вызова не делает — она рисуется линиями.
    //
    // Координаты назначения в записи — ЛОКАЛЬНЫЕ: экран уже сдвинут камерой, и
    // проём рисуется от центра двери, то есть `dx = dy = −64`. Первая версия
    // ждала абсолютных координат и не находила ничего — то есть проверяла не
    // «проём нарисован», а «проём нарисован вот тут», а это разные вещи.
    const half = ISO_DOOR_TILE / 2
    const found = recs.some((r) => r.calls.some((c) => c.m === 'drawImage'
      && c.a.length >= 9
      && c.a[1] === ISO_DOOR_INDEX * ISO_DOOR_TILE
      && c.a[2] === 0
      && c.a[3] === ISO_DOOR_TILE
      && c.a[4] === ISO_DOOR_WALL_H
      && Math.round(c.a[5]) === -half
      && Math.round(c.a[6]) === -half
      && c.a[7] === half && c.a[8] === half))
    if (!found) {
      // Что на самом деле — коротко, без тысяч спрайтов фигур.
      const imgs = recs.flatMap((r) => r.calls.filter((c) => c.m === 'drawImage' && c.a.length >= 9 && c.a[3] !== 16)
        .map((c) => `sx=${c.a[1]} sy=${c.a[2]} sw=${c.a[3]} sh=${c.a[4]} → ${Math.round(c.a[5])},${Math.round(c.a[6])} ${c.a[7]}×${c.a[8]}`)).slice(0, 3)
      throw new Error(`на кадре нет проёма из набора; ждём sx=${ISO_DOOR_INDEX * ISO_DOOR_TILE}, sy=0, `
        + `sw=${ISO_DOOR_TILE}, sh=${ISO_DOOR_WALL_H} → ${-half},${-half} ${half}×${half}. `
        + `Похожее на кадре: ${imgs.join(' | ') || 'ничего'}`)
    }
    expect(found).toBe(true)
  })

  it('дверь ДОСТИЖИМА — иначе комнату нельзя покинуть', () => {
    // Это и есть та поломка, что стоила забега: дверь стояла на кромке стены
    // (y = 64), а игрок ограничен PLAYER_BOUNDS и до y = 112 не дходит. Выход
    // был недостижим, комната не покидалась, и «до финала дошли» падало — без
    // объяснения почему. Теперь причина в одном месте, и она проверяется.
    const b = PLAYER_BOUNDS
    const reach = (x, y) => x >= b.side && x <= s.field.w - b.side && y >= b.top && y <= s.field.h - b.bottom
    expect(reach(s.door.x, s.door.y),
      `дверь (${Math.round(s.door.x)},${Math.round(s.door.y)}) вне досягаемости: `
      + `игрок ходит в [${b.side}…${s.field.w - b.side}] × [${b.top}…${s.field.h - b.bottom}]`)
      .toBe(true)
    // Радиус входа — 40, поэтому и точка двери, и круг входа должны быть внутри.
    expect(reach(s.door.x - s.door.r, s.door.y), 'круг входа в дверь обрезан краем комнаты').toBe(true)
  })

  it('дверь стоит у дальней стены, а не посреди комнаты', () => {
    // Кромка дальней стены — первая линия плиток (y = TILE_WORLD). Проём стоит
    // на одной линии ПОСЛЕ неё: визуально в стене, но достижим.
    expect(s.door.y, 'дверь не у дальней стены').toBeLessThanOrEqual(TILE_WORLD * 2)
    expect(s.door.y, 'дверь уехала в середину комнаты').toBeLessThan(s.field.h / 2)
    expect(s.door.x, 'дверь вне комнаты').toBeGreaterThan(0)
    expect(s.door.x, 'дверь вне комнаты').toBeLessThan(s.field.w)
  })

  it('дверь стоит на средней вертикали ромба — поэтому видна при любой камере', () => {
    // Условие одно: x = y. Тогда ромб-точка двери лежит на средней вертикали
    // ромба, а камера идёт за центром боя, который тоже около этой вертикали.
    // Вторая попытка поставила дверь в середину комнаты по x — и при уехавшей
    // камере она уходила за правый край. Здесь это зафиксировано числом.
    expect(s.door.x, 'дверь сбилась со средней вертикали ромба — она уйдёт за край')
      .toBe(s.door.y)
    const p = roomIso(s.door.x, s.door.y)
    expect(Math.round(p.x), `ромб-точка двери на ${Math.round(p.x)}, а середина ромба ${Math.round(ISO_W / 2)}`)
      .toBe(Math.round(ISO_W / 2))
  })

  it('дверь видна в кадре — в неё надо войти, чтобы выйти', () => {
    const p = roomIso(s.door.x, s.door.y)
    const cam = st().cam
    const x = p.x - cam.x
    const y = p.y - cam.y
    expect(x, `дверь ушла за левый край кадра (${Math.round(x)})`).toBeGreaterThan(0)
    expect(x, `дверь ушла за правый край кадра (${Math.round(x)})`).toBeLessThan(420)
    expect(y, 'дверь ушла за верх кадра').toBeGreaterThan(0)
    expect(y, 'дверь ушла за низ кадра').toBeLessThan(640)
  })
})