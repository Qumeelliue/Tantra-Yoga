// ЗАПИСЬ PNG — собирать листы из кусков тайлсета.
//
// ## Зачем
//
// Читатель PNG у нас уже есть (`pngReader.mjs`), а писателя не было. Нужен он
// для одной конкретной вещи: **показать автору, что лежит в тайлсете**.
//
// Ситуация: в наборе 355 плиток с предметами, и я не вижу их. Выбрать «похожую
// на сундук» наугад — значит поставить игроку в комнату случайный предмет и
// назвать его сокровищем. Это хуже, чем оставить свой горшок: свой хотя бы
// точно читается как «что-то разбиваемое».
//
// Поэтому собирается лист-образец: все кандидаты крупно, с номерами. Автор
// смотрит и говорит, какой — сундук. Один взгляд вместо ста забегов вслепую.
//
// ## Формат
//
// Ровно тот, что читает `pngReader.mjs`: 8 бит, RGBA (тип цвета 6), без
// фильтрации строк (фильтр 0), zlib для данных. Этого достаточно, чтобы
// положить файл в репозиторий и открыть в браузере.

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, body) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(body.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([len, typed, crc])
}

/**
 * Записать RGBA-картинку в PNG.
 *
 * @param {Uint8Array|Buffer} rgba — w*h*4 байт
 */
export function writePng(file, w, h, rgba) {
  const raw = Buffer.alloc(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0                                  // фильтр 0
    Buffer.from(rgba.buffer || rgba, rgba.byteOffset || 0, rgba.length)
      .copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8    // глубина
  ihdr[9] = 6    // RGBA
  writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]))
  return file
}

/** Пустой холст RGBA. */
export function blank(w, h, rgba = [0, 0, 0, 0]) {
  const buf = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = rgba[0]
    buf[i * 4 + 1] = rgba[1]
    buf[i * 4 + 2] = rgba[2]
    buf[i * 4 + 3] = rgba[3]
  }
  return { w, h, data: buf }
}

/** Положить прямоугольник из `src` в `dst`. Ближний сосед, как в игре. */
export function blit(dst, src, sx, sy, sw, sh, dx, dy, dw = sw, dh = sh) {
  for (let y = 0; y < dh; y++) {
    const uy = sy + Math.min(sh - 1, Math.floor((y * sh) / dh))
    for (let x = 0; x < dw; x++) {
      const ux = sx + Math.min(sw - 1, Math.floor((x * sw) / dw))
      const si = (uy * src.w + ux) * 4
      const di = ((dy + y) * dst.w + (dx + x)) * 4
      if (dx + x < 0 || dy + y < 0 || dx + x >= dst.w || dy + y >= dst.h) continue
      dst.data[di] = src.data[si]
      dst.data[di + 1] = src.data[si + 1]
      dst.data[di + 2] = src.data[si + 2]
      dst.data[di + 3] = src.data[si + 3]
    }
  }
}

/** Заливка прямоугольника цветом — подложка и рамки в образце. */
export function fillRect(dst, x, y, w, h, [r, g, b, a]) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || yy < 0 || xx >= dst.w || yy >= dst.h) continue
      const i = (yy * dst.w + xx) * 4
      dst.data[i] = r
      dst.data[i + 1] = g
      dst.data[i + 2] = b
      dst.data[i + 3] = a
    }
  }
}