// ПРОЗРАЧНОСТЬ ИЗОМЕТРИЧЕСКОГО НАБОРА: ЧЁРНЫЙ ФОН → АЛЬФА.
//
// ## Зачем
//
// Наборы Screaming Brain (CC0) отдаются в PNG **без альфа-канала**: ромб плитки
// лежит на чёрном фоне, и цвет прозрачности записан в файле `.tsx` строкой
// `trans="000000"`. Пока альфы нет, девять ромбов склеиваются в сплошной
// квадрат 128×64, и пол комнаты становится прямоугольной кашей.
//
// Значит, прозрачность надо привести один раз к настоящему виду — здесь. Файл
// переписывается на месте, один раз, и дальше набор читается как любой другой.
//
// ## Почему порог 12, а не «любой не-чёрный»
//
// Порог 12 выбран не на глаз, а по замеру: у всех девяти ромбов ровно 50 %
// пикселей — то есть ровно половина ромба, и это самый честный признак «плитка
// правильной формы». Внутри ромба есть и почти чёрные пиксели (тени в кладке),
// и если бы порог был 0, они стали бы дырками в полу. Проверяется в
// `tests/isoPrep.test.js`: после перевода доля непрозрачных пикселей в каждой
// из девяти плиток обязана остаться около 50 %.
//
// Файл результата НЕ коммитится вслепую: скрипт печатает, что получилось, и
// падает, если доля непрозрачных пикселей поехала.

import { readPng } from './pngReader.mjs'
import { writePng } from './pngWriter.mjs'

/** Порог «это не фон». См. объяснение в шапке. */
const KEY = 12

/** Файлы, которые нужно перевести. Путь → сколько плиток 128×64 в листе. */
const FILES = [
  { file: 'webapp/public/assets/iso/floor-tiled.png', cols: 3, rows: 3 },
  { file: 'webapp/public/assets/iso/floor-wood.png', cols: 3, rows: 3 },
]

const opaqueShare = (img) => {
  let op = 0
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 200) op++
  return op / (img.w * img.h)
}

/** Доля непрозрачных пикселей в одной плитке 128×64. */
const share = (img, col, row) => {
  let op = 0
  let tot = 0
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 128; x++) {
      const px = ((row * 64 + y) * img.w + col * 128 + x) * 4
      tot++
      if (img.data[px + 3] > 200) op++
    }
  }
  return op / tot
}

const prep = ({ file, cols, rows }) => {
  const img = readPng(file)
  const before = opaqueShare(img)
  const data = img.data
  for (let i = 0; i < data.length; i += 4) {
    const dark = data[i] <= KEY && data[i + 1] <= KEY && data[i + 2] <= KEY
    data[i + 3] = dark ? 0 : 255
  }
  const after = opaqueShare(img)
  // Ромб занимает ровно половину квадрата 128×64. Если после перевода это не так,
  // значит порог выбран неверно и пол придётся чинить глазами — а глазом здесь
  // не проверить. Поэтому падаем.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Имя не `share`: `const share = share(...)` — это обращение к самой себе
      // во время объявления, и Node падает с «Cannot access before
      // initialization». Выглядит как ерунда, стоит минуты молчания.
      const part = share(img, c, r)
      if (part < 0.4 || part > 0.6) {
        throw new Error(`плитка ${c},${r} в ${file}: после перевода непрозрачно ${Math.round(part * 100)} %, `
          + 'ожидалось около 50 % — порог прозрачности выбран неверно')
      }
    }
  }
  writePng(file, img.w, img.h, data)
  return { file, size: `${img.w}×${img.h}`, before: Math.round(before * 100), after: Math.round(after * 100) }
}

// Сверка путей через `import.meta.url` здесь не годится: путь к проекту
// содержит пробел (`Tantra The Game`), и он приходит закодированным как
// `%20`. Из-за этого скрипт молча ничего не делал — файл оставался без альфы,
// а проверка его размера проходила. Сверяем по имени файла.
if (String(process.argv[1] || '').endsWith('isoPrep.mjs')) {
  for (const f of FILES) {
    try {
      const r = prep(f)
      console.log(`${r.file}: ${r.size}, непрозрачно было ${r.before} %, стало ${r.after} %`)
    } catch (e) {
      console.log(`${f.file}: ПРОПУЩЕН — ${e.message}`)
    }
  }
}

export { prep, FILES }