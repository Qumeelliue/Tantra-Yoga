// Экран медитации с дыхательной мини-игрой (§16.2, идея №11).
// Фаза «дыхание»: тапайте на пике вдоха — качество 0..3 усиливает медитацию.
// Фаза «отпускание»: выберите до maxBurn карт-оков, они навсегда покинут ум.
import { h, mount } from '../dom.js'
import { burst, floatNum, sfx } from '../fx.js'
import { CARDS } from '../../core/data.js'
import { meditatableCards, doMeditate, meditateEffects } from '../../core/run.js'

const IN_MS = 2200
const OUT_MS = 2200
const CYCLE = IN_MS + OUT_MS
const PEAK_LO = 0.42
const PEAK_HI = 0.58
const MAX_Q = 3

export function meditationScreen(app, { onDone } = {}) {
  const run = app.run
  const burnable = meditatableCards(run)
  const root = h('div', { class: 'screen active node-screen' })

  const qualityEl = h('div', { class: 'med-quality' })
  const hintEl = h('div', { class: 'med-hint center' })
  const circleEl = h('div', { class: 'med-breath' })
  const omEl = h('div', { class: 'med-om' }, 'ॐ')
  const phaseEl = h('div', { class: 'med-phase' })
  const zoneEl = h('div', { class: 'med-zone', onclick: onTap },
    circleEl,
    h('div', { class: 'med-inner' }, omEl, phaseEl))
  const nextBtn = h('button', { class: 'btn primary med-next', onclick: () => toBurn() }, 'Завершить дыхание →')

  mount(root,
    h('div', { class: 'node-title display' }, 'Медитация · дыхание'),
    hintEl,
    qualityEl,
    zoneEl,
    nextBtn)

  // ── фаза дыхания ─────────────────────────────────────────────

  let quality = 0
  let t0 = performance.now()
  let raf = 0
  let ended = false
  let lastMiss = 0

  function cyclePos() {
    return ((performance.now() - t0) % CYCLE) / CYCLE
  }

  function breathScale(pos) {
    const f = Math.min(pos * 2, 2 - pos * 2) // 0..1 симметрично вокруг пика
    return 0.55 + 0.45 * Math.sin(Math.PI * f)
  }

  function frame() {
    if (ended) return
    const pos = cyclePos()
    const s = breathScale(pos)
    circleEl.style.transform = `scale(${s})`
    phaseEl.textContent = pos < 0.5 ? 'вдох' : 'выдох'
    if (quality >= MAX_Q) phaseEl.textContent = 'покой'
    raf = requestAnimationFrame(frame)
  }

  function onTap(e) {
    if (ended || quality >= MAX_Q) return
    const pos = cyclePos()
    const rect = zoneEl.getBoundingClientRect()
    const x = e.clientX || rect.left + rect.width / 2
    const y = e.clientY || rect.top + rect.height / 2
    if (pos >= PEAK_LO && pos <= PEAK_HI) {
      quality += 1
      sfx.med()
      burst(x, y, '#ffe9b3', 16)
      renderQuality()
      if (quality >= MAX_Q) {
        phaseEl.textContent = 'покой'
        floatNum(innerWidth / 2, innerHeight / 2, 'дыхание установлено', 'heal')
      }
    } else {
      const now = performance.now()
      if (now - lastMiss > 600) {
        lastMiss = now
        sfx.error()
        hintEl.textContent = 'Не в такт: тапните, когда круг в полном вдохе.'
        circleEl.classList.add('shake')
        setTimeout(() => circleEl.classList.remove('shake'), 400)
      }
    }
  }

  function renderQuality() {
    mount(qualityEl, Array.from({ length: MAX_Q }, (_, i) =>
      h('span', { class: `q-dot ${i < quality ? 'on' : ''}` })))
  }

  function showHint() {
    hintEl.textContent = 'Дышите вместе с кругом: на вдохе он растёт. Тапните на пике — каждый точный вдох углубляет медитацию.'
  }

  // ── фаза отпускания ──────────────────────────────────────────

  function toBurn() {
    if (ended) return
    ended = true
    cancelAnimationFrame(raf)
    const fx = meditateEffects(quality)
    const selected = new Set()
    const uniq = [...new Set(burnable)]

    const listEl = h('div', { class: 'choices med-burn-list' })
    function renderList() {
      mount(listEl, uniq.map((id) => {
        const on = selected.has(id)
        const maxed = selected.size >= fx.maxBurn && !on
        return h('div', {
          class: `choice med-burn ${on ? 'on' : ''} ${maxed ? 'disabled' : ''}`,
          onclick: maxed ? null : () => toggle(id),
        },
          h('div', { class: 'c-main' }, CARDS[id].name),
          h('div', { class: 'c-sub' }, `осталось в колоде: ${burnable.filter((x) => x === id).length}`))
      }))
    }
    function toggle(id) {
      if (selected.has(id)) selected.delete(id)
      else {
        if (selected.size >= fx.maxBurn) return
        selected.add(id)
      }
      renderList()
      renderCta()
    }

    const cta = h('button', { class: 'btn primary', onclick: confirm })
    function renderCta() {
      cta.textContent = selected.size > 0
        ? `Отпустить (${selected.size})`
        : 'Завершить медитацию'
    }

    const note = h('p', { class: 'hint center' })

    mount(root,
      h('div', { class: 'node-icon' }, 'ॐ'),
      h('div', { class: 'node-title display' }, 'Медитация'),
      h('div', { class: 'med-result' },
        h('div', { class: 'row center' }, h('span', { class: 'badge passive' }, `дыхание ${quality}/3`)),
        h('div', { class: 'row center mt' },
          h('span', { class: 'badge passive' }, `+${fx.heal} ХП`),
          fx.sattvaBonus > 0 ? h('span', { class: 'badge sat' }, `+${fx.sattvaBonus} саттвы`) : null)),
      burnable.length > 0
        ? h('p', { class: 'node-text' }, `Отпустите до ${fx.maxBurn} карт-оков — они навсегда покинут ум.`)
        : h('p', { class: 'hint center' }, 'В колоде нет оков — ум чист. Возьмите покой.'),
      listEl,
      cta)

    renderList()
    renderCta()

    function confirm() {
      const res = doMeditate(run, [...selected], { quality })
      sfx.med()
      if (res.burned > 0) sfx.burn()
      const pos = { x: innerWidth / 2, y: innerHeight / 2 }
      floatNum(pos.x, pos.y, `+${res.healed} ХП`, 'heal')
      onDone && onDone(res)
    }
  }

  showHint()
  renderQuality()
  raf = requestAnimationFrame(frame)
  return root
}
