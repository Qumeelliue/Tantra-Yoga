// НА СОБРАННОМ ЭКРАНЕ ДОЛЖЕН БЫТЬ РОМБ, А НЕ ПРЯМОУГОЛЬНИК.
//
// ## Зачем именно этот файл
//
// Всё остальное про изометрию проверяет модули: проекцию, пол, стены, порядок
// фигур. Это правильно, но недостаточно. Модули могут быть верны, а экран —
// нет: забытый `drawImage`, не тот холст, забытый сдвиг камеры — и на экране
// пустота, а все проверки зелёные.
//
// Поэтому здесь берётся **настоящий кадр игры** и смотрятся его пиксели.
//
// ## ГЛАВНАЯ ОШИБКА, КОТОРУЮ ЭТОТ ФАЙЛ УЖЕ ПОЙМАЛ
//
// Холст боя масштабируется: `fit()` ставит `setTransform(dpr × ширина/420, …)`,
// то есть видимая область 420×640 растянута на весь буфер (на телефоне это
// 780×1688). Первая версия проверки читала левый верхний угол БУФЕРА и думала,
// что это весь экран. На деле она смотрела на увеличенный угол комнаты — и
// заключала «пол не нарисовался», хотя он нарисован. Чинить такие проверки
// глазами нельзя: поэтому координаты переводятся явно, через масштаб холста.
//
// ## Честность прибора
//
// Стенд молча пропускал `drawImage` с холстом-источником, а размер источника
// читался только по полю `w`, которое у буфера холста называется `width`. Итог:
// пол и стены комнаты на экране проверок просто не появлялись. Обе ошибки
// исправлены в `tests/helpers/dom.js` — вместе с честным смешиванием прозрачности.

import { describe, it, expect, beforeAll } from 'vitest'
import { installDom, clickables, textOf, chooseLordIfShown } from './helpers/dom.js'
import { roomIso, ISO_W, ISO_H, TILE_WORLD } from '../webapp/js/ui/iso.js'

let dom
beforeAll(() => {
  dom = installDom({ fresh: true })
  dom.setProfile({ width: 390, height: 844, dpr: 3, touch: true })
  return import('@webapp/js/main.js')
})

const scr = () => dom.root.childNodes[dom.root.childNodes.length - 1]
const here = () => textOf(scr()).replace(/\s+/g, ' ').trim()
const tg = () => clickables(scr())
const st = () => globalThis.window.__field
const VIEW_W = 420
const VIEW_H = 640

function clickRe(re, what = '') {
  const el = tg().find((n) => re.test(textOf(n)))
  expect(el, `не нажалось: ${what}. экран: ${here().slice(0, 140)}`).toBeTruthy()
  el.dispatch('click')
  dom.flushRaf(3)
}

function enterField() {
  for (let i = 0; i < 12; i++) {
    if (/Город спит/.test(here())) break
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
  if (/Почерк/i.test(here())) {
    const a = tg().find((x) => /wsel-card/.test(x.className || ''))
    if (a) a.dispatch('click')
  }
  if (/Фонтан|нефрит/i.test(here())) {
    const j = tg().filter((x) => /jade-card/.test(x.className || ''))
    if (j[0]) j[0].dispatch('click')
  }
  const world = tg().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
  if (!world) throw new Error(`нет открытой чакры. экран: ${here().slice(0, 180)}`)
  world.dispatch('click')
  chooseLordIfShown(tg())
  expect(!!dom.root.querySelector('.field-left'), `бой не открылся: ${here().slice(0, 180)}`).toBe(true)
  return st()
}

/**
 * Настоящий кадр боя ВМЕСТЕ с масштабом.
 *
 * `sx`/`sy` — во сколько раз видимая область 420×640 больше буфера, наоборот:
 * `bufX = viewX * sx`. Без этого читается не экран, а его угол.
 */
function frame() {
  const cv = dom.lastCanvas()
  const ctx = cv.getContext('2d')
  const d = ctx.getImageData(0, 0, cv.width, cv.height)
  return {
    w: d.width, h: d.height, d: d.data,
    sx: cv.width / VIEW_W, sy: cv.height / VIEW_H,
  }
}

/** Пиксель по координате ВИДИМОЙ ОБЛАСТИ. */
const at = (px, vx, vy) => {
  const x = Math.max(0, Math.min(px.w - 1, Math.round(vx * px.sx)))
  const y = Math.max(0, Math.min(px.h - 1, Math.round(vy * px.sy)))
  const i = (y * px.w + x) * 4
  return { a: px.d[i + 3], v: (px.d[i] + px.d[i + 1] + px.d[i + 2]) / 3 }
}

/** Сколько разных оттенков в прямоугольнике видимой области — «плитки», а не заливка. */
function shades(px, vx0, vy0, vw, vh) {
  const seen = new Set()
  for (let y = vy0; y < vy0 + vh; y += 2) {
    for (let x = vx0; x < vx0 + vw; x += 2) {
      const p = at(px, x, y)
      if (p.a < 200) continue
      seen.add(Math.round(p.v / 8) * 8)
    }
  }
  return seen.size
}

/** Точка ромба → координата видимой области (минус камера). */
const onScreen = (px, wx, wy) => {
  const p = roomIso(wx, wy)
  return { x: p.x - st().cam.x, y: p.y - st().cam.y }
}

describe('Собранный экран: комната-ромб', () => {
  let px = null
  let s = null
  beforeAll(async () => {
    s = enterField()
    // Слои комнаты строятся в `then()` загрузки картинки, то есть в
    // микрозадаче. Пока они не выполнились, на экране лежит запасная ровная
    // заливка, и проверка «пол из плиток» падала бы, обвиняя рисунок.
    for (let i = 0; i < 6; i++) await Promise.resolve()
    s.player.x = s.field.w / 2
    s.player.y = s.field.h / 2
    for (const f of s.foes) { f.x = s.field.w * 0.5; f.y = s.field.h * 0.45 }
    dom.flushRaf(3)
    px = frame()
  })

  it('кадр не пустой, и масштаб холста известен', () => {
    let op = 0
    for (let i = 3; i < px.d.length; i += 4) if (px.d[i] > 200) op++
    expect(op, 'кадр почти пуст — комнаты на экране нет').toBeGreaterThan(px.w * px.h * 0.5)
    // Буфер больше видимой области: значит, читать надо с масштабом. Если это
    // перестанет быть так, проверка ниже начнёт смотреть не туда.
    expect(px.sx, 'холст не масштабируется — а fit() обязан его масштабировать')
      .toBeGreaterThan(1)
  })

  it('в центре комнаты — неоднородная картинка, а не ровная заливка', () => {
    const c = onScreen(px, s.field.w / 2, s.field.h / 2)
    expect(c.x, 'центр комнаты ушёл за кадр — проверить нечего').toBeGreaterThan(20)
    expect(c.x, 'центр комнаты ушёл за кадр — проверить нечего').toBeLessThan(VIEW_W - 20)
    const p = at(px, c.x, c.y)
    expect(p.a, 'в центре комнаты пусто — пол не нарисован').toBeGreaterThan(200)
    expect(p.v, 'в центре комнаты темно — пол не нарисован, лежит запасная заливка')
      .toBeGreaterThan(90)
    expect(shades(px, c.x - 40, c.y - 20, 80, 40),
      'в центре комнаты ровный цвет — это заливка, а не плитки')
      .toBeGreaterThan(2)
  })

  it('под нижним углом ромба — фон: комната кончается ромбом, а не прямоугольником', () => {
    // Нижний угол ромба виден всегда: он в середине экрана по ширине, а камера
    // ездит только вбок. Под ним — фон, и стены там нет (в изометрии передние
    // стены не строят: они закрыли бы комнату). Если под углом тоже пол, значит
    // ромб на самом деле прямоугольник.
    const bottom = onScreen(px, s.field.w, s.field.h)
    expect(bottom.x, 'нижний угол ромба не в кадре по ширине').toBeGreaterThan(10)
    expect(bottom.x, 'нижний угол ромба не в кадре по ширине').toBeLessThan(VIEW_W - 10)
    expect(bottom.y + 40, 'под нижним углом ромба не помещается в экран').toBeLessThan(VIEW_H)
    const inside = at(px, bottom.x, bottom.y - 60).v
    const outside = at(px, bottom.x, bottom.y + 40).v
    expect(outside, `под углом ромба та же яркость (${outside.toFixed(0)}), сколько внутри `
      + `(${inside.toFixed(0)}) — пол залит прямоугольником`)
      .toBeLessThan(inside - 4)
  })

  it('над краем комнаты стоит стена, а выше неё — небо', () => {
    // Колонка у левого края экрана. Граница ромба в этой колонке считается из
    // геометрии, а не от балды: у ромба высота в колонке равна половине высоты,
    // умноженной на долю расстояния от середины.
    const cam = st().cam
    const vx = 60
    const bx = vx + cam.x
    const edge = (ISO_H / 2) * (1 - Math.abs(bx - ISO_W / 2) / (ISO_W / 2))
    const edgeY = edge - cam.y
    expect(edgeY, 'граница ромба в этой колонке вне экрана').toBeGreaterThan(20)
    expect(edgeY, 'граница ромба в этой колонке вне экрана').toBeLessThan(VIEW_H - 10)
    const sky = at(px, vx, 6).v
    let wall = 0
    for (let y = 8; y < edgeY - 4; y++) {
      if (Math.abs(at(px, vx, y).v - sky) > 6) wall++
    }
    expect(wall, `над краем комнаты (${Math.round(edgeY)}) ничего нет — стены на экране нет`)
      .toBeGreaterThan(25)
  })

  it('под садхакой есть тень — фигура стоит на полу ромба', () => {
    // Тень рисуется по той же точке ромба, что и сама фигура. Это самая честная
    // проверка «фигура на месте»: если бы экран сдвигал фигуры отдельно от пола,
    // тень уехала бы.
    const c = onScreen(px, s.player.x, s.player.y)
    let dark = 0
    for (let y = c.y - 2; y < c.y + 10; y++) {
      for (let x = c.x - 16; x < c.x + 16; x++) {
        const p = at(px, x, y)
        if (p.a > 200 && p.v < 90) dark++
      }
    }
    expect(dark, `под садхакой (${Math.round(c.x)},${Math.round(c.y)}) нет тени`)
      .toBeGreaterThan(15)
  })

  it('мировая единица равна пикселю: расстояние на экране не вдвое меньше боя', () => {
    // Расстояние по ромбу меньше (иначе это был бы поворот, а не проекция), но
    // не вдвое: вдвое означало бы, что ромб вдвое короче боя и экран врёт о
    // расстояниях — игрок целится мимо.
    const foe = s.foes[0]
    if (!foe) return
    const a = roomIso(s.player.x, s.player.y)
    const b = roomIso(foe.x, foe.y)
    const onRhomb = Math.hypot(b.x - a.x, b.y - a.y)
    const inBattle = Math.hypot(foe.x - s.player.x, foe.y - s.player.y)
    expect(onRhomb).toBeLessThan(inBattle)
    expect(onRhomb).toBeGreaterThan(inBattle * 0.5)
    expect(TILE_WORLD).toBe(64)
  })

  it('комната помещается в кадр: и садхака, и все оки на экране', () => {
    // Это то, ради чего размер комнаты и подбирался: по оке должно быть видно
    // и по ней должно быть можно ударить. Ока за кадром — потерянная ока.
    const cam = st().cam
    const inside = (wx, wy) => {
      const p = roomIso(wx, wy)
      const x = p.x - cam.x
      const y = p.y - cam.y
      return x >= 0 && x <= VIEW_W && y >= 0 && y <= VIEW_H
    }
    expect(inside(s.player.x, s.player.y), 'садхака не на экране').toBe(true)
    for (const f of s.foes) {
      expect(inside(f.x, f.y), `ока (${Math.round(f.x)},${Math.round(f.y)}) не на экране — `
        + 'по ней нельзя ни ударить, ни увидеть, что она идёт').toBe(true)
    }
  })
})