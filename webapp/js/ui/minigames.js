// Мини-игры «в такт» (§16.2): кииртан-ритм при розыгрыше кииртан-карт.
// Кииртан-ритм: 4 бита, 3 точных тапа дают качество 3 → +2 саттвы и +1 карту.
import { h, mount } from './dom.js'
import { sfx, burst } from './fx.js'

const BEAT = 480
const TOTAL = 4
const MAX_TAPS = 3
const TOLERANCE = 150

export function kirtanRhythmOverlay({ onDone = () => {} } = {}) {
  const t0 = performance.now() + 350 // короткая пауза перед первым битом
  const beatTimes = Array.from({ length: TOTAL }, (_, i) => t0 + BEAT * i)
  const hitBeat = new Set()
  let goodTaps = 0
  let done = false
  const timers = []

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
    overlay.remove()
    onDone(goodTaps)
  }

  beatTimes.forEach((bt) => {
    timers.push(setTimeout(() => {
      if (done) return
      circle.classList.add('beat')
      setTimeout(() => circle.classList.remove('beat'), 200)
    }, bt - t0))
  })
  timers.push(setTimeout(() => {
    if (done) return
    label.textContent = goodTaps >= MAX_TAPS ? 'Ритм пойман!' : 'Кииртан прозвучал'
    setTimeout(finish, 600)
  }, beatTimes[TOTAL - 1] - t0 + 500))

  overlay.addEventListener('click', (e) => {
    if (done) return
    const now = performance.now()
    let best = null
    for (let i = 0; i < beatTimes.length; i++) {
      if (hitBeat.has(i)) continue
      const d = Math.abs(now - beatTimes[i])
      if (d <= TOLERANCE && (best === null || d < best.d)) best = { i, d }
    }
    if (best) {
      hitBeat.add(best.i)
      goodTaps += 1
      sfx.beat()
      const rect = overlay.getBoundingClientRect()
      burst(rect.left + rect.width / 2, rect.top + rect.height / 2, '#ffe9b3', 10)
      circle.classList.add('hit')
      setTimeout(() => circle.classList.remove('hit'), 200)
      renderDots()
      if (goodTaps >= MAX_TAPS) finish()
    } else {
      sfx.miss()
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
