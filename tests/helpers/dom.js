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
  'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect',
  'fillText', 'strokeText', 'measureText',
  'setLineDash',
]

function makeCtx() {
  const ctx = {
    canvas: null,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt',
    font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
    globalAlpha: 1, shadowBlur: 0, shadowColor: 'transparent',
    measureText: (t) => ({ width: String(t).length * 6 }),
  }
  for (const m of CTX_METHODS) ctx[m] = () => {}
  ctx.createLinearGradient = () => ({ addColorStop() {} })
  ctx.createRadialGradient = () => ({ addColorStop() {} })
  return ctx
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
export function installDom() {
  if (installed) return installed

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
      el.getContext = () => makeCtx()
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
  installed.worldPoint = (el, wx, wy, worldW = 420, worldH = 640) => {
    const r = el.getBoundingClientRect()
    return {
      x: r.left + (wx / worldW) * r.width,
      y: r.top + (wy / worldH) * r.height,
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
