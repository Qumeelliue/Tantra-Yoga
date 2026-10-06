// ДОМА ПЛОЩАДЕЙ ГОРОДА — СБОРКА УЧАСТКОВ (2026-10-06).
//
// ## Зачем этот файл
//
// Земля площадей уже была изометрической (МЕХАНИКА 63), а домов не было: игрок
// видел семь плиток земли с эмодзи. Этот скрипт собирает участок: четыре плитки
// земли 2×2 и на задней из них — дом из лицензионного набора: две стены (левая
// и правая, из одной световой серии) и крыша.
//
// ## Почему сборка, а не «поставить картинки в экран»
//
// Экран Города — DOM (карточки, кнопки, списки). Собирать дом из трёх картинок
// прямо в вёрстке — значит держать три `background-position`, которые нельзя
// проверить и легко разъедутся при первой правке. Здесь дом собирается один
// раз, замеряется и ложится в игру одним файлом `plot-N.png`.
//
// ## Геометрия замерена, а не выбрана
//
// Стена набора — 64×96: параллелограмм, у которого нижняя кромка (0,64)→(64,96)
// ложится ровно на передний край плитки пола, а верхняя кромка (0,0)→(64,32)
// повторяет её наклон 2:1. Значит стена ставится со сдвигом −32 по вертикали;
// правая стена — ещё +64 по горизонтали. Крыша: у всех годных кусков передний
// угол нижней кромки на (71…73, 91), значит крыша ляжет на стены при сдвиге
// (−8, −85). Всё это скрипт проверяет на самих картинках и падает при отходе.
//
// ## Свет — фильтр поверх участка, а не вторая картинка
//
// «Спит» и «зажжено» в `ui/town.js` — фильтр яркости (МЕХАНИКА 63). Дом на
// участке — часть той же картинки, и он темнеет и светлеет вместе с землёй.
// Отдельных «тёмных» и «светлых» домов нет намеренно.

import { readPng } from './pngReader.mjs'
import { writePng } from './pngWriter.mjs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Фон набора — бирюза rgb(0,128,128). Порог тот же, что у земли и реквизита. */
const KEY = 14

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)))
const SRC_DIR = join(ROOT, 'webapp/public/assets/town-src')
const TOWN_DIR = join(ROOT, 'webapp/public/assets/town')
const OUT_DIR = TOWN_DIR

/**
 * Холст участка один на все семь площадей — иначе карточки в сетке «поедут»
 * по высоте. Запас по краям: контент занимает x 8…264, y 5…218, и ни один край
 * не касается рамки (это проверяется — обрезка была бы незаметна на глаз).
 */
export const CANVAS = { w: 272, h: 226 }
/** Левый-верхний угол «задней» плитки участка (0,0) в холсте. */
export const BX = 72
export const BY = 90

/**
 * Семь домов. `(лист, пара рядов, стиль)` — стены; ряд внутри пары выбирается
 * по замеру (где ЛЕВАЯ стена светлее); `roof` — кусок крыши.
 *
 * Порядок — по яркости стен: 57 → 104 (замерено). Это вторая лестница света
 * после земли (79 → 153): и земля, и дома светлеют от первой площади к седьмой.
 */
export const HOUSES = [
  { sh: 2, pair: 3, st: 3, roof: [1, 0], why: 'тёмно-бурый дом, бурая крыша' },
  { sh: 2, pair: 3, st: 5, roof: [1, 1], why: 'серо-бурый дом, черепица' },
  { sh: 2, pair: 3, st: 7, roof: [2, 2], why: 'сине-серый дом, серая крыша' },
  { sh: 1, pair: 3, st: 4, roof: [2, 0], why: 'красный дом, плоская крыша' },
  { sh: 2, pair: 0, st: 8, roof: [0, 0], why: 'тёплый серый дом, песочная крыша' },
  { sh: 1, pair: 0, st: 2, roof: [3, 0], why: 'серо-синий дом, каменная крыша' },
  { sh: 3, pair: 0, st: 0, roof: [0, 2], why: 'песочный дом, широкая крыша' },
]

const isTeal = (d, i) => Math.abs(d[i]) <= KEY && Math.abs(d[i + 1] - 128) <= KEY
  && Math.abs(d[i + 2] - 128) <= KEY

/** Вырезать кусок листа и снять бирюзовый фон. */
export function cutTile(src, x0, y0, w, h) {
  const out = { w, h, data: Buffer.alloc(w * h * 4) }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((y0 + y) * src.w + (x0 + x)) * 4
      const d = (y * w + x) * 4
      out.data[d] = src.data[s]
      out.data[d + 1] = src.data[s + 1]
      out.data[d + 2] = src.data[s + 2]
      out.data[d + 3] = isTeal(src.data, s) ? 0 : 255
    }
  }
  return out
}

/** Средняя яркость непрозрачных пикселей. */
export function luminance(img) {
  let n = 0
  let l = 0
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 200) continue
    n++
    l += 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]
  }
  return n ? l / n : 0
}

/** Средний цвет непрозрачных — для подбора крыши по цвету. */
export function meanColor(img) {
  let n = 0
  let r = 0
  let g = 0
  let b = 0
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 200) continue
    n++
    r += img.data[i]
    g += img.data[i + 1]
    b += img.data[i + 2]
  }
  return [r / n, g / n, b / n]
}

const blit = (dst, src, ox, oy) => {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (!src.data[(y * src.w + x) * 4 + 3]) continue
      const X = ox + x
      const Y = oy + y
      if (X < 0 || Y < 0 || X >= dst.w || Y >= dst.h) continue
      const s = (y * src.w + x) * 4
      const d = (Y * dst.w + X) * 4
      dst.data[d] = src.data[s]
      dst.data[d + 1] = src.data[s + 1]
      dst.data[d + 2] = src.data[s + 2]
      dst.data[d + 3] = 255
    }
  }
}

/** Нижняя кромка: для каждого x — самый нижний непрозрачный y; -1 — пусто. */
function bottomEdge(img) {
  const bot = []
  for (let x = 0; x < img.w; x++) {
    let m = -1
    for (let y = img.h - 1; y >= 0; y--) {
      if (img.data[(y * img.w + x) * 4 + 3]) { m = y; break }
    }
    bot.push(m)
  }
  return bot
}

/**
 * Проверки геометрии: стена ложится на край плитки, крыша — на стену.
 *
 * Если набор обновят и кромки сдвинутся, сборка молча «уедет»: дом повиснет
 * в воздухе или утонет в земле. Поэтому каждая кромка сверяется с замером.
 */
function checkWall(tile, side) {
  const bot = bottomEdge(tile)
  // Низ левой стены: (0,64) → (63,95). Низ правой — зеркально: (0,95) → (63,64).
  const left = bot[0]
  const right = bot[63]
  const want = side === 'sw' ? [64, 95] : [95, 64]
  if (Math.abs(left - want[0]) > 2 || Math.abs(right - want[1]) > 2) {
    throw new Error(`низ ${side}-стены не совпал с замером: слева ${left} (ждали ${want[0]}), `
      + `справа ${right} (ждали ${want[1]}) — стена не ляжет на край плитки`)
  }
}

function checkRoof(tile) {
  const bot = bottomEdge(tile)
  let lowX = 0
  let lowY = -1
  for (let x = 0; x < tile.w; x++) if (bot[x] > lowY) { lowY = bot[x]; lowX = x }
  if (lowX < 68 || lowX > 76 || lowY < 88 || lowY > 92) {
    throw new Error(`передний угол крыши (${lowX},${lowY}) не совпал с замером (71…73, 91) — `
      + 'крыша не сядет на стены')
  }
  // Наклон кромки 2:1: слева от угла подъём 32 на 64.
  const leftY = bot[lowX - 64]
  if (leftY < 0 || Math.abs((lowY - leftY) - 32) > 3) {
    throw new Error(`левая кромка крыши не 2:1: перепад ${lowY - leftY}, ждали 32`)
  }
}

/** Один дом: прочитать листы, выбрать световой ряд, собрать участок. */
export function composePlot(spec, houseIndex, { srcDir = SRC_DIR, townDir = TOWN_DIR } = {}) {
  const b = join(srcDir, `buildings-${spec.sh}.png`)
  const r = join(srcDir, 'roofing-1.png')
  for (const f of [b, r]) {
    if (!existsSync(f)) throw new Error(`нет файла набора ${f} — положить его в assets/town-src/`)
  }
  const buildings = readPng(b)
  const roofs = readPng(r)

  // Световой ряд пары — где ЛЕВАЯ (SW) стена светлее. Один свет на весь город.
  const rA = spec.pair * 2
  const rB = spec.pair * 2 + 1
  const swA = cutTile(buildings, spec.st * 128, rA * 96, 64, 96)
  const swB = cutTile(buildings, spec.st * 128, rB * 96, 64, 96)
  const row = luminance(swA) > luminance(swB) ? rA : rB
  const sw = row === rA ? swA : swB
  const se = cutTile(buildings, spec.st * 128 + 64, row * 96, 64, 96)
  const roof = cutTile(roofs, spec.roof[1] * 143, spec.roof[0] * 92, 143, 92)

  checkWall(sw, 'sw')
  checkWall(se, 'se')
  checkRoof(roof)

  const ground = readPng(join(townDir, `plaza-${houseIndex + 1}.png`))
  const plot = { w: CANVAS.w, h: CANVAS.h, data: Buffer.alloc(CANVAS.w * CANVAS.h * 4) }

  // Земля 2×2: (0,0) в (BX,BY); восток +64,+32; север −64,+32; юго-восток +0,+64.
  for (const [dx, dy] of [[0, 0], [64, 32], [-64, 32], [0, 64]]) {
    blit(plot, ground, BX + dx, BY + dy)
  }
  // Дом на задней плите: стены со сдвигом −32, крыша на (−8, −85).
  blit(plot, sw, BX, BY - 32)
  blit(plot, se, BX + 64, BY - 32)
  blit(plot, roof, BX - 8, BY - 85)

  checkPlot(plot)
  return plot
}

/** Проверки готового участка: не обрезан, дом стоит, земля видна. */
export function checkPlot(plot) {
  const at = (x, y) => plot.data[(y * plot.w + x) * 4 + 3]
  for (let x = 0; x < plot.w; x++) {
    if (at(x, 0) || at(x, plot.h - 1)) {
      throw new Error(`участок обрезан сверху или снизу (x=${x}) — поднять холст`)
    }
  }
  for (let y = 0; y < plot.h; y++) {
    if (at(0, y) || at(plot.w - 1, y)) {
      throw new Error(`участок обрезан слева или справа (y=${y}) — расширить холст`)
    }
  }
  // Дом: над задней плитой (выше BY) обязаны быть непрозрачные пиксели — это
  // стены и крыша. Без дома их там неоткуда взять: земля ниже BY.
  let house = 0
  let ground = 0
  for (let y = 0; y < plot.h; y++) {
    for (let x = 0; x < plot.w; x++) {
      if (!at(x, y)) continue
      if (y < BY) house++
      else ground++
    }
  }
  if (house < 1500) {
    throw new Error(`над землёй всего ${house} пикселей дома — дом не собрался`)
  }
  if (ground < 10000) {
    throw new Error(`земли всего ${ground} пикселей — участок не собрался`)
  }
}

/** Собрать и записать один участок. */
export function preparePlot(spec, houseIndex, opts = {}) {
  const plot = composePlot(spec, houseIndex, opts)
  writePng(join(opts.outDir || OUT_DIR, `plot-${houseIndex + 1}.png`), plot.w, plot.h, plot.data)
  return plot
}

if (String(process.argv[1] || '').endsWith('townHouses.mjs')) {
  let bad = 0
  const lums = []
  HOUSES.forEach((spec, i) => {
    try {
      const plot = preparePlot(spec, i)
      const walls = readPng(`${TOWN_DIR}/plaza-${i + 1}.png`) // для сообщения
      const lum = Math.round(luminance(plot))
      lums.push(lum)
      console.log(`plot-${i + 1}.png: ${plot.w}×${plot.h}, участок яркость ${lum}, `
        + `дом лист${spec.sh} пара${spec.pair} стиль${spec.st} (${spec.why}), земля ${walls.w}×${walls.h}`)
    } catch (e) {
      bad++
      console.log(`plot-${i + 1}.png: ПРОПУЩЕН — ${e.message}`)
    }
  })
  if (bad) process.exitCode = 1
  else console.log(`семь участков собраны, яркость ${lums.join(' → ')}`)
}
