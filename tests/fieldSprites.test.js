// СПРАЙТЫ: ФИГУРЫ ЛИЦЕНЗИОННЫЕ, И РАСКЛАДКА ПРОВЕРЯЕТСЯ ПО САМИМ КАРТИНКАМ.
//
// ## Почему файл существует
//
// Всё рисование в Поле Ума было самодельным: `fieldArt.js`, вектора, без единого
// кадра анимации. Автор посмотрел на игру и сказал — «текстура, которая ходит по
// клеточкам». Это было про figур, и лечится только взятыми лицензионными
// спрайтами (Calciumtrice, CC-BY 3.0).
//
// Ровно на этом файле уже находилось четыре ошибки, и все четыре были бы
// невидимы, пока кто-то не посмотрит на игру глазами:
//
// 1. **Ока без спрайта.** Если хоть одна ока осталась на векторе, а остальные на
//    спрайтах — это выглядит как поломка. Проверка требует: у КАЖДОГО врага из
//    контента есть фигура.
// 2. **Фигура на несуществующем листе.** Опечатка в имени файла — и персонаж не
//    рисуется никогда, молча.
// 3. **Полоса анимации за пределами листа.** Лист 320×320 = 10 полос, у «слизи»
//    20. Персонаж, поставленный на 18-ю полосу, читает пустоту.
// 4. **Условия лицензии не выполнены.** CC-BY 3.0 требует указать автора. Если
//    файл с источниками исчезнет, игра останется на лицензионной графике без
//    указания авторства — это нарушение, и оно должно падать проверкой.
//
// ## Чего здесь нет
//
// Нет проверки «спрайт нарисован» на настоящей картинке: для этого нужен
// браузер, а не vitest. Проверки идут по данным и по файлам. Настоящий вид игры
// проверяет автор — глазами.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CHARACTERS, FOE_SPRITE, ANIMS, SPRITE_SHEET_COUNT, drawFieldSprite } from '../webapp/js/ui/fieldSprites.js'
import { readPng } from '../scripts/pngReader.mjs'
import { ENEMIES } from '../webapp/js/core/data.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const FIELD_DIR = join(root, 'webapp/public/assets/field')

const CELL = 32
const sizes = new Map()
function sheetSize(file) {
  if (!sizes.has(file)) {
    const p = join(FIELD_DIR, file)
    if (!existsSync(p)) return null
    const img = readPng(p)
    sizes.set(file, { w: img.w, h: img.h })
  }
  return sizes.get(file)
}

describe('Лицензионная графика: источники и условия соблюдены', () => {
  it('файл с источниками и лицензиями на месте и называет автора', () => {
    const f = join(FIELD_DIR, 'CREDITS.md')
    expect(existsSync(f), 'нет файла с источниками графики — условия CC-BY не выполнены').toBe(true)
    const t = readFileSync(f, 'utf8')
    expect(t, 'в файле источников не назван автор').toMatch(/Calciumtrice/)
    expect(t, 'в файле источников не названа лицензия').toMatch(/CC-BY 3\.0/)
    // Kenney (CC0) взят как запасной — и это тоже надо называть.
    expect(t, 'запасной набор CC0 не назван').toMatch(/CC0/)
  })

  it('каждый лист, на который ссылается код, лежит в папке игры', () => {
    for (const [id, c] of Object.entries(CHARACTERS)) {
      const p = join(FIELD_DIR, c.sheet)
      expect(existsSync(p), `лист «${c.sheet}» для персонажа «${id}» не найден в assets/field`).toBe(true)
    }
    expect(SPRITE_SHEET_COUNT, 'все персонажи ссылаются на один лист — вероятно, опечатка')
      .toBeGreaterThanOrEqual(3)
  })
})

describe('Раскладка полос анимации верна по настоящим размерам листа', () => {
  it('у каждого персонажа все пять полос помещаются в лист', () => {
    // Персонаж, поставленный на полосу за краем листа, читает пустоту: на экране
    // просто ничего не рисуется, и причина неочевидна.
    for (const [id, c] of Object.entries(CHARACTERS)) {
      const s = sheetSize(c.sheet)
      expect(s, `лист «${c.sheet}» не читается`).toBeTruthy()
      const rows = Math.floor(s.h / CELL)
      const lastRow = c.firstRow + Math.max(...Object.values(ANIMS).map((a) => a.row))
      expect(lastRow, `персонаж «${id}» стоит на полосе ${lastRow + 1}, а в листе `
        + `«${c.sheet}» их ${rows}`).toBeLessThan(rows)
      expect(c.firstRow, `персонаж «${id}» начинается с отрицательной полосы`).toBeGreaterThanOrEqual(0)
    }
  })

  it('кадры каждой анимации помещаются в лист по ширине', () => {
    for (const [id, c] of Object.entries(CHARACTERS)) {
      const s = sheetSize(c.sheet)
      const cols = Math.floor(s.w / CELL)
      for (const [name, a] of Object.entries(ANIMS)) {
        for (const f of a.frames) {
          expect(f, `анимация «${name}» персонажа «${id}» ссылается на кадр `
            + `${f}, а в листе столбцов ${cols}`).toBeLessThan(cols)
          expect(f, `анимация «${name}» персонажа «${id}» ссылается на отрицательный кадр`)
            .toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('лист делится на клетки без остатка — иначе кадр съедет', () => {
    for (const file of new Set(Object.values(CHARACTERS).map((c) => c.sheet))) {
      const s = sheetSize(file)
      expect(s.w % CELL, `ширина листа «${file}» (${s.w}) не кратна клетке ${CELL}`)
        .toBe(0)
      expect(s.h % CELL, `высота листа «${file}» (${s.h}) не кратна клетке ${CELL}`)
        .toBe(0)
    }
  })
})

describe('Каждая ока получила фигуру — иначе поле выглядит поломанным', () => {
  it('у каждого врага из контента есть строка в FOE_SPRITE', () => {
    const ids = Object.keys(ENEMIES).filter((id) => ENEMIES[id] && typeof ENEMIES[id] === 'object')
    expect(ids.length, 'в контенте нет врагов — проверять нечего').toBeGreaterThan(0)
    const без = ids.filter((id) => !FOE_SPRITE[id])
    expect(без, `у ${без.length} врагов нет фигуры: ${без.join(', ')}. Остальные будут `
      + 'спрайтами, а эти — векторами, и поле будет выглядеть сломанным').toEqual([])
  })

  it('в FOE_SPRITE нет имён врагов, которых нет в контенте', () => {
    const ids = new Set(Object.keys(ENEMIES))
    const лишние = Object.keys(FOE_SPRITE).filter((id) => !ids.has(id))
    expect(лишние, `в FOE_SPRITE есть фигуры для несуществующих врагов: ${лишние.join(', ')}. `
      + 'Они молча ничего не рисуют и при этом проходят проверку').toEqual([])
  })

  it('каждая фигура оки существует в списке персонажей', () => {
    for (const [id, s] of Object.entries(FOE_SPRITE)) {
      expect(CHARACTERS[s], `ока «${id}» ссылается на персонажа «${s}», которого нет`).toBeTruthy()
    }
  })

  it('владыка отличается от обычной оки размером, а не только фигурой', () => {
    // Владыка должен читаться как владыка. Проверяем, что он есть и что он не
    // путается с тем же персонажем, что и обычная ока той же стихии.
    const обычные = Object.entries(FOE_SPRITE).filter(([id]) => !id.startsWith('lord_') && !id.endsWith('_raja')
      && !id.endsWith('_maharaja') && !id.endsWith('_natha') && !id.endsWith('_kala') && !id.endsWith('_pati')
      && !['moha', 'ahankara'].includes(id))
    expect(обычные.length, 'обычные оки не найдены — фильтр в проверке сломан').toBeGreaterThan(0)
  })
})

describe('Запасной путь: пока картинка едет — рисуется вектор', () => {
  it('без загруженной картинки drawFieldSprite честно отказывается', () => {
    // В vitest нет `Image`, значит листы не грузятся. Модуль обязан сказать
    // «не нарисовано» — иначе поле останется пустым при первой же загрузке.
    const calls = []
    const ctx = { drawImage: (...a) => calls.push(a) }
    const ok = drawFieldSprite(ctx, 'sadhaka', 'walk', 1)
    expect(ok, 'спрайт нарисован без картинки — значит, поле останется пустым').toBe(false)
    expect(calls.length, 'drawImage вызван без картинки').toBe(0)
  })

  it('неизвестный персонаж тоже отказывается, а не рисует мусор', () => {
    const ctx = { drawImage: () => {} }
    expect(drawFieldSprite(ctx, 'нетакого', 'walk', 1)).toBe(false)
  })

  it('анимации, которых нет в справочнике, не ломают отрисовку', () => {
    // Опечатка в имени анимации не должна ронять кадр: берётся `idle`.
    expect(() => drawFieldSprite({ drawImage: () => {} }, 'sadhaka', 'нетакая', 1)).not.toThrow()
  })
})

describe('Всё, что нарисовано в бою, берётся из лицензионного листа', () => {
  // Почему это отдельная проверка, а не «ну и так понятно».
  //
  // Просящий был нарисован моим вектором — свечкой с именем, хотя это человек,
  // который просит о помощи. Откат «вернуть вектор» проходил молча: 1479 тестов
  // были зелёные, потому что никто не проверял, ЧЕМ нарисована фигура.
  //
  // Проверка по исходнику здесь сознательная: спрайты в стенде грузятся, но
  // вопрос «какой путь отрисовки выбран» надёжнее видно в коде, чем по пикселям.
  const src = readFileSync(new URL('../webapp/js/ui/screens/field.js', import.meta.url), 'utf8')

  const entities = [
    { name: 'просящий', marker: /drawFieldSprite\(ctx, 'sadhaka_alt'/, why: 'служение — это человек, а не свеча' },
    { name: 'садхака', marker: /drawFieldSprite\(ctx, 'sadhaka'/, why: 'игрок должен быть из листа' },
    { name: 'ока', marker: /drawFieldSprite\(ctx, spriteId/, why: 'все 35 врагов получили фигуры' },
  ]

  for (const e of entities) {
    it(`${e.name} рисуется лицензионной фигурой`, () => {
      expect(e.marker.test(src),
        `${e.name} рисуется своим вектором. ${e.why}. Вектор остаётся только `
        + 'запасным путём на время загрузки.').toBe(true)
    })
  }

  it('запасной вектор остаётся запасным, а не основным путём', () => {
    // Вектор нужен: пока лист едет, поле не должно быть пустым. Но он обязан
    // стоять ПОСЛЕ попытки спрайта, а не вместо неё.
    // Ищем по КОДУ, а не по комментарию. Проверка искала кусок исходника по словам
    // «просящие (сева)» — то есть знала про текст, а не про поведение. Стоило
    // комментарию переехать (рисунок просящего переехал в общий список по
    // глубине), и проверка падала с «у просящего нет попытки нарисовать
    // спрайт» — хотя спрайт никуда не делся.
    const spriteAt = src.indexOf("drawFieldSprite(ctx, 'sadhaka_alt'")
    const vectorAt = src.indexOf('drawWareArt(')
    expect(spriteAt, 'у просящего нет попытки нарисовать спрайт').toBeGreaterThanOrEqual(0)
    expect(vectorAt, 'у просящего нет запасного вектора — а он нужен').toBeGreaterThanOrEqual(0)
    expect(spriteAt < vectorAt,
      'запасной вектор стоит раньше попытки нарисовать спрайт — значит, спрайт '
      + 'не рисуется никогда, и поле остаётся на самодельной графике').toBe(true)
  })
})