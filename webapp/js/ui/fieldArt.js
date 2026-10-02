// Поле Ума — РИСУНОК.
//
// Стиль взят не по вкусу, а по источнику: «The art style of Hades is a 2D dark,
// fantastical pen & ink style» — перо и тушь (стиль Mike Mignola), плюс
// «a lot of bold fluorescent colors are used» — яркие неоновые акценты на
// почти чёрном фоне.
//
// Отсюда три правила, которые этот модуль обязан соблюдать (проверяются
// тестами в tests/fieldArt.test.js):
//
//   1. НИКАКИХ размытых эллипсов вместо фигур. Тело — многоугольник.
//   2. У ВСЕГО есть контур тушью. Без контура фигура не нарисована, а вылеплена.
//   3. Цвет — только акцентом. Заливка фигур приглушённая, светятся мелочи:
//      ядро оковы, аура, кольцо замаха, дуги.
//
// Почему отдельный модуль: раньше рисунок жил внутри экрана, и красивый макет
// ничего не говорил об игре. Теперь макет и игра рисуются одними и теми же
// функциями — расходиться им больше негде.

/** Палитра. Цвета гун — строго по источнику (Idea and Ideology, ч. 1). */
export const ART = {
  ink: '#000000',
  inkSoft: 'rgba(0,0,0,.62)',
  outline: '#000',
  sattva: '#f2f0e8',   // саттва — белый
  rajas: '#ff2d2d',    // раджас — красный
  tamas: '#000000',    // тамас — чёрный
  vaeshya: '#ffc61a',  // вайшья — жёлтый (раджас + тамас)
  gold: '#ffcf4a',
  goldSoft: '#ffe6a8',
  cyan: '#4fe8ff',
  purple: '#b06bff',
  lime: '#9dff5a',
  paper: '#e8e2d4',
  dim: '#a89f8e',
  bodyFoe: '#140e1a',
  bodyFoeEdge: '#3a2f52',
}

/** Многоугольник по массиву [x,y,…]. Основа всех фигур. */
function poly(ctx, pts) {
  ctx.beginPath()
  ctx.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
  ctx.closePath()
}

/** Штриховка тушью: пара диагоналей внутри текущего пути. */
function hatch(ctx, x0, y0, w, h, n, gap, color) {
  ctx.save()
  ctx.clip()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  for (let i = 0; i < n; i++) {
    const x = x0 - h + i * gap
    ctx.beginPath()
    ctx.moveTo(x, y0 + h)
    ctx.lineTo(x + h, y0)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * ОКА (рипу или паша).
 *
 * Форма — рваный десятиугольник с чётким контуром. Внутри — тусклое ядро,
 * снаружи — неоновая обводка ядра и две узкие щели-глаза.
 * Никаких мягких пятен: контур, штриховка, цвет только в ядре.
 */
// ── СИЛУЭТЫ ОК ─────────────────────────────────────────────────────────
// В Hades у каждого типа врага своя форма: никогда не спутаешь, кто идёт.
// У нас ока выглядели все одинаково — отличался только цвет ядра. Теперь
// форма выведена из СОДЕРЖАНИЯ ока: у кродхи шипы, у лобхи тяжёлое днище,
// у гордости плюмаж, у сонной обмякшие плечи. Ничего не выдумано — взято
// то, что уже записано про каждую ока в `content/enemies.json` и в
// `RIPU_BEHAVIOR`/`PASHA_BEHAVIOR`.

/** Ока: тело = рваный многоугольник, заданный долями от полуразмера R. */
export const FOE_SHAPES = {
  // КРОДХА (гнев): острый и рваный — поднятые шипы, широкие плечи.
  krodha: (R) => [
    [0, -R * 1.24], [R * 0.2, -R * 0.86], [R * 0.5, -R * 1.04], [R * 0.62, -R * 0.6],
    [R * 1.06, -R * 0.4], [R * 0.82, R * 0.02], [R * 0.6, R * 0.44], [0, R * 0.88],
    [-R * 0.6, R * 0.44], [-R * 0.82, R * 0.02], [-R * 1.06, -R * 0.4], [-R * 0.62, -R * 0.6],
    [-R * 0.5, -R * 1.04], [-R * 0.2, -R * 0.86],
  ],
  // ЛОБХА (жадность): низкий, широкий, тяжёлый — держит, не отдаёт.
  lobha: (R) => [
    [0, -R * 0.82], [R * 0.56, -R * 0.5], [R * 1.18, -R * 0.1], [R * 1.12, R * 0.4],
    [R * 0.66, R * 0.84], [0, R * 1.0], [-R * 0.66, R * 0.84], [-R * 1.12, R * 0.4],
    [-R * 1.18, -R * 0.1], [-R * 0.56, -R * 0.5],
  ],
  // КАМА (влечение): узкий и высокий — тонкий стан, длинная рука.
  kama: (R) => [
    [0, -R * 1.18], [R * 0.3, -R * 0.7], [R * 0.52, -R * 0.3], [R * 1.24, R * 0.06],
    [R * 0.58, R * 0.3], [R * 0.44, R * 0.66], [0, R * 0.94], [-R * 0.44, R * 0.66],
    [-R * 0.5, R * 0.3], [-R * 0.52, -R * 0.3], [-R * 0.3, -R * 0.7],
  ],
  // МАДА (гордость): высокомерный — плюмаж и раздутые плечи.
  mada: (R) => [
    [0, -R * 1.1], [R * 0.22, -R * 0.92], [R * 0.74, -R * 0.86], [R * 0.88, -R * 0.34],
    [R * 0.62, R * 0.3], [0, R * 0.84], [-R * 0.62, R * 0.3], [-R * 0.88, -R * 0.34],
    [-R * 0.74, -R * 0.86], [-R * 0.22, -R * 0.92],
  ],
  // МАТСАРЬЯ (досада): тонкий и длинный, весь — жалоба.
  matsarya: (R) => [
    [0, -R * 1.16], [R * 0.26, -R * 0.78], [R * 0.46, -R * 0.4], [R * 0.9, -R * 0.62],
    [R * 0.52, R * 0.02], [R * 0.56, R * 0.44], [0, R * 1.08], [-R * 0.56, R * 0.44],
    [-R * 0.52, R * 0.02], [-R * 0.9, -R * 0.62], [-R * 0.46, -R * 0.4], [-R * 0.26, -R * 0.78],
  ],
  // НИДРА (сон): обмякшая — скошенная голова, провисшие плечи.
  nidra: (R) => [
    [R * 0.22, -R * 0.84], [R * 0.7, -R * 0.52], [R * 0.94, R * 0.02], [R * 0.7, R * 0.52],
    [0, R * 0.78], [-R * 0.7, R * 0.52], [-R * 0.94, R * 0.02], [-R * 0.7, -R * 0.52],
    [-R * 0.34, -R * 0.8],
  ],
  // ПАША (внешние оковы) — восемь разных фигур, по одной на каждую оку.
  // Внешние оковы давят извне, поэтому у них чужеродные, нечеловеческие
  // очертания. Имена — из `content/enemies.json`, форма — по смыслу имени.
  bhaya_pasha: (R) => [                                    // Бхая — сковывает
    [0, -R * 1.0], [R * 0.34, -R * 0.72], [R * 1.12, -R * 0.5], [R * 0.7, -R * 0.1],
    [R * 1.06, R * 0.3], [R * 0.52, R * 0.76], [0, R * 0.86], [-R * 0.52, R * 0.76],
    [-R * 1.06, R * 0.3], [-R * 0.7, -R * 0.1], [-R * 1.12, -R * 0.5], [-R * 0.34, -R * 0.72],
  ],
  lajja: (R) => [                                           // Ладжа — прячется
    [0, -R * 0.72], [R * 0.5, -R * 0.44], [R * 0.9, R * 0.1], [R * 0.7, R * 0.6],
    [0, R * 0.86], [-R * 0.7, R * 0.6], [-R * 0.9, R * 0.1], [-R * 0.5, -R * 0.44],
  ],
  ghrna: (R) => [                                           // Грна (ghrńá) — жжёт
    [0, -R * 1.22], [R * 0.26, -R * 0.84], [R * 0.86, -R * 0.86], [R * 0.6, -R * 0.24],
    [R * 0.96, R * 0.36], [R * 0.4, R * 0.72], [0, R * 0.8], [-R * 0.4, R * 0.72],
    [-R * 0.96, R * 0.36], [-R * 0.6, -R * 0.24], [-R * 0.86, -R * 0.86], [-R * 0.26, -R * 0.84],
  ],
  samshaya_pasha: (R) => [                                 // Шаунка (shauṋká) — подтачивает
    [0, -R * 1.06], [R * 0.3, -R * 0.78], [R * 1.16, -R * 0.44], [R * 0.62, -R * 0.02],
    [R * 0.5, R * 0.5], [0, R * 1.1], [-R * 0.5, R * 0.5], [-R * 0.62, -R * 0.02],
    [-R * 1.16, -R * 0.44], [-R * 0.3, -R * 0.78],
  ],
  kula: (R) => [                                            // Кула — родовитый
    [0, -R * 1.04], [R * 0.66, -R * 0.9], [R * 0.82, -R * 0.36], [R * 0.62, R * 0.34],
    [R * 0.3, R * 0.8], [0, R * 0.92], [-R * 0.3, R * 0.8], [-R * 0.62, R * 0.34],
    [-R * 0.82, -R * 0.36], [-R * 0.66, -R * 0.9],
  ],
  sila: (R) => [                                            // Шила — холодная
    [0, -R * 1.26], [R * 0.24, -R * 0.9], [R * 0.52, -R * 0.5], [R * 0.46, R * 0.14],
    [R * 0.66, R * 0.66], [0, R * 0.94], [-R * 0.66, R * 0.66], [-R * 0.46, R * 0.14],
    [-R * 0.52, -R * 0.5], [-R * 0.24, -R * 0.9],
  ],
  mana_pasha: (R) => [                                     // Мана — напыщенный
    [0, -R * 0.94], [R * 0.2, -R * 0.82], [R * 0.86, -R * 0.94], [R * 0.96, -R * 0.28],
    [R * 0.66, R * 0.3], [0, R * 0.78], [-R * 0.66, R * 0.3], [-R * 0.96, -R * 0.28],
    [-R * 0.86, -R * 0.94], [-R * 0.2, -R * 0.82],
  ],
  jugupsa: (R) => [                                         // Джугупса — шепчущая
    [0, -R * 1.14], [R * 0.42, -R * 0.8], [R * 0.64, -R * 0.36], [R * 0.38, R * 0.06],
    [R * 0.9, R * 0.44], [R * 0.5, R * 0.82], [0, R * 0.96], [-R * 0.5, R * 0.82],
    [-R * 0.9, R * 0.44], [-R * 0.38, R * 0.06], [-R * 0.64, -R * 0.36], [-R * 0.42, -R * 0.8],
  ],
  // Общая фигура паши — на случай, если попадётся незнакомая внешняя оковь
  pasha: (R) => [
    [0, -R * 1.06], [R * 0.44, -R * 0.74], [R * 1.08, -R * 0.62], [R * 0.78, -R * 0.08],
    [R * 1.0, R * 0.36], [R * 0.5, R * 0.72], [0, R * 0.9], [-R * 0.5, R * 0.72],
    [-R * 1.0, R * 0.36], [-R * 0.78, -R * 0.08], [-R * 1.08, -R * 0.62], [-R * 0.44, -R * 0.74],
  ],
}

/** Профиль ока по id. Ока без профиля — обычный овал. */
export function foeShape(id) {
  return FOE_SHAPES[id] || ((R) => [
    [0, -R], [R * 0.42, -R * 0.66], [R * 0.92, -R * 0.44], [R * 0.76, -R * 0.06],
    [R * 0.58, R * 0.36], [0, R], [-R * 0.58, R * 0.36], [-R * 0.76, -R * 0.06],
    [-R * 0.92, -R * 0.44], [-R * 0.42, -R * 0.66],
  ])
}

export function drawFoeArt(ctx, f, t) {
  const boss = !!f.isBoss
  const R = boss ? 44 : 18          // полуразмер
  const dark = f.trueLight === 'dark'

  // ── тень на земле: жёсткая, не размытая ──
  ctx.fillStyle = ART.inkSoft
  ctx.beginPath()
  ctx.ellipse(0, R * 0.92, R * 0.92, R * 0.24, 0, 0, 7)
  ctx.fill()

  // ── тело: рваный многоугольник ПО ФИГУРЕ ЭТОЙ ОКИ ───────────────
  // У ока свой профиль, у паши — общий «скрепный». Владыка оставляет
  // прежнюю общую форму: он и должен выглядеть как общий, а не как кто-то.
  // `poly` ждёт плоский список, профили записаны парами — сплющиваем здесь.
  const shapeFn = boss ? foeShape() : foeShape(f.id)
  const pts = shapeFn(R).flat()
  poly(ctx, pts)
  ctx.fillStyle = boss ? '#1a0d12' : ART.bodyFoe
  ctx.fill()

  // штриховка тушью по телу — объём без градиента
  hatch(ctx, -R, -R, R * 2, R * 2, boss ? 7 : 4, boss ? 12 : 9, 'rgba(0,0,0,.45)')

  // ── контур тушью: главный, жёсткий ──
  poly(ctx, pts)
  ctx.strokeStyle = ART.outline
  ctx.lineWidth = boss ? 2.4 : 1.7
  ctx.stroke()

  // внутренняя неоновая кромка — «свет изнутри», тонкая
  poly(ctx, pts)
  ctx.strokeStyle = dark ? 'rgba(176,107,255,.5)' : 'rgba(242,240,232,.42)'
  ctx.lineWidth = 0.9
  ctx.stroke()

  // ── ядро: единственное место, где горит ──
  const coreR = boss ? 15 : 8.5
  const coreY = R * 0.12
  ctx.save()
  ctx.shadowBlur = boss ? 16 : 10
  ctx.shadowColor = dark ? ART.purple : ART.sattva
  ctx.fillStyle = dark ? ART.purple : ART.sattva
  ctx.beginPath()
  ctx.ellipse(0, coreY, coreR, coreR * 1.2, 0, 0, 7)
  ctx.fill()
  ctx.restore()

  // ── глаза: узкие щели, а не точки ──
  const eyeY = -R * 0.34
  const eyeW = boss ? 11 : 6.2
  const eyeH = boss ? 3.4 : 2.2
  const gap = boss ? 13 : 7.4
  ctx.save()
  ctx.shadowBlur = boss ? 12 : 7
  ctx.shadowColor = dark ? ART.purple : ART.sattva
  ctx.fillStyle = dark ? ART.purple : ART.sattva
  ctx.fillRect(-gap - eyeW / 2, eyeY, eyeW, eyeH)
  ctx.fillRect(gap - eyeW / 2, eyeY, eyeW, eyeH)
  ctx.restore()

  // ── аура (вивека): метка над головой ──
  const L = f.shownLight
  const ay = -R - 13
  if (L === 'unknown') {
    // неведение закрыло различение: штрихованный квадрат вместо цвета
    ctx.save()
    ctx.strokeStyle = '#5a4d70'
    ctx.lineWidth = 1
    ctx.fillStyle = 'rgba(20,16,28,.9)'
    ctx.fillRect(-6, ay - 6, 12, 12)
    ctx.strokeRect(-6, ay - 6, 12, 12)
    ctx.strokeStyle = '#8a7fa8'
    for (let i = -5; i <= 5; i += 3) {
      ctx.beginPath(); ctx.moveTo(-5, ay + i); ctx.lineTo(5, ay + i + 8); ctx.stroke()
    }
    ctx.restore()
  } else {
    const col = L === 'light' ? ART.sattva : '#6b3fa8'
    ctx.save()
    ctx.shadowBlur = 9
    ctx.shadowColor = col
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(0, ay, boss ? 4.6 : 3.4, 0, 7)
    ctx.fill()
    ctx.restore()
  }
  ctx.font = `bold ${boss ? 10 : 9}px ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(0,0,0,.8)'
  const auraTxt = L === 'unknown' ? '?' : L === 'light' ? 'видья' : 'авидья'
  ctx.strokeText(auraTxt, 0, ay - 8)
  ctx.fillStyle = L === 'light' ? ART.sattva : ART.dim
  ctx.fillText(auraTxt, 0, ay - 8)
}

/**
 * САДХАКА.
 *
 * Не эллипс. Фигура: роба-трапеция со срезом, покатые плечи, круглая голова,
 * руки сложены на животе. На ткани — штриховка, как на рисунке пером.
 * `dir` — куда смотрит (-1 влево, 1 вправо).
 */
export function drawSadhakaArt(ctx, dir = 1, opt = {}) {
  const H = 46
  ctx.save()
  if (opt.flip) ctx.scale(-1, 1)

  // тень
  ctx.fillStyle = ART.inkSoft
  ctx.beginPath()
  ctx.ellipse(0, 2, 11, 3.4, 0, 0, 7)
  ctx.fill()

  // ── роба ──
  poly(ctx, [7, -H + 12, 14, -H + 16, 19, 2, -19, 2, -14, -H + 16, -7, -H + 12])
  ctx.fillStyle = '#efe7d7'
  ctx.fill()
  hatch(ctx, -20, -H + 10, 40, H, 7, 6, 'rgba(0,0,0,.10)')
  poly(ctx, [7, -H + 12, 14, -H + 16, 19, 2, -19, 2, -14, -H + 16, -7, -H + 12])
  ctx.strokeStyle = ART.outline
  ctx.lineWidth = 1.5
  ctx.stroke()

  // ── плечи / воротник ──
  poly(ctx, [0, -H + 8, 8, -H + 14, 5, -H + 19, -5, -H + 19, -8, -H + 14])
  ctx.fillStyle = '#fbf8f0'
  ctx.fill()
  ctx.strokeStyle = ART.outline
  ctx.lineWidth = 1.2
  ctx.stroke()

  // ── руки сложены на животе ──
  poly(ctx, [-9, -H + 26, 9, -H + 26, 7, -H + 32, -7, -H + 32])
  ctx.fillStyle = '#f2ead9'
  ctx.fill()
  ctx.strokeStyle = ART.outline
  ctx.lineWidth = 1
  ctx.stroke()

  // ── голова ──
  ctx.beginPath()
  ctx.ellipse(0, -H + 4, 5.6, 6.4, 0, 0, 7)
  ctx.fillStyle = '#fdfaf2'
  ctx.fill()
  ctx.strokeStyle = ART.outline
  ctx.lineWidth = 1.2
  ctx.stroke()

  ctx.restore()
}

/**
 * ПРОСЯЩИЙ (варьа севы). Фигура в платье + тонкая золотая линия в небо —
 * «зов». Ока его слышит, игрок — тоже.
 */
export function drawWareArt(ctx, w, t) {
  const H = 30
  ctx.save()
  // тень
  ctx.fillStyle = ART.inkSoft
  ctx.beginPath()
  ctx.ellipse(0, 1, 8, 2.6, 0, 0, 7)
  ctx.fill()
  // платье
  poly(ctx, [4, -H + 8, 8, -H + 10, 12, 1, -12, 1, -8, -H + 10, -4, -H + 8])
  ctx.fillStyle = w.done ? '#2a2430' : '#5b5163'
  ctx.fill()
  hatch(ctx, -12, -H + 6, 24, H, 4, 6, 'rgba(0,0,0,.22)')
  poly(ctx, [4, -H + 8, 8, -H + 10, 12, 1, -12, 1, -8, -H + 10, -4, -H + 8])
  ctx.strokeStyle = ART.outline
  ctx.lineWidth = 1.2
  ctx.stroke()
  // голова
  ctx.beginPath()
  ctx.ellipse(0, -H + 4, 4.4, 5, 0, 0, 7)
  ctx.fillStyle = w.done ? '#4a4450' : '#9a8f7e'
  ctx.fill()
  ctx.strokeStyle = ART.outline
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()

  if (w.done) return
  // зов: пунктирная золотая линия вверх + слова
  ctx.save()
  ctx.strokeStyle = 'rgba(255,207,74,.75)'
  ctx.lineWidth = 1.2
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(0, -H)
  ctx.lineTo(0, -H - 26)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.font = 'italic 10px Georgia, serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = ART.paper
  ctx.shadowBlur = 5
  ctx.shadowColor = '#000'
  ctx.fillText(w.call || '', 0, -H - 32)
  ctx.restore()
}

/**
 * СОКРОВИЩЕ (Dead Cells: containers; Hades: горшки). Ломаемый сосуд в углу.
 *
 * Читаемость здесь важнее красоты: игрок должен за метр узнать, что это
 * вещь, которую можно разбить, и по трещине — сколько ещё ударов. Поэтому
 * горшок тёмный с СВЕТЛЫМ контуром (а не тёмный на тёмном, как тень), а
 * сундук отличается формой и золотым ободком, а не только размером.
 *
 * `hp`/`maxHp` рисуются как трещина: игрок видит, что сосуд уже бит, и не
 * тратит лишний удар, думая, что он цел.
 */
export function drawPotArt(ctx, pot) {
  ctx.save()
  if (pot.chest) {
    // сундук — прямоугольник, ободок золотой, замок светлее
    ctx.fillStyle = ART.inkSoft
    ctx.beginPath()
    ctx.ellipse(0, 1, 14, 3.6, 0, 0, 7)
    ctx.fill()
    ctx.fillStyle = '#3a2a1e'
    ctx.strokeStyle = ART.goldSoft
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.rect(-13, -18, 26, 19)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-13, -10)
    ctx.lineTo(13, -10)
    ctx.strokeStyle = 'rgba(255,207,74,.55)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = ART.gold
    ctx.beginPath()
    ctx.rect(-2.6, -14, 5.2, 4.4)
    ctx.fill()
  } else {
    // горшок — тёмный сосуд со светлым контуром и трещиной по числу ударов
    ctx.fillStyle = ART.inkSoft
    ctx.beginPath()
    ctx.ellipse(0, 1, 9, 2.8, 0, 0, 7)
    ctx.fill()
    ctx.fillStyle = '#3a2a1e'
    ctx.strokeStyle = ART.dim
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(-8, 2)
    ctx.quadraticCurveTo(-11, -8, -6, -16)
    ctx.lineTo(6, -16)
    ctx.quadraticCurveTo(11, -8, 8, 2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  // трещина — по одному штриху на каждый оставшийся удар
  const left = Math.max(0, pot.hp)
  ctx.strokeStyle = ART.paper
  ctx.lineWidth = 1
  for (let i = 0; i < left; i++) {
    ctx.beginPath()
    ctx.moveTo(-4 + i * 3, -14)
    ctx.lineTo(-1 + i * 3, -7)
    ctx.lineTo(-4 + i * 3, 0)
    ctx.stroke()
  }
  ctx.restore()
}

/** Цветок на месте освобождённой оковы — след, а не добыча. */
export function drawFlowerArt(ctx, t) {
  ctx.save()
  const sway = Math.sin(t * 1.2) * 0.12
  ctx.strokeStyle = '#3d6b30'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -8)
  ctx.stroke()
  ctx.translate(0, -8)
  ctx.rotate(sway)
  poly(ctx, [0, -5, 4.6, -2, 3, 4, -3, 4, -4.6, -2])
  ctx.save()
  ctx.shadowBlur = 7
  ctx.shadowColor = 'rgba(157,255,90,.55)'
  ctx.fillStyle = ART.lime
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = 'rgba(0,0,0,.55)'
  ctx.lineWidth = 0.9
  ctx.stroke()
  ctx.restore()
}
