// Загрузка контента (content/*.json) в удобные карты.
import cardsData from '@content/cards.json'
import enemiesData from '@content/enemies.json'
import relicsData from '@content/relics.json'
import eventsData from '@content/events.json'
import quotesData from '@content/quotes.json'
import challengesData from '@content/challenges.json'
import trialsData from '@content/trials.json'

export const CARDS = cardsData
export const ENEMIES = enemiesData
export const RELICS = relicsData
export const EVENTS = eventsData
export const QUOTES = quotesData
export const CHALLENGES = Object.fromEntries(
  Object.entries(challengesData).filter(([k]) => !k.startsWith('_'))
)

// Дерево челленджей Ямы/Ниямы (§16.2, идея №16): испытание открывает карту-практику
// навсегда (мета-прогресс). Каждое испытание — поведенческое правило боя; пройдено →
// rewardCard попадает в пул наград. Закрытая карта в наградах не появляется.
export const TRIALS = Object.fromEntries(
  Object.entries(trialsData).filter(([k]) => !k.startsWith('_'))
)

// Все карты, что открываются испытаниями (награда дерева).
export const TRIAL_REWARD_CARDS = Object.values(TRIALS).map((t) => t.rewardCard)

// Доступные испытания: первые неоткрытые из каждой ветви (Яма/Нияма) — остальные
// закрыты «деревом» до прохождения предыдущих. Порядок внутри ветви — order.
// floor — текущий этаж забега: испытание появляется не раньше своего minFloor
// (прогрессивная сложность, как Ascension в StS / Pact of Punishment в Hades).
export function availableTrials(unlocked = [], floor = 0) {
  const byBranch = { yama: [], niyama: [] }
  for (const t of Object.values(TRIALS)) {
    ;(byBranch[t.branch] || (byBranch[t.branch] = [])).push(t)
  }
  const out = []
  for (const branch of Object.keys(byBranch)) {
    const list = byBranch[branch].sort((a, b) => a.order - b.order)
    const next = list.find((t) => !unlocked.includes(t.rewardCard) && (t.minFloor ?? 0) <= floor)
    if (next) out.push(next)
  }
  return out
}

export function starterDeck() {
  const deck = []
  for (const card of Object.values(CARDS)) {
    if (card && card.id && card.starter && card.starter > 0) {
      for (let i = 0; i < card.starter; i++) deck.push(card.id)
    }
  }
  return deck
}

// Варны — социальный цикл Саркара (§12.1 спеки, Human Society Part 2):
// психологические типы ума, а не касты. Прогрессия между забегами:
// шудра → кшатрия → випра → вайшья. Каждая варна = джанма (стиль рождения).
// varnaIdx — позиция в цикле (для открытия/прогресса).
export const JANMAS = {
  shudra: {
    id: 'shudra',
    name: 'Шудра',
    sanskrit: 'शूद्र',
    varnaIdx: 0,
    color: '#555c66',
    desc: 'Психология труда и статичности: ум привязан к настоящему и к телу. Выносливость выше — но гуны смещены к тамасу.',
    gunaStart: { s: 3, r: 2, t: 4 },
    prana: 0,
    deckAdd: [],
    hp: 10,
  },
  kshatriya: {
    id: 'kshatriya',
    name: 'Кшатрия',
    sanskrit: 'क्षत्रिय',
    varnaIdx: 1,
    color: '#c0392b',
    desc: 'Борцовский дух: прошлое и настоящее, «might is right». Агрессивный старт — Тапах и первое усилие вместо пассивных практик.',
    gunaStart: { s: 3, r: 5, t: 2 },
    prana: 0,
    deckAdd: ['tapah', 'first_effort'],
    hp: -5,
  },
  vipra: {
    id: 'vipra',
    name: 'Випра',
    sanskrit: 'विप्र',
    varnaIdx: 2,
    color: '#e8e4d8',
    desc: 'Психология интеллекта: прошлое, настоящее и будущее — видеть структуру. Саттвичный запас и знание на старте.',
    gunaStart: { s: 5, r: 3, t: 2 },
    prana: 0,
    deckAdd: ['shaoca', 'svadhyaya'],
    hp: 5,
  },
  vaeshya: {
    id: 'vaeshya',
    name: 'Вайшья',
    sanskrit: 'वैश्य',
    varnaIdx: 3,
    color: '#c9a227',
    desc: 'Мутативность и накопление: деньги как мера всего. Начинает с перекосом раджаса и лишней Праной — но и с оковкой жадности.',
    gunaStart: { s: 3, r: 5, t: 3 },
    prana: 10,
    deckAdd: ['lobha', 'dana'],
    hp: 0,
  },
}

// Порядок варн в социальном цикле (для прогресса мета-игры).
export const VARNA_ORDER = ['shudra', 'kshatriya', 'vipra', 'vaeshya']

export function starterDeckFor(janna) {
  const deck = starterDeck()
  const j = janna && JANMAS[janna] ? JANMAS[janna] : null
  if (j) {
    for (const id of j.deckAdd || []) deck.push(id)
  }
  return deck
}

// Пул наград: все карты кроме мусора/овковок и стартовых. Карты, открываемые
// испытаниями (Яма/Нияма), доступны только после прохождения испытания (мета-прогресс).
// Стартовые карты в награды не выпадают, кроме открытых испытанием (напр. Ахимса).
export function cardRewardPool(unlocked = []) {
  const open = new Set(unlocked)
  return Object.values(CARDS).filter((c) => {
    if (!c || !c.id || c.type === 'curse' || c.type === 'vritti') return false
    if (TRIAL_REWARD_CARDS.includes(c.id)) return open.has(c.id)
    if (c.starter) return false
    return true
  })
}
