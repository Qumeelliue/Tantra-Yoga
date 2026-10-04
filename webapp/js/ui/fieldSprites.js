// СПРАЙТЫ ИЗ ЛИЦЕНЗИОННЫХ НАБОРОВ — вместо своих векторов.
//
// ## Откуда это
//
// Рисунок весь — не мой. Взяты готовые листы Calciumtrice с OpenGameArt:
// персонажи (анимированные) и тайлсет подземелья, все под **CC-BY 3.0**.
// Kenney Roguelike Pack (CC0) — запасной вариант. Полный список источников и
// условия лицензий — `webapp/public/assets/field/CREDITS.md`.
//
// ## Почему это появилось
//
// Автор посмотрел на игру и сказал: «это какое-то убожество, всё кривое, косое —
// текстура, которая типа ходит по клеточкам». По коду это было верно: все фигуры
// рисовались моими векторами в `fieldArt.js`, статичными, без единого кадра
// анимации. Правило проекта («геймплей копируем») я прочитал как «копируем
// механики» и отдал слой показа себе — то есть ровно туда, куда нельзя.
//
// ## Правило, которое теперь здесь записано
//
// > **Рисунок — лицензионный, если есть лицензионный.** Своё рисование допустимо
// > только там, где лицензионного взять нечего. Исключение — заглушка, пока
// > картинка грузится.
//
// ## Что здесь НЕ выдумано
//
// Раскладку листов я не придумывал, а прочитал по пикселям: сетка 32×32,
// 10 столбцов, 5 полос анимаций на персонажа (`scripts/pngReader.mjs` печатает
// подпись каждого кадра, и по ним видно, какая полоса симметрична — это шаг).
//
// Порядок полос у автора описан словами на странице листа: idle, gesture, walk,
// attack, death. У листа «воин» полоса 1 зеркально-симметрична (значит шаг), и
// на этом раскладка проверена, а не угадана. Остальные полосы назначены по
// порядку, как у автора; если какая-то полоса окажется не тем движением, это
// видно в игре и правится одной строкой.
//
// ## Запасной путь
//
// `drawFieldSprite` возвращает `false`, если картинка ещё не грузится. Тогда
// вызывающий код рисует старый вектор. Игра никогда не остаётся пустой, и
// проверки, где `Image` не существует, идут по векторной ветке.

/** Источник: `assets/field/...` — папка `webapp/public`, отдаётся как `/assets/...`. */
const BASE = 'assets/field'

/**
 * Полосы анимаций. Строка — в листе, кадры — в строке.
 *
 * `once: true` — кадр доходит до последнего и стоит: для удара и смерти это
 * правильно, иначе садхака после удара продолжает «бить» в воздух.
 */
const ANIMS = {
  idle: { row: 0, frames: [2, 3, 4, 5, 4, 3], fps: 2.5 },
  walk: { row: 1, frames: [1, 2, 3, 4, 5, 6, 7, 8], fps: 9 },
  attack: { row: 2, frames: [1, 2, 3, 4, 5, 6, 7, 8, 9], fps: 13, once: true },
  hurt: { row: 3, frames: [1, 2, 3, 4, 5, 6, 7, 8, 9], fps: 12, once: true },
  death: { row: 4, frames: [1, 2, 3, 4, 5, 6, 7, 8, 9], fps: 7, once: true },
}

export const ANIM_NAMES = Object.keys(ANIMS)

/** Сама таблица полос — наружу, чтобы проверки сверяли раскладку с картинками. */
export { ANIMS }

/**
 * Персонажи: где лист и с какой полосы начинается его блок.
 *
 * `firstRow` — потому что в листе сидят ДВА персонажа: первый занимает полосы
 * 0–4, второй 5–9. У «слизи» персонажей четыре (20 полос), у «змеи» один (5).
 */
export const CHARACTERS = {
  sadhaka: { sheet: 'warrior.png', firstRow: 0 },
  sadhaka_alt: { sheet: 'warrior.png', firstRow: 5 },

  warrior: { sheet: 'warrior.png', firstRow: 5 },
  cleric: { sheet: 'animated-cleric.png', firstRow: 0 },
  cleric_alt: { sheet: 'animated-cleric.png', firstRow: 5 },
  ranger: { sheet: 'animated-ranger.png', firstRow: 0 },
  ranger_alt: { sheet: 'animated-ranger.png', firstRow: 5 },
  rogue: { sheet: 'animated-rogue.png', firstRow: 0 },
  rogue_alt: { sheet: 'animated-rogue.png', firstRow: 5 },
  wizard: { sheet: 'animated-wizard.png', firstRow: 0 },
  wizard_alt: { sheet: 'animated-wizard.png', firstRow: 5 },
  orc: { sheet: 'animated-orcs.png', firstRow: 0 },
  orc_armored: { sheet: 'animated-orcs.png', firstRow: 5 },
  goblin_knife: { sheet: 'goblins.png', firstRow: 0 },
  goblin_hammer: { sheet: 'goblins.png', firstRow: 5 },
  skeleton: { sheet: 'skeleton.png', firstRow: 0 },
  slime: { sheet: 'animated-slime.png', firstRow: 0 },
  slime_blue: { sheet: 'animated-slime.png', firstRow: 5 },
  slime_red: { sheet: 'animated-slime.png', firstRow: 10 },
  snake: { sheet: 'animated-snake.png', firstRow: 0 },
}

/**
 * Кому какая фигура. Не произвольно: по поведению.
 *
 * Нидра — сон, медлительность → слизь. Бхая — страх, быстрое нападение →
 * лучник. Грна — жжение, укус → змея. Шила — терпение, неподвижность → гоблин с
 * ножом. Аханкара — «я»-сознание, и это второй человек: а не оков, а его отражение.
 * Второй человек выбран сознательно — аханкара это и есть «я», то есть садхака
 * рядом с садхакой.
 *
 * Минотавр автора свёрстан со сдвигом (480×240, полосы не ложатся на сетку
 * 32×32), и подгонять под него особый случай дороже, чем взять другую фигуру.
 * Поэтому его нет — и это записано здесь, чтобы никто не вернул его «на
 * всякий случай».
 */
export const FOE_SPRITE = {
  // шесть рипу — внутренние, быстрые и злые
  krodha: 'orc',
  lobha: 'goblin_hammer',
  kama: 'rogue',
  mada: 'cleric',
  matsarya: 'skeleton',
  nidra: 'slime',
  // восемь паш — внешние, держат дистанцию
  bhaya_pasha: 'ranger',
  lajja: 'rogue_alt',
  ghrna: 'snake',
  samshaya_pasha: 'wizard',
  kula: 'cleric_alt',
  sila: 'goblin_knife',
  mana_pasha: 'wizard_alt',
  jugupsa: 'slime_blue',
  // владыки — крупнее и важнее видом
  moha: 'ranger_alt',
  ahankara: 'warrior',
  kama_raja: 'ranger_alt',
  krodha_maharaja: 'orc_armored',
  mada_natha: 'cleric_alt',
  matsarya_kala: 'skeleton',
  lobha_pati: 'orc_armored',
  lord_nidra: 'slime_red',
  lord_kula_kundalini: 'orc_armored',
  lord_bhaya: 'ranger_alt',
  lord_ghrna: 'snake',
  lord_samshaya: 'wizard_alt',
  lord_jugupsa: 'slime_blue',
  lord_mana: 'wizard_alt',
  lord_lajja: 'rogue_alt',
  lord_shila: 'goblin_knife',
  lord_kula: 'cleric',
  lord_sankalpa: 'rogue',
  lord_vikalpa: 'wizard',
  lord_karta: 'orc',
  lord_sanchara: 'ranger',
}

/** Загруженные листы: имя файла → картинка. */
const IMAGES = new Map()
let loading = null
let failed = false

/**
 * Загрузить все листы. Идемпотентно: второй вызов вернёт тот же промис.
 *
 * `Image` может не существовать (проверки на заглушке DOM, Node без браузера) —
 * тогда это не ошибка, а «рисунка нет»: вызывающий код рисует вектор.
 */
export function loadFieldSprites() {
  if (loading) return loading
  if (typeof Image === 'undefined') {
    failed = true
    loading = Promise.resolve(false)
    return loading
  }
  const sheets = [...new Set(Object.values(CHARACTERS).map((c) => c.sheet))]
  loading = Promise.all(sheets.map((src) => new Promise((done) => {
    const img = new Image()
    img.onload = () => { IMAGES.set(src, img); done(true) }
    img.onerror = () => done(false)
    img.src = `${BASE}/${src}`
  }))).then((res) => {
    // Хотя бы один лист должен прийти: иначе игрока нечем рисовать и надо
    // честно остаться на векторах, а не мигать пустотой.
    if (!res.some(Boolean)) failed = true
    return !failed
  })
  return loading
}

/** Рисунок приехал? */
export function spritesReady() {
  return !failed && IMAGES.size > 0 && [...IMAGES.values()].every((i) => i.complete !== false)
}

/** Есть ли такой персонаж и его лист. */
export function hasSprite(charId) {
  const c = CHARACTERS[charId]
  return !!(c && IMAGES.get(c.sheet))
}

/**
 * Нарисовать кадр.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} charId — ключ `CHARACTERS`
 * @param {string} anim — ключ `ANIMS`
 * @param {number} t — время в секундах (кадр выбирается по нему)
 * @param {object} [opt]
 * @param {boolean} [opt.flip] — отразить по горизонтали
 * @param {number} [opt.scale] — во сколько раз больше 32×32
 * @param {number} [opt.alpha]
 * @param {number} [opt.frame] — конкретный кадр, важнее времени (для замаха)
 * @returns {boolean} — нарисовano ли. `false` = зови вектор.
 */
export function drawFieldSprite(ctx, charId, anim, t = 0, opt = {}) {
  const def = CHARACTERS[charId]
  if (!def) return false
  const img = IMAGES.get(def.sheet)
  if (!img) return false
  const a = ANIMS[anim] || ANIMS.idle
  const cell = ANIM_CELL
  const idx = opt.frame != null
    ? opt.frame
    : Math.min(a.frames.length - 1, Math.floor(t * a.fps))
  const frame = a.frames[Math.max(0, Math.min(a.frames.length - 1, idx))]
  const sx = frame * cell
  const sy = (def.firstRow + a.row) * cell
  const scale = opt.scale || 1
  const dw = cell * scale
  const dh = cell * scale
  // Автор советует сдвинуть фигуру на 4–6 пикселей вниз, чтобы она стояла
  // в середине плитки, а не на её краю. Сдвиг дан в долях клетки.
  const dy = -dh / 2 + (opt.groundOffset != null ? opt.groundOffset * scale : 5 * scale)
  const prevAlpha = ctx.globalAlpha
  if (opt.alpha != null) ctx.globalAlpha = prevAlpha * opt.alpha
  if (opt.flip) {
    ctx.save()
    ctx.scale(-1, 1)
    ctx.drawImage(img, sx, sy, cell, cell, -dw / 2, dy, dw, dh)
    ctx.restore()
  } else {
    ctx.drawImage(img, sx, sy, cell, cell, -dw / 2, dy, dw, dh)
  }
  ctx.globalAlpha = prevAlpha
  return true
}

/**
 * Тень фигуры. У лицензионного автора тени нет, а без неё фигура «висит»:
 * он прямо пишет, что тень кладётся слоем умножения между фигурами и полом.
 * Рисуем椭圆 под ногами — это и есть его метод, а не свой.
 */
export function drawFieldShadow(ctx, scale = 1) {
  const prev = ctx.globalAlpha
  ctx.globalAlpha = prev * 0.3
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.ellipse(0, 2, 9 * scale, 3 * scale, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = prev
}

/** Сколько листов приехало — для проверок и для честной надписи в отладке. */
export function loadedSheetCount() {
  return IMAGES.size
}

export const SPRITE_SHEET_COUNT = new Set(Object.values(CHARACTERS).map((c) => c.sheet)).size

/**
 * Плитка пола — 16×16, а кадр персонажа — 32×32.
 *
 * Это два разных размера в одном наборе, и путать их нельзя: автор пишет в
 * своей инструкции «16x16 tiles and a wall height of 32 pixels». Первая версия
 * здесь взяла 32 и молча брала кусок 2×2 плитки вместо одной — то есть на пол
 * выходила бы четверть тайлсета, и заметить это можно было бы только глазами.
 * Поэтому имена разные: FLOOR_CELL — плитка пола, ANIM_CELL — кадр фигуры.
 */
export const FLOOR_CELL = 16
export const ANIM_CELL = 32

// ── СТЕНЫ ИЗ ТАЙЛСЕТА ──────────────────────────────────────────────────────
//
// Фасад стены найден измером: в ряду 30 листа идёт ровная полоса из девяти
// похожих плиток (колонки 12–20), и это единственное место набора, где
// одинаковые плитки стоят подряд в линию. У краёв полосы (колонки 12 и 20)
// рисунок чуть другой — это торцы стены.
//
// Почему стена не 32 пикселя, хотя автор пишет «wall height of 32 pixels»:
// верхней плитки стены рядом нет — в рядах 28, 29 и 31 подходящих плиток нет
// вовсе. Поэтому стена строится из тёмной плитки пола (это её верхняя
// грань, та же плоскость, что пол) и фасада снизу. Ширина стены при этом 32
// пикселя — как у автора, просто верх берётся из набора как «земля, а не
// пол», а не как отдельная плитка.
//
// Отбор проверяется на файле: у фасада обязан быть резкий белый верх и
// тёмный низ, у верха — ровный средний тон без белой шапки.
export const WALL_CAP_L = [30, 12]
export const WALL_BODY = [[30, 13], [30, 14], [30, 15], [30, 16], [30, 17], [30, 18], [30, 19]]
export const WALL_CAP_R = [30, 20]
/** Толщина стены в пикселях мира: 16 верх + 16 фасад. */
export const WALL_THICK = FLOOR_CELL * 2

let wallCanvas = null

/** Темнее обычного пола: верхняя грань стены должна быть глуше. */
function tintTile(g, src, sx, sy, w, h, dx, dy, dark) {
  g.save()
  g.globalAlpha = 1
  g.drawImage(src, sx, sy, w, h, dx, dy, w, h)
  g.restore()
  if (dark) {
    // Затемнение — заливкой поверх, а не «другим тайлом»: в наборе нет
    // отдельной плитки для верха стены, и выдумывать оттенок «похожий на
    // камень» — значит рисовать своё там, где взято лицензионное.
    g.save()
    g.globalAlpha = 0.42
    g.fillStyle = '#000'
    g.fillRect(dx, dy, w, h)
    g.restore()
  }
}

/**
 * Собрать стены арены один раз: верхняя грань по всей ширине, фасад под ней,
 * плюс фасады по левому и правому краю (повёрнутые).
 */
export function buildWallCanvas(worldW, worldH) {
  if (!tileImage) return null
  if (wallCanvas && wallCanvas.width === worldW && wallCanvas.height === worldH) return wallCanvas
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(worldW))
  c.height = Math.max(1, Math.round(worldH))
  const g = c.getContext('2d')
  if (!g) return null
  g.imageSmoothingEnabled = false
  const T = FLOOR_CELL

  // Верхняя грань стены: та же плитка, что пол, но затемнённая.
  for (let x = 0; x < worldW; x += T) {
    const [tr, tc] = FLOOR_TILES[(x / T) % FLOOR_TILES.length | 0]
    tintTile(g, tileImage, tc * T, tr * T, T, T, x, 0, true)
  }
  // Фасад: слева и справа торцы, между ними тело.
  const caps = WALL_BODY.length
  const across = Math.ceil(worldW / T)
  for (let i = 0; i < across; i++) {
    const x = i * T
    const [tr, tc] = i === 0 ? WALL_CAP_L
      : i === across - 1 ? WALL_CAP_R
        : WALL_BODY[(i - 1) % caps]
    g.drawImage(tileImage, tc * T, tr * T, T, T, x, T, T, T)
  }
  // Боковые фасады. Поворот на 90° — стена сбоку встаёт вдоль края комнаты.
  for (const side of [0, 1]) {
    const x0 = side ? worldW - T : 0
    for (let i = 0; i < Math.ceil(worldH / T); i++) {
      const y = i * T
      const [tr, tc] = WALL_BODY[i % caps]
      g.save()
      g.translate(side ? x0 + T : x0, y)
      g.rotate(side ? Math.PI / 2 : -Math.PI / 2)
      g.drawImage(tileImage, tc * T, tr * T, T, T, -T, 0, T, T)
      g.restore()
    }
  }
  wallCanvas = c
  return c
}

export function wallReady() {
  return !!wallCanvas
}

// ── ПОЛ ИЗ ТАЙЛСЕТА ────────────────────────────────────────────────────────
//
// Тот же CC-BY 3.0 набор Calciumtrice, что и персонажи. Пол собирается один раз
// в отдельный холст на весь арену и выводится одним `drawImage` за кадр.
//
// Почему не «найти в тайлсете пол и кидать на лету»: таких плиток на кадр
// выходит около тысячи, и на телефоне это заметно. Один блит вместо тысячи
// вызовов — разница в цене, а не в виде.
//
// Почему плитки отобраны измером, а не на глаз: `scripts/pngReader.mjs` печатает
// по каждой плитке средний тон, разброс и разницу верха с низом. «Земля под
// ногами» — это средний тон, малый разброс и отсутствие резкой горизонтальной
// границы; стена — наоборот, с резкой границей. Отбор дал 14 плиток, и они
// легли кластером в рядах 1–2 и 6 — то есть это действительно пол, а не
// случайные куски.
//
// Семантического попадания здесь не требуется: для пола годится любой
// средний по тону тайл подземелья. Ошибка в выборе видна не как «не то
// изображение», а как «пол другого оттенка».
export const FLOOR_TILES = [
  [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [2, 3], [2, 4], [6, 9], [6, 10], [6, 11],
]


let tileImage = null
let floorCanvas = null

/** Отдать загруженный тайлсет слою изометрии: один файл — одна загрузка. */
export function tilesetImage() {
  return tileImage
}

/** Загрузить тайлсет. Тот же идемпотентный порядок, что у остальных листов. */
export function loadFieldTileset() {
  if (tileImage) return Promise.resolve(true)
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(false)
  }
  return new Promise((done) => {
    const img = new Image()
    img.onload = () => { tileImage = img; done(true) }
    img.onerror = () => done(false)
    img.src = `${BASE}/dungeon.png`
  })
}

/**
 * Собрать пол арены один раз.
 *
 * @returns {HTMLCanvasElement|null} — null, если тайлсет не приехал. Тогда
 *   отрисовка падает назад на процедурный фон, и это не поломка.
 */
export function buildFloorCanvas(worldW, worldH) {
  if (!tileImage) return null
  if (floorCanvas && floorCanvas.width === worldW && floorCanvas.height === worldH) return floorCanvas
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(worldW))
  c.height = Math.max(1, Math.round(worldH))
  const g = c.getContext('2d')
  if (!g) return null
  g.imageSmoothingEnabled = false
  // Выбор плитки — по позиции, а не случайно: иначе пол «дышал» бы при каждом
  // кадре, и это видно глазом как рябь.
  for (let ty = 0; ty < Math.ceil(worldH / FLOOR_CELL); ty++) {
    for (let tx = 0; tx < Math.ceil(worldW / FLOOR_CELL); tx++) {
      const h = (tx * 73856093) ^ (ty * 19349663)
      const [tr, tc] = FLOOR_TILES[Math.abs(h) % FLOOR_TILES.length]
      g.drawImage(tileImage, tc * FLOOR_CELL, tr * FLOOR_CELL, FLOOR_CELL, FLOOR_CELL,
        tx * FLOOR_CELL, ty * FLOOR_CELL, FLOOR_CELL, FLOOR_CELL)
    }
  }
  floorCanvas = c
  return c
}

/** Готов ли пол. Проверяется тестом: пол не должен молчать. */
export function floorReady() {
  return !!floorCanvas
}