// Переиспользуемые виджеты: карты, орбы гун, бейджи, цитаты, враги.
import { h } from './dom.js'
import { CARDS, QUOTES } from '../core/data.js'
import { CHAKRAS } from '../core/run.js'

export function cardEl(card, { cost, compact = false, onPlay } = {}) {
  const c = typeof card === 'string' ? CARDS[card] : card
  const effCost = cost != null ? cost : c.cost
  return h(
    'div',
    {
      class: `card c-${c.type}`,
      onclick: onPlay ? () => onPlay(c.id) : null,
      style: compact ? 'flex:0 0 96px;width:96px;height:146px;' : null,
    },
    h('div', { class: `cost ${effCost === 0 ? 'zero' : ''}` }, effCost),
    h('div', { class: 'c-name' }, c.name),
    h('div', { class: 'c-sanscr sanscr' }, c.sanskrit || ''),
    h('div', { class: 'c-desc' }, c.desc || ''),
    h('div', { class: 'c-type' }, typeLabel(c.type)),
    gunaLine(c.guna)
  )
}

function gunaLine(g) {
  if (!g) return null
  const parts = []
  if (g.s > 0) parts.push(h('span', { class: 'sat', style: 'color:var(--sat)' }, `s+${g.s}`))
  if (g.s < 0) parts.push(h('span', { class: 'sat', style: 'color:var(--sat)' }, `s${g.s}`))
  if (g.r > 0) parts.push(h('span', { style: 'color:var(--raj)' }, ` r+${g.r}`))
  if (g.t > 0) parts.push(h('span', { style: 'color:var(--tam)' }, ` t+${g.t}`))
  return h('div', { class: 'c-guna' }, parts)
}

export function typeLabel(t) {
  return {
    curse: 'мусор',
    vritti: 'овка',
    practice: 'практика',
    mantra: 'мантра',
    kiirtana: 'кииртан',
    seva: 'служение',
  }[t] || t
}

export function gunaOrbs(g, { lead, prama } = {}) {
  const gd = { s: 0, r: 0, t: 0 }
  const defs = [
    { key: 's', label: 'саттва', color: 'sat' },
    { key: 'r', label: 'раджас', color: 'raj' },
    { key: 't', label: 'тамас', color: 'tam' },
  ]
  return h(
    'div',
    { class: 'gunas' },
    defs.map((d) =>
      h(
        'div',
        { class: `guna-orb ${d.color}` },
        h('div', { class: `orb ${lead === d.key ? 'lead' : ''} ${g[d.key] <= 1 ? 'low' : ''}` }, g[d.key]),
        h('div', { class: 'g-lbl' }, d.label)
      )
    )
  )
}

export function badges({ prama, imbalance, samadhi, passive = [] }) {
  const items = []
  if (prama) items.push(h('span', { class: 'badge prama' }, '☯ прама'))
  if (samadhi) items.push(h('span', { class: 'badge samadhi' }, '◉ самадхи'))
  if (imbalance === 't') items.push(h('span', { class: 'badge imbalance' }, '▼ тамас-перекос'))
  if (imbalance === 'r') items.push(h('span', { class: 'badge imbalance' }, '▲ раджас-перекос'))
  if (imbalance === 's') items.push(h('span', { class: 'badge imbalance' }, '☀ саттва-перекос'))
  for (const p of passive) items.push(h('span', { class: 'badge passive' }, p))
  if (items.length === 0) return null
  return h('div', { class: 'badges' }, items)
}

export function quoteBox(quoteId, { onClose } = {}) {
  const q = QUOTES[quoteId]
  if (!q) return null
  return h(
    'div',
    { class: 'quote-box fade-in' },
    h('div', { class: 'q-term sanscr' }, `${q.term} · ${q.sanskrit}`),
    h('div', { class: 'q' }, `«${q.quote}»`),
    h('div', { class: 'q-src' }, q.source),
    h('div', { class: 'q-term', style: 'margin-top:8px' }, q.life),
    onClose ? h('button', { class: 'btn small mt', onclick: onClose }, 'Хорошо') : null
  )
}

export function enemyCard(e, { calmHint = true } = {}) {
  const hpPct = Math.max(0, (e.hp / e.maxHp) * 100)
  const calmDots = []
  for (let i = 0; i < e.calmMax; i++) calmDots.push(h('div', { class: `calm-dot ${i < e.calm ? 'on' : ''}` }))
  return h(
    'div',
    { class: 'enemy-card' },
    h('div', { class: 'enemy-name display' }, e.name),
    h('div', { class: 'enemy-epithet' }, e.epithet),
    e.def.isBoss && e.def.chakra != null && CHAKRAS[e.def.chakra]
      ? h('div', { class: 'enemy-chakra' }, `владыка чакры ${CHAKRAS[e.def.chakra]}`)
      : null,
    h('div', { class: 'enemy-sanscr sanscr' }, e.def.sanskrit),
    h('div', { class: `enemy-art glyph-${e.glyph}` }),
    h(
      'div',
      { class: 'enemy-hp-wrap' },
      h(
        'div',
        { class: 'enemy-hp-lbl' },
        h('span', {}, 'ХП'),
        h('span', {}, `${Math.max(0, Math.ceil(e.hp))} / ${e.maxHp}`)
      ),
      h('div', { class: 'enemy-hp-bar' }, h('div', { class: 'enemy-hp-fill', style: `width:${hpPct}%` }))
    ),
    h(
      'div',
      { class: 'calm-bar' },
      calmDots
    ),
    calmHint ? h('div', { class: 'calm-hint' },
      e.def.calmCard
        ? `освобождается: ${CARDS[e.def.calmCard]?.name || ''} · ахимса`
        : 'успокоение ахимсой') : null
  )
}

export function intentChip(e) {
  const kind = intentKind(e.intentName)
  const dmg = e.intentDamage > 0 ? h('span', { class: 'i-dmg' }, e.intentDamage) : null
  return h(
    'div',
    { class: 'intent' },
    h('span', { class: 'i-kind' }, kind),
    dmg,
    h('span', {}, e.intentName)
  )
}

function intentKind(name) {
  if (/удар|замах|захват|пелена|тяжёлая/.test(name)) return 'атака'
  if (/накопление|рокот/.test(name)) return 'защита'
  if (/вспышка|спячка|разбухание/.test(name)) return 'усиление'
  return 'действие'
}

export function samadhiMeter(gain, threshold) {
  const pct = Math.min(100, (gain / threshold) * 100)
  return h(
    'div',
    { class: 'meter-wrap', style: 'margin:2px 0' },
    h('div', { class: 'row between', style: 'font-size:10px;color:var(--muted);letter-spacing:.14em;text-transform:uppercase' },
      h('span', {}, 'Самадхи'),
      h('span', {}, `${Math.min(gain, threshold)}/${threshold}`)),
    h('div', { class: 'hp-bar', style: 'margin-top:3px' }, h('div', { class: 'enemy-hp-fill', style: `width:${pct}%;background:linear-gradient(90deg,#f2c46d,#ffe9b3)` }))
  )
}
