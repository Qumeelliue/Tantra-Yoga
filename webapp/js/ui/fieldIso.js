// ИЗОМЕТРИЧЕСКАЯ КОМНАТА: РОМБОВЫЙ ПОЛ И ФАСАДЫ СТЕН.
//
// ## Зачем
//
// Автор: «продолжай, но только нормальная игра, а не мусор 2д». 2д-мусор был не
// в логике, а в картинке: комната была прямоугольной площадкой с нарисованным
// в коде полом и стеной. Здесь комната — настоящий ромб, собранный из
// лицензионных плиток 128×64 (набор Screaming Brain, CC0).
//
// ## Что здесь построено
//
//   пол    — 14×14 ромбов, собранных ОДИН раз в холст на всю комнату;
//   стены  — фасады вдоль двух дальних краёв ромба (верх-лево и верх-право),
//            плюс верхняя грань, чтобы стена была объёмной.
//
// ## Почему пол собирается заранее
//
// Плиток в комнате 196. Это 196 вызовов drawImage за кадр, и на телефоне это
// дорого. Пол собирается ОДИН раз, дальше это один drawImage. Разница в цене —
// и только.
//
// ## Почему стены только на двух краях
//
// В изометрии видны две дальние стороны ромба. Ближние стоят спиной к зрителю:
// их фасады закрыли бы всю комнату. Так же и в Heroes — задние стены есть,
// передних нет.
//
// ## Откуда берётся текстура стены
//
// Того же набора пола: ромб 128×64, растянутый по параллелограмму фасада.
// Растяжение по скосу — это не «натянутая» картинка, а ровно геометрия изометрии:
// грань куба в параллелограмме по определению. Плюс ровный тёмный фон под
// текстурой, чтобы прозрачные углы ромба не выглядели дырами в кладке.

import {
  TILE_W, TILE_H, TILE_WORLD, ROOM_TILES, ISO_W, ISO_H, roomIso,
} from './iso.js'

const BASE = 'assets/iso'

/** Плитка в листе набора: 128×64, лист 384×192 — это 3×3. */
const SRC_W = 128
const SRC_H = 64
const COLS = 3

/**
 * Какие плитки пола берём.
 *
 * Отбор сделан по замеру цвета, а не на глаз: у всех девяти ромбов ровно 50 %
 * пикселей, то есть форма правильная, а средний цвет различается заметно — от
 * светло-серого (198,198,194) до зелёного (99,112,92). В пол взяты пять серых и
 * светло-песочных: зелёный и тёмный ушли бы в «другую комнату», а это тот же
 * камень, просто другой оттенок. Значения — в `SOURCES.md`.
 */
export const FLOOR_VARIANTS = [[0, 0], [1, 0], [2, 0], [1, 2], [2, 2]]

/** Высота стены в пикселях экрана. Две с половиной плитки — комната не тоннель. */
export const WALL_H = 56

let tileset = null
let floorLayer = null
let wallLayer = null
let loadStarted = false
let doorImg = null

/**
 * Дверной проём из того же набора.
 *
 * Лист `door-sw.png` — 768×192, то есть ШЕСТЬ проёмов по 128×192. Раньше в
 * `SOURCES.md` было написано «128×192», и это было неверно: 128×192 — размер
 * ОДНОГО проёма, а не листа. Ошибка не выглядела ошибкой, пока проём не
 * попытались нарисовать и он не оказался в шесть раз шире комнаты.
 *
 * У проёма 128×192 сверху стена с проёмом, снизу пол. Рисуется ТОЛЬКО стена
 * (верхние 128 строк): пол под ней уже нарисован настоящими плитками, а пол из
 * проёма — квадрат, и он выглядел бы заплатой.
 *
 * `sw` — потому что наша стена смотрит вниз-влево (грань +y). Набор даёт оба
 * поворота: `se` смотрит вниз-вправо и стоит на стене столбца x = 0.
 */
export const ISO_DOOR_TILE = 128
export const ISO_DOOR_WALL_H = 128
/** Проём в листе: берём первый, а не «случайный» — порядок в наборе не описан. */
export const ISO_DOOR_INDEX = 0

export function loadIsoDoor() {
  if (doorImg) return Promise.resolve(true)
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(false)
  }
  return new Promise((done) => {
    const img = new Image()
    img.onload = () => { doorImg = img; done(true) }
    img.onerror = () => done(false)
    img.src = `${BASE}/door-sw.png`
  })
}

export function isoDoorImage() {
  return doorImg
}

/**
 * Загрузить набор. Возвращает `true`, если плитки приехали.
 *
 * Один раз: повторные вызовы отдают тот же результат, второй `Image` не
 * создаётся. Это проверяется в `tests/isoRoom.test.js`.
 */
export function loadIsoTiles() {
  if (tileset) return Promise.resolve(true)
  if (loadStarted) return Promise.resolve(false)
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(false)
  }
  loadStarted = true
  return new Promise((done) => {
    const img = new Image()
    img.onload = () => { tileset = img; done(true) }
    img.onerror = () => done(false)
    img.src = `${BASE}/floor-tiled.png`
  })
}

/** Приехал ли набор. */
export function isoTilesReady() {
  return !!tileset
}

/**
 * Плитка пола по координатам комнаты — детерминированно.
 *
 * Выбор псевдослучайный, но по позиции, а не по счётчику кадров: иначе пол
 * пересобирался бы заново каждый кадр и «дышал» бы пятнами. Хэш с двумя
 * большими простыми множителями даёт ровный фон без диагональных полос.
 */
function variantAt(tx, ty) {
  const h = (Math.imul(tx + 1, 73856093) ^ Math.imul(ty + 1, 19349663)) >>> 0
  return FLOOR_VARIANTS[h % FLOOR_VARIANTS.length]
}

/**
 * Пол комнаты: ромбы, собранные в один холст на всю комнату.
 *
 * @returns {HTMLCanvasElement|null} — `null`, пока набор едет. Тогда экран
 *   рисует пустой фон, и это не поломка, а ожидание картинки.
 */
export function buildIsoFloor() {
  if (floorLayer || !tileset) return floorLayer
  const c = document.createElement('canvas')
  c.width = ISO_W
  c.height = ISO_H
  const g = c.getContext('2d')
  g.imageSmoothingEnabled = false
  for (let ty = 0; ty < ROOM_TILES; ty++) {
    for (let tx = 0; tx < ROOM_TILES; tx++) {
      const centre = roomIso(tx * TILE_WORLD + TILE_WORLD / 2, ty * TILE_WORLD + TILE_WORLD / 2)
      const [col, row] = variantAt(tx, ty)
      // Целые координаты и выключенное сглаживание — иначе между ромбами
      // появляются щели в один пиксель: пол выглядит как сетка, а это ровно то,
      // за что автор и ругал игру («текстура ходит по клеточкам»).
      const dx = Math.round(centre.x - TILE_W / 2)
      const dy = Math.round(centre.y - TILE_H / 2)
      g.drawImage(tileset, col * SRC_W, row * SRC_H, SRC_W, SRC_H, dx, dy, TILE_W, TILE_H)
    }
  }
  // Затемнение по глубине: дальний край темнее. Рисуется ПОСЛЕ всех ромбов и
  // только по нарисованному (`source-atop`), иначе затемнение накрыло бы пустоту
  // вокруг ромба чёрным прямоугольником.
  g.save()
  g.globalCompositeOperation = 'source-atop'
  const grd = g.createLinearGradient(0, 0, 0, ISO_H)
  grd.addColorStop(0, 'rgba(0,0,0,0.55)')
  grd.addColorStop(0.45, 'rgba(0,0,0,0.12)')
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, ISO_W, ISO_H)
  g.restore()
  floorLayer = c
  return c
}

/** Грань стены: параллелограмм от края плитки вверх на WALL_H. */
function wallFace(g, ax, ay, bx, by) {
  const dirX = (bx - ax) / TILE_WORLD
  const dirY = (by - ay) / TILE_WORLD
  g.save()
  g.beginPath()
  g.moveTo(ax, ay)
  g.lineTo(bx, by)
  g.lineTo(bx, by - WALL_H)
  g.lineTo(ax, ay - WALL_H)
  g.closePath()
  g.clip()
  // Ровный фон под текстурой: углы ромба прозрачные, и без него в кладке были бы
  // дыры в форме ромба, а не в форме кирпича.
  g.fillStyle = '#2b2724'
  g.fillRect(Math.min(ax, bx) - 2, Math.min(ay, by) - WALL_H - 2, Math.abs(bx - ax) + 4, WALL_H + 4)
  // Текстура: та же плитка пола, растянутая по скосу грани. Матрица берёт
  // направление края и поднимает текстуру вверх — то есть ровно то, что делает
  // грань куба в изометрии.
  g.transform(dirX, dirY, 0, -1, ax, ay)
  const [col, row] = FLOOR_VARIANTS[(ax + ay) % FLOOR_VARIANTS.length | 0]
  g.globalAlpha = 0.9
  g.drawImage(tileset, col * SRC_W, row * SRC_H, SRC_W, SRC_H, 0, 0, TILE_W, WALL_H)
  g.globalAlpha = 1
  g.restore()
}

/**
 * Фасады вдоль двух дальних краёв ромба.
 *
 * Верх-лево — вдоль ряда `y = 0`, видна грань, обращённая в комнату. Верх-право
 * — вдоль столбца `x = 0`, та же история с другой стороны.
 */
export function buildIsoWalls() {
  if (wallLayer || !tileset) return wallLayer
  const c = document.createElement('canvas')
  c.width = ISO_W
  c.height = ISO_H
  const g = c.getContext('2d')
  g.imageSmoothingEnabled = false

  // Ряд идёт на одну плиту ДЛИННЕЕ с каждого конца. Ровно по длине комнаты
  // стена обрывается полуплиткой от угла ромба, и у края комнаты остаётся
  // дырка в половину плитки — её видно, потому что ромб там самый узкий.
  // Лишняя полплитки — это толщина стены на углу, и она же прикрывает стык двух
  // стен на верхнем углу ромба.
  for (let i = -1; i <= ROOM_TILES; i++) {
    const x0 = i * TILE_WORLD
    // Верх-лево: грань на краю ряда y = 0.
    const a1 = roomIso(x0, TILE_WORLD)
    const b1 = roomIso(x0 + TILE_WORLD, TILE_WORLD)
    wallFace(g, a1.x, a1.y, b1.x, b1.y)
    // Верх-право: грань на краю столбца x = 0.
    const a2 = roomIso(TILE_WORLD, x0)
    const b2 = roomIso(TILE_WORLD, x0 + TILE_WORLD)
    wallFace(g, a2.x, a2.y, b2.x, b2.y)
  }

  // Верхняя грань стены — ромб на месте каждой стеновой плитки, поднятый на
  // WALL_H. Рисуется после фасадов: она накрывает их верхний край, и стена
  // перестаёт быть бумагой. Поднимать надо на высоту стены, иначе грань ляжет на
  // пол, а не на кладку.
  for (let i = 0; i < ROOM_TILES; i++) {
    const x0 = i * TILE_WORLD
    // Верх-лево: плитка (i, 0) — та, за которой стоит стена ряда.
    const topRow = roomIso(x0 + TILE_WORLD / 2, TILE_WORLD / 2)
    // Верх-право: плитка (0, i) — та, за которой стоит стена столбца.
    const topCol = roomIso(TILE_WORLD / 2, x0 + TILE_WORLD / 2)
    for (const p of [topRow, topCol]) {
      g.drawImage(tileset, 1 * SRC_W, 0 * SRC_H, SRC_W, SRC_H,
        Math.round(p.x - TILE_W / 2), Math.round(p.y - TILE_H / 2 - WALL_H), TILE_W, TILE_H)
    }
  }

  wallLayer = c
  return c
}

/** Готовы ли слои комнаты. */
export function isoRoomReady() {
  return !!floorLayer && !!wallLayer
}

export function isoFloorCanvas() {
  return floorLayer
}

export function isoWallCanvas() {
  return wallLayer
}

/** Сброс слоёв — только для проверок, которые строят комнату заново. */
export function resetIsoRoom() {
  floorLayer = null
  wallLayer = null
  doorImg = null
}