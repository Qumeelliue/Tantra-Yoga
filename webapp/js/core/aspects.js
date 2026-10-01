// ПОЧЕРК (Hades: weapon aspects) — второй слой выбора поверх варны.
//
// Зачем. Варна выбирается один раз и живёт вечно: выбрал шудру — значит
// стойкость навсегда. Четыре варны на всю игру — это четыре игры, и после
// десяти забегов выбор перестаёт быть выбором. В Hades у оружия есть
// АСПЕКТЫ: то же оружие, другой почерк, и он меняет бой сильнее самой вещи.
//
// Скопировано 1:1:
//
//   · аспект выбирается **после** оружия и **до** забега;
//   · аспект — это **развилка с обеими сторонами**: в нём есть и сила, и
//     плата (в Hades аспект всегда либо ускоряет, либо меняет цену);
//   · аспектов на оружие несколько, и они меняют существующие величины, а не
//     вводят новые.
//
// Чем отличаемся. У Hades аспект — «+30 % урона». У нас аспект меняет один
// СЛОТ БОЯ и всегда с обратной стороной: почерк — это не «лучше», а «иначе».
// Иначе выбор был бы очевидным и обесценивал бы саму варну.
//
// Правила:
//
//   1. аспект всегда меняет уже существующие величины (тот же закон, что у
//      даров и усилений мастерской);
//   2. у каждого аспекта есть цитата из шастр (правило проекта);
//   3. аспект НЕ переживает забег: сменился забег — сменился почерк.

import { DEFAULT_FIELD_OPTIONS } from './field.js'

export const ASPECTS = {
  shudra: [
    {
      id: 'shudra_asteya',
      name: 'Астея',
      label: 'не берёшь лишнего',
      quoteId: 'asteya',
      desc: 'Неведение растёт медленнее, но и шаг короче.',
      field: 'неведение +1 тише · ход медленнее',
      gain: 'aвидья растёт на 0.4 в секунду меньше',
      cost: 'шаг на 8 % короче',
      apply: (o) => {
        o.avidyaGainIdle = Math.round(((o.avidyaGainIdle ?? 2.2) - 0.4) * 100) / 100
        o.walkSpeed = Math.round((o.walkSpeed ?? 132) * 0.92)
      },
    },
    {
      id: 'shudra_shaoca',
      name: 'Шауча',
      label: 'чистота',
      quoteId: 'shaoca',
      desc: 'Дыхание гасит неведение сильнее, но оки слышат дальше.',
      field: 'дыхание гасит сильнее · оки слышат дальше',
      gain: 'дыхание гасит на 5 больше',
      cost: 'радиус успокоения на 8 меньше',
      apply: (o) => {
        o.avidyaCalmBreath = (o.avidyaCalmBreath ?? 14) + 5
        o.calmRadius = (o.calmRadius ?? 62) - 8
      },
    },
  ],
  kshatriya: [
    {
      id: 'kshatriya_tapah',
      name: 'Тапах',
      label: 'аскеза',
      quoteId: 'tapah',
      desc: 'Удар бьёт сильнее — и сильнее кормит неведение.',
      field: 'урон удара +4 · неведение за удар +5',
      gain: 'урон удара по окове на 4 больше',
      cost: 'удар кормит неведение на 5 больше',
      apply: (o) => {
        o.strikeBonus = (o.strikeBonus ?? 0) + 4
        o.avidyaGainStrike = (o.avidyaGainStrike ?? 9) + 5
      },
    },
    {
      id: 'kshatriya_satya',
      name: 'Satya',
      label: 'правда',
      quoteId: 'satya',
      desc: 'Окно дефлекта шире — но и длина оковы достаёт дальше.',
      field: 'окно парирования +0.03 · длина оковы +8',
      gain: 'окно парирования шире на 0.03 с',
      cost: 'ока достаёт до тебя на 8 пикселей дальше',
      apply: (o) => {
        o.parryWindow = Math.round(((o.parryWindow ?? 0.2) + 0.03) * 1000) / 1000
        o.enemyReach = (o.enemyReach ?? 40) + 8
      },
    },
  ],
  vipra: [
    {
      id: 'vipra_viveka',
      name: 'Вивека',
      label: 'различение',
      quoteId: 'viveka',
      desc: 'Пелена неведения отступает позже — но запас Ци меньше.',
      field: 'пелена неведения позже · запас Ци −4',
      gain: 'пелена неведения отступает при 0.9 неведения',
      cost: 'запас Ци на 4 меньше',
      apply: (o) => {
        o.auraVeilAt = 0.9
        o.psychicMax = Math.max(2, (o.psychicMax ?? 12) - 4)
      },
    },
    {
      id: 'vipra_pratyahara',
      name: 'Пратьяхара',
      label: 'отступление внутрь',
      quoteId: 'pratyahara',
      desc: 'Оки теряют спокойствие медленнее — но рывок реже.',
      field: 'стойкость оков выше · рывок реже',
      gain: 'ока теряет спокойствие на треть медленнее',
      cost: 'рывок на 0.2 с дольше',
      apply: (o) => {
        o.calmDecayEnemy = Math.round(((o.calmDecayEnemy ?? 0.22) * 0.6) * 1000) / 1000
        o.dashCooldown = Math.round(((o.dashCooldown ?? 0.85) + 0.2) * 100) / 100
      },
    },
  ],
  vaeshya: [
    {
      id: 'vaeshya_seva',
      name: 'Сева',
      label: 'служение',
      quoteId: 'seva',
      desc: 'Помощь прикрывает щитом — а монет приносит меньше.',
      field: 'сева даёт щит · монет меньше',
      gain: 'каждая сева даёт 1 щит',
      cost: 'монет ×0.7',
      apply: (o) => {
        o.sevaShield = (o.sevaShield ?? 0) + 1
        o.coinMul = Math.round((o.coinMul ?? 1) * 0.7 * 100) / 100
      },
    },
    {
      id: 'vaeshya_santosa',
      name: 'Сантоша',
      label: 'довольство',
      quoteId: 'santosa',
      desc: 'В лавке дешевле — а с комнат падает меньше.',
      field: 'скидка в лавке · монет с комнат меньше',
      gain: 'скидка в лавке 30 %',
      cost: 'монет ×0.7',
      apply: (o) => {
        o.shopDiscount = 0.3
        o.coinMul = Math.round((o.coinMul ?? 1) * 0.7 * 100) / 100
      },
    },
  ],
}

/** Аспекты варны. Пустой массив, если варны нет. */
export function aspectsFor(varna) {
  return ASPECTS[varna] || []
}

/** Аспект по id или null. */
export function aspectById(id) {
  for (const list of Object.values(ASPECTS)) {
    const hit = list.find((a) => a.id === id)
    if (hit) return hit
  }
  return null
}

/**
 * Применить почерк. Меняет существующие величины, ничего не вводит.
 * Цепочка: варна → нефрит → дары → мастерская → жар; почерк применяется
 * сразу после варны, потому что он её уточняет, а не перекрывает.
 */
export function applyAspect(opts, id) {
  const o = { ...DEFAULT_FIELD_OPTIONS, ...opts }
  const a = aspectById(id)
  if (a) a.apply(o)
  for (const key of Object.keys(o)) if (typeof o[key] === 'number' && !Number.isFinite(o[key])) o[key] = DEFAULT_FIELD_OPTIONS[key]
  return o
}