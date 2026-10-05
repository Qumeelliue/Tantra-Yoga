// ОСНОВАНИЕ ФИГУРЫ — РОМБ ТОГО ЖЕ СООТНОШЕНИЯ, ЧТО И ПОЛ.
//
// ## Зачем этот файл
//
// Решение автора про фигуры: они остаются нарисованными **видом сверху**
// (набор Calciumtrice), потому что изометрических фигур в свободных наборах
// нет, а выдумывать их запрещено правилом проекта. Вид объявлен честно —
// «сверху, по клеткам ромбами».
//
// Честность вида держится на одной детали: под фигурой стоит **ромб того же
// соотношения 2:1, что и плитка пола**. Пока тень была эллипсом, ромбический пол
// и круглая тень говорили разное («сверху» и «скосок» одновременно), и фигура
// выглядела плоско.
//
// ## Правило и как его нарушить
//
//   ПРАВИЛО: соотношение ромба-основания = соотношение плитки пола = 2:1.
//
//   НАРУШЕНИЕ (ровно то, что здесь ловится):
//   1. `drawFieldShadow` рисует эллипс или круг вместо ромба;
//   2. ромб нарисован 4:1 или 2.5:1 — то есть «примерно изометрически»;
//   3. ширина основания приходит из другого модуля, который потом поменяет
//      пол на квадрат — и основание останется ромбом;
//   4. на настоящем кадре под садхакой нет тёмного пятна.
//
//   ГДЕ ПАДАЕТ: `webapp/js/ui/fieldSprites.js`, функция `drawFieldShadow`.
//
// ## Почему число одно на всех
//
// `FIGURE_BASE_RATIO` экспортируется, и пол берёт из него же. Пока у пола и у
// основания было по своему числу, «примерно одинаково» разъезжалось на глаз.
//
// Про сам экран — здесь честно: `isoScreen.test.js` смотрит пиксели собранного
// кадра и требует тёмное пятно под садхакой. Это проверка «есть тень», но не
// «ровно ромб 2:1» — форма по пикселям здесь не различить. Форму проверяет этот
// файл, а кадр — `isoScreen.test.js`.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  drawFieldShadow, FIGURE_BASE_RATIO,
} from '../webapp/js/ui/fieldSprites.js'
import { TILE_W, TILE_H } from '../webapp/js/ui/iso.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

/** Холст, который только запоминает путь фигуры. */
function pathCtx() {
  const ops = []
  return {
    ops,
    globalAlpha: 1,
    fillStyle: '',
    beginPath: () => ops.push(['beginPath']),
    moveTo: (...a) => ops.push(['moveTo', ...a]),
    lineTo: (...a) => ops.push(['lineTo', ...a]),
    closePath: () => ops.push(['closePath']),
    ellipse: (...a) => ops.push(['ellipse', ...a]),
    arc: (...a) => ops.push(['arc', ...a]),
    fill: () => ops.push(['fill']),
    stroke: () => ops.push(['stroke']),
  }
}

/** Вершины ромба из записанных команд. */
function diamondVerts(ops) {
  const pts = []
  for (const [name, x, y] of ops) {
    if (name === 'moveTo' || name === 'lineTo') pts.push([x, y])
  }
  return pts
}

describe('Ромб-основание под фигурой', () => {
  it('основание нарисовано ромбом, а не эллипсом', () => {
    const ctx = pathCtx()
    drawFieldShadow(ctx, 1)
    expect(ctx.ops.filter((c) => c[0] === 'ellipse').length,
      'под фигурой снова эллипс — на ромбическом полу это читается как плоская наклейка')
      .toBe(0)
    expect(ctx.ops.filter((c) => c[0] === 'fill').length, 'основание не залито — фигура висит в воздухе')
      .toBeGreaterThan(0)
    expect(diamondVerts(ctx.ops).length, 'ромб-основание собрано не из четырёх углов').toBe(4)
  })

  it('соотношение ромба совпадает с соотношением плитки пола', () => {
    const ctx = pathCtx()
    drawFieldShadow(ctx, 1)
    const v = diamondVerts(ctx.ops)
    const xs = v.map((p) => p[0])
    const ys = v.map((p) => p[1])
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...ys)
    expect(h, 'ромб-основание выродилось в линию').toBeGreaterThan(1)
    // Плитка пола — эталон: 2:1. Основание обязано быть тем же, иначе ромбический
    // пол и круглое пятно говорят разное.
    expect(FIGURE_BASE_RATIO).toBe(TILE_W / TILE_H)
    expect(w / h).toBeCloseTo(TILE_W / TILE_H, 5)
  })

  it('вершины ромба лежат крест-накрест: левый-правый и верх-низ', () => {
    // Ромб рисуется от левой вершины по часовой стрелке. Если порядок нарушен,
    // фигура закрывается не той формой — и на экране это выглядит как сломанный
    // многоугольник, а проверить потом нечем.
    const ctx = pathCtx()
    drawFieldShadow(ctx, 1)
    const v = diamondVerts(ctx.ops)
    const left = v.reduce((a, b) => (b[0] < a[0] ? b : a))
    const right = v.reduce((a, b) => (b[0] > a[0] ? b : a))
    const top = v.reduce((a, b) => (b[1] < a[1] ? b : a))
    const bottom = v.reduce((a, b) => (b[1] > a[1] ? b : a))
    expect(left).toBe(v[0])
    expect(right).toBe(v[2])
    expect(top).toBe(v[1])
    expect(bottom).toBe(v[3])
    expect(left[1], 'левая и правая вершины не на одной высоте — ромб перекошен')
      .toBeCloseTo(right[1], 5)
    expect(top[0], 'верхняя и нижняя вершины не на одной вертикали')
      .toBeCloseTo(bottom[0], 5)
  })

  it('масштаб фигуры масштабирует основание, а прозрачность не забыта', () => {
    const one = pathCtx()
    drawFieldShadow(one, 1)
    const oneV = diamondVerts(one.ops)
    const big = pathCtx()
    drawFieldShadow(big, 2)
    const bigV = diamondVerts(big.ops)
    const w = (pts) => Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]))
    expect(w(bigV) / w(oneV), 'основание не выросло вместе с фигурой').toBeCloseTo(2, 5)
    expect(one.globalAlpha, 'прозрачность кадра не восстановлена — фигура уйдёт в невидимость')
      .toBe(1)
  })

  it('основание живёт в одном файле: спрайт и вектор рисуют одно и то же', () => {
    // Призрак правила AGENTS §9.2: правило без одного числа разъезжается. Пока
    // ромб был и в `fieldSprites.js`, и в `fieldArt.js`, это было два места, и
    // они разошлись бы на глаз — а заметить можно только глазами на игре.
    //
    // Проверка ловит ровно нарушение: свой ромб в любом из двух файлов.
    for (const f of ['webapp/js/ui/fieldSprites.js', 'webapp/js/ui/fieldArt.js']) {
      const src = readFileSync(join(root, f), 'utf8')
      const rombs = src.match(/hh\s*=\s*hw\s*\/\s*(FIGURE_BASE_RATIO|2)\b/g) || []
      const draws = src.match(/ctx\.moveTo\(-hw,/g) || []
      expect(rombs.length, `своё соотношение ромба в ${f} — вместо FIGURE_BASE_RATIO`)
        .toBeLessThanOrEqual(1)
      expect(draws.length, `ромб нарисован вторым способом в ${f}`)
        .toBeLessThanOrEqual(1)
    }
    // И спрайт, и вектор зовут одну и ту же функцию основания.
    const sprites = readFileSync(join(root, 'webapp/js/ui/fieldSprites.js'), 'utf8')
    expect(sprites, 'спрайт рисует своё основание вместо общего').toMatch(/drawFigureBase\(ctx, scale/)
    const art = readFileSync(join(root, 'webapp/js/ui/fieldArt.js'), 'utf8')
    expect(art, 'вектор рисует своё основание вместо общего')
      .toMatch(/export function drawFigureBase/)
  })

  it('основание рисуется и под садхакой, и под каждой окой', () => {
    // Проверка по коду экрана, а не по модулю: основание в модуле есть, а на
    // экране может не рисоваться — ровно так уже пропадали дверь и фонтан.
    const src = readFileSync(join(root, 'webapp/js/ui/screens/field.js'), 'utf8')
    const calls = src.match(/drawFieldShadow\(/g) || []
    // Два места: садхака и ока (у оки вызов в ветке падения — тень уезжает
    // вместе с падающей фигурой, и это один вызов).
    expect(calls.length, 'основание рисуется меньше двух раз — одна из фигур повиснет в воздухе')
      .toBeGreaterThanOrEqual(2)
    expect(src, 'основание под садхакой пропало').toMatch(/drawFieldShadow\(ctx,\s*1\.15\)/)
    expect(src, 'основание под окой пропало').toMatch(/drawFieldShadow\(ctx,\s*big/)
  })

  it('векторный запасной путь тоже рисует ромб, а не свой овал', () => {
    // Пока спрайт едет, игра рисует вектор. Если у вектора своя круглая тень, то
    // в первую секунду боя основание одно, а через секунду другое — и это видно
    // как мигание под ногами.
    const src = readFileSync(join(root, 'webapp/js/ui/fieldArt.js'), 'utf8')
    const legs = src.match(/ctx\.ellipse\(0,\s*1\s*,\s*\d/g) || []
    expect(legs.length, 'в векторных фигурах есть круглые тени — основание мигает при загрузке')
      .toBe(0)
  })
})