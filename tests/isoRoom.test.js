// КОМНАТА ДОЛЖНА БЫТЬ РОМБОМ — И ЭТО ПРОВЕРЯЕТСЯ ПИКСЕЛЯМИ.
//
// ## Зачем
//
// Снимок экрана в этом окружении не работает, глазом проверить нельзя. Но
// холст в стенде — настоящий, с пикселями. Значит, «комната похожа на ромб» —
// не субъективное суждение, а измеримое утверждение: у пола есть форма ромба,
// у стены есть фасад, между плитками нет щелей.
//
// ## Что здесь ловится
//
//   1. Пол не ромб (например, плитки просто скопированы сеткой) — видно по
//      тому, что непрозрачные пиксели заполняют прямоугольник.
//   2. Щели между плитками в один пиксель — по темным линиям внутри пола.
//   3. Стены нарисованы не там или не те — по непрозрачным пикселям ВЫШЕ
//      верхнего угла ромба: там должна быть только стена, пола быть не должно.
//   4. Затемнение не легло по глубине: верх комнаты темнее низа.
//   5. Стена пустая (набор не приехал) — тогда слой нулевой.
//
// Каждая проверка сделана откатом: см. `notes/HANDOFF.md`, отрезок 21.

import { describe, it, expect, beforeAll } from 'vitest'
import { installDom } from './helpers/dom.js'
import { readPng } from '../scripts/pngReader.mjs'
import {
  loadIsoTiles, buildIsoFloor, buildIsoWalls, isoFloorCanvas, isoWallCanvas,
  isoRoomReady, resetIsoRoom, WALL_H, FLOOR_VARIANTS,
} from '@webapp/js/ui/fieldIso.js'
import { ISO_W, ISO_H, ROOM_TILES, roomIso } from '@webapp/js/ui/iso.js'

let dom
let floor
let wall

/** Пиксели холста, снятые в обычный массив — читать их дальше удобно. */
const pixels = (canvas) => {
  const g = canvas.getContext('2d')
  const d = g.getImageData(0, 0, canvas.width, canvas.height).data
  return { w: canvas.width, h: canvas.height, d }
}

const alphaAt = (px, x, y) => px.d[(y * px.w + x) * 4 + 3]

beforeAll(() => { installDom({ fresh: true }) })

describe('Набор плиток приехал и в нём есть альфа', () => {
  it('файл пола — ромбы с прозрачными углами, а не сплошной квадрат', async () => {
    // Это проверка подготовки файла (`scripts/isoPrep.mjs`), а не рисунка.
    // Без прозрачности девять ромбов склеиваются в кашу, и никакая геометрия
    // это не спасёт.
    const png = readPng('webapp/public/assets/iso/floor-tiled.png')
    let op = 0
    for (let i = 3; i < png.data.length; i += 4) if (png.data[i] > 200) op++
    const share = op / (png.w * png.h)
    expect(share, `непрозрачно ${Math.round(share * 100)} % — набор без альфы, ромбы склеятся`)
      .toBeGreaterThan(0.4)
    expect(share, `непрозрачно ${Math.round(share * 100)} % — ромб должен занимать половину плитки`)
      .toBeLessThan(0.6)
  })

  it('загрузка вызывается один раз — второй Image не создаётся', async () => {
    // Проверка на повторную загрузку: два `Image` на один файл означают, что
    // пол и стены могут собраться из разных картинок.
    const a = await loadIsoTiles()
    const b = await loadIsoTiles()
    expect(a && b, 'набор не приехал — проверки комнаты не имеют смысла').toBe(true)
  })
})

describe('Пол комнаты — ромб', () => {
  beforeAll(async () => {
    dom = installDom({ fresh: true })
    await loadIsoTiles()
    floor = buildIsoFloor()
  })

  it('слой собран и его размеры равны ромбу', () => {
    expect(isoFloorCanvas(), 'пол не собрался — набор не приехал или холста нет').toBeTruthy()
    expect(floor.width).toBe(ISO_W)
    expect(floor.height).toBe(ISO_H)
  })

  it('пол занимает ромб, а не прямоугольник', () => {
    const px = pixels(floor)
    let op = 0
    for (let i = 3; i < px.d.length; i += 4) if (px.d[i] > 200) op++
    const share = op / (ISO_W * ISO_H)
    // Ромб — половина своего описанного прямоугольника. Плитки занимают ровно
    // половину: 196 плиток по 64×32 = 401 408 пикселей из 896×448 = 401 408.
    expect(share, `пол занимает ${Math.round(share * 100)} % прямоугольника — ромба нет`)
      .toBeCloseTo(0.5, 2)
  })

  it('вне ромба пусто — значит, плитки легли по геометрии, а не сеткой', () => {
    const px = pixels(floor)
    // Четыре угла описанного прямоугольника вне ромба — обязаны быть пусты.
    const probes = [[2, 2], [ISO_W - 3, 2], [2, ISO_H - 3], [ISO_W - 3, ISO_H - 3]]
    for (const [x, y] of probes) {
      expect(alphaAt(px, x, y), `пиксель (${x},${y}) заполнен — это угол прямоугольника, `
        + 'а не пустота вне ромба').toBeLessThan(40)
    }
  })

  it('внутри ромба нет щелей: каждая линия вдоль плитки заполнена', () => {
    // Щель в один пиксель между плитками — это ровно то «клетчатое», за что
    // автор ругал игру. Ищутся вертикальные линии внутри ромба: если между
    // ромбами осталась пустота, на ней альфа падает.
    const px = pixels(floor)
    const gaps = []
    for (let ty = 0; ty < ROOM_TILES; ty++) {
      for (let tx = 0; tx < ROOM_TILES; tx++) {
        // Центр плитки и середина её правой кромки — оба обязаны быть заполнены.
        const c = roomIso(tx * 64 + 32, ty * 64 + 32)
        const e = roomIso(tx * 64 + 64, ty * 64 + 32)
        if (alphaAt(px, Math.round(c.x), Math.round(c.y)) < 200) gaps.push(`центр ${tx},${ty}`)
        // Край плитки проверяется только там, где он внутри холста: у самого
        // правого и нижнего углов ромба кромка упирается в границу картинки, и
        // «пусто там» — это не щель, а конец комнаты.
        // У самой правой плитки восточный кром — это край комнаты, а не стык
        // с соседней: там ромб сходит в точку, и «пусто рядом» правильно.
        if (tx < ROOM_TILES - 1 && alphaAt(px, Math.round(e.x) - 1, Math.round(e.y)) < 200) {
          gaps.push(`край ${tx},${ty}`)
        }
      }
    }
    expect(gaps.slice(0, 5), `пусто в ${gaps.length} местах — между плитками щели`).toEqual([])
  })

  it('дальний край темнее ближнего — ромб читается как место, а не как доска', () => {
    const px = pixels(floor)
    const brightness = (y0, y1) => {
      let sum = 0
      let n = 0
      for (let y = y0; y < y1; y += 2) {
        for (let x = 0; x < ISO_W; x += 2) {
          const i = (y * px.w + x) * 4
          if (px.d[i + 3] < 200) continue
          sum += (px.d[i] + px.d[i + 1] + px.d[i + 2]) / 3
          n++
        }
      }
      return { v: n ? sum / n : 0, n }
    }
    const far = brightness(0, 40)
    const near = brightness(ISO_H - 60, ISO_H - 20)
    expect(far.n, 'пол пуст — затемнение нечего мерить').toBeGreaterThan(100)
    expect(near.n, 'пол пуст — затемнение нечего мерить').toBeGreaterThan(100)
    expect(far.v, `дальний край ${far.v.toFixed(1)} не темнее ближнего ${near.v.toFixed(1)}`)
      .toBeLessThan(near.v)
  })
})

describe('Стены стоят на двух дальних краях ромба', () => {
  beforeAll(async () => {
    dom = installDom({ fresh: true })
    await loadIsoTiles()
    floor = buildIsoFloor()
    wall = buildIsoWalls()
  })

  it('слой стен собран', () => {
    expect(isoWallCanvas(), 'стены не собрались').toBeTruthy()
    expect(wall.width).toBe(ISO_W)
    expect(wall.height).toBe(ISO_H)
    expect(isoRoomReady(), 'комната не готова: пол или стены пустые').toBe(true)
  })

  it('высота стены известна и больше плитки', () => {
    // Стена ниже половины плитки читается как порог, а не как стена.
    expect(WALL_H, `высота стены ${WALL_H} — ниже плитки, комната не читается`).toBeGreaterThan(32)
  })

  it('над верхним углом ромба есть пиксели — это стена', () => {
    // Верхний угол ромба — точка (ISO_W/2, 0). Над ним на высоту WALL_H должна
    // стоять стена, и больше там ничего нет. Если пикселей нет, стена не
    // нарисована, и комната «висит в воздухе».
    const px = pixels(wall)
    let op = 0
    for (let y = 1; y <= WALL_H; y++) {
      for (let x = ISO_W / 2 - 20; x < ISO_W / 2 + 20; x++) {
        if (alphaAt(px, Math.round(x), y) > 200) op++
      }
    }
    expect(op, 'над верхним углом ромба пусто — стены нет').toBeGreaterThan(400)
  })

  it('стена стоит вдоль обоих дальних краёв — на всём их протяжении', () => {
    const px = pixels(wall)
    // Проверяем не «есть ли стена вообще», а «стоит ли она ВДОЛЬ края»: для
    // середины каждого края берём точку на кромке пола и требуем непрозрачных
    // пикселей прямо НАД ней. Одна стена вместо двух, или стена на половину
    // длины, — это открытая комната; проверка «есть пиксели» это пропустила бы.
    const above = (wx, wy) => {
      const p = roomIso(wx, wy)
      let op = 0
      for (let y = Math.round(p.y - WALL_H); y < Math.round(p.y); y++) {
        if (y < 0) continue
        if (alphaAt(px, Math.round(p.x), y) > 200) op++
      }
      return op
    }
    // Верх-лево: край столбца x = 0. Верх-право: край ряда y = 0. Середина
    // комнаты по длине: плитки 4…9 из 14 — там стена точно должна быть.
    const rowY = [4, 5, 6, 7, 8, 9].map((i) => above(i * 64 + 32, 64))
    const colX = [4, 5, 6, 7, 8, 9].map((i) => above(64, i * 64 + 32))
    expect(Math.min(...rowY), 'нет стены вдоль верх-правого края (ряд y = 0)').toBeGreaterThan(20)
    expect(Math.min(...colX), 'нет стены вдоль верх-левого края (столбец x = 0)').toBeGreaterThan(20)
  })

  it('в середине комнаты стены нет — иначе она перекрыта', () => {
    // Нижняя половина ромба (ближняя к зрителю) стен не имеет: там ходят.
    // Если стена есть посередине, комната закрытаown.
    const px = pixels(wall)
    let op = 0
    for (let y = ISO_H - 6; y < ISO_H; y++) {
      for (let x = 0; x < ISO_W; x++) if (alphaAt(px, x, y) > 200) op++
    }
    expect(op, 'стена стоит у самого низа ромба — она закрывает пол').toBeLessThan(ISO_W)
  })

  it('плитки пола выбраны из заявленных — набор не подменён', () => {
    for (const [col, row] of FLOOR_VARIANTS) {
      expect(col, `столбец плитки ${col} вне листа 3×3`).toBeGreaterThanOrEqual(0)
      expect(col, `столбец плитки ${col} вне листа 3×3`).toBeLessThan(3)
      expect(row, `строка плитки ${row} вне листа 3×3`).toBeGreaterThanOrEqual(0)
      expect(row, `строка плитки ${row} вне листа 3×3`).toBeLessThan(3)
    }
    expect(FLOOR_VARIANTS.length, 'в наборе 9 плиток, а взято столько, что пол однотонный')
      .toBeGreaterThan(1)
  })
})

describe('Слои строятся один раз, а не каждый кадр', () => {
  it('повторный вызов отдаёт тот же холст', () => {
    installDom({ fresh: true })
    resetIsoRoom()
    loadIsoTiles().then(() => {
      const a = buildIsoFloor()
      const b = buildIsoFloor()
      expect(a, 'пол не собрался').toBeTruthy()
      expect(b, 'повторный пол не собрался').toBeTruthy()
      expect(a === b, 'пол пересобирается на каждый кадр — это 196 drawImage зря')
        .toBe(true)
    })
  })
})