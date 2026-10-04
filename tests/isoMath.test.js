// ИЗОМЕТРИЯ ДОЛЖНА БЫТЬ ПРОВЕРЯЕМА, А НЕ «КАЖЕТСЯ ПРАВИЛЬНО».
//
// ## Зачем
//
// Изометрию вводили вслепую: снимок экрана здесь не работает, поэтому «похоже на
// Heroes» проверить нечем. Но проекция — это **арифметика**, и арифметика
// проверяется точно, в отличие от картинки.
//
// ## Что здесь ловится
//
//   1. Плитка не 2:1 → набор 128×64 к ромбу не подойдёт, и это не видно глазом.
//   2. Обратная проекция не обратная → палец уезжает на 1280 единиц от оки.
//      ЭТО БЫЛО: сдвиг прибавлялся в прямой проекции и не вычитался в обратной.
//   3. Ромб не помещается по высоте → камера ездит вверх-вниз и бой уезжает из-под
//      пальца.
//   4. Полный бой шире экрана → ока недоступна пальцем и не видна.
//   5. Камера выходит за ромб → за краем комнаты пустота вместо места.
//
// ## Как проверять «сдвиг не забыт»
//
// Не комментарием в коде, а числами: на сотнях точек `roomWorld(roomIso(p))`
// обязан вернуть то же самое. Сдвиг в 320 пикселей даёт ошибку 1280 мировых
// единиц — тест это увидит, а чтение кода — нет.

import { describe, it, expect } from 'vitest'
import {
  TILE_W, TILE_H, TILE_WORLD, ROOM_TILES, ROOM_W, ROOM_H,
  ISO_W, ISO_H, ISO_OFFSET_X, roomIso, roomWorld, depth, isoBounds, clampCamera, depthShade,
} from '../webapp/js/ui/iso.js'

/** Видимая область экрана боя. Та же, что в экране: 420×640. */
const VIEW_W = 420
const VIEW_H = 640

/** Кольцо, в котором стоят оки: `RINGS` в `core/fieldBuild.js` — 0.30…0.70. */
const RING_LO = 0.30
const RING_HI = 0.70

const corner = (fx, fy) => ({ x: ROOM_W * fx, y: ROOM_H * fy })

describe('Ромб изометрии — ровно вдвое шире высоты', () => {
  it('соотношение плитки 2:1, как требует набор', () => {
    // Скачанные CC0-наборы изометрии: плитка 128×64. Если наша плитка будет не
    // вдвое, пол ляжет ромбом неправильно — и это не видно глазом.
    expect(TILE_W / TILE_H, `плитка ${TILE_W}×${TILE_H} — наборы требуют 2:1`).toBe(2)
  })

  it('мировая единица равна пикселю — радиусы боя читаются на экране как есть', () => {
    // Радиус удара 32 в игре и 32 пикселя на экране. Если это перестанет быть
    // так, придётся вводить коэффициент во все проверки попаданий, и они
    // перестанут соответствовать тому, что видит человек.
    expect(TILE_WORLD, 'мировая единица разошлась с пикселем').toBe(TILE_W)
  })

  it('ромб комнаты вдвое шире высоты, и углы стоят где положено', () => {
    const b = isoBounds()
    const rhombW = b.x1 - b.x0
    const rhombH = b.y1 - b.y0
    expect(rhombW / rhombH, `ромб ${rhombW}×${rhombH} — должен быть вдвое шире высоты`)
      .toBeCloseTo(2, 5)
    const a = roomIso(0, 0)
    const right = roomIso(ROOM_W, 0)
    const bottom = roomIso(ROOM_W, ROOM_H)
    expect(right.x, 'правый угол должен быть правее левого').toBeGreaterThan(a.x)
    expect(bottom.y, 'нижний угол должен быть ниже верхнего').toBeGreaterThan(a.y)
    expect(bottom.x, 'нижний угол уехал вбок — ромб перекошен').toBeCloseTo(a.x, 6)
  })

  it('левый угол комнаты стоит ровно в нуле — пол уезжать некуда', () => {
    // Сдвиг наружу не выставлен, поэтому единственный способ узнать, что он
    // есть, — посмотреть на угол. Если угол не ноль, весь пол рисуется со
    // сдвигом и часть комнаты уходит в минус.
    expect(roomIso(0, 0).x, 'верхний угол не там').toBeCloseTo(ISO_OFFSET_X, 9)
    expect(roomIso(0, ROOM_H).x, 'левый угол не в нуле').toBeCloseTo(0, 9)
    expect(roomIso(ROOM_W, 0).x, 'правый угол не на краю ромба').toBeCloseTo(ISO_W, 9)
    expect(roomIso(ROOM_W, ROOM_H).y, 'нижний угол не на краю ромба').toBeCloseTo(ISO_H, 9)
  })

  it('ромб по высоте помещается в телефон', () => {
    expect(ISO_H, `ромб ${ISO_H} выше экрана ${VIEW_H} — камера поедет вверх-вниз`)
      .toBeLessThanOrEqual(VIEW_H)
  })
})

describe('Обратная проекция возвращает то же самое', () => {
  it('палец → мир → палец не уплывает (400 точек по всей комнате)', () => {
    // Ровно тот случай, который стоил прошлой попытки: сдвиг прибавлялся в
    // прямой проекции и не вычитался в обратной. Ошибка была не в «паре пикселей»,
    // а в 1280 мировых единиц — палец попадал в противоположный конец комнаты.
    let worst = 0
    let worstAt = null
    for (let i = 0; i < 400; i++) {
      const x = ((i * 37) % 400) / 400 * ROOM_W
      const y = ((i * 91) % 400) / 400 * ROOM_H
      const iso = roomIso(x, y)
      const back = roomWorld(iso.x, iso.y)
      const err = Math.max(Math.abs(back.x - x), Math.abs(back.y - y))
      if (err > worst) { worst = err; worstAt = { x, y, iso, back } }
    }
    expect(worst, `хуже всего в ${JSON.stringify(worstAt)} — обратная проекция не обратная`)
      .toBeLessThan(1e-9)
  })

  it('переход ромб → мир → ромб тоже точен (для пыток и подсказок)', () => {
    for (let i = 0; i < 200; i++) {
      const sx = ((i * 53) % 200) / 200 * ISO_W
      const sy = ((i * 71) % 200) / 200 * ISO_H
      const w = roomWorld(sx, sy)
      const iso = roomIso(w.x, w.y)
      expect(Math.max(Math.abs(iso.x - sx), Math.abs(iso.y - sy)),
        `пиксель ромба (${Math.round(sx)},${Math.round(sy)}) разошёлся с плоскостью`).toBeLessThan(1e-9)
    }
  })

  it('весь ромб комнаты остаётся внутри своих границ', () => {
    const b = isoBounds()
    for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0, 0.5], [1, 0.5], [0.5, 1]]) {
      const p = roomIso(ROOM_W * fx, ROOM_H * fy)
      expect(p.x, `угол ${fx},${fy} ушёл влево за ромб`).toBeGreaterThanOrEqual(b.x0 - 1e-9)
      expect(p.x, `угол ${fx},${fy} ушёл вправо за ромб`).toBeLessThanOrEqual(b.x1 + 1e-9)
      expect(p.y, `угол ${fx},${fy} ушёл вверх за ромб`).toBeGreaterThanOrEqual(b.y0 - 1e-9)
      expect(p.y, `угол ${fx},${fy} ушёл вниз за ромб`).toBeLessThanOrEqual(b.y1 + 1e-9)
    }
  })
})

describe('ПОЛНЫЙ бой помещается в кадр — иначе по оке нельзя ударить', () => {
  it('ширина боя по ромбу уже экрана', () => {
    // Оки стоят в кольце 0.30–0.70 от краёв комнаты. Проецируем четыре угла
    // этого кольца: их ромб обязан быть уже экрана, иначе ока уходит за кадр, и
    // по ней нельзя ни попасть пальцем, ни увидеть, что она идёт.
    const corners = [
      corner(RING_LO, RING_LO), corner(RING_HI, RING_LO),
      corner(RING_LO, RING_HI), corner(RING_HI, RING_HI),
    ].map((p) => roomIso(p.x, p.y))
    const w = Math.max(...corners.map((p) => p.x)) - Math.min(...corners.map((p) => p.x))
    expect(w, `бой шириной ${Math.round(w)} при экране ${VIEW_W} — часть оков недоступна пальцем`)
      .toBeLessThanOrEqual(VIEW_W)
  })

  it('высота боя по ромбу помещается в экран', () => {
    const corners = [
      corner(RING_LO, RING_LO), corner(RING_HI, RING_LO),
      corner(RING_LO, RING_HI), corner(RING_HI, RING_HI),
    ].map((p) => roomIso(p.x, p.y))
    const h = Math.max(...corners.map((p) => p.y)) - Math.min(...corners.map((p) => p.y))
    expect(h, `бой высотой ${Math.round(h)} при экране ${VIEW_H}`).toBeLessThanOrEqual(VIEW_H)
  })

  it('камера, вставленная в центр боя, показывает весь бой', () => {
    // Не «кольцо уже экрана», а «камера, которая стоит там, где надо, и правда
    // показывает всё». Это ровно то, что делает экран, и именно это отвалилось
    // в прошлый раз: ока оказывалась за кадром, и четыре проверки телефона
    // пали, хотя арифметика в модуле была верной.
    const centre = roomIso(ROOM_W / 2, ROOM_H / 2)
    const cam = clampCamera(centre.x, centre.y, VIEW_W, VIEW_H)
    const corners = [
      corner(RING_LO, RING_LO), corner(RING_HI, RING_LO),
      corner(RING_LO, RING_HI), corner(RING_HI, RING_HI),
    ].map((p) => roomIso(p.x, p.y))
    for (const p of corners) {
      const sx = p.x - cam.x
      const sy = p.y - cam.y
      expect(sx, `угол боя ушёл влево за кадр (${Math.round(sx)})`).toBeGreaterThanOrEqual(0)
      expect(sx, `угол боя ушёл вправо за кадр (${Math.round(sx)})`).toBeLessThanOrEqual(VIEW_W)
      expect(sy, `угол боя ушёл вверх за кадр (${Math.round(sy)})`).toBeGreaterThanOrEqual(0)
      expect(sy, `угол боя ушёл вниз за кадр (${Math.round(sy)})`).toBeLessThanOrEqual(VIEW_H)
    }
  })
})

describe('Камера не выходит за ромб', () => {
  it('по краям ромба камера остаётся внутри', () => {
    const b = isoBounds()
    const spots = [
      roomIso(0, 0), roomIso(ROOM_W, 0), roomIso(0, ROOM_H), roomIso(ROOM_W, ROOM_H),
      roomIso(0, ROOM_H / 2), roomIso(ROOM_W / 2, 0), roomIso(ROOM_W / 2, ROOM_H),
    ]
    for (const p of spots) {
      const cam = clampCamera(p.x, p.y, VIEW_W, VIEW_H)
      expect(cam.x, `камера уехала влево за ромб (${cam.x})`).toBeGreaterThanOrEqual(b.x0)
      expect(cam.x + VIEW_W, 'камера вылезла вправо за ромб').toBeLessThanOrEqual(b.x1 + 1e-9)
      // По вертикали ромб ниже экрана, поэтому камера уходит в минус — это
      // «пустое небо» над комнатой. Значит, проверять надо не «минус запрещён»,
      // а «нижний край ромба не выше низа экрана»: если камера уползёт вверх,
      // низ комнаты окажется отрезанным. Прошлая версия этой проверки требовала
      // `cam.y ≥ 0` и с изометрией ломала бы вёрстку на ровном коде.
      expect(cam.y, 'камера уехала вниз за нижний край ромба').toBeLessThanOrEqual(b.y0 + 1e-9)
      expect(cam.y + VIEW_H, 'низ комнаты отрезан экраном').toBeGreaterThanOrEqual(b.y1 - 1e-9)
    }
  })

  it('камера всегда показывает точку, за которой идёт', () => {
    for (let i = 0; i < 40; i++) {
      const x = (i / 40) * ROOM_W
      const y = ((i * 7) % 40) / 40 * ROOM_H
      const p = roomIso(x, y)
      const cam = clampCamera(p.x, p.y, VIEW_W, VIEW_H)
      const sx = p.x - cam.x
      const sy = p.y - cam.y
      const inView = sx >= 0 && sx <= VIEW_W && sy >= 0 && sy <= VIEW_H
      const roomTooSmall = ISO_W < VIEW_W
      if (!roomTooSmall) {
        expect(inView, `точка комнаты (${Math.round(x)},${Math.round(y)}) ушла из кадра: `
          + `экран (${Math.round(sx)},${Math.round(sy)}) при ромбе ${ISO_W}×${ISO_H}`)
          .toBe(true)
      }
    }
  })
})

describe('Глубина и затемнение', () => {
  it('глубина совпадает с «ниже по экрану»', () => {
    expect(roomIso(100, 100).y, 'глубина и экран разошлись: сортировка врёт').toBeGreaterThan(0)
    const near = roomIso(ROOM_W, ROOM_H)
    const far = roomIso(0, 0)
    expect(depth(ROOM_W, ROOM_H), 'ближний угол должен быть глубже дальнего')
      .toBeGreaterThan(depth(0, 0))
    expect(near.y, 'ближний угол должен быть ниже по экрану').toBeGreaterThan(far.y)
  })

  it('затемнение идёт от дальнего края к ближнему', () => {
    const far = depthShade(0, 0)
    const near = depthShade(ROOM_W, ROOM_H)
    expect(far, 'дальний край не темнее ближнего — ромб читается как доска').toBeLessThan(near)
    expect(far, 'дальний край слишком тёмный, комната провалится в темноту').toBeGreaterThan(0.4)
    expect(near, 'ближний край должен остаться светлым').toBeLessThanOrEqual(1)
    expect(depthShade(0, 0), 'слишком темно').toBeGreaterThanOrEqual(0.5)
  })
})

describe('Размер комнаты один, а не в трёх местах', () => {
  it('плиток ровно столько, сколько объявлено, и ромб считается из них', () => {
    expect(ROOM_W / TILE_WORLD, 'ROOM_W не в плитках').toBe(ROOM_TILES)
    expect(ROOM_H / TILE_WORLD, 'ROOM_H не в плитках').toBe(ROOM_TILES)
    expect(ISO_W, 'ширина ромба считается не из плиток').toBe(ROOM_TILES * TILE_W)
    expect(ISO_H, 'высота ромба считается не из плиток').toBe(ROOM_TILES * TILE_H)
  })
})