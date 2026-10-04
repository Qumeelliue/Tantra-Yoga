// ФИГУРЫ ИДУТ ПО ГЛУБИНЕ — ИНАЧЕ РОМБ ЧИТАЕТСЯ КАК НАБОР НАКЛЕЕК.
//
// ## Зачем
//
// Прямоугольная комната прощала любой порядок отрисовки: кто нарисован
// последним, тот сверху. Ромб не прощает. Если ока, которая БЛИЖЕ к зрителю,
// нарисована раньше дальней, она выглядывает из-за неё — и сцена читается как
// коллаж, а не как место. Это ровно тот «2д-мусор», на который жаловался автор.
//
// ## Что здесь проверяется
//
// Порядок отрисовки на НАСТОЯЩЕМ экране: кадр снимается целиком, и по порядку
// вызовов `translate` определяется, кто кого перекрывает. Проверка не читает
// исходник — исходник можно переписать и сломать, а экран покажет.
//
// ## Откат
//
// Если убрать сортировку (`order.sort(...)`) и рисовать по списку как есть, эта
// проверка падает. См. `notes/HANDOFF.md`, отрезок 21.

import { describe, it, expect, beforeAll } from 'vitest'
import { installDom, clickables, textOf, chooseLordIfShown } from './helpers/dom.js'
import { roomIso } from '../webapp/js/ui/iso.js'

let dom
let recs = []

beforeAll(async () => {
  dom = installDom({ fresh: true })
  // Запись вызовов контекста — до загрузки игры, иначе холсты успеют создаться
  // мимо обёртки. Основа — НАСТОЯЩИЙ контекст стенда: свой список методов
  // забыл бы `setTransform`, `fit()` упал бы, кадр не нарисовался бы, и проверка
  // тихо ничего не проверяла (так уже было в `tests/pots.test.js`).
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
    // Стенд выдаёт новый контекст на каждый `getContext`; без этого вызова
    // обёртка записывала бы вызовы не в тот холст, которым рисует игра.
    el.getContext = () => ctx
    return el
  }
  await import('@webapp/js/main.js')
})

const scr = () => dom.root.childNodes[dom.root.childNodes.length - 1]
const here = () => textOf(scr()).replace(/\s+/g, ' ').trim()
const tg = () => clickables(scr())
const st = () => globalThis.window.__field
const onField = () => !!dom.root.querySelector('.field-left')

function clickRe(re, what = '') {
  const el = tg().find((n) => re.test(textOf(n)))
  expect(el, `не найдено, что нажать: ${what}. экран: ${here().slice(0, 140)}`).toBeTruthy()
  el.dispatch('click')
  dom.flushRaf(3)
}

function enterField() {
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
  expect(onField(), `бой не открылся. экран: ${here().slice(0, 180)}`).toBe(true)
  dom.flushRaf(2)
  return st()
}

/**
 * Где в кадре стояла каждая фигура: порядок вызовов `translate`.
 *
 * Сдвиг камеры — тоже `translate`, поэтому он отбрасывается: у него третий
 * аргумент (0, 0), а у фигур только два.
 */
function drawOrder() {
  const out = []
  for (const r of recs) {
    for (const c of r.calls) {
      if (c.m !== 'translate') continue
      if (c.a.length > 2) continue
      out.push([Math.round(c.a[0]), Math.round(c.a[1])])
    }
  }
  return out
}

describe('Порядок отрисовки — по глубине', () => {
  let s = null
  beforeAll(() => { s = enterField() })

  it('в кадре видны и садхака, и оки', () => {
    expect(st().foes.length, 'в комнате нет оков — проверять нечего').toBeGreaterThan(0)
  })

  it('кто ближе к зрителю, тот нарисован позже', () => {
    const stt = st()
    // Расставляем оков по диагонали «от дальних к ближним» руками: иначе
    // случайная расстановка могла бы случайно оказаться правильной, и проверка
    // прошла бы, ничего не проверяя.
    const spots = [[0.62, 0.62], [0.42, 0.5], [0.5, 0.36]]
    stt.foes.forEach((f, i) => {
      const [fx, fy] = spots[i % spots.length]
      f.x = stt.field.w * fx
      f.y = stt.field.h * fy
      f.dead = false
      f.pacified = false
      f.gone = false
    })
    stt.player.x = stt.field.w * 0.5
    stt.player.y = stt.field.h * 0.5
    stt.pots.length = 0
    stt.wares.length = 0
    stt.coins.length = 0
    for (const r of recs) r.calls.length = 0
    dom.flushRaf(2)

    const seen = drawOrder()
    expect(seen.length, 'кадр без вызовов translate — проверка ничего не измеряет')
      .toBeGreaterThan(3)

    // Где нарисован каждый: ищем его ромб-точку в порядке вызовов.
    const idx = (x, y) => {
      const p = roomIso(x, y)
      for (let i = 0; i < seen.length; i++) {
        if (Math.abs(seen[i][0] - p.x) <= 2 && Math.abs(seen[i][1] - p.y) <= 2) return i
      }
      return -1
    }
    const at = stt.foes.map((f) => idx(f.x, f.y))
    const depths = stt.foes.map((f) => f.x + f.y)
    for (let i = 0; i < at.length; i++) {
      expect(at[i], `ока ${i} (${Math.round(stt.foes[i].x)},${Math.round(stt.foes[i].y)}) `
        + 'не нарисована вовсе — порядок не из чего проверять').toBeGreaterThanOrEqual(0)
    }
    // Знак должен совпадать: чем больше глубина (сумма координат), тем позже
    // нарисовано. Иначе ближняя ока выглядывает из-за дальней, и ромб читается
    // как коллаж. Порядок задаётся руками (три разные глубины), поэтому
    // случайная расстановка не может случайно оказаться правильной.
    for (let i = 1; i < at.length; i++) {
      const prev = stt.foes[i - 1]
      const cur = stt.foes[i]
      const dd = depths[i] - depths[i - 1]
      const da = at[i] - at[i - 1]
      if (Math.abs(dd) < 1) continue            // одна глубина — порядок любой
      expect(dd * da, `глубина оки ${i} (${Math.round(cur.x)},${Math.round(cur.y)}) `
        + `${dd > 0 ? 'больше' : 'меньше'}, а нарисована она `
        + `${da > 0 ? 'позже' : 'раньше'} оки ${i - 1} (${Math.round(prev.x)},${Math.round(prev.y)})`)
        .toBeGreaterThanOrEqual(0)
    }
  })

  it('садхака нарисован после оков, которые ближе к зрителю', () => {
    const stt = st()
    const seen = drawOrder()
    const idx = (x, y) => {
      const p = roomIso(x, y)
      for (let i = 0; i < seen.length; i++) {
        if (Math.abs(seen[i][0] - p.x) <= 2 && Math.abs(seen[i][1] - p.y) <= 2) return i
      }
      return -1
    }
    const me = idx(stt.player.x, stt.player.y)
    expect(me, 'садхака не нарисована — порядок не из чего проверять').toBeGreaterThanOrEqual(0)
    const behind = stt.foes.filter((f) => f.x + f.y < stt.player.x + stt.player.y)
    for (const f of behind) {
      const fi = idx(f.x, f.y)
      if (fi < 0) continue
      expect(me, `садхака (${Math.round(stt.player.x)},${Math.round(stt.player.y)}) нарисована `
        + `раньше дальней оки (${Math.round(f.x)},${Math.round(f.y)}) — она выглядывает из-за неё`)
        .toBeGreaterThan(fi)
    }
  })
})