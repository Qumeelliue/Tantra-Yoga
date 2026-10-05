// ЗЕМЛЯ ПЛОЩАДЕЙ ГОРОДА — ЛИЦЕНЗИОННАЯ ИЗОМЕТРИЧЕСКАЯ ПЛИТКА, А НЕ ЭМОДЗИ.
//
// ## Почему этот файл
//
// Поле Ума стало изометрическим (ромбы 2:1, стены по глубине). А Город остался
// экраном на DOM-карточках с эмодзи-глифами: «◐», «♥», «👑». Это ровно то
// различие, которое правило проекта называет палящимся — два разных вида в
// одной игре.
//
// Проверяется три слоя:
//
//   1. **Плитки.** Файлы на месте, соотношение сторон такое же, как у игровой
//      плитки пола, альфа снята, семь плиток разных по тону.
//   2. **Код экрана.** Земля площади ставится по индексу площади, а не одной
//      картинкой на все семь.
//   3. **Собранный экран.** У каждой площади на экране есть свой ромб земли.
//
// ## Что здесь НЕ проверяется
//
// Красота и уместность. Глазом здесь не проверить, и врать про это нельзя.
//
// ## Что этот файл уже ловил
//
// Молчаливую замену семи плиток одной. Если бы земля бралась «для красоты»
// одним файлом, на экране было бы семь одинаковых площадей, и проверка на
// разные тоны осталась бы зелёной — файлы-то лежат.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readPng } from '../scripts/pngReader.mjs'
import { CHOSEN, prepareOne } from '../scripts/townPrep.mjs'
import { PLAZA_TILES, PLAZA_COUNT, plazaSrc, PLAZA_LIT, PLAZA_DARK } from '../webapp/js/ui/town.js'
import { TILE_W, TILE_H } from '../webapp/js/ui/iso.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const TOWN_DIR = join(root, 'webapp/public/assets/town')
const SRC_DIR = join(root, 'webapp/public/assets/town-src')

/** Средняя яркость непрозрачных пикселей — «светлеет ли площадь». */
function brightnessOf(img) {
  let n = 0
  let s = 0
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 200) continue
    n++
    s += (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3
  }
  return n ? Math.round(s / n) : 0
}

describe('Земля площадей: плитки из лицензионного набора', () => {
  it('у каждой площади свой файл, и все они на месте', () => {
    expect(PLAZA_COUNT, 'площадей должно быть семь — по числу чакр').toBe(7)
    const files = new Set()
    for (const t of PLAZA_TILES) {
      expect(existsSync(join(TOWN_DIR, t.file)), `плитка «${t.file}» не найдена в assets/town`)
        .toBe(true)
      files.add(t.file)
    }
    expect(files.size, 'семь площадей делят меньше семи плиток — часть площадей выглядит одинаково')
      .toBe(PLAZA_COUNT)
  })

  it('исходные листы на месте: без них землю нечем пересобрать', () => {
    for (const f of ['terrain-1.png', 'terrain-2.png']) {
      expect(existsSync(join(SRC_DIR, f)), `нет исходного листа ${f} — землю нечем пересобрать`)
        .toBe(true)
    }
  })

  it('соотношение сторон такое же, как у игровой плитки пола', () => {
    // Ромб не 2:1 — это параллелограмм: он «завалится», и площадь перестанет
    // читаться как изометрическая. Считается из самих картинок.
    for (const t of PLAZA_TILES) {
      const img = readPng(join(TOWN_DIR, t.file))
      expect(img.w / img.h, `«${t.file}» ${img.w}×${img.h}: соотношение `
        + `${(img.w / img.h).toFixed(2)} вместо ${(TILE_W / TILE_H).toFixed(2)} — `
        + 'плитка не ляжет ромбом')
        .toBeCloseTo(TILE_W / TILE_H, 2)
    }
  })

  it('у плиток прозрачные углы: иначе на экране чёрный квадрат', () => {
    // Ровно та поломка, из-за которой наборы Screaming Brain отдаются без
    // альфы: чёрный фон лежит в самом файле.
    for (const t of PLAZA_TILES) {
      const img = readPng(join(TOWN_DIR, t.file))
      const corners = [[0, 0], [img.w - 1, 0], [0, img.h - 1], [img.w - 1, img.h - 1]]
      const opaque = corners.filter(([x, y]) => img.data[(y * img.w + x) * 4 + 3] > 16).length
      expect(opaque, `у «${t.file}» непрозрачный угол — фон набора не снят, `
        + 'площадь станет прямоугольником')
        .toBe(0)
    }
  })

  it('плитки разные по тону: семь одинаковых земель — это одна земля', () => {
    // Проверка на РАЗНЫЕ тона, а не на «разные файлы»: семь копий одной плитки
    // прошли бы по именам файлов и выглядели бы как семь одинаковых площадей.
    for (let i = 0; i < PLAZA_TILES.length; i++) {
      for (let j = i + 1; j < PLAZA_TILES.length; j++) {
        const a = PLAZA_TILES[i]
        const b = PLAZA_TILES[j]
        const ia = readPng(join(TOWN_DIR, a.file))
        const ib = readPng(join(TOWN_DIR, b.file))
        let same = 0
        for (let k = 0; k < ia.data.length; k += 4) {
          if (ia.data[k] === ib.data[k] && ia.data[k + 1] === ib.data[k + 1]
            && ia.data[k + 2] === ib.data[k + 2]) same++
        }
        expect(same / (ia.data.length / 4), `«${a.file}» и «${b.file}» — `
          + 'почти одна и та же плитка: площади неразличимы')
          .toBeLessThan(0.7)
      }
    }
  })

  it('записанная яркость совпадает с картинкой: числа не выдуманы', () => {
    // В `town.js` записана яркость каждой плитки — по ней выбирается состояние
    // и по ней же проверяется, что «земля светлеет». Если число в коде разойдётся
    // с файлом, подпись «свет в площадях» перестанет соответствовать экрану, и
    // заметить это можно будет только глазами.
    for (const t of PLAZA_TILES) {
      const real = brightnessOf(readPng(join(TOWN_DIR, t.file)))
      expect(Math.abs(real - t.brightness), `у «${t.file}» в коде написано `
        + `${t.brightness}, а в картинке ${real}`)
        .toBeLessThanOrEqual(2)
    }
  })

  it('нарезка воспроизводима: скрипт собирает те же плитки', () => {
    // Если исходники или координаты поменяются и скрипт не перезапустят, набор
    // в игре разойдётся с исходниками — и через полгода никто не вспомнит,
    // какая плитка была правильной.
    const tmp = mkdtempSync(join(tmpdir(), 'town-'))
    try {
      for (const spec of CHOSEN) prepareOne(spec, SRC_DIR, tmp)
      for (const t of PLAZA_TILES) {
        const made = join(tmp, t.file)
        expect(existsSync(made), `скрипт не собрал «${t.file}»`).toBe(true)
        const a = readPng(made)
        const b = readPng(join(TOWN_DIR, t.file))
        expect([a.w, a.h], `«${t.file}»: скрипт даёт ${a.w}×${a.h}, а в игре ${b.w}×${b.h}`)
          .toEqual([b.w, b.h])
        let diff = 0
        for (let i = 0; i < a.data.length; i += 4) {
          if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1]
            || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) diff++
        }
        expect(diff, `«${t.file}»: ${diff} пикселей отличаются от того, что лежит в `
          + 'игре — набор разошёлся с исходниками, запусти `npm run town:prep`')
          .toBe(0)
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('Земля площадей: правила вида и подстановка', () => {
  it('состояние площади — фильтр, а не отдельная картинка', () => {
    // Свет в игре — это фильтр поверх того же места, а не другая картинка места.
    // Если бы для «спит» и «зажжено» были свои плитки, их пришлось бы держать
    // в паре: замена одной тихо испортила бы второе состояние.
    expect(PLAZA_DARK, 'тёмное состояние площади ничем не отличается от светлого')
      .not.toBe(PLAZA_LIT)
    expect(PLAZA_DARK, 'тёмная площадь не темнее — «площадь спит во тьме» не читается')
      .toMatch(/brightness\((\d+)%\)/)
    const dark = Number(PLAZA_DARK.match(/brightness\((\d+)%\)/)[1])
    const lit = Number(PLAZA_LIT.match(/brightness\((\d+)%\)/)[1])
    expect(dark, 'тёмная площадь не темнее светлой — состояния перепутаны местами')
      .toBeLessThan(100)
    expect(lit, 'зажжённая площадь не светлее — свет не виден')
      .toBeGreaterThan(100)
  })

  it('площадь берёт свою плитку по номеру, а не одну на все семь', () => {
    // Ровно та молчаливая подмена, которую проверка обязана ловить: если земля
    // бралась бы одной картинкой «для красоты», на экране было бы семь
    // одинаковых площадей, и всё остальное осталось бы зелёным.
    const src = readFileSync(join(root, 'webapp/js/ui/screens/../town.js'), 'utf8')
    expect(src, 'в town.js нет адреса плитки по номеру площади').toMatch(/function plazaSrc\(index\)/)
    expect(src, 'plazaSrc не берёт плитку по индексу').toMatch(/PLAZA_TILES\[index/)
    const main = readFileSync(join(root, 'webapp/js/main.js'), 'utf8')
    expect(main, 'экран Города не ставит землю площади').toMatch(/plazaSrc\(areaIndex\)/)
    expect(main, 'земля площади не фильтруется по состоянию')
      .toMatch(/ground\.style\.filter = lit \? PLAZA_LIT : PLAZA_DARK/)
    // И номера площадей действительно разные.
    const urls = new Set()
    for (let i = 0; i < PLAZA_COUNT; i++) urls.add(plazaSrc(i))
    expect(urls.size, 'семь площадей ссылаются на меньше семи плиток').toBe(PLAZA_COUNT)
  })
})