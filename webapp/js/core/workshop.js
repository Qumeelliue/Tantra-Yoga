import { DEFAULT_FIELD_OPTIONS } from './field.js'
import { heatReward } from './heat.js'

// Мастерская севы — постоянная петля между забегами.
//
// Источник механики: **Nine Sols** — валюта 拜 «поклонение» копится за то,
// что ты делал, и тратится в мастерской на постоянные усиления. Плюс
// **Hades** — прогресс переживает смерть (зеркало/«Судьба»).
//
// Наш смысл: валюта — **сева**, и тратится она не на «силу», а на
// **практику**: каждое усиление — это один из принципов Ямы и Ниямы из
// шастр, и покупая его, игрок открывает цитату. Философия учится через
// трату, а не через чтение.
//
// Каждое усиление меняет ОДИН существующий слот боя. Ничего нового
// не вводится (AGENTS.md §2, design/BASE-GAME.md).

/**
 * Усиления мастерской. `apply` — функция, которая получает набор опций
 * боя и меняет ОДНО из них. `quoteId` — цитата из шастр, без неё
 * усиления не существует (правило проекта).
 */
export const WORKSHOP = [
  {
    id: 'yama_ahimsa',
    name: 'Яма · Ахимса',
    quoteId: 'ahimsa',
    cost: 3,
    desc: 'Удар больше почти не кормит авидью.',
    why: 'Ахимса означает не причинять страданий — даже себе',
    apply: (o) => { o.avidyaGainStrike = 2 },
  },
  {
    id: 'niyama_aparigraha',
    name: 'Нияма · Апариграха',
    quoteId: 'aparigraha',
    cost: 3,
    desc: 'Серия дефлектов горит дольше на 2 секунды.',
    why: 'сокращать собственные удобства',
    apply: (o) => { o.comboWindow += 2 },
  },
  {
    id: 'niyama_shaoca',
    name: 'Нияма · Шауча',
    quoteId: 'shaoca',
    cost: 4,
    desc: 'Неведение растёт на треть медленнее.',
    why: 'чистота: внешняя и внутренняя',
    apply: (o) => { o.avidyaGainIdle = Math.round(o.avidyaGainIdle * 0.66 * 100) / 100 },
  },
  {
    id: 'seva_viprocita',
    name: 'Сева · Випрочита',
    quoteId: 'seva',
    cost: 5,
    desc: 'Крипа отпускает оковы сильнее.',
    why: 'объект служения — это Нараяна',
    apply: (o) => { o.krpaCalm = 1.6 },
  },
  {
    id: 'krpa_umbrella',
    name: 'Крипа · Зонт',
    quoteId: 'krpa',
    cost: 6,
    desc: 'Окно дефлекта шире: 0.20 → 0.24 с.',
    why: 'убери зонт тщеславия — и дождь достигнет',
    apply: (o) => { o.parryWindow = 0.24 },
  },
  {
    id: 'brahmacarya',
    name: 'Брахмачарья',
    quoteId: 'brahmacarya',
    cost: 5,
    desc: 'Запас Ци выше: 12 → 16.',
    why: 'оставаться привязанным к Брахме',
    apply: (o) => { o.psychicMax = 16 },
  },
]

/** Базовая цена усиления. */
export function workshopCost(id) {
  return WORKSHOP.find((u) => u.id === id)?.cost ?? 0
}

/** Сколько очков севы набежало за забег. Считается честно, из фактов боя. */
export function sevaPointsFor(st) {
  let p = 0
  p += st.pacified || 0                       // каждая снятая ока — 1
  p += (st.served?.size || 0)                 // каждая сева — 1
  if (st.foes?.every((f) => f.pacified)) p += 2   // локация без единого удара
  if (st.krpaUsed) p += 1                     // под крипой стоял
  if (st.player && !st.player.alive) p = Math.max(0, p - 1)  // умер — минус
  // ЖАР платит. Без этого он был бы наказанием, а не ставкой, и вопрос
  // «зачем играть снова» остался бы без ответа. Копия из Hades: награда
  // растёт вместе с добровольно взятым уровнем.
  //
  // Важно: множитель применяется ПОСЛЕ вычитания за смерть, а не до. Иначе
  // смерть на жаре 5 обнуляла бы ставку и платила за провал больше, чем за
  // успех, — то есть жар поощрял бы умирать.
  const heat = st.heat || 0
  if (heat > 0) p = heatReward(heat, p)
  return p
}

/**
 * Применить все купленные усижения к набору опций боя.
 * `owned` — массив id из профиля. Возвращает новый объект (не мутирует входной).
 */
export function applyUpgrades(opts, owned = []) {
  // Последний в цепочке варна → нефрит → дары → мастерская. Считает от
  // полных значений и страхуется от NaN — см. applyBoons.
  const o = { ...DEFAULT_FIELD_OPTIONS, ...opts }
  for (const u of WORKSHOP) {
    if (!owned.includes(u.id)) continue
    u.apply(o)
  }
  for (const key of Object.keys(o)) if (typeof o[key] === 'number' && !Number.isFinite(o[key])) o[key] = DEFAULT_FIELD_OPTIONS[key]
  return o
}

/** Можно ли купить. */
export function canBuy(id, points, owned = []) {
  if (owned.includes(id)) return false
  const c = workshopCost(id)
  return c > 0 && points >= c
}
