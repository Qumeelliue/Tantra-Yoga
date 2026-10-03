// РАСПАКОВЩИК PNG — чтобы смотреть лицензионные листы пикселями.
//
// Зачем он здесь. Листы спрайтов приходят одним файлом, и чтобы нарезать их на
// кадры, нужно знать размер кадра и где он начинается. Смотреть картинку и
// прикидывать на глаз нельзя: ошибка в четыре пикселя даёт кадры, в которых
// половина — кусок соседнего, и это видно только в игре.
//
// Стандартной библиотеки для PNG в Node нет, а ставить зависимость ради чтения
// картинки — лишнее. Формат простой: IHDR, пачка IDAT (zlib), и четыре фильтра
// строк. Здесь ровно это, без украшений.
//
// Проверяется откатом: если фильтр распознан неверно, число строк с «мусором»
// перестаёт быть нулём. См. `tests/pngReader.test.js`.

import { inflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'

const paeth = (a, b, c) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/** Прочитать PNG и вернуть { w, h, data } — RGBA, по 4 байта на пиксель. */
export function readPng(file) {
  const buf = readFileSync(file)
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('не PNG')

  let off = 8
  let w = 0
  let h = 0
  let bitDepth = 0
  let colorType = 0
  const idat = []

  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const body = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      w = body.readUInt32BE(0)
      h = body.readUInt32BE(4)
      bitDepth = body[8]
      colorType = body[9]
    } else if (type === 'IDAT') {
      idat.push(body)
    } else if (type === 'IEND') break
    off += 12 + len
  }

  if (bitDepth !== 8) throw new Error(`глубина ${bitDepth} не читается`)
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`тип цвета ${colorType} не читается`)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * channels
  const out = Buffer.alloc(h * stride)
  let pos = 0

  for (let y = 0; y < h; y++) {
    const filter = raw[pos++]
    const line = raw.subarray(pos, pos + stride)
    pos += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= channels ? prev[x - channels] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) v += paeth(a, b, c)
      else if (filter !== 0) throw new Error(`фильтр ${filter} в строке ${y} не распознан`)
      cur[x] = v & 0xff
    }
  }

  // В RGBA, если исходник был без альфы.
  if (channels === 4) return { w, h, data: out }
  const rgba = Buffer.alloc(w * h * 4)
  for (let i = 0, n = w * h; i < n; i++) {
    rgba[i * 4] = out[i * channels]
    rgba[i * 4 + 1] = out[i * channels + 1] || 0
    rgba[i * 4 + 2] = out[i * channels + 2] || 0
    rgba[i * 4 + 3] = channels === 2 ? out[i * channels + 1] : 255
  }
  return { w, h, data: rgba }
}

/** Пиксель прозрачен? */
export const isEmpty = (img, x, y) => img.data[(y * img.w + x) * 4 + 3] === 0

/**
 * Найти размер кадра по периодичности картинки.
 *
 * Идея: у листа спрайтов кадры повторяются, и между ними есть либо пустая полоса,
 * либо край кадра. Метод ищет высоту, при которой все строки листа разбиваются на
 * одинаковые блоки, — то есть каждая строка внутри блока совпадает с той же
 * строкой другого блока.
 *
 * Возвращает все правдоподобные размеры, а не первый: первый по счёту размер
 * часто 1, и это верно, но бесполезно.
 */
export function guessFrameSizes(img, maxSize = 64) {
  const out = []
  for (let s = 1; s <= maxSize; s++) {
    if (img.w % s !== 0 && img.h % s !== 0) continue
    let ok = true
    for (let y = 0; y + s <= img.h && ok; y += s) {
      for (let k = 0; k < s && ok; k++) {
        const a = (y + k) * img.w * 4
        for (let x = 0; x < img.w * 4; x += 4) {
          if (img.data[a + x] !== img.data[x] || img.data[a + x + 3] !== img.data[x + 3]) {
            ok = false
            break
          }
        }
      }
    }
    if (ok && s > 1) out.push(s)
  }
  return out
}

/** Горизонтальные линии, где весь столбец прозрачен — кандидаты на границы кадров. */
export function transparentColumns(img) {
  const cols = []
  for (let x = 0; x < img.w; x++) {
    let empty = true
    for (let y = 0; y < img.h; y++) {
      if (!isEmpty(img, x, y)) { empty = false; break }
    }
    cols.push(empty)
  }
  return cols
}

export function transparentRows(img) {
  const rows = []
  for (let y = 0; y < img.h; y++) {
    let empty = true
    for (let x = 0; x < img.w; x++) {
      if (!isEmpty(img, x, y)) { empty = false; break }
    }
    rows.push(empty)
  }
  return rows
}

/** Сколько непустых пикселей в кадре (x, y, размер). 0 — кадр пустой. */
export function inkIn(img, x0, y0, size) {
  let n = 0
  for (let y = y0; y < y0 + size && y < img.h; y++) {
    for (let x = x0; x < x0 + size && x < img.w; x++) if (!isEmpty(img, x, y)) n++
  }
  return n
}