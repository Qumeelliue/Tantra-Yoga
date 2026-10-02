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
// РАНГИ НЕФРИТА (МЕХАНИКА 55). В Hades у каждого хранилища 8 рангов: ранг
// покупается тем же, что и остальное в комнате сбережений, и каждый следующий
// добавляет ЧАСТЬ первого эффекта, а не новый эффект. Здесь то же самое:
// ранг покупается амбросией у того же фонтана, где нефрит выбирается, и
// каждый следующий ранг усиливает ту же самую величину.
//
// Почему это «копия», а не своё: в рантайме ранг не вводит ни одной новой
// величины — только множитель уже существующего шага. Поэтому весь эффект
// ранга виден в обычных опциях боя, и замер его видит тем же путём.
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
    // ранг: та же прама, та же шакти — просто крепче и дольше
    step: (o) => { o.pramaWindow += 0.08; o.shaktiMax += 3 },
    apply: (o, lv = 1, self = null) => { o.pramaWindow += 0.20; o.shaktiMax += 6; for (let i = 1; i < lv; i++) { if (self && typeof self.step === 'function') self.step(o) } },
  },
  {
    id: 'viveka',
    name: 'Вивека',
    sub: 'различение',
    desc: 'Возвращённый удар снимает намного больше спокойствия. Плата: неведение растёт быстрее на покое.',
    quoteId: 'viveka',
    // ранг усиливает ОБЕ стороны: и пользу, и цену. Иначе высокий ранг
    // «Вивеки» был бы подарком без причины.
    step: (o) => { o.deflectCalm += 0.25; o.avidyaGainIdle += 0.25 },
    apply: (o, lv = 1, self = null) => { o.deflectCalm += 0.45; o.avidyaGainIdle += 0.6; for (let i = 1; i < lv; i++) { if (self && typeof self.step === 'function') self.step(o) } },
  },
  {
    id: 'ahankara',
    name: 'Аханкара',
    sub: '«я»',
    desc: '+6 жизни на весь побег. Плата: удар по окове кормит неведение сильнее.',
    quoteId: 'ahankara',
    step: (o) => { o.playerHp += 2; o.avidyaGainStrike += 1 },
    apply: (o, lv = 1, self = null) => { o.playerHp += 6; o.avidyaGainStrike += 2; for (let i = 1; i < lv; i++) { if (self && typeof self.step === 'function') self.step(o) } },
  },
  {
    id: 'pranayama',
    name: 'Пранаяма',
    sub: 'управление дыханием',
    desc: 'Мантра стоит на 2 Ци меньше — можно дышать заметно чаще.',
    quoteId: 'pranayama',
    step: (o) => { o.mantraCostCut += 0.8 },
    apply: (o, lv = 1, self = null) => { o.mantraCostCut += 2; for (let i = 1; i < lv; i++) { if (self && typeof self.step === 'function') self.step(o) } },
  },
  {
    id: 'aparigraha',
    name: 'Апариграха',
    sub: 'непривязанность',
    desc: 'В полтора раза больше монет, и неведение копится на покое медленнее.',
    quoteId: 'aparigraha',
    step: (o) => { o.coinMul = (o.coinMul || 1) * 1.15; o.avidyaGainIdle -= 0.2 },
    apply: (o, lv = 1, self = null) => { o.coinMul = (o.coinMul || 1) * 1.5; o.avidyaGainIdle -= 0.5; for (let i = 1; i < lv; i++) { if (self && typeof self.step === 'function') self.step(o) } },
  },
  {
    id: 'dhyana',
    name: 'Дхьяна',
    sub: 'медитация',
    desc: 'Рывок возвращается на треть быстрее, и прама держится дольше.',
    quoteId: 'dhyana',
    step: (o) => { o.dashCooldown = Math.max(0.2, o.dashCooldown - 0.1); o.pramaWindow += 0.04 },
    apply: (o, lv = 1, self = null) => { o.dashCooldown = Math.max(0.2, o.dashCooldown - 0.3); o.pramaWindow += 0.1; for (let i = 1; i < lv; i++) { if (self && typeof self.step === 'function') self.step(o) } },
  },
  {
    id: 'mudra',
    name: 'Мудра севы',
    sub: 'печать служения',
    desc: 'Любая сева даёт 5 щита. Служение начинает по-настоящему прикрывать.',
    quoteId: 'mudra',
    step: (o) => { o.sevaShield += 3 },
    apply: (o, lv = 1, self = null) => { o.sevaShield += 5; for (let i = 1; i < lv; i++) { if (self && typeof self.step === 'function') self.step(o) } },
  },
  {
    id: 'prana',
    name: 'Прана',
    sub: 'жизненная энергия',
    desc: 'Потолок Ци выше на 6 — дышать и бить дефлектом можно чаще.',
    quoteId: 'prana',
    step: (o) => { o.psychicMax += 3 },
    apply: (o, lv = 1, self = null) => { o.psychicMax += 6; for (let i = 1; i < lv; i++) { if (self && typeof self.step === 'function') self.step(o) } },
  },
]

export const KEEPSAKE_BY_ID = Object.fromEntries(KEEPSAKES.map((k) => [k.id, k]))

// Восемь рангов — как в Hades. `KEEPSAKE_LEVEL_COST[lv]` — цена перехода
// С ранга lv НА lv+1, то есть `cost[1]` — цена второго ранга.
export const KEEPSAKE_MAX_LEVEL = 8
export const KEEPSAKE_LEVEL_COST = [0, 30, 45, 65, 90, 120, 155, 200]

/** Цена следующего ранга. null — ранг уже высший, покупать нечего. */
export function keepsakeLevelCost(level) {
  const lv = Number.isFinite(level) ? Math.max(1, Math.min(KEEPSAKE_MAX_LEVEL, level)) : 1
  if (lv >= KEEPSAKE_MAX_LEVEL) return null
  return KEEPSAKE_LEVEL_COST[lv]
}


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
export function applyKeepsake(opts, id, level = 1) {
  const o = { ...DEFAULT_FIELD_OPTIONS, ...opts }
  const k = KEEPSAKE_BY_ID[id]
  // Ранг зажимается ДО apply: ранг 99 из испорченного сохранения не должен
  // превращать опции в NaN, а страховка внизу обязана остаться последним словом.
  const lv = Number.isFinite(level) ? Math.max(1, Math.min(KEEPSAKE_MAX_LEVEL, Math.round(level))) : 1
  if (k) k.apply(o, lv, k)
  // Страховка: NaN в опциях — это всегда ошибка, а не «особый случай».
  for (const key of Object.keys(o)) if (typeof o[key] === 'number' && !Number.isFinite(o[key])) o[key] = DEFAULT_FIELD_OPTIONS[key]
  return o
}
