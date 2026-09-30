// НЕФРИТЫ (Hades: Keepsakes / Jadestone) — второй источник силы рядом с дарами.
//
// В Hades в начале побега стоит «Фонтан юности», где игрок выбирает
// хранилище (keepsake) — один предмет на весь побег, меняющий бой.
// В Nine Sols это «нефритовые слоты» — пассивные модификаторы способностей.
//
// Здесь ровно та же схема: ОДИН нефрит на забег, выбирается у фонтана
// перед первым шагом. Каждый нефрит меняет ТОЛЬКО уже существующие
// величины боя — никаких новых слотов (AGENTS.md §2, игра копируется).
//
// Термины и цитаты — настоящие, из корпуса Ананда Марги (content/quotes.json).

/** @type {Array<{id:string,name:string,sub:string,desc:string,quoteId:string,apply:(o:any)=>void}>} */
import { DEFAULT_FIELD_OPTIONS } from './field.js'

export const KEEPSAKES = [
  {
    id: 'prama',
    name: 'Прама',
    sub: 'равновесие',
    desc: 'Прама держится дольше, а потолок духовной силы выше на 6.',
    quoteId: 'prama',
    apply: (o) => { o.pramaWindow += 0.20; o.shaktiMax += 6 },
  },
  {
    id: 'viveka',
    name: 'Вивека',
    sub: 'различение',
    desc: 'Возвращённый удар снимает намного больше спокойствия. Плата: неведение растёт быстрее на покое.',
    quoteId: 'viveka',
    apply: (o) => { o.deflectCalm += 0.45; o.avidyaGainIdle += 0.6 },
  },
  {
    id: 'ahankara',
    name: 'Аханкара',
    sub: '«я»',
    desc: '+6 жизни на весь побег. Плата: удар по окове кормит неведение сильнее.',
    quoteId: 'ahankara',
    apply: (o) => { o.playerHp += 6; o.avidyaGainStrike += 2 },
  },
  {
    id: 'pranayama',
    name: 'Пранаяма',
    sub: 'управление дыханием',
    desc: 'Мантра стоит на 2 Ци меньше — можно дышать заметно чаще.',
    quoteId: 'pranayama',
    apply: (o) => { o.mantraCostCut += 2 },
  },
  {
    id: 'aparigraha',
    name: 'Апариграха',
    sub: 'непривязанность',
    desc: 'В полтора раза больше монет, и неведение копится на покое медленнее.',
    quoteId: 'aparigraha',
    apply: (o) => { o.coinMul = (o.coinMul || 1) * 1.5; o.avidyaGainIdle -= 0.5 },
  },
  {
    id: 'dhyana',
    name: 'Дхьяна',
    sub: 'медитация',
    desc: 'Рывок возвращается на треть быстрее, и прама держится дольше.',
    quoteId: 'dhyana',
    apply: (o) => { o.dashCooldown = Math.max(0.2, o.dashCooldown - 0.3); o.pramaWindow += 0.1 },
  },
  {
    id: 'mudra',
    name: 'Мудра севы',
    sub: 'печать служения',
    desc: 'Любая сева даёт 5 щита. Служение начинает по-настоящему прикрывать.',
    quoteId: 'mudra',
    apply: (o) => { o.sevaShield += 5 },
  },
  {
    id: 'prana',
    name: 'Прана',
    sub: 'жизненная энергия',
    desc: 'Потолок Ци выше на 6 — дышать и бить дефлектом можно чаще.',
    quoteId: 'prana',
    apply: (o) => { o.psychicMax += 6 },
  },
]

export const KEEPSAKE_BY_ID = Object.fromEntries(KEEPSAKES.map((k) => [k.id, k]))

/** Три нефрита на выбор — как три дара, но выбор один и навсегда на забег. */
export function rollKeepsakes(rng = Math.random, n = 3) {
  const pool = KEEPSAKES.slice()
  const out = []
  while (out.length < Math.min(n, pool.length)) {
    const i = Math.floor(rng() * pool.length)
    out.push(pool.splice(i, 1)[0])
  }
  return out
}

/**
 * Надевает нефрит. Возвращает НОВЫЙ объект опций — вход не мутируется.
 *
 * Считает от ПОЛНЫХ значений по умолчанию, а не от того, что уже пришло:
 * иначе `undefined + 0.1` даёт NaN, и ломается всё, что дальше считает
 * по этой величине. Опции всегда строятся цепочкой варна → нефрит → дары →
 * мастерская, и промежуточный объект может быть неполным.
 */
export function applyKeepsake(opts, id) {
  const o = { ...DEFAULT_FIELD_OPTIONS, ...opts }
  const k = KEEPSAKE_BY_ID[id]
  if (k) k.apply(o)
  // Страховка: NaN в опциях — это всегда ошибка, а не «особый случай».
  for (const key of Object.keys(o)) if (typeof o[key] === 'number' && !Number.isFinite(o[key])) o[key] = DEFAULT_FIELD_OPTIONS[key]
  return o
}
