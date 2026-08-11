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
  med() { tone(392, 0.5, 'sine', 0.04); tone(523, 0.6, 'sine', 0.035, 0.2); tone(659, 0.8, 'sine', 0.03, 0.4) },
  death() { tone(180, 0.6, 'sine', 0.05); tone(120, 0.8, 'sine', 0.05, 0.2); tone(80, 1.0, 'sine', 0.045, 0.4) },
  win() { tone(523, 0.25, 'sine', 0.05); tone(659, 0.25, 'sine', 0.05, 0.12); tone(784, 0.25, 'sine', 0.05, 0.24); tone(1047, 0.5, 'sine', 0.045, 0.36) },
  samadhi() { tone(700, 0.5, 'sine', 0.04); tone(1050, 0.6, 'sine', 0.03, 0.1); tone(1400, 0.7, 'sine', 0.02, 0.2) },
}
