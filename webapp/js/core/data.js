// Загрузка контента (content/*.json) в удобные карты.
import cardsData from '@content/cards.json'
import enemiesData from '@content/enemies.json'
import relicsData from '@content/relics.json'
import eventsData from '@content/events.json'
import quotesData from '@content/quotes.json'

export const CARDS = cardsData
export const ENEMIES = enemiesData
export const RELICS = relicsData
export const EVENTS = eventsData
export const QUOTES = quotesData

export function starterDeck() {
  const deck = []
  for (const card of Object.values(CARDS)) {
    if (card && card.id && card.starter && card.starter > 0) {
      for (let i = 0; i < card.starter; i++) deck.push(card.id)
    }
  }
  return deck
}

// Джанма — «как вы родились в этот раз»: преднастройка старта (§12.2 спеки).
export const JANMAS = {
  trader: {
    id: 'trader',
    name: 'Торговец',
    sanskrit: 'वैश्य',
    desc: 'Вайшья-склонность: начинает с перекосом раджаса и лишней Праной.',
    gunaStart: { s: 3, r: 5, t: 3 },
    prana: 10,
    deckAdd: ['lobha'],
    hp: 0,
  },
  warrior: {
    id: 'warrior',
    name: 'Воин',
    sanskrit: 'क्षत्रिय',
    desc: 'Кшатрия-склонность: агрессивный старт — Тапах вместо пассивных практик, +сила.',
    gunaStart: { s: 3, r: 3, t: 3 },
    prana: 0,
    deckAdd: ['tapah', 'first_effort'],
    hp: -5,
  },
  sadhu: {
    id: 'sadhu',
    name: 'Садху',
    sanskrit: 'ब्राह्मण',
    desc: 'Брахмана-склонность: саттвичный запас и стартовая практика очищения.',
    gunaStart: { s: 5, r: 3, t: 3 },
    prana: 0,
    deckAdd: ['shaoca'],
    hp: 5,
  },
}

export function starterDeckFor(janna) {
  const deck = starterDeck()
  const j = janna && JANMAS[janna] ? JANMAS[janna] : null
  if (j) {
    for (const id of j.deckAdd || []) deck.push(id)
  }
  return deck
}

export function cardRewardPool() {
  return Object.values(CARDS).filter((c) => c && c.id && !c.starter && c.type !== 'curse' && c.type !== 'vritti')
}
