// Мини-игры «в такт» (§16.2): кииртан-ритм при розыгрыше кииртан-карт.
// Кииртан-ритм: 4 бита, 3 точных тапа дают качество 3 → +2 саттвы и +1 карту.
import { h, mount } from './dom.js'
import { sfx, burst, audioNow, scheduleTone } from './fx.js'
import { haptics } from './haptics.js'

const BEAT = 480
const TOTAL = 4
const MAX_TAPS = 3
const TOLERANCE = 150 // мс; в аудио-такте — те же мс, т.к. currentTime в секундах

export function kirtanRhythmOverlay({ onDone = () => {} } = {}) {
  // Единый аудио-такт (§16.2, идея №7, точный ритм): биты планируются заранее
  // на audioContext.currentTime (без дрейфа setTimeout), тапы меряются по нему же.
  // Если WebAudio недоступен — фолбэк на performance.now() (прежнее поведение).
  const acNow = audioNow()
  const useAudioClock = acNow != null
  const clockNow = () => (useAudioClock ? audioNow() : performance.now() / 1000)

  const t0 = clockNow() + 0.35 // короткая пауза перед первым битом
  const beatTimes = Array.from({ length: TOTAL }, (_, i) => t0 + (BEAT / 1000) * i)
  const hitBeat = new Set()
  let goodTaps = 0
  let done = false
  const timers = []
  const scheduled = [] // запланированные осцилляторы (для отмены при «Пропустить»)

  const overlay = h('div', { class: 'rhythm-overlay' })
  const circle = h('div', { class: 'rhythm-circle' })
  const label = h('div', { class: 'rhythm-label' }, 'Тапайте в такт пению')
  const dotsEl = h('div', { class: 'rhythm-dots' })
  const skipBtn = h('button', { class: 'btn ghost small', onclick: finish }, 'Пропустить')

  function renderDots() {
    mount(dotsEl, beatTimes.map((_, i) => h('span', { class: `r-dot ${hitBeat.has(i) ? 'on' : ''}` })))
  }

  function finish() {
    if (done) return
    done = true
    for (const t of timers) clearTimeout(t)
    for (const s of scheduled) s.stop()
    overlay.remove()
    onDone(goodTaps)
  }

  beatTimes.forEach((bt, i) => {
    // Звук бита планируется заранее на точное аудио-время (WebAudio lookup).
    if (useAudioClock) {
      scheduled.push(scheduleTone(880, 0.045, 'sine', 0.016, bt))
    } else {
      timers.push(setTimeout(() => sfx.beatTick(), (bt - clockNow()) * 1000))
    }
    // Визуал можно вешать по таймеру (дрейф миллисекунд некритичен для UI).
    timers.push(setTimeout(() => {
      if (done) return
      circle.classList.add('beat')
      setTimeout(() => circle.classList.remove('beat'), 200)
    }, (bt - clockNow()) * 1000))
  })
  timers.push(setTimeout(() => {
    if (done) return
    label.textContent = goodTaps >= MAX_TAPS ? 'Ритм пойман!' : 'Кииртан прозвучал'
    setTimeout(finish, 600)
  }, (beatTimes[TOTAL - 1] - clockNow()) * 1000 + 500))

  overlay.addEventListener('click', (e) => {
    if (done) return
    const now = clockNow()
    let best = null
    for (let i = 0; i < beatTimes.length; i++) {
      if (hitBeat.has(i)) continue
      const d = Math.abs(now - beatTimes[i]) * 1000
      if (d <= TOLERANCE && (best === null || d < best.d)) best = { i, d }
    }
    if (best) {
      hitBeat.add(best.i)
      goodTaps += 1
      sfx.beat()
      haptics.impact('light') // лёгкий «прис» каждого пойманного бита
      const rect = overlay.getBoundingClientRect()
      burst(rect.left + rect.width / 2, rect.top + rect.height / 2, '#ffe9b3', 10)
      circle.classList.add('hit')
      setTimeout(() => circle.classList.remove('hit'), 200)
      renderDots()
      if (goodTaps >= MAX_TAPS) finish()
    } else {
      sfx.miss()
      haptics.impact('rigid') // жёсткий «щелчок» ≠ звуку промаха
    }
  })

  renderDots()
  mount(overlay,
    h('div', { class: 'rhythm-panel' },
      h('div', { class: 'rhythm-title' }, 'Кииртан'),
      label,
      circle,
      dotsEl,
      skipBtn))
  document.body.append(overlay)
}
