// РЕКВИЗИТ БОЯ ИЗ ЛИЦЕНЗИОННЫХ НАБОРОВ.
//
// ## Зачем этот файл
//
// Четыре предмета Поля Ума были нарисованы мной в коде: сокровище, фонтан
// амбросии, хаос и цветок на месте оковы. Правило проекта: **рисунок
// лицензионный, если лицензионный взять можно**. Взять можно — наборы CC0 уже
// лежат в `assets/props/`, и пол комнаты давно сделан из них же.
//
// ## Правило здесь одно: своё рисование — это запасной путь
//
// Векторные рисунки не выкинуты: пока картинка едет, игра рисует свой. Но
// `drawProp` честно говорит, нарисовалось ли лицензионное, и проверка на
// собранном экране требует, чтобы на кадре стояла ИМЕННО картинка. Раньше
// проверка требовала «файл существует» — этого мало: файл мог лежать, а на
// экране был мой вектор.
//
// ## Как плитка ложится на пол
//
// Три из пяти плиток — ромбы 2:1, то есть ровно форма плитки пола. Ставить их
// надо так: верх ромба (левый угол картинки) — в точку на пол��, то есть в
// `roomIso(x, y)` минус половина ширины ромба. Иначе ромб уезжает на полплитки
// влево-вверх, и предмет висит над полом.
//
// ## Что здесь НЕ лицензионное
//
// Свет из открытой двери, золотое сияние амбросии и подпись под фонтаном.
// Свет не имеет формы, которую сравнивают с чужой, — набор тут не поможет.
// Это записано в `assets/props/CREDITS.md`, а не оставлено молча.

import { TILE_W, TILE_H } from './iso.js'

const BASE = 'assets/props'

/** Имена файлов. Ключ — то, что спрашивает код. */
export const PROP_FILES = {
  chest: 'chest.png',
  chestOpen: 'chest-open.png',
  basin: 'basin.png',
  water: 'water.png',
  lava: 'lava.png',
  bloom: 'bloom.png',
}

const images = new Map()
let loadStarted = false

/** Загрузить все плитки реквизита. Один раз; повтор зовёт тот же результат. */
export function loadProps() {
  if (loadStarted) return Promise.resolve(propsReady())
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(false)
  }
  loadStarted = true
  const jobs = Object.entries(PROP_FILES).map(([name, file]) => new Promise((done) => {
    const img = new Image()
    img.onload = () => { images.set(name, img); done(true) }
    img.onerror = () => done(false)
    img.src = `${BASE}/${file}`
  }))
  return Promise.all(jobs).then(() => propsReady())
}

/** Все ли плитки на месте. */
export function propsReady() {
  return Object.keys(PROP_FILES).every((n) => images.has(n))
}

/** Сколько плиток приехало — для проверок и честной надписи. */
export function loadedPropCount() {
  return images.size
}

/**
 * Сама картинка по имени — для проверок, которые сверяют геометрию отрисовки.
 *
 * Зачем именно ссылка, а не размер: `chest.png` и `chest-open.png` обе
 * 128×128, и по размеру их не отличить. Проверка «какой ящик нарисован» должна
 * знать, что это ИМЕННО целый, а не разбитый. То же самое у фигур:
 * `isoDoorImage()` сделано так же.
 */
export function propImage(name) {
  return images.get(name) || null
}

export const PROP_COUNT = Object.keys(PROP_FILES).length

/** Размер плитки по файлу — читается из самой картинки, а не задаётся рядом. */
function sizeOf(img) {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  return { w, h }
}

/**
 * Ложить ромб 2:1 на пол.
 *
 * Левый верхний угол картинки — это верх ромба, а не левый край. Поэтому
 * сдвиг на половину ширины ромба вправо и на половину его высоты вниз: ромб
 * оказывается ЦЕЛИКОМ в точке (0,0), как и положение фигуры.
 */
function drawRhomb(ctx, img, scale = 1) {
  const { w, h } = sizeOf(img)
  const dw = w * scale
  const dh = h * scale
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
}

/**
 * Ложить плитку на пол.
 *
 * @param {CanvasRenderingContext2D} ctx — уже сдвинут в точку на полу
 * @param {string} name — ключ из `PROP_FILES`
 * @param {object} [opt]
 * @param {number} [opt.scale] — масштаб (по умолчанию 1, то есть плитка пола)
 * @param {number} [opt.alpha] — прозрачность
 * @returns {boolean} — нарисовалась ли картинка. `false` зовёт вектор.
 */
export function drawProp(ctx, name, opt = {}) {
  const img = images.get(name)
  if (!img) return false
  const prev = ctx.globalAlpha
  if (opt.alpha != null) ctx.globalAlpha = prev * opt.alpha
  drawRhomb(ctx, img, opt.scale == null ? 1 : opt.scale)
  ctx.globalAlpha = prev
  return true
}

/**
 * Ложить куб (ящик) на пол.
 *
 * Отличие от ромба: куб стоит ВЫШЕ точки на пол. Точка (0,0) — это угол
 * основания куба, то есть передняя нижняя вершина ромба-основания. Поэтому
 * куб смещается вверх на свою высоту и рисуется в полразмера: ящик занимает
 * одну плитку пола, а не две.
 *
 * @returns {boolean}
 */
export function drawPropCube(ctx, name, opt = {}) {
  const img = images.get(name)
  if (!img) return false
  const { w, h } = sizeOf(img)
  const scale = opt.scale == null ? 0.5 : opt.scale
  const prev = ctx.globalAlpha
  if (opt.alpha != null) ctx.globalAlpha = prev * opt.alpha
  // Нижняя вершина картинки — это точка, где куб касается пола, и она должна
  // попасть в (0,0). Поэтому сдвиг вверх на всю высоту — `CUBE_LIFT`.
  const dw = w * scale
  const dh = h * scale
  ctx.drawImage(img, -dw / 2, -dh * CUBE_LIFT, dw, dh)
  ctx.globalAlpha = prev
  return true
}

/**
 * Насколько куб поднимается над точкой на пол, в долях своей высоты.
 *
 * ## Почему именно вся высота
 *
 * Плитка куба в наборе — 128×128, и куб занимает её целиком: верхняя вершина
 * на `y = 0`, нижняя (передняя нижняя вершина основания, то есть точка, где
 * куб касается пола) на `y = 127`. Замерено на обоих ящиках.
 *
 * Значит, чтобы нижняя вершина попала в точку на полу, картинку надо сдвинуть
 * вверх на **всю** свою высоту. Первая версия брала половину (`CUBE_LIFT = 0.5`)
 * — и ящик уезжал на полплитки ВНИЗ, то есть тонул в полу. Поймала проверка по
 * нижнему краю дерева на кадре, а не по доле непрозрачных.
 *
 * Это правило вида, а не константа оформления: его легко нарушить молча, и
 * чинить потом пришлось бы глазами. Проверяется в `tests/propsTruth.test.js`.
 */
export const CUBE_LIFT = 1

/** Горизонтальная ширина игровой плитки пола — эталон для всех пропов. */
export const PROP_TILE_W = TILE_W
/** Высота игровой плитки пола. */
export const PROP_TILE_H = TILE_H

/** Сброс — только для проверок. */
export function resetProps() {
  images.clear()
  loadStarted = false
}