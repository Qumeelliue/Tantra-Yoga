// Экран боя: HUD, гуны, враг, рука, анимации.
import { h, mount, clear } from '../dom.js'
import { cardEl, gunaOrbs, badges, enemyCard, intentChip, samadhiMeter, avidyaMeter, microvitaBadge } from '../widgets.js'
import { burst, floatNum, setTint, setGunaAudio, sfx, kiirtanaWave, microvitaFx } from '../fx.js'
import { haptics } from '../haptics.js'
import { CARDS } from '../../core/data.js'
import { playCard, endTurn, resolveRemoval, effectiveCost, checkOutcome, kiirtanaRhythmBonus, samadhiPacify } from '../../core/engine.js'
import { kirtanRhythmOverlay } from '../minigames.js'

export function combatScreen(app) {
  const { combat, run, meta } = app
  const root = h('div', { class: 'screen active' })

  // контейнеры
  const hudEl = h('div', { class: 'hud' })
  const gunaEl = h('div', {})
  const badgeEl = h('div', {})
  const meterEl = h('div', {})
  const enemyZone = h('div', { class: 'enemy-zone' })
  const samadhiBtn = h('button', { class: 'btn ghost small', style: 'width:auto;margin:6px auto;display:none', onclick: doSamadhiPacify }, '◉ Успокоить (самадхи)')
  const pilesEl = h('div', { class: 'piles-row' })
  const handEl = h('div', { class: 'hand' })
  const endBtn = h('button', { class: 'btn ghost end-turn-btn', onclick: () => doEndTurn() }, 'Завершить ход ✦')
  const logEl = h('div', { class: 'combat-log' })
  const peekEl = h('div', { class: 'hint center', style: 'min-height:18px' })

  mount(
    root,
    hudEl,
    h('div', { class: 'panel', style: 'padding:10px 12px' }, gunaEl, badgeEl, meterEl),
    enemyZone,
    samadhiBtn,
    peekEl,
    h('div', { class: 'hand-wrap' }, handEl, pilesEl),
    endBtn,
    logEl
  )

  let busy = false

  // Синергии-«потоки» (§8.5): собранные школы ума видны как пассивные бейджи,
  // а незакрытые — как прогресс к активации (учит «собирать состояние ума»).
  function synergyBadges(s) {
    if (!s) return []
    const out = []
    if (s.ahimsa) out.push('☯ поток ахимсы')
    else if (s.n && s.n.ahimsa >= 2) out.push(`☯ ахимса ${s.n.ahimsa}/3`)
    if (s.kiirtana) out.push('◉ поток кииртана')
    else if (s.n && s.n.kiirtana >= 2) out.push(`◉ кииртан ${s.n.kiirtana}/3`)
    if (s.yama) out.push('🕉 поток ямы')
    else if (s.n && s.n.practice >= 3) out.push(`🕉 яма ${s.n.practice}/4`)
    if (s.seva) out.push('✋ поток служения')
    else if (s.n && s.n.seva >= 2) out.push(`✋ сева ${s.n.seva}/3`)
    return out
  }

  function render() {
    const p = combat.player
    const e = combat.enemies[0]

    // HUD
    const hpPct = Math.max(0, (p.hp / p.maxHp) * 100)
    mount(
      hudEl,
      h('div', { class: 'hp-cell' },
        h('span', { class: 'lbl' }, 'ХП'),
        h('div', { class: 'hp-bar' }, h('div', { class: 'hp-fill', style: `width:${hpPct}%` })),
        h('span', { class: 'hp-num' }, `${Math.max(0, Math.ceil(p.hp))}`)),
      h('div', { class: 'energy-pips' }, Array.from({ length: p.maxEnergy + (p.inSamadhi ? 1 : 0) }, (_, i) =>
        h('div', { class: `pip ${i < p.energy ? 'on' : ''}` })))
    )

    mount(gunaEl, gunaOrbs(p.guna, { lead: p.imbalance, prama: p.prama }))
    mount(badgeEl, badges({ prama: p.prama, imbalance: p.imbalance, samadhi: p.inSamadhi, passive: synergyBadges(combat.synergies), mentalities: combat.mentalities }))
    mount(meterEl,
      samadhiMeter(p.samadhiGain, combat.o.samadhiThreshold),
      avidyaMeter(combat),
      microvitaBadge(combat))


    // враг
    if (e && !e.dead && !e.pacified) {
      const enc = app.meta && app.meta.encounters && app.meta.encounters[e.id]
      const intentsHidden = !!combat.hideIntents
      mount(enemyZone,
        enemyCard(e),
        h('div', { class: 'row', style: 'gap:6px' }, intentChip(e, { hidden: intentsHidden })),
        intentsHidden
          ? h('div', { class: 'hint center', style: 'font-size:10px;margin-top:2px;color:var(--muted)' },
              'неведение скрывает шаг врага — знание (випра) откроет видение')
          : null,
        enc > 1 ? h('div', { class: 'hint center', style: 'font-size:10px;margin-top:4px' },
          `встреч в прошлых жизнях: ${enc}`) : null)
    } else {
      mount(enemyZone)
    }

    // самадхи-действие (§8.4): «видеть истину» → отпустить одного обычного врага
    samadhiBtn.style.display = p.inSamadhi && e && !e.dead && !e.pacified && !e.def.isBoss ? 'block' : 'none'

    // колоды
    mount(pilesEl,
      h('span', {}, `колода: <b>${combat.piles.draw.length}</b>`),
      h('span', {}, `сброс: <b>${combat.piles.discard.length}</b>`))

    // рука
    mount(handEl, combat.piles.hand.map((id, i) =>
      cardEl(CARDS[id], { cost: effectiveCost(combat, CARDS[id]), onPlay: () => doPlay(i) })
    ))

    // предвидение/память: самадхи показывает следующие карты, Дхрувасмрити и
    // зрелая випра (ур.2+) — верхнюю карту колоды (видение ума, §12.1)
    const memoryPeek = combat.peekStart && combat.peek && combat.peek.length > 0
    if ((p.inSamadhi || memoryPeek) && combat.piles.draw.length > 0) {
      const next = p.inSamadhi
        ? combat.piles.draw.slice(-2).reverse()
        : (combat.peek || []).slice(-2)
      mount(peekEl,
        h('span', { style: 'color:var(--gold-soft)' }, p.inSamadhi ? 'предвидение: ' : 'память: '),
        next.map((id) => h('span', { class: 'sanscr', style: 'margin:0 4px;color:var(--gold)' }, CARDS[id].name)))
    } else {
      mount(peekEl)
    }

    setTint(p.imbalance === 't' ? 't' : p.imbalance === 'r' ? 'r' : p.imbalance === 's' ? 's' : null)
    setGunaAudio(p.inSamadhi ? null : p.imbalance === 't' ? 't' : p.imbalance === 'r' ? 'r' : p.imbalance === 's' ? 's' : null)

    if (combat.pending && combat.pending.type === 'removal') {
      showBurnOverlay()
    }
  }

  function posOf(el) {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }

  function doPlay(handIndex) {
    if (busy || combat.pending || combat.outcome) return
    const card = CARDS[combat.piles.hand[handIndex]]
    if (combat.player.energy < effectiveCost(combat, card)) {
      sfx.error()
      toast('Не хватает энергии', 'danger')
      return
    }
    busy = true
    const cardEls = handEl.children
    const el = cardEls[handIndex]
    const from = el ? posOf(el) : { x: innerWidth / 2, y: innerHeight / 2 }
    if (card.type === 'kiirtana') { sfx.kiirtana(); kiirtanaWave() }
    else if (card.type === 'mantra') sfx.med()
    else sfx.play()

    // Кииртан-ритм (§16.2, идея №7): точное пение даёт бонус (саттва/карта)
    if (card.type === 'kiirtana') {
      kirtanRhythmOverlay({
        onDone: (quality) => {
          const events = playCard(combat, handIndex, 0)
          events.push(...kiirtanaRhythmBonus(combat, quality))
          applyEvents(events, from)
          if (combat.outcome) finish()
          else { render(); busy = false }
        },
      })
      return
    }

    const events = playCard(combat, handIndex, 0)
    applyEvents(events, from)
    if (combat.pending) {
      showBurnOverlay()
      busy = false
      return
    }
    if (combat.outcome) {
      finish()
    } else {
      render()
      busy = false
    }
  }

  function doEndTurn() {
    if (busy || combat.pending || combat.outcome) return
    busy = true
    sfx.turn()
    const events = endTurn(combat)
    applyEvents(events, { x: innerWidth / 2, y: innerHeight / 4 })
    if (combat.outcome) {
      finish()
    } else {
      render()
      busy = false
    }
  }

  function doSamadhiPacify() {
    if (busy || combat.pending || combat.outcome) return
    busy = true
    sfx.peace()
    const events = samadhiPacify(combat, 0)
    applyEvents(events, posOf(enemyZone))
    if (combat.outcome) {
      finish()
    } else {
      render()
      busy = false
    }
  }

  function applyEvents(events, from) {
    for (const ev of events) {
      if (ev.type === 'damage') {
        sfx.dmg()
        const t = ev.target === 'enemy' ? enemyZone : hudEl
        const pos = posOf(t) || from
        floatNum(pos.x + (Math.random() * 40 - 20), pos.y, `-${ev.amount}`, ev.target === 'player' ? 'dmg' : 'block')
        if (ev.target === 'enemy') burst(pos.x, pos.y, '#ff8a4a', 8)
        if (ev.target === 'player') haptics.impact('medium')
      } else if (ev.type === 'heal') {
        sfx.heal()
        haptics.impact('soft')
        const pos = posOf(hudEl)
        floatNum(pos.x, pos.y, `+${ev.amount}`, 'heal')
      } else if (ev.type === 'block') {
        floatNum(innerWidth / 2, innerHeight / 2, `+${ev.amount}`, 'block')
      } else if (ev.type === 'guna') {
        const key = ev.delta.s > 0 ? 's' : ev.delta.r > 0 ? 'r' : ev.delta.t > 0 ? 't' : null
        if (key) floatNum(innerWidth / 2, innerHeight / 2 + 40, `+${ev.delta[key]}`, key === 's' ? 'sat' : key === 'r' ? 'raj' : 'tam')
      } else if (ev.type === 'pacified') {
        sfx.peace()
        haptics.notify('success')
        const pos = posOf(enemyZone)
        burst(pos.x, pos.y, '#ffe9b3', 26)
        toast(ev.message, 'good')
      } else if (ev.type === 'pacify_gain') {
        floatNum(innerWidth / 2, innerHeight / 2 + 70, `+${ev.calm} спокойствие`, 'sat')
      } else if (ev.type === 'calm_decay') {
        // Владыка сопротивляется (§9.4): его ход снимает накопленное спокойствие —
        // нужно опережать давление, чтобы освободить его
        const pos = posOf(enemyZone)
        floatNum(pos.x, pos.y - 24, 'спокойствие тает', 'tam')
      } else if (ev.type === 'microvita') {
        // Микровиты (§9.1b): положительный микровит летит от карты к окове —
        // свет растворяет узел (+calm), пелена спадает. Явный светлый визуал.
        sfx.microvitaPos()
        haptics.impact('soft')
        microvitaFx(from.x, from.y, 'pos', 12)
        const pos = posOf(enemyZone)
        burst(pos.x, pos.y, '#ffe9b3', 10)
        floatNum(pos.x, pos.y - 10, `+${ev.amount} микровит`, 'sat')
      } else if (ev.type === 'negative_microvita') {
        // Отрицательные микровиты: грязная карта порождает тьму вниз — она
        // питает неведение (шкала авидьи растёт). Видно, чем кормишь ум.
        sfx.microvitaNeg()
        microvitaFx(from.x, from.y, 'neg', 8)
      } else if (ev.type === 'samadhi') {
        sfx.samadhi()
        haptics.notify('success')
        toast(ev.message, 'hl')
      } else if (ev.type === 'kiirtana_rhythm') {
        const parts = []
        if (ev.sattva > 0) parts.push(`+${ev.sattva} саттвы`)
        if (ev.drew > 0) parts.push('+карта')
        toast(parts.length > 0 ? `Ритм кииртана: ${parts.join(' · ')}` : 'Кииртан прозвучал в тишине', parts.length > 0 ? 'good' : '')
      } else if (ev.type === 'anchor') {
        toast(`Якорь: ${ev.situation} → ${ev.practice}`, 'good')
      } else if (ev.type === 'log' || ev.type === 'stolen') {
        toast(ev.text || 'Враг присвоил вашу карту', 'danger')
      } else if (ev.type === 'confused') {
        toast('Иллюзия перемешала вашу руку', 'danger')
      } else if (ev.type === 'burn') {
        sfx.burn()
        toast('Карта отпущена — сожжена', 'good')
      } else if (ev.type === 'samskara') {
        // Авидья (§9.1a): «прилетела самскара» — тяжёлый симптом, ум накрыло
        sfx.dmg()
        haptics.impact('medium')
        setTint('t')
        toast(ev.message, 'danger')
      } else if (ev.type === 'kill') {
        // Подавление силой (§9.2): окову задавили, но не освободили — самскара вернётся
        sfx.hit()
        haptics.impact('medium')
        const pos = posOf(enemyZone)
        burst(pos.x, pos.y, '#e06a5a', 20)
        toast('Окова подавлена, но не освобождена — она вернётся.', 'danger')
      } else if (ev.type === 'error') {
        toast(ev.message, 'danger')
        haptics.notify('error')
      }
    }
  }

  function showBurnOverlay() {
    const options = combat.pending.options
    const overlay = h(
      'div',
      { class: 'burn-overlay' },
      h(
        'div',
        { class: 'burn-panel' },
        h('div', { class: 'display', style: 'font-size:22px' }, 'Отречение'),
        h('p', { class: 'hint mt' }, 'Выберите карту, которую отпустите. Сгоревшая карта навсегда покидает ум — этот забег.'),
        h(
          'div',
          { class: 'burn-options' },
          options.map((id) =>
            h('div', { class: 'burn-item', onclick: () => doBurn(id, overlay) },
              h('span', {}, CARDS[id].name),
              h('span', { class: 'sanscr' }, CARDS[id].sanskrit || ''))
          ),
          h('button', { class: 'btn ghost small', style: 'width:auto;align-self:center', onclick: () => overlay.remove() }, 'Не сейчас')
        )
      )
    )
    document.body.append(overlay)
  }

  function doBurn(id, overlay) {
    resolveRemoval(combat, id)
    overlay.remove()
    sfx.burn()
    const pos = posOf(enemyZone)
    burst(pos.x, pos.y, '#ffe9b3', 18)
    if (combat.outcome) finish()
    else { render(); busy = false }
  }

  function toast(text, cls = '') {
    const line = h('div', { class: `log-line ${cls}` }, text)
    logEl.append(line)
    setTimeout(() => line.remove(), 2800)
  }

  function finish() {
    busy = true
    setGunaAudio(null)
    if (combat.outcome === 'defeat') {
      sfx.death()
      setTint('t')
    } else {
      sfx.win()
      setTint(null)
    }
    setTimeout(() => {
      app.onCombatEnd(combat)
    }, 900)
  }

  render()
  return root
}
