// МИНИ-СТЕНД DOM ДЛЯ ТЕСТОВ.
//
// Зачем. Экраны игры — двадцать функций в main.js и ещё десять в
// webapp/js/ui/screens/. Ни одну из них не покрывал ни один тест: тесты
// проверяли ядро, а ядро — это чистые числа. Экран может падать при
// `undefined` в поле профиля, и никто этого не увидит, пока игрок не дойдёт
// до этого места через три забега.
//
// Ставить настоящий jsdom нельзя: в проекте нет сети и лишних зависимостей.
// А нужна тут ровно одна поверхность — вот этот список:
//
//   document.createElement / createTextNode / body / getElementById / readyState
//   window.addEventListener / innerHeight / AudioContext / Telegram
//   navigator.vibrate / matchMedia / requestAnimationFrame
//   canvas.getContext('2d') — 30 методов, ровно те, что зовёт отрисовка
//
// Всё это перечислено в `MISSING_*` внизу: если игра начнёт просить что-то
// ещё, стенд скажет об этом точно, а не упадёт молча.

// ── элемент ────────────────────────────────────────────────────────────
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPng } from '../../scripts/pngReader.mjs'

let nodeId = 0

class StubNode {
  constructor(nodeType) {
    this.nodeType = nodeType
    this.childNodes = []
    this.parentNode = null
    this._listeners = new Map()
    this._id = ++nodeId
  }

  get firstChild() { return this.childNodes[0] || null }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1) }

  /**
   * Поиск по классу или #id. Игра берёт `.field-ui` и `#fb-parry` — без
   * этого стенд падал на первом же экране боя.
   */
  querySelector(sel) {
    const all = []
    const walk = (n) => {
      if (!n || n.nodeType !== 1) return
      all.push(n)
      for (const c of n.childNodes) walk(c)
    }
    walk(this)
    for (const n of all) {
      if (sel.startsWith('.') && readClass(n).split(/\s+/).includes(sel.slice(1))) return n
      if (sel.startsWith('#') && n.id === sel.slice(1)) return n
      if (n.tagName && n.tagName === sel.toUpperCase()) return n
    }
    return null
  }

  querySelectorAll(sel) {
    const out = []
    const walk = (n) => {
      if (!n || n.nodeType !== 1) return
      if (sel.startsWith('.') && readClass(n).split(/\s+/).includes(sel.slice(1))) out.push(n)
      if (sel.startsWith('#') && n.id === sel.slice(1)) out.push(n)
      for (const c of n.childNodes) walk(c)
    }
    walk(this)
    return out
  }

  /** Присваивание id и classname идёт через setAttribute — синхронизируем. */
  get className2() { return this.className }

  append(...kids) {
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false) continue
      const node = k.nodeType ? k : new StubText(String(k))
      node.parentNode = this
      this.childNodes.push(node)
    }
  }

  removeChild(node) {
    const i = this.childNodes.indexOf(node)
    if (i >= 0) this.childNodes.splice(i, 1)
    node.parentNode = null
    return node
  }

  remove() { if (this.parentNode) this.parentNode.removeChild(this) }

  /**
   * textContent — не просто свойство. Игра ставит `btn.textContent = 'Готово'`,
   * и на стенде без этого кнопка оставалась пустой: замена текста ничего не
   * делала, и тест «не находил кнопку, которой нет».
   */
  get textContent() { return childText(this) }
  set textContent(v) {
    this.childNodes = []
    if (v !== '' && v != null) this.append(new StubText(String(v)))
  }

  get innerHTML() { return this.textContent }
  set innerHTML(v) { this.textContent = v }

  setAttribute(name, value) {
    if (name === 'class') this.className = value
    else if (name === 'style') this.style.cssText = value
    else this[name] = value
    this._attrs = this._attrs || {}
    this._attrs[name] = value
  }

  getAttribute(name) {
    if (name === 'class') return this.className
    return this._attrs ? this._attrs[name] : null
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, [])
    this._listeners.get(type).push(fn)
  }

  removeEventListener(type, fn) {
    const a = this._listeners.get(type) || []
    const i = a.indexOf(fn)
    if (i >= 0) a.splice(i, 1)
  }

  dispatch(type, ev = {}) {
    for (const fn of [...(this._listeners.get(type) || [])]) fn({ type, target: this, preventDefault() {}, stopPropagation() {}, ...ev })
  }

  /**
   * Захват пальца. Игра вешает его на холст, чтобы палец не «потерялся»,
   * если игрок увёл его за край. На стенде метода не было — код в `try`
   * его проглатывал, и мышь-экран оставался непроверенным.
   */
  setPointerCapture(id) { this._captured = id }
  releasePointerCapture(id) { if (this._captured === id) this._captured = undefined }
  hasPointerCapture(id) { return this._captured === id }

  // Клик по кнопке — то, как игрок нажимает. Собираем потом в обход дерева.
  click() { this.dispatch('click') }
}

// ── текст ──────────────────────────────────────────────────────────────
class StubText extends StubNode {
  constructor(text) { super(3); this.data = text }
  get textContent() { return this.data }
}

/**
 * Текст узла целиком, вместе с потомками.
 *
 * Функция была ВЫЗВАНА в `textContent` (`get textContent() { return
 * childText(this) }`), но нигде не была определена. Ни один тест этого не
 * задевал, потому что все ходили через `textOf`, у которого своя обходка:
 * мёртвый вызов в стенде выглядел как работающий код. Нашёлся при проверке
 * подсказок в бою — там `textContent` читается прямо с элемента.
 */
function childText(node) {
  let out = ''
  for (const c of node.childNodes || []) {
    if (c.nodeType === 3) out += c.data
    else out += childText(c)
  }
  return out
}

/**
 * style: игра пишет и через cssText, и через setProperty/getPropertyValue.
 * Плоский объект со строкой в cssText — этого не хватало: подсветка узла
 * падала с «style.setProperty is not a function».
 */
function makeStyle() {
  const st = { cssText: '', setProperty(k, v) { st['_' + k] = String(v) }, getPropertyValue(k) { return st['_' + k] || '' }, removeProperty(k) { delete st['_' + k] } }
  return st
}

/** classList поверх строкового className — как в настоящем DOM. */
function readClass(el) {
  return String(el.className || el._attrs?.class || '')
}

function makeClassList(el) {
  const read = () => String(el.className || el._attrs?.class || '').split(/\s+/).filter(Boolean)
  const write = (list) => { el.className = [...new Set(list)].join(' ') }
  return {
    add: (...c) => write([...read(), ...c]),
    remove: (...c) => write(read().filter((x) => !c.includes(x))),
    toggle: (c, on) => {
      const has = read().includes(c)
      const want = on === undefined ? !has : !!on
      write(want ? [...read(), c] : read().filter((x) => x !== c))
      return want
    },
    contains: (c) => read().includes(c),
    get length() { return read().length },
    toString: () => el.className || '',
  }
}

// ── canvas 2d ──────────────────────────────────────────────────────────
// Методы — ровно те, что зовёт отрисовка (проверено grep-ом по ui/).
const CTX_METHODS = [
  'save', 'restore', 'scale', 'rotate', 'translate', 'setTransform',
  'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'rect',
  'bezierCurveTo', 'quadraticCurveTo', 'clip',
  'fill', 'stroke', 'strokeRect', 'clearRect',
  'fillText', 'strokeText', 'measureText',
  'setLineDash',
]

function makeCtx(canvas) {
  // ── Матрица 2×3 ──
  //
  // Зачем она здесь: пол комнаты — ромбы, они ложатся внахлёст, и прозрачные
  // углы соседней плитки НЕ должны стирать её соседа. Раньше стенд копировал
  // альфу как есть, и изометрический пол выходил кольцом: оставались только
  // границы ромбов. Это была поломка прибора, а не рисунка, и она выглядела
  // как «пол нарисован неправильно» — выглядело бы глазом, если бы глаз был.
  //
  // Теперь наложение честное (`source-over` как в браузере) и `source-atop` для
  // затемнения по глубине. Плюс скос через `transform`: без него фасад стены
  // в принципе нельзя было бы проверить — он рисуется именно наклоном.
  const I = [1, 0, 0, 1, 0, 0]
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ]
  let M = I.slice()
  const stack = []

  const ctx = {
    canvas: canvas || null,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt',
    font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    shadowBlur: 0, shadowColor: 'transparent',
    imageSmoothingEnabled: true,
    measureText: (t) => ({ width: String(t).length * 6 }),
  }
  for (const m of CTX_METHODS) ctx[m] = () => {}
  ctx.save = () => { stack.push(M.slice()); stack.push([ctx.globalAlpha, ctx.globalCompositeOperation]) }
  ctx.restore = () => {
    const mode = stack.pop()
    M = stack.pop() || I.slice()
    if (mode) { ctx.globalAlpha = mode[0]; ctx.globalCompositeOperation = mode[1] }
  }
  ctx.transform = (a, b, c, d, e, f) => { M = mul(M, [a, b, c, d, e, f]) }
  ctx.setTransform = (a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) => { M = [a, b, c, d, e, f] }
  ctx.translate = (x, y) => { M = mul(M, [1, 0, 0, 1, x, y]) }
  ctx.scale = (x, y) => { M = mul(M, [x, 0, 0, y, 0, 0]) }
  ctx.rotate = (a) => { M = mul(M, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]) }
  ctx.createLinearGradient = (x0 = 0, y0 = 0, x1 = 0, y1 = 1) => {
    const g = { __grad: { x0, y0, x1, y1, stops: [] }, addColorStop(t, c) { this.__grad.stops.push([t, c]) } }
    return g
  }
  ctx.createRadialGradient = (x0 = 0, y0 = 0, r0 = 0, x1 = 0, y1 = 0, r1 = 1) => {
    const g = { __grad: { x0, y0, x1, y1, r0, r1, radial: true, stops: [] }, addColorStop(t, c) { this.__grad.stops.push([t, c]) } }
    return g
  }

  // ── Цвет ──
  //
  // Заливка нужна не для красоты прибора, а ради одного утверждения: «дальний
  // край комнаты темнее ближнего». Без заливки это нечем проверить — а глазом
  // здесь не проверить ничего.
  const parseColour = (c) => {
    if (Array.isArray(c)) return [c[0], c[1], c[2], c.length > 3 ? c[3] : 1]
    const s = String(c).trim()
    let m = /^#([0-9a-f]{3})$/i.exec(s)
    if (m) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16), 1]
    m = /^#([0-9a-f]{6})$/i.exec(s)
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1]
    m = /^rgba?\(([^)]+)\)$/i.exec(s)
    if (m) {
      const p = m[1].split(',').map((v) => parseFloat(v))
      return [p[0] || 0, p[1] || 0, p[2] || 0, p.length > 3 ? p[3] : 1]
    }
    return [255, 0, 255, 1]   // незнакомый цвет виден сразу, а не тихо
  }

  const gradAt = (gr, x, y) => {
    const stops = gr.stops
    if (!stops.length) return [0, 0, 0, 0]
    if (!gr.__lut) {
      // Таблица на 256 шагов вдоль оси градиента, считается один раз на градиент.
      // Без неё каждый пиксель полноэкранной заливки снова и снова считает
      // положение и смешивает цвета — проверка вставала по таймауту, а не
      // говорила правду. Шаг 1/255 незаметен глазом, а работы в 256 раз меньше.
      const lut = new Float32Array(256 * 4)
      for (let i = 0; i < 256; i++) lut.set(gradColourAt(stops, i / 255), i * 4)
      gr.__lut = lut
    }
    let t
    if (gr.radial) {
      // Без Math.hypot: он заметно медленнее, а вызывается на каждый пиксель
      // полноэкранной заливки.
      const ddx = x - gr.x1
      const ddy = y - gr.y1
      const d = Math.sqrt(ddx * ddx + ddy * ddy)
      t = gr.r1 > gr.r0 ? (d - gr.r0) / (gr.r1 - gr.r0) : 0
    } else {
      const dx = gr.x1 - gr.x0
      const dy = gr.y1 - gr.y0
      const len = dx * dx + dy * dy
      t = len ? ((x - gr.x0) * dx + (y - gr.y0) * dy) / len : 0
    }
    const i = (t <= 0 ? 0 : t >= 1 ? 255 : (t * 255) | 0) * 4
    // Результат кладётся в общий буфер, а не в новый массив. Новый массив на
    // каждый пиксель полноэкранной заливки — это миллион мелких объектов в
    // кадре; сборщик мусора съедал больше времени, чем сама растеризация.
    GRAD_OUT[0] = gr.__lut[i]
    GRAD_OUT[1] = gr.__lut[i + 1]
    GRAD_OUT[2] = gr.__lut[i + 2]
    GRAD_OUT[3] = gr.__lut[i + 3]
    return GRAD_OUT
  }

  const GRAD_OUT = new Float32Array(4)

  /** Цвет градиента в точке `t`, со цветами разобранными. */
  const gradColourAt = (stops, t) => {
    const ps = stops.map(([o, c]) => [o, parseColour(c)])
    let a = ps[0]
    let b = ps[ps.length - 1]
    for (let i = 0; i < ps.length - 1; i++) {
      if (t >= ps[i][0] && t <= ps[i + 1][0]) { a = ps[i]; b = ps[i + 1]; break }
    }
    const span = b[0] - a[0]
    const k = span ? (t - a[0]) / span : 0
    return [
      a[1][0] + (b[1][0] - a[1][0]) * k,
      a[1][1] + (b[1][1] - a[1][1]) * k,
      a[1][2] + (b[1][2] - a[1][2]) * k,
      a[1][3] + (b[1][3] - a[1][3]) * k,
    ]
  }

  /** Положить цвет в пиксель с учётом прозрачности и режима наложения. */
  const put = (px, di, rgb, alpha, gaArg = null, atopArg = null) => {
    const ga = (gaArg === null ? Math.max(0, Math.min(1, ctx.globalAlpha)) : gaArg)
      * Math.max(0, Math.min(1, alpha))
    if (ga <= 0) return
    const atop = atopArg === null ? ctx.globalCompositeOperation === 'source-atop' : atopArg
    const da = px.data[di + 3]
    // Две частые дороги обходятся без деления: непрозрачная заливка по пустому
    // месту — это буквально три записи в буфер.
    if (ga >= 1 && da === 0) {
      px.data[di] = rgb[0]; px.data[di + 1] = rgb[1]; px.data[di + 2] = rgb[2]; px.data[di + 3] = 255
      return
    }
    if (atop && da === 0) return
    const sa = ga
    const daf = da / 255
    const oa = atop ? daf : sa + daf * (1 - sa)
    if (oa <= 0) { px.data[di + 3] = 0; return }
    for (let k = 0; k < 3; k++) {
      px.data[di + k] = Math.round((rgb[k] * sa + px.data[di + k] * daf * (1 - sa)) / oa)
    }
    px.data[di + 3] = Math.round(oa * 255)
  }

  const ensure = (w, h) => {
    if (!canvas) return null
    if (!canvas.__px || canvas.__px.width !== w || canvas.__px.height !== h) {
      canvas.__px = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }
    }
    return canvas.__px
  }
  if (canvas) ensure(canvas.width || 300, canvas.height || 150)

  ctx.clearRect = (x, y, w, h) => {
    const px = ensure(canvas.width || 300, canvas.height || 150)
    if (!px) return
    for (let yy = Math.max(0, y | 0); yy < Math.min(px.height, (y + h) | 0); yy++) {
      for (let xx = Math.max(0, x | 0); xx < Math.min(px.width, (x + w) | 0); xx++) {
        const i = (yy * px.width + xx) * 4
        px.data[i] = px.data[i + 1] = px.data[i + 2] = px.data[i + 3] = 0
      }
    }
  }

  // Только форма (img, sx, sy, sw, sh, dx, dy, dw, dh) и (img, dx, dy).
  //
  // Наложение — честное, как в браузере: прозрачный пиксель источника не
  // стирает то, что под ним. Матрица учитывается обратным отображением: каждый
  // пиксель результата переводится обратно в координаты источника.
  ctx.drawImage = (img, ...a) => {
    const px = canvas && ensure(canvas.width || 300, canvas.height || 150)
    // Источник — либо картинка (`Image`), либо ХОЛСТ. Второе нужно, чтобы пол и
    // стены комнаты действительно появились на собранном экране: слои строятся
    // в отдельных холстах и выводятся на экран одним `drawImage`, а раньше стенд
    // такие вызовы молча пропускал. То есть на экране в проверках комнаты не
    // было — и «пол нарисован правильно» было нечем подтвердить.
    const src = img && (img.__img || img.__px)
    if (!px || !src) return
    // Размер источника лежит под двумя именами: у картинки это `w`/`h`
    // (`scripts/pngReader.mjs`), у буфера холста — `width`/`height`. Раньше
    // читалось только `w`, и вызов с холстом-источником молча рисовал пустоту:
    // `NaN` в размерах, индекс за пределами буфера, ноль пикселей. То есть пол
    // и стены комнаты на экране не появлялись, а проверка «модуль правильный»
    // была зелёной.
    const srcW = src.w !== undefined ? src.w : src.width
    const srcH = src.h !== undefined ? src.h : src.height
    if (!srcW || !srcH) return
    let sx = 0; let sy = 0; let sw = srcW; let sh = srcH
    let dx; let dy; let dw; let dh
    if (a.length >= 8) { [sx, sy, sw, sh, dx, dy, dw, dh] = a }
    else if (a.length >= 4) { [dx, dy, dw, dh] = a; sw = img.width || srcW; sh = img.height || srcH }
    else if (a.length >= 2) { [dx, dy] = a; dw = img.width || srcW; dh = img.height || srcH }
    else return
    const sx0 = Math.max(0, sx | 0); const sy0 = Math.max(0, sy | 0)
    const sw0 = Math.max(1, Math.min(sw | 0, srcW - sx0))
    const sh0 = Math.max(1, Math.min(sh | 0, srcH - sy0))
    const dw0 = Math.max(1, dw | 0); const dh0 = Math.max(1, dh | 0)

    // Обратная матрица: из точки экрана в точку источника.
    const det = M[0] * M[3] - M[1] * M[2]
    if (!det) return
    const ia = M[3] / det
    const ib = -M[1] / det
    const ic = -M[2] / det
    const id = M[0] / det
    const ie = (M[2] * M[5] - M[3] * M[4]) / det
    const if_ = (M[1] * M[4] - M[0] * M[5]) / det

    const cs = [[dx, dy], [dx + dw, dy], [dx, dy + dh], [dx + dw, dy + dh]].map(([x, y]) => [
      M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5],
    ])
    const bx0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[0]))))
    const bx1 = Math.min(px.width, Math.ceil(Math.max(...cs.map((c) => c[0]))))
    const by0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[1]))))
    const by1 = Math.min(px.height, Math.ceil(Math.max(...cs.map((c) => c[1]))))
    const ga = Math.max(0, Math.min(1, ctx.globalAlpha))
    const atop = ctx.globalCompositeOperation === 'source-atop'

    for (let ty = by0; ty < by1; ty++) {
      for (let tx = bx0; tx < bx1; tx++) {
        // Пиксель результата → точка в прямоугольнике назначения → источник.
        // Смещение `dx, dy` вычитается обязательно: обратная матрица даёт
        // координату на экране, а источник ищется от угла прямоугольника.
        // Без этого плитка в правом нижнем углу ищется за краем листа и не рисуется.
        const lx = ia * (tx + 0.5) + ic * (ty + 0.5) + ie - dx
        const ly = ib * (tx + 0.5) + id * (ty + 0.5) + if_ - dy
        const u = (lx / dw) * sw
        const v = (ly / dh) * sh
        if (u < 0 || v < 0 || u >= sw0 || v >= sh0) continue
        const si = ((sy0 + Math.floor(v)) * srcW + (sx0 + Math.floor(u))) * 4
        const di = (ty * px.width + tx) * 4
        const sa = (src.data[si + 3] / 255) * ga
        if (sa <= 0) continue                       // прозрачный источник не стирает
        const da = px.data[di + 3] / 255
        if (atop && da <= 0) continue               // рисуем только по нарисованному
        const oa = atop ? da : sa + da * (1 - sa)
        if (oa <= 0) { px.data[di + 3] = 0; continue }
        for (let k = 0; k < 3; k++) {
          px.data[di + k] = Math.round((src.data[si + k] * sa
            + px.data[di + k] * da * (1 - sa)) / oa)
        }
        px.data[di + 3] = Math.round(oa * 255)
      }
    }
  }

  ctx.fillRect = (x, y, w, h) => {
    const px = canvas && ensure(canvas.width || 300, canvas.height || 150)
    if (!px) return
    const grad = ctx.fillStyle && ctx.fillStyle.__grad
    const solid = grad ? null : parseColour(ctx.fillStyle)
    if (!grad && solid[3] <= 0) return
    const ga = Math.max(0, Math.min(1, ctx.globalAlpha))
    const atop = ctx.globalCompositeOperation === 'source-atop'
    const x0 = Math.max(0, x | 0)
    const y0 = Math.max(0, y | 0)
    const x1 = Math.min(px.width, (x + w) | 0)
    const y1 = Math.min(px.height, (y + h) | 0)
    if (x1 <= x0 || y1 <= y0) return

    // СКОРОСТЬ ЗАЛИВКИ. Полноэкранная заливка — это 558 тысяч пикселей на кадр,
    // и в бою таких заливок пятнадцать. Честное смешивание каждого пикселя
    // стоило 8 миллионов операций на кадр, и проверка телефона вставала по
    // таймауту вместо ответа по существу. Поэтому два быстрых пути:
    //
    //   непрозрачная заливка — по одной полосе на ряд (`fill` буфера, без
    //     блоков): 3600 вызовов на кадр вместо миллиона;
    //   полупрозрачная — блоками, не более 4096 блоков на заливку, и внутри
    //     блока картинка считается одноцветной (взята первая точка блока).
    //
    // Компромисс назван прямо, и он безопасен для проверок, которые читают
    // холст: полосы в 8–16 пикселей неразличимы на «пол темнее у дальнего края»
    // и на «стена стоит на краю комнаты».
    const blockAlpha = grad ? 1 : solid[3]
    const opaque = ga * blockAlpha >= 1 && !atop
    const area = (x1 - x0) * (y1 - y0)
    const step = opaque ? 1 : Math.max(1, Math.round(Math.sqrt(area / 4096)))

    // Запись цвета в отрезок буфера. Буфер чересстрочный (R,G,B,A подряд), поэтому
    // `data.fill(цвет, от, до)` здесь НЕЛЬЗЯ: он залил бы весь отрезок одним
    // каналом. Пиксели пишутся по четыре байта, без вызова функции на пиксель —
    // на полноэкранной заливке это разница между секундой и тремя миллисекундами.
    const data = px.data
    const spanRow = (base, span, r, g, b, a) => {
      for (let i = 0; i < span; i += 4) {
        data[base + i] = r; data[base + i + 1] = g; data[base + i + 2] = b; data[base + i + 3] = a
      }
    }
    const blendRow = (base, span, rgb) => {
      for (let i = 0; i < span; i += 4) put(px, base + i, rgb, rgb[3], ga, atop)
    }

    if (step <= 1) {
      // Без блоков: сплошной цвет — по полосе, градиент — по пикселю.
      const span = (x1 - x0) * 4
      for (let yy = y0; yy < y1; yy++) {
        const base = (yy * px.width + x0) * 4
        if (!grad && opaque) spanRow(base, span, solid[0] | 0, solid[1] | 0, solid[2] | 0, 255)
        else if (!grad) blendRow(base, span, solid)
        else {
          for (let xx = x0; xx < x1; xx++) {
            const rgb = gradAt(grad, xx, yy)
            put(px, (yy * px.width + xx) * 4, rgb, rgb[3], ga, atop)
          }
        }
      }
      return
    }

    // Блоками: цвет берётся один раз на блок, дальше идёт прямая запись.
    const bw = Math.min(step, x1 - x0)
    const bh = Math.min(step, y1 - y0)
    for (let by = y0; by < y1; by += bh) {
      const rows = Math.min(bh, y1 - by)
      for (let bx = x0; bx < x1; bx += bw) {
        const cols = Math.min(bw, x1 - bx)
        const span = cols * 4
        const rgb = grad ? gradAt(grad, bx, by) : solid
        if (opaque) {
          const r = rgb[0] | 0; const g = rgb[1] | 0; const b = rgb[2] | 0
          for (let rr = 0; rr < rows; rr++) spanRow(((by + rr) * px.width + bx) * 4, span, r, g, b, 255)
          continue
        }
        if (!atop) {
          // Полупрозрачно: смешиваем один раз по первому пикселю блока и пишем
          // результат прямо. Внутри блока картинка считается одноцветной —
          // компромисс назван в шапке блока.
          const di = (by * px.width + bx) * 4
          const sa = ga * rgb[3]
          const da = data[di + 3] / 255
          const oa = sa + da * (1 - sa)
          const ch = [0, 0, 0]
          for (let k = 0; k < 3; k++) {
            ch[k] = oa > 0 ? Math.round((rgb[k] * sa + data[di + k] * da * (1 - sa)) / oa) : 0
          }
          const av = Math.round(oa * 255)
          for (let rr = 0; rr < rows; rr++) spanRow(((by + rr) * px.width + bx) * 4, span, ch[0], ch[1], ch[2], av)
          continue
        }
        for (let rr = 0; rr < rows; rr++) blendRow(((by + rr) * px.width + bx) * 4, span, rgb)
      }
    }
  }

  ctx.getImageData = (x, y, w, h) => {
    const px = ensure(canvas.width || 300, canvas.height || 150)
    const out = new Uint8ClampedArray(w * h * 4)
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const tx = (x | 0) + xx
        const ty = (y | 0) + yy
        const di = (yy * w + xx) * 4
        if (tx < 0 || ty < 0 || tx >= px.width || ty >= px.height) continue
        const si = (ty * px.width + tx) * 4
        out[di] = px.data[si]
        out[di + 1] = px.data[si + 1]
        out[di + 2] = px.data[si + 2]
        out[di + 3] = px.data[si + 3]
      }
    }
    return { data: out, width: w, height: h }
  }
  ctx.putImageData = (imgData, x, y) => {
    const px = ensure(canvas.width || 300, canvas.height || 150)
    if (!px || !imgData) return
    for (let yy = 0; yy < imgData.height; yy++) {
      const ty = (y | 0) + yy
      if (ty < 0 || ty >= px.height) continue
      for (let xx = 0; xx < imgData.width; xx++) {
        const tx = (x | 0) + xx
        if (tx < 0 || tx >= px.width) continue
        const si = (yy * imgData.width + xx) * 4
        const di = (ty * px.width + tx) * 4
        px.data[di] = imgData.data[si]
        px.data[di + 1] = imgData.data[si + 1]
        px.data[di + 2] = imgData.data[si + 2]
        px.data[di + 3] = imgData.data[si + 3]
      }
    }
  }

  /** Сколько непрозрачных пикселей в прямоугольнике — удобно для проверок. */
  ctx.__opaqueIn = (x, y, w, h) => {
    const d = ctx.getImageData(x, y, w, h)
    let n = 0
    for (let i = 3; i < d.data.length; i += 4) if (d.data[i] > 0) n++
    return n
  }

  return ctx
}

// ── Image ───────────────────────────────────────────────────────────────
//
// Стенду не было `Image` вообще, поэтому лицензионные спрайты не могли
// загрузиться ни в игре, ни в проверке: слой молча уходил на векторный
// запасной путь, и проверка «спрайт нарисован» была недостижима.
//
// Здесь `Image` читает файл из `webapp/public` тем же распаковщиком PNG, что и
// `scripts/pngReader.mjs`. Путь относительный — как в браузере: игра просит
// `assets/field/warrior.png`.
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webapp', 'public')

function makeImageClass() {
  return class StubImage {
    constructor() {
      this.onload = null
      this.onerror = null
      this.complete = false
      this.naturalWidth = 0
      this.naturalHeight = 0
      this.width = 0
      this.height = 0
      this.__img = null
    }
    set src(v) {
      this.__src = v
      // Загрузка в браузере асинхронна, и игра на это рассчитывает. Здесь —
      // тоже: иначе проверка проходила бы по коду, который в браузере ведёт
      // себя иначе.
      queueMicrotask(() => {
        try {
          const rel = String(v).replace(/^\/+/, '')
          const file = join(PUBLIC_DIR, rel)
          if (!existsSync(file)) throw new Error(`нет файла ${rel}`)
          const img = readPng(file)
          this.__img = img
          this.naturalWidth = img.w
          this.naturalHeight = img.h
          this.width = img.w
          this.height = img.h
          this.complete = true
          this.onload?.()
        } catch (e) {
          this.complete = true
          this.onerror?.(e)
        }
      })
    }
    get src() { return this.__src }
  }
}

// ── установка ──────────────────────────────────────────────────────────
let installed = null

/**
 * «Устройство», на котором игра считает, что запущена. Телефон по умолчанию
 * не ставим: старые тесты писались под 400×800. Но менять можно — и нужно:
 * игра спрашивает у экрана `matchMedia('(hover: none) and (pointer: coarse)')`
 * и по ответу даёт подсказку «веди пальцем» вместо «жми WASD».
 */
const profile = { width: 400, height: 800, dpr: 1, touch: false }

/**
 * Ставит стенд на globalThis. Повторный вызов — no-op: набор глобалов
 * общий для всех тестов в процессе, и переустановка сбрасывала бы стенд
 * у соседнего файла.
 */
export function installDom(opts = {}) {
  // `fresh` — поставить ЗАНОВО окружение.
  //
  // Стенд ставится один раз на процесс, и это было правильно, пока файлов было
  // мало: соседние файлы делили один DOM, но на практике делят и СОСТОЯНИЕ
  // игры. Три файла, которые ведут забег целиком, начали падать в общем прогоне
  // и проходить по отдельности — то есть в зависимости от того, как разложились
  // файлы по воркерам.
  //
  // Молчаливую зависимость от порядка убрать нельзя, не дав файлу сказать
  // «мне нужно чистое». Теперь можно.
  if (installed && !opts.fresh) return installed
  if (opts.fresh) { installed = null }

  const documentElement = new StubNode(1)
  documentElement.tagName = 'HTML'
  const body = new StubNode(1)
  body.tagName = 'BODY'
  documentElement.append(body)
  // Стили корня — игра кладёт туда безопасные зоны Telegram (applySafeArea).
  // Раньше здесь был голый объект, и первая же запись падала бы.
  documentElement.style = makeStyle()

  // Элементы, которые игра ищет при загрузке модулей (fx.js берёт холст
  // 'bindu' и слой тонировки 'tint' на верхнем уровне, без проверок).
  const makeEl = (tag, id) => {
    const el = new StubNode(1)
    el.tagName = tag.toUpperCase()
    el.id = id
    el.style = makeStyle()
    el.dataset = {}
    el.className = ''
    // classList: игра гасит тонировку через tintEl.classList.remove('on'),
    // и без него стенд падал на первом же переходе.
    el.classList = makeClassList(el)
    el.disabled = false
    el.value = ''
    if (tag === 'canvas') {
      el.width = 300
      el.height = 150
      // Контекст один и тот же, как в браузере: иначе пиксельный буфер
      // терялся бы между вызовами и «нарисован ли спрайт» нельзя было бы проверить.
      el.getContext = () => (el.__ctx || (el.__ctx = makeCtx(el)))
    }
    el.setAttribute = StubNode.prototype.setAttribute.bind(el)
    el.addEventListener = StubNode.prototype.addEventListener.bind(el)
    el.removeEventListener = StubNode.prototype.removeEventListener.bind(el)
    el.getAttribute = StubNode.prototype.getAttribute.bind(el)
    el.remove = StubNode.prototype.remove.bind(el)
    el.removeChild = StubNode.prototype.removeChild.bind(el)
    el.append = StubNode.prototype.append.bind(el)
    // Прямоугольник элемента. Настоящий холст на телефоне занимает весь
    // экран, и игра переводит координаты касания в координаты мира по
    // нему. Если прямоугольник не выставлен, берём экран целиком.
    el.__rect = null
    el.getBoundingClientRect = () => el.__rect || { left: 0, top: 0, width: profile.width, height: profile.height }
    return el
  }

  const byId = new Map()
  const root = makeEl('div', 'app')
  body.append(root)
  byId.set('app', root)
  const bindu = makeEl('canvas', 'bindu')
  const tint = makeEl('div', 'tint')
  byId.set('bindu', bindu)
  byId.set('tint', tint)
  body.append(bindu)
  body.append(tint)

  const document = {
    readyState: 'complete',
    createElement(tag) {
      const el = makeEl(tag, '')
      el.click = () => el.dispatch('click')
      el.focus = () => {}
      el.blur = () => {}
      return el
    },
    createTextNode: (t) => new StubText(String(t)),
    getElementById: (id) => byId.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body,
    documentElement,
    addEventListener: () => {},
  }

  const store = new Map()
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  }

  const listeners = new Map()
  const win = {
    innerHeight: profile.height,
    innerWidth: profile.width,
    devicePixelRatio: profile.dpr,
    addEventListener: (t, fn) => {
      if (!listeners.has(t)) listeners.set(t, [])
      listeners.get(t).push(fn)
    },
    removeEventListener: () => {},
    localStorage,
    AudioContext: undefined,
    webkitAudioContext: undefined,
    Telegram: undefined,
    // matchMedia отвечает по профилю устройства: на «телефоне» игра ведёт
    // себя как на телефоне (палец вместо клавиш), на десктопе — как на
    // десктопе. Игроки одного поля — разные.
    matchMedia: (q = '') => ({
      matches: /hover:\s*none/.test(q) ? profile.touch
        : /hover:\s*hover/.test(q) ? !profile.touch
          : false,
      media: q,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    }),
    // Прокрутка: игра возвращает экран вверх при смене. Без этого стенд
    // падал бы на каждом переходе — а это самый частый путь в игре.
    scrollTo: () => {},
    scroll: () => {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    open: () => null,
  }
  win.document = document

  let rafId = 0
  const rafQueue = new Map()

  // Часы стенда. Игра берёт время из `performance.now()`, и если оно не
  // идёт, то `dt` равен нулю: оковы не снимаются, монеты не падают,
  // двери не открываются. Стенд с вечными нулём молча превращался в
  // проверку «ничего не происходит» — и все такие прогоны проходили.
  let nowMs = 0
  const clock = {
    now: () => nowMs,
    advance: (ms) => { nowMs += ms },
    set: (ms) => { nowMs = ms },
  }

  installed = {
    document, window: win, localStorage, body, root, byId, listeners, clock,
    tick: (fn) => {
      const id = ++rafId
      rafQueue.set(id, fn)
      return id
    },
    // Кадры не крутятся сами: тест сам решает, когда «прошёл кадр».
    // Иначе тест на 2000 кадров превратился бы в гонку с таймером.
    //
    // Время ИДЁТ. Игра берёт его из performance.now() и считает dt; если
    // часы стоят, dt = 0, и мир не двигается: оковы не снимаются, монеты не
    // падают, двери не открываются. Стенд с вечными нулём молча превращался
    // в проверку «ничего не происходит» — и все такие прогоны проходили.
    errors: [],
    flushRaf(frames = 1, dtMs = 16) {
      for (let f = 0; f < frames; f++) {
        clock.advance(dtMs)
        const batch = [...rafQueue.entries()]
        rafQueue.clear()
        for (const [, fn] of batch) {
          try { fn(clock.now()) } catch (e) { installed.errors.push(e) }
        }
      }
    },
    pendingRaf: () => rafQueue.size,
  }

  // Игра вешает клавиши и через `addEventListener(...)` без префикса —
  // в браузере это window. На стенде глобал не существует.
  win.addEventListener = (t, fn) => {
    if (!listeners.has(t)) listeners.set(t, [])
    listeners.get(t).push(fn)
  }
  win.removeEventListener = (t, fn) => {
    const a = listeners.get(t) || []
    const i = a.indexOf(fn)
    if (i >= 0) a.splice(i, 1)
  }
  /** Нажать клавишу — как игрок нажимает. */
  installed.press = (type, key) => {
    for (const fn of [...(listeners.get(type) || [])]) {
      fn({ type, key, preventDefault() {}, stopPropagation() {} })
    }
  }

  // ── ПАЛЬЦЫ ──────────────────────────────────────────────────────────────
  // Телефон — главная платформа игры, а до этого ни один тест не трогал
  // события указателя. Весь ходьбы-и-рывок-удар по полю живёт в них: на
  // телефоне там нет ни WASD, ни правой кнопки мыши. Пустой стенд молчал
  // об этой половине игры.
  //
  // Событие идёт и элементу, и window — в браузере оно всплывает.
  function pointerEvent(el, type, x, y, id, button = 0) {
    return {
      type, pointerId: id, pointerType: 'touch', isPrimary: true,
      clientX: x, clientY: y, screenX: x, screenY: y, pageX: x, pageY: y,
      button, buttons: type === 'pointerup' ? 0 : 1,
      width: 24, height: 24, pressure: type === 'pointerup' ? 0 : 0.5,
      target: el, currentTarget: el,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true },
      stopPropagation() {},
      releasePointerCapture() { el.releasePointerCapture?.(id) },
      hasPointerCapture() { return !!el.hasPointerCapture?.(id) },
    }
  }

  function firePointer(el, type, x, y, id, button = 0) {
    if (!el) return null
    const ev = pointerEvent(el, type, x, y, id, button)
    for (const fn of [...(el._listeners?.get(type) || [])]) fn(ev)
    for (const fn of [...(listeners.get(type) || [])]) fn({ ...ev, target: el })
    return ev
  }

  let fingerId = 1
  /** Последний холст на экране — тот, по которому сейчас ходят. */
  installed.lastCanvas = () => {
    let found = null
    const walk = (n) => {
      if (!n || n.nodeType !== 1) return
      if (n.tagName === 'CANVAS') found = n
      for (const c of n.childNodes) walk(c)
    }
    walk(installed.root)
    return found
  }
  installed.fingerDown = (el, x, y, { id = 1, button = 0 } = {}) => firePointer(el, 'pointerdown', x, y, id, button)
  installed.fingerMove = (el, x, y, { id = 1 } = {}) => firePointer(el, 'pointermove', x, y, id)
  installed.fingerUp = (x = 0, y = 0, { id = 1 } = {}) => {
    // Палец отпускают где угодно — событие летит в window, а не в холст.
    const ev = firePointer(installed.root, 'pointerup', x, y, id)
    // Браузер после отпускания снимает захват и шлёт lostpointercapture.
    const cv = installed.lastCanvas()
    if (cv) firePointer(cv, 'lostpointercapture', x, y, id)
    return ev
  }
  /** Короткое нажатие: палец коснулся и оторвался. Именно это «тап». */
  installed.fingerTap = (el, x, y, { id = 1 } = {}) => {
    installed.fingerDown(el, x, y, { id })
    clock.advance(40)
    return installed.fingerUp(x, y, { id })
  }
  /** Следующий «палец» — многотысячность: два пальца на экране сразу. */
  installed.newFingerId = () => ++fingerId

  /**
   * Точка мира → координаты экрана. Игра рисует поле в координатах 420×640,
   * а палец приходит в пикселях экрана; перевод внутри игры. Здесь та же
   * арифметика, чтобы тест мог сказать «палец на окове», а не «палец в
   * пикселе 137, 402».
   */
  /**
   * Точка мира → точка экрана.
   *
   * Учитывает камеру: арена больше экрана, и координата мира — это координата
   * плюс смещение камеры. Без этого проверка телефона тапала «в ока» туда, где
   * оки нет, и падала — причём падала не по своей логике, а потому что
   * преобразование у неё было другое, чем у игры.
   */
  installed.worldPoint = (el, wx, wy) => {
    const r = el.getBoundingClientRect()
    const viewW = 420
    const viewH = 640
    // Перевод спрашивается у ИГРЫ (`st.screenPoint`), а не считается здесь.
    // Стенд раньше знал устройство рисунка: «мировая точка минус камера». Стоило
    // рисунку стать ромбом — проверки телефона падали, хотя указующий палец был
    // прав, и чинить приходилось не игру, а стенд.
    const field = globalThis.window?.__field
    const view = field?.screenPoint ? field.screenPoint(wx, wy) : null
    if (!view) throw new Error('игра не умеет сказать, где на экране точка боя — стенду не на что опереться')
    const sx = view.x
    const sy = view.y
    return {
      x: r.left + (sx / viewW) * r.width,
      y: r.top + (sy / viewH) * r.height,
    }
  }

  /**
   * Сменить «устройство»: размер экрана, плотность пикселей и телефон ли.
   * Ставить ДО первого экрана — игра читает это один раз при сборке.
   */
  installed.setProfile = (p = {}) => {
    Object.assign(profile, p)
    win.innerWidth = profile.width
    win.innerHeight = profile.height
    win.devicePixelRatio = profile.dpr
    globalThis.innerWidth = profile.width
    globalThis.innerHeight = profile.height
    globalThis.devicePixelRatio = profile.dpr
    return { ...profile }
  }
  /** Прямоугольник элемента — для проверок ввода и подгонки холста. */
  installed.setRect = (el, rect) => { el.__rect = rect; return el }
  installed.profileNow = () => ({ ...profile })

  globalThis.document = document
  globalThis.Image = makeImageClass()
  globalThis.window = win
  globalThis.addEventListener = win.addEventListener
  globalThis.removeEventListener = win.removeEventListener
  globalThis.localStorage = localStorage
  // В Node 26 navigator — геттер, присваивать нельзя. Пробуем defines,
  // и если не вышло — патчим через defineProperty на сам объект.
  if (!globalThis.navigator) {
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true })
  }
  try {
    globalThis.navigator.vibrate = () => true
  } catch {
    Object.defineProperty(globalThis.navigator, 'vibrate', {
      value: () => true, configurable: true, writable: true,
    })
  }
  globalThis.matchMedia = win.matchMedia
  globalThis.requestAnimationFrame = installed.tick
  globalThis.cancelAnimationFrame = (id) => rafQueue.delete(id)
  globalThis.innerHeight = win.innerHeight
  globalThis.innerWidth = win.innerWidth
  globalThis.devicePixelRatio = win.devicePixelRatio
  globalThis.Audio = class { constructor() { this.play = () => Promise.resolve(); this.pause = () => {} } }
  globalThis.HTMLCanvasElement = class {}
  globalThis.performance = { now: () => installed.clock.now() }

  return installed
}

/**
 * Кликабельные элементы экрана. Это не только <button>: выбор варны, карточки
 * дара, нефрит и узлы карты — обычные div-и с onclick, и если искать только
 * кнопки, половина игры в проверку не попадёт.
 */
export function clickables(node) {
  const out = []
  const walk = (n) => {
    if (!n || n.nodeType !== 1) return
    const has = n._listeners && n._listeners.has('click') && n._listeners.get('click').length
    if (has) out.push(n)
    for (const c of n.childNodes) walk(c)
  }
  walk(node)
  return out
}

/** Жмёт КАЖДОГО кликабельного по очереди, собирая ошибки, а не роняя. */
export function clickEverything(node, { skip = [], limit = Infinity } = {}) {
  const errors = []
  const targets = clickables(node).slice(0, limit === Infinity ? undefined : limit)
  for (const b of targets) {
    const label = `${b.className || ''} ${textOf(b).slice(0, 24)}`
    if (skip.some((s) => label.includes(s))) continue
    try { b.dispatch('click') } catch (e) { errors.push({ label, error: e }) }
  }
  return { count: targets.length, errors }
}

/**
 * ТРОН ЧАКРЫ (МЕХАНИКА 58): если на экране выбор владыки — выбрать первого.
 *
 * Зачем это в стенде, а не в каждом тесте. Вход в чакру теперь упирается в
 * экран тронов, и тест, который ждёт бой, падал бы с «бой не открылся» —
 * то есть на забытом экране, а не на сломанной игре. Ровно тот класс поломки,
 * который ловится здесь: «тест красный, потому что появился шаг, а не
 * потому что игра сломалась».
 *
 * Возвращает выбранного владыку (имя) или null, если тронов на экране нет.
 */
export function chooseLordIfShown(nodes, which = 0) {
  const cards = nodes.filter((x) => /lord-card/.test(String(x.className || '')))
  if (!cards.length) return null
  const card = cards[Math.min(which, cards.length - 1)]
  const name = (textOf(card).match(/трон (.+?)(?:трон|приёмы|Это|Ахе)/) || [])[1] || ''
  card.dispatch('click')
  return name.trim() || 'владыка'
}

/**
 * Экран дверей или нет — ПО КАРТОЧКАМ, а не по слову «Двери».
 *
 * Как это случилось. Экран тронов (МЕХАНИКА 58) заканчивается фразой «его
 * имя стоит на двери», и тест, который искал экран дверей по `/Двери/i`,
 * стал считать трон дверями: карточек дверей на экране ноль, а проверка
 * «на экране дверей нет ни одной двери» падала. Слово «двери» вообще не
 * признак: дверь есть и на троне, и в лавке, и в покое.
 */
export function doorCards(nodes) {
  return nodes.filter((x) => /door-card/.test(String(x.className || '')))
}

/** Все строки экрана — чтобы искать «пустой экран» и «NaN на видном месте». */
export function textOf(node) {
  const out = []
  const walk = (n) => {
    if (!n) return
    if (n.nodeType === 3) out.push(n.data)
    else if (n.nodeType === 1) {
      if (n.tagName === 'INPUT' && n.value) out.push(n.value)
      for (const c of n.childNodes) walk(c)
    }
  }
  walk(node)
  return out.join(' ').replace(/\s+/g, ' ').trim()
}
