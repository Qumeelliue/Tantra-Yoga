// ДОМА ПЛОЩАДЕЙ ГОРОДА: НА ЗЕМЛЕ СТОИТ ДОМ, А НЕ ЭМОДЗИ.
//
// ## Почему этот файл
//
// Земля площадей уже была изометрической, а на ней ничего не стояло: игрок
// видел семь плиток земли и эмодзи-глиф. Дом собран скриптом
// (`scripts/townHouses.mjs`, `npm run houses:prep`) из того же лицензионного
// набора, что и земля комнаты: две стены и крыша на участке 2×2.
//
// Проверяется три слоя:
//
//   1. **Файлы.** Семь участков, один холст, края прозрачные (ничего не
//      обрезано), над землёй есть дом.
//   2. **Сборка.** `composePlot` даёт ровно те файлы, что лежат в игре, и сам
//      падает, если кромки стены или крыши уехали от замера.
//   3. **Код экрана.** Участок ставится по номеру площади, состояние — фильтр,
//      глифов на экране больше нет.
//
// ## Что здесь НЕ проверяется
//
// Красота. Глазом здесь не проверить, и врать про это нельзя.
//
// ## Что этот файл ловит
//
//   1. Дом, «уехавший» с земли (крыша или стены сдвинуты на пару пикселей —
//      на глаз это заметно, а проверке видно числом).
//   2. Участок, обрезанный холстом: у набора есть крыши выше прочих, и тесный
//      холст срезал бы верхушку молча.
//   3. Возврат эмодзи-глифов вместо дома.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readPng } from '../scripts/pngReader.mjs'
import {
  HOUSES, CANVAS, BY, composePlot, luminance,
} from '../scripts/townHouses.mjs'
import { PLOT_TILES, PLOT_COUNT, plotSrc, PLAZA_LIT, PLAZA_DARK } from '../webapp/js/ui/town.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const TOWN_DIR = join(root, 'webapp/public/assets/town')
const SRC_DIR = join(root, 'webapp/public/assets/town-src')

describe('Дома площадей: участки собраны', () => {
  it('у каждой площади свой участок, и все семь на месте', () => {
    expect(PLOT_COUNT, 'площадей должно быть семь — по числу чакр').toBe(7)
    const files = new Set()
    for (const t of PLOT_TILES) {
      expect(existsSync(join(TOWN_DIR, t.file)), `участок «${t.file}» не найден в assets/town`)
        .toBe(true)
      expect(existsSync(join(TOWN_DIR, t.ground)), `земля «${t.ground}» под участком не найдена`)
        .toBe(true)
      files.add(t.file)
    }
    expect(files.size, 'семь площадей делят меньше семи участков — часть площадей выглядит одинаково')
      .toBe(PLOT_COUNT)
  })

  it('исходные листы домов и крыш на месте: без них дом нечем пересобрать', () => {
    for (const f of ['buildings-1.png', 'buildings-2.png', 'buildings-3.png', 'roofing-1.png']) {
      expect(existsSync(join(SRC_DIR, f)), `нет исходного листа ${f} — дом нечем пересобрать`)
        .toBe(true)
    }
  })

  it('у всех участков один холст: сетка площадей не поедет по высоте', () => {
    // Разные холсты при одинаковой ширине карточки дали бы разные высоты, и
    // сетка Города «поехала» бы. Один холст — одно место у всех.
    for (const t of PLOT_TILES) {
      const img = readPng(join(TOWN_DIR, t.file))
      expect([img.w, img.h], `«${t.file}» ${img.w}×${img.h}, а холст участка `
        + `${CANVAS.w}×${CANVAS.h} — сетка поедет`)
        .toEqual([CANVAS.w, CANVAS.h])
    }
  })

  it('участок не обрезан: по всем четырём краям прозрачная полоса', () => {
    // Крыши набора разной высоты. Тесный холст срезал бы верхушку молча: на
    // экране это читалось бы как «так и надо».
    for (const t of PLOT_TILES) {
      const img = readPng(join(TOWN_DIR, t.file))
      for (let x = 0; x < img.w; x++) {
        expect(img.data[x * 4 + 3], `«${t.file}» касается верхнего края (x=${x})`).toBe(0)
        expect(img.data[((img.h - 1) * img.w + x) * 4 + 3], `«${t.file}» касается нижнего края`)
          .toBe(0)
      }
      for (let y = 0; y < img.h; y++) {
        expect(img.data[(y * img.w) * 4 + 3], `«${t.file}» касается левого края (y=${y})`).toBe(0)
        expect(img.data[(y * img.w + img.w - 1) * 4 + 3], `«${t.file}» касается правого края`)
          .toBe(0)
      }
    }
  })

  it('на участке есть дом над землёй, а не только земля', () => {
    // Дом стоит на задней плите: выше её верхнего угла (BY) стены и крыша
    // обязаны быть. У голой земли там пусто, и «дом есть» было бы ложью.
    for (const t of PLOT_TILES) {
      const img = readPng(join(TOWN_DIR, t.file))
      let house = 0
      for (let y = 0; y < BY; y++) {
        for (let x = 0; x < img.w; x++) if (img.data[(y * img.w + x) * 4 + 3]) house++
      }
      expect(house, `«${t.file}»: над землёй ${house} пикселей дома — дом не собрался`)
        .toBeGreaterThan(1500)
    }
  })

  it('записанная яркость совпадает с картинкой: числа не выдуманы', () => {
    // В `town.js` записана яркость каждого участка — от неё зависит, что значит
    // «площадь светлеет». Если число разойдётся с файлом, подпись перестанет
    // соответствовать экрану, и заметить это можно будет только глазами.
    for (const t of PLOT_TILES) {
      const real = Math.round(luminance(readPng(join(TOWN_DIR, t.file))))
      expect(Math.abs(real - t.brightness), `у «${t.file}» в коде написано `
        + `${t.brightness}, а в картинке ${real}`)
        .toBeLessThanOrEqual(2)
    }
  })

  it('участки разные: семь одинаковых домов — это один дом', () => {
    for (let i = 0; i < PLOT_TILES.length; i++) {
      for (let j = i + 1; j < PLOT_TILES.length; j++) {
        const a = PLOT_TILES[i]
        const b = PLOT_TILES[j]
        const ia = readPng(join(TOWN_DIR, a.file))
        const ib = readPng(join(TOWN_DIR, b.file))
        let same = 0
        for (let k = 0; k < ia.data.length; k += 4) {
          if (ia.data[k] === ib.data[k] && ia.data[k + 1] === ib.data[k + 1]
            && ia.data[k + 2] === ib.data[k + 2]) same++
        }
        expect(same / (ia.data.length / 4), `«${a.file}» и «${b.file}» — `
          + 'почти один и тот же участок: площади неразличимы')
          .toBeLessThan(0.7)
      }
    }
  })

  it('на каждую площадь — свой дом: семь сборок, а не одна на всех', () => {
    // Спецификация сборки: если бы один дом поставили на все семь площадей,
    // различие осталось бы только в земле, и «у каждой площади свой дом» было
    // бы неправдой.
    const keys = HOUSES.map((h) => `${h.sh}-${h.pair}-${h.st}`)
    expect(new Set(keys).size, `домов ${new Set(keys).size} на ${keys.length} площадей — кто-то делит дом`)
      .toBe(HOUSES.length)
    expect(HOUSES.length, 'сборок домов должно быть семь').toBe(PLOT_COUNT)
  })
})

describe('Дома площадей: сборка воспроизводима', () => {
  it('composePlot собирает ровно те участки, что лежат в игре', () => {
    // Если исходники или координаты поменяются и скрипт не перезапустят, участки
    // в игре разойдутся с исходниками — и через полгода никто не вспомнит, где
    // был дом. Проверка пересобирает файл заново байт в байт.
    HOUSES.forEach((spec, i) => {
      const made = composePlot(spec, i)
      const live = readPng(join(TOWN_DIR, `plot-${i + 1}.png`))
      expect([made.w, made.h], `plot-${i + 1}.png: сборка даёт ${made.w}×${made.h}`)
        .toEqual([live.w, live.h])
      let diff = 0
      for (let k = 0; k < made.data.length; k += 4) {
        if (made.data[k] !== live.data[k] || made.data[k + 1] !== live.data[k + 1]
          || made.data[k + 2] !== live.data[k + 2] || made.data[k + 3] !== live.data[k + 3]) diff++
      }
      expect(diff, `plot-${i + 1}.png: ${diff} пикселей отличаются от сборки — `
        + 'запусти `npm run houses:prep`')
        .toBe(0)
    })
  })
})

describe('Дома площадей: подстановка на экране', () => {
  it('участок ставится по номеру площади, а не одной картинкой на все семь', () => {
    const src = readFileSync(join(root, 'webapp/js/ui/town.js'), 'utf8')
    expect(src, 'в town.js нет адреса участка по номеру площади').toMatch(/function plotSrc\(index\)/)
    expect(src, 'plotSrc не берёт участок по индексу').toMatch(/PLOT_TILES\[index/)
    const main = readFileSync(join(root, 'webapp/js/main.js'), 'utf8')
    expect(main, 'экран Города не ставит участок площади').toMatch(/plotSrc\(areaIndex\)/)
    expect(main, 'участок площади не фильтруется по состоянию')
      .toMatch(/plot\.style\.filter = lit \? PLAZA_LIT : PLAZA_DARK/)
    const urls = new Set()
    for (let i = 0; i < PLOT_COUNT; i++) urls.add(plotSrc(i))
    expect(urls.size, 'семь площадей ссылаются на меньше семи участков').toBe(PLOT_COUNT)
  })

  it('эмодзи-глифы не вернулись на экран', () => {
    // Дом — это и есть знак площади. Глиф рядом с домом вернул бы «два разных
    // вида в одной игре», из-за которых экран и переделывался.
    const main = readFileSync(join(root, 'webapp/js/main.js'), 'utf8')
    expect(main, 'на экране Города снова эмодзи-глиф').not.toMatch(/city-area-glyph/)
    const css = readFileSync(join(root, 'webapp/css/main.css'), 'utf8')
    expect(css, 'в CSS остался стиль эмодзи-глифа').not.toMatch(/\.city-area-glyph/)
  })

  it('состояние площади — фильтр, а не отдельные картинки домов', () => {
    // Тот же закон, что и для земли: «спит» и «зажжено» — фильтр поверх одного
    // участка. Отдельные картинки пришлось бы держать в паре, и замена одной
    // молча испортила бы второе состояние.
    const dark = Number(PLAZA_DARK.match(/brightness\((\d+)%\)/)[1])
    const lit = Number(PLAZA_LIT.match(/brightness\((\d+)%\)/)[1])
    expect(dark, 'тёмная площадь не темнее светлой — состояния перепутаны')
      .toBeLessThan(100)
    expect(lit, 'зажжённая площадь не светлее — свет не виден').toBeGreaterThan(100)
    const main = readFileSync(join(root, 'webapp/js/main.js'), 'utf8')
    expect(main, 'у участка нет двух состояний: свет и тьма выглядят одинаково')
      .toMatch(/city-area-plot/)
  })
})
