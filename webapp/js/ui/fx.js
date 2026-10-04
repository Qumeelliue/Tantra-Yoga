// Визуальные эффекты: бинду-частицы, вспышки, всплывающие числа,
// тонировка экрана по гунам, лёгкие звуки (WebAudio, без файлов).

const bindu = document.getElementById('bindu')
const tintEl = document.getElementById('tint')
const ctx = bindu.getContext('2d')

let W = 0, H = 0, DPR = 1
let particles = []

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2)
  W = window.innerWidth
  H = window.innerHeight
  bindu.width = W * DPR
  bindu.height = H * DPR
  bindu.style.width = W + 'px'
  bindu.style.height = H + 'px'
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
}
window.addEventListener('resize', resize)

function makeBindu() {
  return {
    x: Math.random() * W,
    y: H + 10 + Math.random() * 60,
    r: 0.6 + Math.random() * 1.6,
    vy: 0.25 + Math.random() * 0.7,
    vx: (Math.random() - 0.5) * 0.16,
    tw: Math.random() * Math.PI * 2,
    tws: 0.02 + Math.random() * 0.04,
    gold: Math.random() < 0.75,
  }
}

function loop() {
  ctx.clearRect(0, 0, W, H)
  if (particles.length < 42) particles.push(makeBindu())
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.y -= p.vy
    p.x += p.vx + Math.sin(p.tw) * 0.12
    p.tw += p.tws
    const a = 0.25 + 0.25 * Math.sin(p.tw)
    ctx.beginPath()
    ctx.fillStyle = p.gold
      ? `rgba(242, 196, 109, ${a})`
      : `rgba(255, 255, 255, ${a * 0.5})`
    ctx.shadowColor = p.gold ? 'rgba(242,196,109,0.8)' : 'transparent'
    ctx.shadowBlur = p.gold ? 6 : 0
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    if (p.y < -20) p.y = H + 10
  }
  requestAnimationFrame(loop)
}

export function initFx() {
  resize()
  requestAnimationFrame(loop)
}

// Вспышка частиц в точке (клиентские координаты)
export function burst(x, y, color = '#f2c46d', count = 14) {
  const body = document.body
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div')
    el.className = 'burst'
    const ang = Math.random() * Math.PI * 2
    const dist = 30 + Math.random() * 60
    el.style.left = x + 'px'
    el.style.top = y + 'px'
    el.style.background = color
    el.style.setProperty('--dx', Math.cos(ang) * dist + 'px')
    el.style.setProperty('--dy', Math.sin(ang) * dist + 'px')
    body.append(el)
    setTimeout(() => el.remove(), 750)
  }
}

// Кииртан-волна: золотое кольцо, расходящееся из центра экрана
export function kiirtanaWave() {
  const body = document.body
  for (let i = 0; i < 3; i++) {
    const el = document.createElement('div')
    el.className = 'kiirtana-ring'
    el.style.left = '50%'
    el.style.top = '45%'
    el.style.animationDelay = `${i * 0.18}s`
    body.append(el)
    setTimeout(() => el.remove(), 1400)
  }
}

// Микровиты (§9.1b): искры «серебряной линии» между материей и идеей.
// kind 'pos' — положительные микровиты (свет вверх, растворяют окову);
// kind 'neg' — отрицательные (тьма вниз, питают неведение). Приходит с точки
// разыгранной карты (from) и летит к врагу/вниз — видно, чем кормишь ум.
export function microvitaFx(x, y, kind = 'pos', count = 10) {
  const body = document.body
  const color = kind === 'pos' ? '#ffe9b3' : '#8a6fb6'
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div')
    el.className = `burst mv mv-${kind}`
    const ang = Math.random() * Math.PI * 2
    const dist = 16 + Math.random() * 44
    let dx = Math.cos(ang) * dist
    let dy = Math.sin(ang) * dist
    if (kind === 'pos') dy -= 30 + Math.random() * 22 // подъём к врагу
    else dy += 30 + Math.random() * 22 // падение вниз
    el.style.left = x + 'px'
    el.style.top = y + 'px'
    el.style.background = color
    el.style.setProperty('--dx', dx + 'px')
    el.style.setProperty('--dy', dy + 'px')
    body.append(el)
    setTimeout(() => el.remove(), 850)
  }
}

// Всплывающее число
export function floatNum(x, y, text, cls = 'dmg') {
  const el = document.createElement('div')
  el.className = `float-num ${cls}`
  el.textContent = text
  el.style.left = x + 'px'
  el.style.top = y + 'px'
  document.body.append(el)
  setTimeout(() => el.remove(), 950)
}

// Вспышка-заливка экрана (§дофамин): короткий цветной флеш в момент силы —
// поток открыт, окову почти освободили. Даёт мгновенный «щелчок» награды.
let flashEl = null
export function flash(color = 'rgba(255,233,179,0.22)', dur = 0.6) {
  if (!flashEl) {
    flashEl = document.createElement('div')
    flashEl.className = 'screen-flash'
    document.body.append(flashEl)
  }
  flashEl.style.background = color
  flashEl.classList.remove('on')
  void flashEl.offsetWidth // перезапуск анимации
  flashEl.style.setProperty('--fdur', dur + 's')
  flashEl.classList.add('on')
}

// Тонировка экрана по состоянию гун
const TINT = {
  s: 'radial-gradient(70% 50% at 50% 30%, rgba(255, 233, 179, 0.5), transparent 70%), rgba(255, 240, 210, 0.18)',
  r: 'radial-gradient(70% 50% at 50% 30%, rgba(255, 138, 74, 0.5), transparent 70%), rgba(255, 120, 60, 0.12)',
  t: 'radial-gradient(70% 50% at 50% 30%, rgba(60, 40, 100, 0.6), transparent 70%), rgba(20, 10, 40, 0.22)',
}
export function setTint(gunaKey) {
  if (!gunaKey) {
    tintEl.classList.remove('on')
    tintEl.style.background = 'transparent'
    return
  }
  tintEl.style.background = TINT[gunaKey] || 'transparent'
  tintEl.classList.add('on')
}

// ── Аудио-тинт гун (§исследование): звук передаёт состояние ума параллельно визуалу.
// Саттва — светлая синусоида, раджас — резкая пила ниже, тамас — низкий гул.
// В самадхи/вне боя — тишина (retract, без обрыва).
let droneNodes = null

export function setGunaAudio(key) {
  const audio = ensureAc()
  if (!audio) return
  stopGunaAudio()
  if (!key) return
  try {
    const osc = audio.createOscillator()
    const g = audio.createGain()
    osc.type = key === 'r' ? 'sawtooth' : 'sine'
    osc.frequency.value = key === 's' ? 220 : key === 'r' ? 185 : 110
    g.gain.setValueAtTime(0.0, audio.currentTime)
    g.gain.linearRampToValueAtTime(0.02, audio.currentTime + 0.8)
    osc.connect(g)
    g.connect(audio.destination)
    osc.start()
    droneNodes = { osc, g }
  } catch {}
}

function stopGunaAudio() {
  if (!droneNodes) return
  const { osc, g } = droneNodes
  droneNodes = null
  try {
    const audio = ensureAc()
    if (!audio) return
    g.gain.linearRampToValueAtTime(0.0, audio.currentTime + 0.4)
    setTimeout(() => { try { osc.stop() } catch {} }, 600)
  } catch {}
}

export function stopAllAudio() {
  stopGunaAudio()
}

// ── Звук (WebAudio) ───────────────────────────────────────────

let ac = null
let muted = false

export function setMuted(m) { muted = m }

function ensureAc() {
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)() } catch { return null }
  }
  if (ac.state === 'suspended') ac.resume()
  return ac
}

// Текущее время аудио-такта (сек). Ритм-механики используют его как единый
// источник времени — тапы и звук синхронизированы, без дрейфа setTimeout.
export function audioNow() {
  const a = ensureAc()
  return a ? a.currentTime : null
}

// Точное планирование тона на АБСОЛЮТНОЕ аудио-время `whenSec` (сек по audioNow()).
// Возвращает {stop} для отмены ещё не прозвучавшего звука.
export function scheduleTone(freq, dur, type = 'sine', gain = 0.06, whenSec) {
  const audio = ensureAc()
  if (!audio || muted || whenSec == null) return { stop: () => {} }
  try {
    const osc = audio.createOscillator()
    const g = audio.createGain()
    osc.type = type
    osc.frequency.value = freq
    const t = Math.max(audio.currentTime, whenSec)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g)
    g.connect(audio.destination)
    osc.start(t)
    osc.stop(t + dur + 0.02)
    return { stop: () => { try { osc.stop() } catch {} } }
  } catch {
    return { stop: () => {} }
  }
}

function tone(freq, dur, type = 'sine', gain = 0.06, when = 0) {
  const audio = ensureAc()
  if (!audio || muted) return
  const osc = audio.createOscillator()
  const g = audio.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(0.0001, audio.currentTime + when)
  g.gain.exponentialRampToValueAtTime(gain, audio.currentTime + when + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + when + dur)
  osc.connect(g)
  g.connect(audio.destination)
  osc.start(audio.currentTime + when)
  osc.stop(audio.currentTime + when + dur + 0.02)
}

export const sfx = {
  unlock() { ensureAc(); tone(620, 0.22, 'sine', 0.05); tone(932, 0.3, 'sine', 0.04, 0.08) },
  play() { tone(340, 0.12, 'triangle', 0.05) },
  hit() { tone(150, 0.12, 'square', 0.045); tone(110, 0.16, 'square', 0.04, 0.04) },
  dmg() { tone(130, 0.18, 'sawtooth', 0.05) },
  heal() { tone(520, 0.2, 'sine', 0.045); tone(780, 0.24, 'sine', 0.035, 0.07) },
  peace() { tone(440, 0.28, 'sine', 0.05); tone(660, 0.3, 'sine', 0.045, 0.09); tone(880, 0.42, 'sine', 0.035, 0.18) },
  burn() { tone(200, 0.3, 'triangle', 0.04); tone(120, 0.34, 'triangle', 0.04, 0.05) },
  error() { tone(90, 0.12, 'square', 0.04) },
  turn() { tone(300, 0.1, 'sine', 0.035) },
  beat() { tone(440, 0.09, 'triangle', 0.05) },
  beatTick() { tone(880, 0.045, 'sine', 0.016) }, // тихий метроном-бит кииртана
  miss() { tone(180, 0.08, 'square', 0.035) },
  med() { tone(392, 0.5, 'sine', 0.04); tone(523, 0.6, 'sine', 0.035, 0.2); tone(659, 0.8, 'sine', 0.03, 0.4) },
  death() { tone(180, 0.6, 'sine', 0.05); tone(120, 0.8, 'sine', 0.05, 0.2); tone(80, 1.0, 'sine', 0.045, 0.4) },
  win() { tone(523, 0.25, 'sine', 0.05); tone(659, 0.25, 'sine', 0.05, 0.12); tone(784, 0.25, 'sine', 0.05, 0.24); tone(1047, 0.5, 'sine', 0.045, 0.36) },
  samadhi() { tone(700, 0.5, 'sine', 0.04); tone(1050, 0.6, 'sine', 0.03, 0.1); tone(1400, 0.7, 'sine', 0.02, 0.2) },
  // Кииртан: нисходящая гамма имени (Баба Нам Кевалам)
  kiirtana() {
    const notes = [587.3, 523.3, 493.9, 440, 392, 329.6, 293.7]
    notes.forEach((f, i) => tone(f, 0.16, 'sine', 0.04, i * 0.09))
    tone(329.6, 0.3, 'triangle', 0.03, notes.length * 0.09)
  },
  buy() { tone(440, 0.16, 'sine', 0.045); tone(660, 0.2, 'sine', 0.04, 0.08); tone(880, 0.24, 'sine', 0.035, 0.16) },
  // Микровиты (§9.1b): положительный — светлый звон-восход (тонкий звук — носитель
  // положительных микровитов), отрицательный — тяжёлый низкий гул (тьма вниз).
  microvitaPos() { tone(880, 0.18, 'sine', 0.035); tone(1318, 0.26, 'sine', 0.025, 0.07) },
  microvitaNeg() { tone(165, 0.2, 'triangle', 0.04); tone(110, 0.28, 'triangle', 0.03, 0.05) },
  // Активация потока-синергии (§дофамин): восходящий «искрящийся» мотив —
  // ум собрал школу, состояние ума стало силой.
  flow() { tone(659, 0.14, 'sine', 0.045); tone(784, 0.14, 'sine', 0.045, 0.08); tone(988, 0.16, 'sine', 0.045, 0.16); tone(1318, 0.4, 'sine', 0.04, 0.24) },
}

// ── ЗВУКИ «ПОЛЯ УМА» ────────────────────────────────────────────────────
// Смысл каждого звука взят из боя, а не придуман: в Nine Sols парирование
// полностью **глушит** звук удара (попадание слышно по своему лязгу),
// в Sekiro лязг выше при длинной серии. Здесь то же самое.

/** Лязг дефлекта. Чем длиннее серия — тем выше тон: слышно вслепую. */
function parryPitch(combo) {
  return 523.25 * Math.pow(2, Math.min(7, Math.max(0, combo - 1)) / 12)
}

export const fieldSfx = {
  /** Пауза: короткий «вдох» и его оборот. Тише боя — это не событие, а остановка. */
  pause() {
    tone(196, 0.16, 'sine', 0.05, 0.01)
    tone(147, 0.24, 'sine', 0.035, 0.02)
  },
  /** Металлический лязг перехваченного удара + глушение звука самого удара. */
  parry(combo = 1) {
    const f = parryPitch(combo)
    tone(f, 0.13, 'triangle', 0.075)
    tone(f * 2.01, 0.2, 'sine', 0.04, 0.01)
    tone(f * 0.5, 0.24, 'sine', 0.035, 0.005)
    // металлический призвук: короткий шумовой «звон»
    tone(f * 3, 0.09, 'sine', 0.018, 0.03)
  },
  /** Промах: глухой деревянный удар. Не неприятный — просто мимо. */
  parryMiss() {
    tone(132, 0.11, 'square', 0.035)
    tone(88, 0.16, 'sine', 0.03, 0.02)
  },
  /** Окова рассыпается в свет — восходящий аккорд. */
  pacify() {
    const base = 392
    ;[1, 1.25, 1.5, 2].forEach((m, i) => tone(base * m, 0.5 - i * 0.06, 'sine', 0.05, i * 0.06))
    tone(base * 3, 0.7, 'sine', 0.018, 0.3)
  },
  /**
   * Удар попал в оку.
   *
   * До этого звука не было вовсе: событие `hit` доходило до экрана,say писала
   * «попадание», и всё. То есть удар по паше был беззвучен, а дефлект гремел.
   * Игрок слышал, что защитился, и не слышал, что попал — и это переворачивало
   * смысл боя: главное действие игрока было тише второстепенного.
   *
   * Звук короткий и сухой: удар, а не взрыв. Никакого подъёма на третью ноту —
   * попадание не награда, а работа.
   */
  hit() {
    tone(220, 0.09, 'triangle', 0.07)
    tone(110, 0.14, 'square', 0.05, 0.01)
    tone(640, 0.05, 'sine', 0.022, 0.005)
  },
  /**
   * Удар по рипу — не проходит.
   *
   * Принципиально другой звук: глухой, сдавленный, БЕЗ звона и верха. Ровно то,
   * чего игрок ждёт от удара, здесь нет — и ухом это слышно раньше, чем глазом
   * прочтёт «рипу не ранится». Это не украшение, а часть урока: сила не
   * работает, и звук говорит об этом раньше текста.
   */
  blocked() {
    tone(120, 0.13, 'square', 0.045)
    tone(74, 0.2, 'sine', 0.04, 0.02)
    tone(96, 0.1, 'triangle', 0.02, 0.06)
  },
  /**
   * Удар пришёлся по игроку.
   *
   * Садхака беззвучен не был никогда — а это худший из трёх случаев: игрок
   * теряет жизнь и не получает знака. Звук короткий, низкий и телесный, без
   * верха, чтобы не помешать слышать, что происходит дальше.
   */
  hurt() {
    tone(150, 0.16, 'sawtooth', 0.055)
    tone(84, 0.26, 'sine', 0.05, 0.02)
  },
  /** Ока пала. Короткий глухой спад — и тишина. */
  die() {
    tone(180, 0.2, 'triangle', 0.05)
    tone(96, 0.34, 'sine', 0.04, 0.06)
  },
  /** Владыка замахнулся: нарастающий низкий гул — слышно заранее. */
  bossWind(phase = 1) {
    const f = phase >= 2 ? 58 : 74
    tone(f, 0.34, 'sawtooth', 0.028)
    tone(f * 1.5, 0.3, 'sine', 0.022, 0.04)
  },
  /** Удар владыки: тяжело, с низким ударом. */
  bossHit() {
    tone(96, 0.3, 'sawtooth', 0.06)
    tone(64, 0.4, 'sine', 0.05, 0.02)
    tone(180, 0.1, 'square', 0.028, 0.01)
  },
  /** Порог 50%: обрыв звука, рык, потом светлый звон. */
  bossBreak() {
    tone(220, 0.14, 'sawtooth', 0.05)   // обрыв
    tone(55, 0.9, 'sawtooth', 0.055, 0.14)  // рык
    tone(880, 0.6, 'sine', 0.035, 0.2)
    tone(1174, 0.7, 'sine', 0.025, 0.32)
  },
  /** Мантра: у каждой свой голос. id — из MANTRA_SLOTS. */
  mantra(id) {
    if (id === 'japa') {                      // повторение: короткий тихий звон
      tone(1174.7, 0.13, 'sine', 0.04)
      tone(1567.9, 0.16, 'sine', 0.022, 0.05)
    } else if (id === 'pranayama') {          // дыхание: мягкий вдох-выдох
      tone(329.6, 0.34, 'sine', 0.035)
      tone(246.9, 0.5, 'sine', 0.03, 0.16)
    } else if (id === 'madhuvidya') {         // знание-мёд: тёплая нота
      tone(523.3, 0.4, 'sine', 0.045)
      tone(659.3, 0.45, 'sine', 0.032, 0.08)
      tone(784, 0.5, 'sine', 0.022, 0.18)
    } else if (id === 'upavasa') {            // пост: глухой удар, как от оковы
      tone(147, 0.2, 'square', 0.04)
      tone(392, 0.36, 'sine', 0.03, 0.06)
    } else {
      tone(440, 0.26, 'sine', 0.04)
    }
  },
  /** Сева: тёплый мягкий аккорд — помощь без платы. */
  seva() {
    tone(261.6, 0.5, 'sine', 0.04)
    tone(392, 0.55, 'sine', 0.032, 0.08)
    tone(523.3, 0.6, 'sine', 0.022, 0.16)
  },
  /** Авидья запылила: еле слышный высокий гул. */
  avidya(level) {
    if (level < 0.5) return
    tone(1180, 0.5, 'sine', 0.008 + (level - 0.5) * 0.02)
    tone(1770, 0.4, 'sine', 0.005 + (level - 0.5) * 0.012, 0.05)
  },
  /** Авидья схлынула — короткий спад. */
  avidyaDown() {
    tone(880, 0.22, 'sine', 0.022)
    tone(587, 0.28, 'sine', 0.016, 0.05)
  },
  step() { tone(96, 0.05, 'sine', 0.014) },
  dash() { tone(420, 0.13, 'triangle', 0.03); tone(190, 0.16, 'sine', 0.022, 0.03) },
  /** Самадхи открылась — свет заливает. */
  samadhi() {
    tone(196, 1.4, 'sine', 0.045)
    tone(392, 1.2, 'sine', 0.03, 0.1)
    tone(587.3, 1.0, 'sine', 0.022, 0.22)
    tone(784, 0.9, 'sine', 0.016, 0.36)
  },
}

/** Тихий дрон локации: своя нота и своя окраска на каждую стихию. */
const DRONES = {
  0: { f: 55,    type: 'sine',     gain: 0.016, shimmer: 0 },   // Земля — низкий грунт
  1: { f: 82.4,  type: 'sine',     gain: 0.018, shimmer: 0.4 }, // Вода — плеск
  2: { f: 61.7,  type: 'sawtooth', gain: 0.010, shimmer: 0 },   // Огонь — гул
  3: { f: 110,   type: 'sine',     gain: 0.012, shimmer: 0.6 }, // Воздух — свист
  4: { f: 130.8, type: 'sine',     gain: 0.014, shimmer: 0.5 }, // Эфир — звон
  5: { f: 146.8, type: 'triangle', gain: 0.010, shimmer: 0.7 }, // Ум — стекло
  6: { f: 196,   type: 'sine',     gain: 0.010, shimmer: 0.8 }, // Сознание — почти тишина
}

let droneNode = null
let droneGain = null
let droneShimmer = null

/** Запустить фон локации. Вызывать не чаще раза при входе в комнату. */
export function startDrone(floor = 0) {
  const audio = ensureAc()
  if (!audio) return
  stopDrone()
  const d = DRONES[floor] || DRONES[0]
  const osc = audio.createOscillator()
  droneGain = audio.createGain()
  droneGain.gain.value = 0.0001
  osc.type = d.type
  osc.frequency.value = d.f
  osc.connect(droneGain)
  droneGain.connect(audio.destination)
  osc.start()
  droneNode = osc
  // медленный подъём громкости — фон не должен ударить сразу
  droneGain.gain.exponentialRampToValueAtTime(d.gain, audio.currentTime + 2.5)
  if (d.shimmer > 0) {
    const sh = audio.createOscillator()
    droneShimmer = audio.createGain()
    droneShimmer.gain.value = 0.0001
    sh.type = 'sine'
    sh.frequency.value = d.f * 3.01
    sh.connect(droneShimmer)
    droneShimmer.connect(audio.destination)
    sh.start()
    droneShimmer.gain.exponentialRampToValueAtTime(d.gain * 0.22 * d.shimmer, audio.currentTime + 3.5)
    droneShimmerOsc = sh
  }
}

let droneShimmerOsc = null

export function stopDrone() {
  const audio = ac
  if (!audio) return
  const fade = (node, gainNode) => {
    if (!node || !gainNode) return
    try {
      gainNode.gain.cancelScheduledValues(audio.currentTime)
      gainNode.gain.setValueAtTime(Math.max(0.0001, gainNode.gain.value), audio.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.4)
      node.stop(audio.currentTime + 0.5)
    } catch { /* уже остановлен */ }
  }
  fade(droneNode, droneGain)
  fade(droneShimmerOsc, droneShimmer)
  droneNode = droneGain = droneShimmer = droneShimmerOsc = null
}

// ── Аудиотека практики (§16.2, идея №33): проигрывание собранных звуков ──
// Каждый звук — «записанная практика», которую можно унести в жизнь (WebAudio,
// без файлов). Звуки генерируются как паттерны тонов; источник — Шастра.

export function playLibrarySound(id) {
  switch (id) {
    case 'omkara':
      // Пранава: a-u-ma — творение, сохранение, растворение. Медленный нисходящий дрон.
      tone(196, 0.5, 'sine', 0.04)
      tone(164.8, 0.7, 'sine', 0.045, 0.4)
      tone(130.8, 1.4, 'sine', 0.05, 0.9)
      tone(98, 1.6, 'sine', 0.045, 1.8)
      tone(196, 2.6, 'sine', 0.015, 0.4) // обертон-серебро
      break
    case 'kiirtana':
      // Кииртана: нисходящая гамма Имени (как в sfx.kiirtana, но длиннее — пение).
      ;[587.3, 523.3, 493.9, 440, 392, 329.6, 293.7, 261.6].forEach((f, i) =>
        tone(f, 0.32, 'sine', 0.05, i * 0.24))
      tone(293.7, 0.9, 'triangle', 0.04, 1.8)
      break
    case 'bija':
      // Биджа-мантра: звук-семя — короткий яркий вброс и отклик (акустический корень).
      tone(1100, 0.09, 'triangle', 0.06)
      tone(1648, 0.05, 'sine', 0.045, 0.03)
      tone(660, 0.5, 'sine', 0.04, 0.1)
      tone(880, 0.3, 'sine', 0.025, 0.22)
      break
    case 'japa':
      // Джапа: медитативное повторение — ровный ритм коротких тонов («манана»).
      ;[0, 0.42, 0.84, 1.26, 1.68, 2.1].forEach((t) => tone(440, 0.2, 'sine', 0.045, t))
      break
    case 'mantra':
      // Мантра: то, что повторением ведёт к освобождению. Спокойная арпеджио-петля.
      ;[392, 440, 523.3, 587.3].forEach((f, i) => tone(f, 0.34, 'sine', 0.04, i * 0.3))
      tone(523.3, 1.1, 'sine', 0.03, 1.2)
      break
    case 'pranayama':
      // Пранаяма: вдох — выдох (медленное дыхание звуком).
      tone(220, 0.7, 'sine', 0.035)
      tone(246.9, 0.8, 'sine', 0.04, 0.6)
      tone(220, 1.1, 'sine', 0.04, 1.3)
      tone(196, 1.2, 'sine', 0.035, 2.2)
      break
    default:
      return
  }
}
