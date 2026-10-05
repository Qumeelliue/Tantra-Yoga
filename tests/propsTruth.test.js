// РЕКВИЗИТ БОЯ — ЛИЦЕНЗИОННЫЙ, И НА КАДРЕ ИМЕННО КАРТИНКА.
//
// ## Почему этот файл
//
// Правило проекта: **рисунок лицензионный, если лицензионный взять можно**.
// Четыре предмета Поля Ума были нарисованы в коде, хотя наборы CC0 лежат рядом.
//
// Но проверка «файл с картинкой существует» — пустая. Ровно на этом месте уже
// пропадали с экрана дверь, фонтан и хаос: файлы были, модульные проверки были
// зелёные, а на кадре ничего не было. Модуль может быть верным, а экран — нет.
//
// Поэтому здесь ДВА слоя:
//
//   1. **Файлы и альфа.** Проверяется, что картинка на месте, что её углы
//      прозрачны (иначе на экране чёрный квадрат), и что соотношение сторон
//      совпадает с плиткой пола.
//
//   2. **Собранный экран.** Берётся настоящий кадр боя и смотрятся его
//      пиксели: у сокровища и у хаоса на экране должна стоять картинка из
//      набора, а не заливка из кода.
//
// ## Что здесь НЕ проверяется
//
// Нравится ли это автору. Глазом здесь не проверить, и врать про это нельзя.
//
// ## О чём этот файл уже ловил
//
//   1. **Нарезка без сдвига по горизонтали.** Доля непрозрачных была правильной
//      (50 %), а на выходе шла вертикальная полоса из одного пикселя. Доля
//      прошла, полоса — нет. Ловится только сравнением пикселей.
//   2. **Малиновый фон у воды.** Набор пишет «black or magenta backgrounds», и
//      первая версия ключила только чёрный: вода выходила малиновым квадратом
//      на 100 % непрозрачности.
//   3. **Куб вместо ромба.** У `dungeon.png` нет сетки (полосы идут с шага 74),
//      и окно 128×64 с шага 128 попадало на красный куб, а не на лаву. Хаос на
//      экране оказывался блоком, стоящим посреди ромбической комнаты.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readPng } from '../scripts/pngReader.mjs'
import { CHOSEN, prepareOne } from '../scripts/propPrep.mjs'
import { installDom, clickables, textOf, chooseLordIfShown } from './helpers/dom.js'
import { PROP_FILES, CUBE_LIFT } from '../webapp/js/ui/props.js'
import { roomIso, TILE_W as PROP_TILE_W, TILE_H as PROP_TILE_H } from '../webapp/js/ui/iso.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const PROPS_DIR = join(root, 'webapp/public/assets/props')
const SRC_DIR = join(root, 'webapp/public/assets/props-src')

/** Плитки-ромбы: их соотношение обязано совпадать с плиткой пола. */
const RHOMB_PROPS = ['water', 'lava', 'bloom']

describe('Реквизит: файлы, лицензия и прозрачность', () => {
  it('файл с источниками на месте и называет набор, автора и лицензию', () => {
    const f = join(PROPS_DIR, 'CREDITS.md')
    expect(existsSync(f), 'нет файла с источниками реквизита — условия CC0 не выполнены').toBe(true)
    const t = readFileSync(f, 'utf8')
    expect(t, 'в файле источников не назван автор').toMatch(/Screaming Brain Studios/)
    expect(t, 'в файле источников не назван второй автор').toMatch(/IKSLM/)
    expect(t, 'в файле источников не названа лицензия').toMatch(/CC0/)
  })

  it('каждая плитка, на которую ссылается код, лежит в папке игры', () => {
    for (const [name, file] of Object.entries(PROP_FILES)) {
      expect(existsSync(join(PROPS_DIR, file)), `плитка «${name}» (${file}) не найдена в assets/props`)
        .toBe(true)
    }
  })

  it('исходные листы на месте: без них реквизит нечем пересобрать', () => {
    // Нарезка воспроизводима: `npm run props:prep`. Если исходники удалены,
    // скрипт падает с «нет файла набора», и это лучше, чем молчаливая поломка.
    for (const f of ['crates-wood.png', 'temple-block.png', 'water.png', 'grass.png', 'dungeon.png']) {
      expect(existsSync(join(SRC_DIR, f)), `нет исходного листа ${f} — реквизит нечем пересобрать`)
        .toBe(true)
    }
  })

  it('у плиток-ромбов соотношение сторон такое же, как у плитки пола', () => {
    // Ромб не 2:1 — это не ромб, а параллелограмм: он не ляжет на пол ровно, и
    // предмет будет «перекошен». Считается из самих картинок, а не из кода.
    for (const name of RHOMB_PROPS) {
      const img = readPng(join(PROPS_DIR, PROP_FILES[name]))
      const ratio = img.w / img.h
      expect(ratio, `«${name}» ${img.w}×${img.h}: соотношение ${ratio.toFixed(2)} вместо `
        + `${(PROP_TILE_W / PROP_TILE_H).toFixed(2)} — плитка не ляжет на пол ромбом`)
        .toBeCloseTo(PROP_TILE_W / PROP_TILE_H, 1)
    }
  })

  it('в плитке нет остатков фона набора: ни одного непрозрачного чёрного', () => {
    // Ровно та поломка, из-за которой наборы Screaming Brain и отдаются без
    // альфы: чёрный фон лежит в самом файле. Если хоть один такой пиксель
    // остался непрозрачным, на экране будет чёрное пятно.
    //
    // Проверка на ВСЕХ пикселях, а не на углах: углы — частный случай, а
    // «камень» может быть тёмным и в середине плитки. Малиновый фон тоже
    // считается: набор пишет «black or magenta backgrounds», и вода приходит
    // именно с малиновым.
    for (const [name, file] of Object.entries(PROP_FILES)) {
      const img = readPng(join(PROPS_DIR, file))
      let left = 0
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i + 3] < 128) continue
        const dark = img.data[i] <= 14 && img.data[i + 1] <= 14 && img.data[i + 2] <= 14
        const magenta = img.data[i] > 240 && img.data[i + 1] <= 14 && img.data[i + 2] > 240
        if (dark || magenta) left++
      }
      expect(left, `у «${name}» (${file}) ${left} пикселей остались цвета фона набора — `
        + 'фон не снят, на экране будет чёрное (или малиновое) пятно')
        .toBe(0)
    }
  })

  it('у плиток, которые ложатся на пол, прозрачные углы', () => {
    // Три из пяти плиток — ромбы, а ромб 2:1 непрозрачен ровно наполовину, и
    // углы у него всегда пустые. Непрозрачный угол у ромба означает, что это
    // не ромб.
    //
    // Про кубы (ящики) и про `basin` этого не требуется: ящик — куб, а тумба
    // фонтана обрезана по фактическим пикселям, и у неё углы законно каменные.
    // Требовать прозрачные углы у куба было бы проверкой, которой игра не
    // обещает (AGENTS §9.1).
    for (const name of [...RHOMB_PROPS, 'chest', 'chestOpen']) {
      const img = readPng(join(PROPS_DIR, PROP_FILES[name]))
      const corners = [[0, 0], [img.w - 1, 0], [0, img.h - 1], [img.w - 1, img.h - 1]]
      const opaque = corners.filter(([x, y]) => img.data[(y * img.w + x) * 4 + 3] > 16).length
      expect(opaque, `у «${name}» (${PROP_FILES[name]}) непрозрачный угол — `
        + `${name === 'chest' || name === 'chestOpen' ? 'куб нарисован прямоугольником, а не кубом' : 'плитка не ляжет на пол ромбом'}`)
        .toBe(0)
    }
  })

  it('нарезка воспроизводима: скрипт собирает те же плитки', () => {
    // Правило без проверки — пожелание. Здесь скрипт запускается на тех же
    // исходниках, кладёт результат во временную папку и сравнивает с тем, что
    // лежит в игре, попиксельно.
    //
    // Это ловит молчаливую смену плитки: если кто-то поменяет координаты в
    // `propPrep.mjs` и забудет перезапустить, набор в игре разойдётся с
    // исходниками — и через полгода никто не вспомнит, какой ящик был правильным.
    const tmp = mkdtempSync(join(tmpdir(), 'props-'))
    try {
      for (const spec of CHOSEN) prepareOne(spec, SRC_DIR, tmp)
      for (const [name, file] of Object.entries(PROP_FILES)) {
        const made = join(tmp, file)
        expect(existsSync(made), `скрипт не собрал «${name}» (${file})`).toBe(true)
        const a = readPng(made)
        const b = readPng(join(PROPS_DIR, file))
        expect([a.w, a.h], `«${name}»: скрипт даёт ${a.w}×${a.h}, `
          + `а в игре ${b.w}×${b.h}`).toEqual([b.w, b.h])
        let diff = 0
        for (let i = 0; i < a.data.length; i += 4) {
          if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1]
            || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) diff++
        }
        expect(diff, `«${name}»: ${diff} пикселей отличаются от того, что лежит в игре — `
          + 'набор в игре разошёлся с исходниками, запусти `npm run props:prep`')
          .toBe(0)
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('плитка не пустая и не сплошная: внутри есть и фон, и предмет', () => {
    // Сплошная плитка — это фон, который не сняли. Пустая — это не тот кусок
    // листа. Обе ошибки не видны в размере файла.
    for (const [name, file] of Object.entries(PROP_FILES)) {
      const img = readPng(join(PROPS_DIR, file))
      let op = 0
      for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 128) op++
      const share = op / (img.w * img.h)
      expect(share, `«${name}»: непрозрачно ${(share * 100).toFixed(0)} % — `
        + 'похоже, что это не тот кусок листа')
        .toBeGreaterThan(0.1)
      expect(share, `«${name}»: непрозрачно ${(share * 100).toFixed(0)} % — `
        + 'фон набора не снят, плитка станет квадратом')
        .toBeLessThan(0.98)
    }
  })

  it('ящик целый и ящик разбитый — это РАЗНЫЕ картинки', () => {
    // Читаемость: игрок должен с порога комнаты отличить «ещё цел, можно
    // бить» от «уже разбит». Одна картинка с трещиной из штрихов читалась
    // хуже, чем две разные формы.
    expect(PROP_FILES.chest, 'целый и разбитый ящик — одна и та же картинка')
      .not.toBe(PROP_FILES.chestOpen)
    const a = readPng(join(PROPS_DIR, PROP_FILES.chest))
    const b = readPng(join(PROPS_DIR, PROP_FILES.chestOpen))
    expect([a.w, a.h]).toEqual([b.w, b.h])
    let same = 0
    let n = 0
    for (let i = 0; i < a.data.length; i += 4) {
      n++
      if (a.data[i] === b.data[i] && a.data[i + 1] === b.data[i + 1] && a.data[i + 2] === b.data[i + 2]) same++
    }
    expect(same / n, 'ящики попиксельно одинаковы — это одна картинка под двумя именами')
      .toBeLessThan(0.9)
  })
})

describe('Реквизит: правила вида, а не только файлы', () => {
  it('куб стоит на полу нижней гранью, а ромб ложится центром в точку на пол', () => {
    // Два разных правила, и их легко перепутать.
    //
    // РОМБ (лава, вода, трава) — это пятно НА полу: его центр в точке на полу.
    // КУБ (ящик) — стоит НА полу: его передняя нижняя вершина в точке на полу, а
    // сам он поднят на свою высоту.
    //
    // Число взято измерением самих картинок, а не из вкуса: у ящика 128×128
    // верхняя вершина на `y = 0`, нижняя на `y = 127`, то есть куб занимает
    // плитку целиком и касается пола последней строкой. Значит поднимать надо на
    // ВСЮ высоту. Первая версия брала половину — и ящик уезжал на полплитки
    // вниз, то есть тонул в полу; поймала проверка по нижнему краю на кадре.
    const box = readPng(join(PROPS_DIR, PROP_FILES.chest))
    let top = null
    let bot = null
    for (let y = 0; y < box.h; y++) {
      let n = 0
      for (let x = 0; x < box.w; x++) if (box.data[(y * box.w + x) * 4 + 3] > 128) n++
      if (n > 0) { if (top === null) top = y; bot = y }
    }
    expect(top, 'ящик пуст — нечего мерить').toBe(0)
    expect(bot, 'ящик не достаёт до нижней строки плитки: он короче плитки, '
      + 'и CUBE_LIFT перестанет значить "на всю высоту"')
      .toBe(box.h - 1)
    expect(CUBE_LIFT, 'куб не поднят над полом — ящик уйдёт в пол по передней грани')
      .toBeCloseTo(1, 5)
  })

  it('в коде экрана реквизит рисуется картинкой, а вектор — только запасным путём', () => {
    // Проверка по коду, а не по модулю: модуль может звать картинку, а экран —
    // не звать. Ровно так уже пропадали с экрана дверь, фонтан и хаос.
    const src = readFileSync(join(root, 'webapp/js/ui/screens/field.js'), 'utf8')
    for (const [what, marker] of [
      ['сокровище', /drawPropCube\(ctx, broken \? 'chestOpen' : 'chest'/],
      ['фонтан', /drawProp\(ctx, 'basin'/],
      ['вода фонтана', /drawProp\(ctx, 'water'/],
      ['хаос', /drawProp\(ctx, 'lava'/],
      ['трава на месте оковы', /drawProp\(ctx, 'bloom'/],
    ]) {
      expect(src, `${what}: на экране не рисуется лицензионная картинка`).toMatch(marker)
    }
    // Запасной путь обязан быть, иначе в первую долю секунды боя будет пусто.
    expect(src, 'у сокровища нет запасного вектора').toMatch(/if \(!boxDrawn\) drawPotArt\(ctx, o\)/)
    expect(src, 'у травы на месте оковы нет запасного вектора')
      .toMatch(/if \(!bloomDrawn\)/)
  })

  it('собственный рисунок остался только у света, а не у предметов', () => {
    // Золотой свет амбросии и фиолетовая дверь хаоса — исключение, и оно
    // записано словами в CREDITS и BASE-GAME. Проверка ловит молчаливое
    // возвращение: если кто-то снова нарисует фонтан целиком в коде, тут
    // станет зелёным, а предметы в комнате — снова чужими.
    const credits = readFileSync(join(PROPS_DIR, 'CREDITS.md'), 'utf8')
    expect(credits, 'в файле источников не сказано, что осталось своим рисунком')
      .toMatch(/свет/i)
    const base = readFileSync(join(root, 'design/BASE-GAME.md'), 'utf8')
    expect(base, 'в BASE-GAME нет записи о том, какие предметы остались лицензионными')
      .toMatch(/МЕХАНИКА 62/)
  })
})

// ── СОБРАННЫЙ ЭКРАН ────────────────────────────────────────────────────
//
// Дальше — не модули, а настоящий кадр. Всё, что выше, может быть верно, а
// на экране всё равно будет пусто: забытый `drawImage`, не тот холст, не
// дождавшаяся загрузка. Это уже случалось в этом проекте дважды.

const VIEW_W = 420
const VIEW_H = 640
const scr = () => dom.root.childNodes[dom.root.childNodes.length - 1]
const here_ = () => textOf(scr()).replace(/\s+/g, ' ').trim()
const tg = () => clickables(scr())
const st = () => globalThis.window.__field

function clickRe(re, what = '') {
  const el = tg().find((n) => re.test(textOf(n)))
  expect(el, `не нажалось: ${what}. экран: ${here_().slice(0, 140)}`).toBeTruthy()
  el.dispatch('click')
  dom.flushRaf(3)
}

function enterField() {
  for (let i = 0; i < 12; i++) {
    if (/Город спит/.test(here_())) break
    const on = tg().find((x) => /Понятно/.test(textOf(x)))
    if (on) { on.dispatch('click'); continue }
    if (tg().some((x) => /fbtn/.test(x.className || ''))) {
      const p = tg().find((x) => /pause/i.test(x.className || '') || /❚/.test(textOf(x))); if (!p) break
      p.dispatch('click')
      const l = tg().find((x) => /оставить забег/i.test(textOf(x))); if (!l) break
      l.dispatch('click')
      continue
    }
    const b = tg().find((x) => /← /.test(textOf(x))); if (!b) break
    b.dispatch('click')
  }
  clickRe(/В путь по миру/, 'с титула')
  clickRe(/Шудра/, 'выбор оружия')
  if (/Почерк/i.test(here_())) {
    const a = tg().find((x) => /wsel-card/.test(x.className || ''))
    if (a) a.dispatch('click')
  }
  if (/Фонтан|нефрит/i.test(here_())) {
    const j = tg().filter((x) => /jade-card/.test(x.className || ''))
    if (j[0]) j[0].dispatch('click')
  }
  const world = tg().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
  if (!world) throw new Error(`нет открытой чакры. экран: ${here_().slice(0, 180)}`)
  world.dispatch('click')
  chooseLordIfShown(tg())
  expect(!!dom.root.querySelector('.field-left'), `бой не открылся: ${here_().slice(0, 180)}`).toBe(true)
  return st()
}

function frame() {
  const cv = dom.lastCanvas()
  const ctx = cv.getContext('2d')
  const d = ctx.getImageData(0, 0, cv.width, cv.height)
  return { w: d.width, h: d.height, d: d.data, sx: cv.width / VIEW_W, sy: cv.height / VIEW_H, cv, ctx }
}

/**
 * Записать, какие картинки и куда выводились на последнем кадре.
 *
 * ## Почему по вызовам, а не по пикселям
 *
 * Пиксельный обход ищет «коричневое дерево» — но пол вокруг ящика тоже
 * песчано-коричневый, и первые три версии проверки ловили не ящик, а пол
 * вокруг него. Оттенков у пола больше, чем у векторного горшка, и проверка
 * проходила зелёной на заливке.
 *
 * Вызов `drawImage` отвечает на вопрос точно: какая картинка и в какой
 * прямоугольник. Сравнивается не размер (у обоих ящиков 128×128), а **сама
 * картинка** — ссылка из `propImage('chest')`.
 */
function recordDraws(ctx) {
  const calls = []
  const orig = ctx.drawImage
  ctx.drawImage = function patched(img, ...a) {
    calls.push({ img, a })
    return orig.call(this, img, ...a)
  }
  return {
    calls,
    /** Прямоугольник вывода картинки в координатах холста, либо `null`. */
    rectOf(img) {
      for (let i = calls.length - 1; i >= 0; i--) {
        if (calls[i].img !== img) continue
        const a = calls[i].a
        if (a.length >= 4) return { x: a[0], y: a[1], w: a[2], h: a[3] }
        if (a.length >= 2) return { x: a[0], y: a[1], w: img.width, h: img.height }
      }
      return null
    },
    restore() { ctx.drawImage = orig },
  }
}

const at = (px, vx, vy) => {
  const x = Math.max(0, Math.min(px.w - 1, Math.round(vx * px.sx)))
  const y = Math.max(0, Math.min(px.h - 1, Math.round(vy * px.sy)))
  const i = (y * px.w + x) * 4
  return { a: px.d[i + 3], r: px.d[i], g: px.d[i + 1], b: px.d[i + 2], v: (px.d[i] + px.d[i + 1] + px.d[i + 2]) / 3 }
}

const onScreen = (px, wx, wy) => {
  const p = roomIso(wx, wy)
  return { x: p.x - st().cam.x, y: p.y - st().cam.y }
}

// `dom` объявлен ДО функций-объявлений выше: `enterField` зовёт `scr()`, а `scr`
// читает `dom`. При обратном порядке вышло `dom is not defined` — и все пять
// проверок кадра молча пропустились, то есть файл был зелёным, ничего не
// проверяя.
let dom = null

describe('Собранный экран: реквизит стоит картинкой', () => {
  let px = null
  let s = null
  let rec = null
  let props = null

  beforeAll(async () => {
    dom = installDom({ fresh: true })
    dom.setProfile({ width: 390, height: 844, dpr: 3, touch: true })
    await import('@webapp/js/main.js')
    props = await import('../webapp/js/ui/props.js')
    s = enterField()
    // Картинки и слои строятся в `then()` загрузки, то есть в микрозадаче.
    for (let i = 0; i < 8; i++) await Promise.resolve()
    // Кадр сначала, потом запись вызовов, потом ЕЩЁ один кадр.
    //
    // Порядок важен: без первого `flushRaf` кадр снимается до того, как игра
    // хоть что-нибудь нарисовала, и пиксели пустые. Без второго — в записи не
    // будет ни одного вызова `drawImage`, потому что записывать нечего.
    dom.flushRaf(3)
    px = frame()
    rec = recordDraws(px.ctx)
    dom.flushRaf(2)
  })

  afterAll(() => { if (rec) rec.restore() })

  it('кадр не пустой', () => {
    let op = 0
    for (let i = 3; i < px.d.length; i += 4) if (px.d[i] > 200) op++
    expect(op, 'кадр почти пуст — комнаты на экране нет').toBeGreaterThan(px.w * px.h * 0.5)
  })

  it('все плитки реквизита приехали', () => {
    // Если картинка не приехала, на экране рисуется вектор — и это не поломка,
    // а ожидание. Но тогда проверки ниже проходят вхолостую, поэтому это
    // проверяется ОТДЕЛЬНО и падает, если набор не загрузился вовсе.
    expect(props.propsReady(), `приехало ${props.loadedPropCount()} из `
      + `${props.PROP_COUNT} плиток реквизита — картинки не загрузились, `
      + 'на экране векторный запасной путь')
      .toBe(true)
  })

  it('сокровище выводится КАРТИНКОЙ ящика, а не вектором', () => {
    // По вызовам `drawImage`, а не по пикселям: пиксельный обход искал
    // «коричневое дерево» и находил пол вокруг, который тоже песчаный.
    // Здесь сравнивается ссылка на картинку — то есть «именно целый ящик».
    const pot = s.pots && s.pots[0]
    if (!pot) return   // в первой комнате сокровища может не быть — это не поломка
    expect(props.propImage('chest'), 'картинка ящика не загружена').toBeTruthy()
    expect(rec.rectOf(props.propImage('chest')),
      'на кадре нет вывода картинки целого ящика — сокровище рисуется вектором')
      .not.toBeNull()
    // Поверх ящика не должен выводиться разбитый: пока он цел, это ошибка.
    expect(rec.rectOf(props.propImage('chestOpen')),
      'на кадре выводится разбитый ящик, хотя сокровище ещё цело')
      .toBeNull()
  })

  it('ящик стоит НА полу: нижняя грань — в точке, где он стоит', () => {
    // Правило вида: передняя нижняя вершина ящика — в точке на полу, а сам
    // ящик поднят на свою высоту (`CUBE_LIFT = 1`, померено по картинке).
    //
    // Числа в `drawImage` заданы в СИСТЕМЕ ХОЛСТА, то есть уже сдвинутой
    // камерой: точка на полу здесь — ноль. Первая версия сравнивала с
    // координатой точки на экране (около 306) и всегда получала «ящик утонул
    // на 306 пикселей» — проверка ловила собственную ошибку в единицах.
    //
    // Допуск 2 пикселя: вершина куба в картинке приходится на `y = 127`, а не
    // на последнюю строку, и разница с нулём меньше двух.
    const pot = s.pots && s.pots[0]
    if (!pot) return
    const r = rec.rectOf(props.propImage('chest'))
    if (!r) return   // «ящик не выведен» проверяется отдельной проверкой выше
    const bottom = r.y + r.h
    expect(Math.abs(bottom), `нижняя грань ящика на ${Math.round(bottom)} относительно `
      + 'точки, где он стоит, а должна быть на нуле — ящик висит в воздухе или '
      + 'утонул в полу')
      .toBeLessThan(2)
    expect(r.w, 'ящик выведен не в полразмера — он занимает больше одной плитки пола')
      .toBeLessThan(PROP_TILE_W * 1.2)
    // И он не выше своей высоты: верхняя грань должна быть на минус высота.
    expect(r.y, `верх ящика на ${Math.round(r.y)}, а при CUBE_LIFT=1 должна быть `
      + `на ${-Math.round(r.h)}`)
      .toBeCloseTo(-r.h, 1)
  })

  it('под хаосом горит земля: на кадре выводится картинка лавы', () => {
    // Хаос-путь стоит не в каждой комнате. Если его нет — проверять нечего, и
    // это не поломка реквизита.
    const c = s.chaos
    if (!c || c.taken) return
    expect(rec.rectOf(props.propImage('lava')),
      'под хаосом нет вывода картинки лавы — хаос читается только подписью')
      .not.toBeNull()
  })

  it('лава и вода ложатся РОМБОМ: ширина вдвое больше высоты', () => {
    // Ромб 2:1 — это форма плитки пола. Если лава или вода выведены
    // прямоугольником, они не лягут на ромбический пол: либо срезаны, либо
    // растянуты.
    for (const name of ['lava', 'water']) {
      const r = rec.rectOf(props.propImage(name))
      if (!r) continue   // не в этой комнате — это не поломка
      expect(r.w / r.h, `${name}: ${Math.round(r.w)}×${Math.round(r.h)} — `
        + `соотношение ${(r.w / r.h).toFixed(2)} вместо `
        + `${(PROP_TILE_W / PROP_TILE_H).toFixed(2)}, плитка не ляжет на ромбический пол`)
        .toBeCloseTo(PROP_TILE_W / PROP_TILE_H, 1)
    }
  })

  it('фонтан, если он есть в комнате, стоит из картинки, а не из кода', () => {
    const sp = s.spring
    if (!sp) return
    expect(rec.rectOf(props.propImage('basin')) || rec.rectOf(props.propImage('water')),
      'фонтан в комнате есть, а на кадре нет ни его тумбы, ни воды — он рисуется вектором')
      .not.toBeNull()
  })
})
