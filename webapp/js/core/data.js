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

// Четыре ментальности ума (§12.1, Human Society Part 2) — это НЕ классы и не
// «класс души»: психологические типы ума, которые в каждом человеке присутствуют
// одновременно (одна доминирует). Чтобы стать садвипрой, надо развить ВСЕ четыре.
// В игре это мета-прогресс: ментальности растут ПАРАЛЛЕЛЬНО от разных поступков;
// слабая ментальность = недостающий навык = заметные трудности.
export const MENTALITIES = {
  shudra: {
    id: 'shudra',
    name: 'Шудра',
    sanskrit: 'शूद्र',
    order: 0,
    color: '#8a8f98',
    desc: 'Присутствие и труд: ум в настоящем, выносливость, стабильность. Навык — стойкость: больше ХП и терпение к натиску авидьи.',
    focusDesc: '+10 ХП на забег · стойкость к авидье',
    focusHp: 10,
  },
  kshatriya: {
    id: 'kshatriya',
    name: 'Кшатрия',
    sanskrit: 'क्षत्रिय',
    order: 1,
    color: '#c0392b',
    desc: 'Смелость и борьба за дхарму: прошлое и настоящее, «might is right». Навык — смелость: противостоять давлению, не срываться в перекос.',
    focusDesc: 'Старт с Тапахом и Первым усилием · смелость против перекоса',
    focusCards: ['tapah', 'first_effort'],
  },
  vipra: {
    id: 'vipra',
    name: 'Випра',
    sanskrit: 'विप्र',
    order: 2,
    color: '#e8e4d8',
    desc: 'Знание и видение структуры: прошлое, настоящее и будущее. Навык — видение: читать интенты и видеть верх колоды.',
    focusDesc: 'Старт со Свадхьяей и Шаочой · видение интентов',
    focusCards: ['svadhyaya', 'shaoca'],
  },
  vaeshya: {
    id: 'vaeshya',
    name: 'Вайшья',
    sanskrit: 'वैश्य',
    order: 3,
    color: '#c9a227',
    desc: 'Мудрость ресурсов: мутативность, деньги как мера. Навык — мудрое использование: Прана тратится эффективнее, скидки в лавке.',
    focusDesc: '+10 Праны на забег · скидки в лавке',
    focusPrana: 10,
  },
}

// Порядок ментальностей (социальный цикл Саркара: шудра → кшатрия → випра → вайшья).
export const MENTALITY_ORDER = ['shudra', 'kshatriya', 'vipra', 'vaeshya']

// Уровни развития ментальности: сколько очков нужно для каждого уровня.
// Уровень 0 — стартовый, уровень 3 — зрелость ментальности.
export const MENTALITY_LEVELS = [0, 4, 10, 18]

// Порог «зрелости» ментальности: уровень, при котором она считается развитой.
// Садвипра = все четыре ментальности на этом уровне и выше (Human Society Part 2, гл. 4).
export const SADVIPRA_MIN_LEVEL = 2

export function mentalityLevel(points) {
  let lv = 0
  for (let i = 0; i < MENTALITY_LEVELS.length; i++) {
    if (points >= MENTALITY_LEVELS[i]) lv = i
  }
  return lv
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

export function starterDeckForFocus(focusId) {
  const deck = starterDeck()
  const f = focusId && MENTALITIES[focusId] ? MENTALITIES[focusId] : null
  if (f) {
    for (const id of f.focusCards || []) deck.push(id)
  }
  return deck
}

// «Раскрываемость» цитат (живые цитаты, §исследование): полный перевод и «жизнь»
// открываются, когда термин ПРОЖИТ — сыграна карта, успокоен враг, получена реликвия
// или знание вручено. Подсказка говорит, как раскрыть. Если у цитаты нет носителя
// (понятие практики: гуна, прама, мантра…) — она раскрыта сразу.
export function quoteLiveHint(quoteId) {
  for (const c of Object.values(CARDS)) if (c.quoteId === quoteId) return 'Сыграйте эту карту в бою — знание оживёт.'
  for (const e of Object.values(ENEMIES)) if (e.quoteId === quoteId) return e.isBoss
    ? 'Освободите владыку чакры по пути Ахимсы.'
    : 'Успокойте этого врага, не убивая его.'
  for (const r of Object.values(RELICS)) if (r.quoteId === quoteId) return 'Возьмите эту реликвию — она раскроется в пути.'
  return null
}

// Цитата раскрыта, если термин прожит; без носителя — всегда раскрыта.
export function isQuoteLived(meta, quoteId) {
  if (!quoteLiveHint(quoteId)) return true
  return !!(meta && meta.lived && meta.lived[quoteId])
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
