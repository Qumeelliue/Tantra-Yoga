// Ментальности как «оружие» — в Hades у каждого оружия свой набор движений.
// У нас у каждой варны свой набор правил боя. Термины и навыки — из
// `MENTALITIES` (Human Society Part 2): варны — не классы, а психология ума.
//
// Каждый набор меняет ТОЛЬКО существующие величины боя. Ничего нового.
// Правило проекта: геймплей копируем, философию интегрируем (AGENTS.md §2).

import { DEFAULT_FIELD_OPTIONS } from './field.js'

export const VARNA_KITS = {
  // Шудра — присутствие и труд. Навык: стойкость. Держится дольше всех.
  shudra: {
    id: 'shudra',
    label: 'стойкость',
    apply: (o) => {
      o.playerHp = (o.playerHp ?? 60) + 10
      o.calmDecayEnemy = (o.calmDecayEnemy ?? 0.22) * 0.7   // спокойствие тает меньше
    },
  },
  // Кшатрия — смелость. Навык: противостоять давлению. Возвращает удар
  // сильнее, но и авидьи кормит сильнее.
  kshatriya: {
    id: 'kshatriya',
    label: 'смелость',
    apply: (o) => {
      o.deflectCalm = (o.deflectCalm ?? 0.85) + 0.3
      o.avidyaGainIdle = (o.avidyaGainIdle ?? 2.2) + 0.5
    },
  },
  // Випра — знание и видение. Навык: различение. Аура не гаснет так быстро,
  // и каждая снятая ока даёт Ци.
  vipra: {
    id: 'vipra',
    label: 'различение',
    apply: (o) => {
      o.auraVeilAt = 0.78
      o.qiOnPacify = (o.qiOnPacify ?? 0) + 2
    },
  },
  // Вайшья — мудрость ресурсов. Навык: стяжание. Больше монет, лавка дешевле.
  vaeshya: {
    id: 'vaeshya',
    label: 'стяжание',
    apply: (o) => {
      o.coinMul = (o.coinMul ?? 1) * 2
      o.shopDiscount = 0.5
    },
  },
}

export function applyVarna(opts, id) {
  const o = { ...DEFAULT_FIELD_OPTIONS, ...opts }
  const kit = VARNA_KITS[id]
  if (kit) kit.apply(o)
  for (const key of Object.keys(o)) if (typeof o[key] === 'number' && !Number.isFinite(o[key])) o[key] = DEFAULT_FIELD_OPTIONS[key]
  return o
}
