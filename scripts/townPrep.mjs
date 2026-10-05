// ЗЕМЛЯ ПЛОЩАДИ ГОРОДА — ЛИЦЕНЗИОННЫЕ ИЗОМЕТРИЧЕСКИЕ ПЛИТКИ.
//
// ## Зачем этот файл
//
// Поле Ума стало изометрическим: пол — ромбы 2:1, стены по дальним краям. А Город
// остался экраном на DOM-карточках с эмодзи-глифами. Это ровно то различие,
// которое правило проекта называет палящимся: два разных вида в одной игре.
//
// Поэтому под каждой из семи площадей кладётся настоящая изометрическая
// плитка земли из того же набора, что и пол комнаты. Площадь перестаёт быть
// карточкой с буквой и становится местом.
//
// ## Почему «плоские», а не «толстые»
//
// У набора две версии. Плоская — ровно 128×64, то есть ровно 2:1, ровно как
// игровая плитка пола. Толстая — 128×72: это плитка с боковыми гранями, то
// есть slab, и её соотношение 1.78, а не 2. Проверено построением: у толстой
// плитки `y = 0` — верхняя вершина ромба, `y = 71` — нижняя, а полная ширина
// держится на `y = 31…39`. Основание площади — ромбом, значит берётся плоская.
//
// ## Фоны бывают двух цветов — и это ломает нарезку
//
// Лист 1 и лист 2 набора лежат на **чёрном** фоне, лист 3 — на **малиновом**
// (это видно и на странице набора: «black or magenta backgrounds»). Первая
// версия ключила только чёрный, и плитки из третьего листа выходили
// малиновыми квадратами. Проверка по доле непрозрачных это поймала.
//
// ## Почему скрипт падает при отклонении
//
// Доля непрозрачных у ромба — ровно 50 %. Уехала — значит не тот кусок листа
// или неверный порог фона. Чинить пришлось бы глазами, а глазом здесь не
// проверить.

import { readPng } from './pngReader.mjs'
import { writePng } from './pngWriter.mjs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Порог «это не фон». Тот же, что у пола и реквизита. */
const KEY = 14

/**
 * Семь площадей — семь плиток.
 *
 * Порядок совпадает с порядком чакр: от мудрости (тёмная земля) к сознанию
 * (светлая). Это не украшение, а подбор по замеру: средняя яркость плитки
 * растёт от 95 (тёмная) до 165 (светлая), и игрок, возвращаясь в Город, видит
 * «земля светлеет» — то же, что обещает подпись «свет в площадях».
 *
 * Плитки выбраны жадно по расстоянию цвета: между соседними — не меньше 30 по
 * сумме каналов RGB, иначе две площади выглядели бы одной.
 */
export const CHOSEN = [
  { file: 'terrain-1.png', col: 0, row: 0, out: 'plaza-1.png', why: 'тёмная земля — площадь спит' },
  { file: 'terrain-1.png', col: 2, row: 3, out: 'plaza-2.png', why: 'земля с камнями — тропа к площади' },
  { file: 'terrain-1.png', col: 0, row: 4, out: 'plaza-3.png', why: 'светлый песок — площадь открывается' },
  { file: 'terrain-1.png', col: 2, row: 4, out: 'plaza-4.png', why: 'серый камень — здесь уже ходят' },
  { file: 'terrain-2.png', col: 1, row: 0, out: 'plaza-5.png', why: 'бледный известняк — площадь светлеет' },
  { file: 'terrain-2.png', col: 1, row: 1, out: 'plaza-6.png', why: 'холодный камень — последняя ступень' },
  { file: 'terrain-2.png', col: 2, row: 5, out: 'plaza-7.png', why: 'тёплый песок под солнцем — свет зажжён' },
]

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)))
const SRC_DIR = join(ROOT, 'webapp/public/assets/town-src')
const OUT_DIR = join(ROOT, 'webapp/public/assets/town')

/** Доля непрозрачных пикселей. */
const share = (img) => {
  let op = 0
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 128) op++
  return op / (img.w * img.h)
}

/**
 * Цвет фона берётся из самого файла, а не задаётся молча.
 *
 * У листов одного набора фон разный (чёрный и малиновый), и «всегда чёрный»
 * однажды тихо превратит малиновый фон в малиновые квадраты на экране.
 */
function bgColorOf(img) {
  // Угол листа — всегда фон: плитки стоят сеткой и угол не покрыт.
  const q = 0
  const { data } = img
  return { r: data[q], g: data[q + 1], b: data[q + 2] }
}

/** Фон набора → альфа 0. */
const keyAlpha = (img, key) => {
  for (let i = 0; i < img.data.length; i += 4) {
    const bg = img.data[i] <= key.r + KEY && img.data[i + 1] <= key.g + KEY
      && img.data[i + 2] <= key.b + KEY
    img.data[i + 3] = bg ? 0 : 255
  }
  return img
}

/** Вырезать плитку из листа. */
export function cutTile(src, { col, row, tile = [128, 64] }) {
  const [tw, th] = tile
  const x0 = col * tw
  const y0 = row * th
  const out = { w: tw, h: th, data: Buffer.alloc(tw * th * 4) }
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const s = ((y0 + y) * src.w + x0 + x) * 4
      const d = (y * tw + x) * 4
      out.data[d] = src.data[s]
      out.data[d + 1] = src.data[s + 1]
      out.data[d + 2] = src.data[s + 2]
      out.data[d + 3] = src.data[s + 3]
    }
  }
  return out
}

/** Приготовить одну плитку. Падает при отклонении доли. */
export function prepareOne(spec, srcDir = SRC_DIR, outDir = OUT_DIR) {
  const srcPath = join(srcDir, spec.file)
  if (!existsSync(srcPath)) throw new Error(`нет файла набора ${spec.file} — положить его в assets/town-src/`)
  const img = readPng(srcPath)
  const key = bgColorOf(img)
  const tileImg = cutTile(keyAlpha(img, key), spec)
  const s = share(tileImg)
  // Ромб занимает ровно половину плитки. Больше — значит фон не снят (плитка
  // станет прямоугольником), меньше — это не тот кусок листа.
  if (s < 0.45 || s > 0.55) {
    throw new Error(`плитка ${spec.out} (${spec.col},${spec.row}) после перевода непрозрачна `
      + `на ${Math.round(s * 100)} %, ожидалось около 50 % — либо порог фона неверный, `
      + `либо выбрана не та плитка`)
  }
  writePng(join(outDir, spec.out), tileImg.w, tileImg.h, tileImg.data)
  return { out: spec.out, size: `${tileImg.w}×${tileImg.h}`, opaque: Math.round(s * 100), key }
}

if (String(process.argv[1] || '').endsWith('townPrep.mjs')) {
  let bad = 0
  for (const spec of CHOSEN) {
    try {
      const r = prepareOne(spec)
      console.log(`${r.out}: ${r.size}, непрозрачно ${r.opaque} %, `
        + `фон набора был (${r.key.r},${r.key.g},${r.key.b})`)
    } catch (e) {
      bad++
      console.log(`${spec.out}: ПРОПУЩЕН — ${e.message}`)
    }
  }
  if (bad) process.exitCode = 1
}