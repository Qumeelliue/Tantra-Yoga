import { DEFAULT_FIELD_OPTIONS } from './field.js'
import { BOONS as BOON_DEFS } from './data.js'

// Дары чакры — выбор 1 из 3 между локациями.
//
// Источник механики: **Hades** — после каждой комнаты боги предлагают
// божественные дары, игрок берёт ОДИН из трёх, и они складываются до конца
// забега. Это не «меню настроек», а сердце забега: каждая комната делает
// следующий бой другим.
//
// ОДИН список на весь проект. Раньше он был написан дважды: термин, санскрит,
// цитата и редкость — в `content/boons.json` для колоды и продублированы
// руками здесь, для поля. Сегодня строки совпадали, но это было совпадение, а
// не гарантия: переименование дара в контенте тихо оставило бы старое имя в
// бою. Теперь личность дара (`id`, `name`, `sanskrit`, `quoteId`, `rarity`)
// приходит из контента, и ниже — только слой ПОЛЯ: что дар делает на арене и
// какой уже существующий слот он двигает. Ничего нового не придумано —
// каждый эффект вешается на уже существующую величину.

/**
 * Слой поля: `desc` — слова для карточки в бою, `field` — короткая строка
 * «что именно меняется», `apply` — правка опций боя.
 */
const FIELD = {
  ahimsa: {
    desc: 'Возвращённый удар успокаивает сильнее.',
    field: 'дефлект даёт больше спокойствия',
    apply: (o) => { o.deflectCalm += 0.25 },
  },
  kiirtana: {
    desc: 'Пение держит ритм: серия горит дольше.',
    field: 'серия дефлектов живёт дольше',
    apply: (o) => { o.comboWindow += 0.8 },
  },
  mantra: {
    desc: 'Мантра стоит на 1 Ци дешевле.',
    field: 'цена мантры −1 (не ниже 0)',
    apply: (o) => { o.mantraCostCut += 1 },
  },
  pranayama: {
    desc: 'Вход в локацию с 4 Ци.',
    field: 'стартовый запас Ци',
    apply: (o) => { o.psychicStart = (o.psychicStart ?? 6) + 4 },
  },
  tapah: {
    desc: 'Удар по внешней окове бьёт на 3 сильнее.',
    field: 'урон удара по паше',
    apply: (o) => { o.strikeBonus += 3 },
  },
  seva: {
    desc: 'Помощь даёт ещё и щит.',
    field: 'сева даёт щит',
    apply: (o) => { o.sevaShield += 1 },
  },
  svadhyaya: {
    desc: 'Окно дефлекта шире: 0.20 → 0.23 с.',
    field: 'окно парирования',
    apply: (o) => { o.parryWindow += 0.03 },
  },
  aparigraha: {
    desc: 'Возвращённый удар гасит неведение вдвое.',
    field: 'дефлект сильнее гасит авидью',
    apply: (o) => { o.deflectAvidya += 1.5 },
  },
  satya: {
    desc: 'Правда видна дольше: аура не гаснет так быстро.',
    field: 'пелена неведения отступает позже',
    apply: (o) => { o.auraVeilAt = 0.75 },
  },
  karuna: {
    desc: 'Сострадание прикрывает: вход с 4 щита.',
    field: 'стартовый щит',
    apply: (o) => { o.shieldStart = 4 },
  },
}

/**
 * Дары для поля: порядок и личность — из контента, механика — из `FIELD`.
 * Дар без слоя поля пропускается (в колоде он остаётся) — расхождение ловит
 * тест «оба пути предлагают один и тот же набор».
 */
export const BOONS = Object.values(BOON_DEFS)
  .filter((def) => FIELD[def.id])
  .map((def) => {
    const f = FIELD[def.id]
    return {
      id: def.id,
      name: def.name,
      sanskrit: def.sanskrit,
      quoteId: def.quoteId,
      rarity: def.rarity,
      desc: f.desc,
      field: f.field,
      apply: f.apply,
    }
  })

/** Собрать опции боя со всеми даром и мастерской. */
export function applyBoons(opts, owned = []) {
  // Считаем от полных значений по умолчанию и страхуемся от NaN: цепочка
  // варна → нефрит → дары → мастерская строит опции в несколько шагов, и
  // одно «пропавшее» поле превращается в NaN, который тихо портит весь бой.
  const o = { ...DEFAULT_FIELD_OPTIONS, ...opts }
  for (const b of BOONS) {
    if (!owned.includes(b.id)) continue
    b.apply(o)
  }
  for (const key of Object.keys(o)) if (typeof o[key] === 'number' && !Number.isFinite(o[key])) o[key] = DEFAULT_FIELD_OPTIONS[key]
  return o
}

/**
 * Три дара на выбор. Вес редких ниже, как в Hades: частое — рядом.
 * Уже взятые не повторяются.
 */
export function rollBoons(owned = [], rng = Math.random, count = 3) {
  const pool = BOONS.filter((b) => !owned.includes(b.id))
  if (pool.length <= count) return pool.slice()
  const weight = (b) => (b.rarity === 'common' ? 3 : b.rarity === 'uncommon' ? 2 : 1)
  const out = []
  const left = pool.slice()
  while (out.length < count && left.length) {
    let total = 0
    for (const b of left) total += weight(b)
    let pick = rng() * total
    let idx = 0
    for (; idx < left.length; idx++) {
      pick -= weight(left[idx])
      if (pick <= 0) break
    }
    idx = Math.min(idx, left.length - 1)
    out.push(left[idx])
    left.splice(idx, 1)
  }
  return out
}
