import { DEFAULT_FIELD_OPTIONS } from './field.js'
import { heatReward } from './heat.js'

// МАСТЕРСКАЯ СЕВЫ — постоянная петля между забегами.
//
// Источники механики:
//
//   · **Nine Sols** — валюта 拜 «поклонение» копится за то, что ты делал, и
//     тратится в мастерской на постоянные усиления;
//   · **Hades** — прогресс переживает смерть (зеркало ночи).
//
// Наш смысл: валюта — **сева**, и тратится она не на «силу», а на **практику**:
// каждое усиление — принцип Ямы или Ниямы, и покупая его, игрок открывает
// цитату. Философия учится через трату, а не через чтение.
//
// ── ЧЕГО НЕ ХВАТАЛО (2026-09-30) ───────────────────────────────────────
// Усилений было шесть, и у каждого было ровно одно состояние: купил — работает
// навсегда. В **Hades** в зеркале ночи у каждого усиления есть **ранги**: купил
// первое, стало доступно второе, затем третье, и каждое дороже. Именно ранги
// дают «ещё один повод вернуться» — игра с шестью одноразовыми кнопками
// заканчивается, а с рангами продолжается.
//
// Правила рангов (все из Hades, ничего не выдумано):
//
//   1. ранг 2 открывается ТОЛЬКО после ранга 1 — «усиление одно на всех»
//      осталось бы верным и на втором, а не стало бы «сильнее»;
//   2. каждый следующий ранг дороже;
//   3. ранг не переписывает купленное: применяются по порядку, 1 → 2 → 3;
//   4. рангов не больше трёх (в Hades тоже три: редкое, героическое,
//      легендарное);
//   5. **предпосылки по числу купленных** (StS: улучшения открываются по
//      мере накопления; Hades: в зеркале ночи часть улучшений требует
//      других купленных): ранг 2 — когда куплено хотя бы 2 других
//      усиления, ранг 3 — когда хотя бы 4.
//
// Зачем пятое правило. Без него мастерская — список покупок без порядка:
// «купить раньше» нечего, и весь выбор сводится к тому, у кого больше
// очков. С предпосылками появляется ВТОРАЯ ось решения: кроме «что
// купить» есть «что купить раньше».
//
// Каждое усиление меняет ОДИН существующий слот боя. Ничего нового не
// вводится (AGENTS.md §2, design/BASE-GAME.md).

/**
 * Усиления мастерской.
 *
 * `ranks` — список рангов, от первого. У первого ранга обязательны `cost`,
 * `desc`, `apply` — они же лежат на самом усилении (`cost`/`desc`/`apply`),
 * чтобы старая разметка и старые сохранения продолжали работать: в профиле
 * ранг 1 лежит как голый `id`, без «#1».
 *
 * `apply` получает набор опций и меняет ОДНО из них. Ранги применяются
 * по порядку, поэтому второй ранг может опираться на первый (например,
 * умножить уже изменённую величину).
 *
 * `quoteId` — цитата из шастр, без неё усиления не существует
 * (правило проекта).
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
    ranks: [
      { cost: 3, desc: 'Удар больше почти не кормит авидью.', apply: (o) => { o.avidyaGainStrike = 2 } },
      { cost: 5, desc: 'Удар больше не кормит авидью вовсе.', apply: (o) => { o.avidyaGainStrike = 0 } },
      { cost: 8, desc: 'Удар не кормит авидью совсем, а дыхание гасит неведение сильнее.', apply: (o) => { o.avidyaGainStrike = 0; o.avidyaCalmBreath = Math.round(o.avidyaCalmBreath * 1.6) } },
    ],
  },
  {
    id: 'niyama_aparigraha',
    name: 'Нияма · Апариграха',
    quoteId: 'aparigraha',
    cost: 3,
    desc: 'Серия дефлектов горит дольше на 2 секунды.',
    why: 'сокращать собственные удобства',
    apply: (o) => { o.comboWindow += 2 },
    ranks: [
      { cost: 3, desc: 'Серия дефлектов горит дольше на 2 секунды.', apply: (o) => { o.comboWindow += 2 } },
      { cost: 5, desc: 'Серия горит дольше ещё на 2 секунды.', apply: (o) => { o.comboWindow += 2 } },
      { cost: 8, desc: 'Серия горит дольше и возвращает больше спокойствия.', apply: (o) => { o.comboWindow += 2; o.deflectCalm += 0.15 } },
    ],
  },
  {
    id: 'niyama_shaoca',
    name: 'Нияма · Шауча',
    quoteId: 'shaoca',
    cost: 4,
    desc: 'Неведение растёт на треть медленнее.',
    why: 'чистота: внешняя и внутренняя',
    apply: (o) => { o.avidyaGainIdle = Math.round(o.avidyaGainIdle * 0.66 * 100) / 100 },
    ranks: [
      { cost: 4, desc: 'Неведение растёт на треть медленнее.', apply: (o) => { o.avidyaGainIdle = Math.round(o.avidyaGainIdle * 0.66 * 100) / 100 } },
      { cost: 6, desc: 'Неведение растёт ещё на треть медленнее.', apply: (o) => { o.avidyaGainIdle = Math.round(o.avidyaGainIdle * 0.66 * 100) / 100 } },
      { cost: 8, desc: 'Стоишь — неведение почти не растёт.', apply: (o) => { o.avidyaGainIdle = Math.min(o.avidyaGainIdle, 0.3) } },
    ],
  },
  {
    id: 'seva_viprocita',
    name: 'Сева · Випрочита',
    quoteId: 'seva',
    cost: 5,
    desc: 'Крипа отпускает оковы сильнее.',
    why: 'объект служения — это Нараяна',
    apply: (o) => { o.krpaCalm = 1.6 },
    ranks: [
      { cost: 5, desc: 'Крипа отпускает оковы сильнее.', apply: (o) => { o.krpaCalm = 1.6 } },
      { cost: 8, desc: 'Крипа отпускает оковы и оглушает дольше.', apply: (o) => { o.krpaCalm = 2.0; o.krpaStun = 2.8 } },
      { cost: 9, desc: 'Крипа отпускает оковы и оглушает надолго.', apply: (o) => { o.krpaCalm = 2.4; o.krpaStun = 3.4 } },
    ],
  },
  {
    id: 'krpa_umbrella',
    name: 'Крипа · Зонт',
    quoteId: 'krpa',
    cost: 6,
    desc: 'Окно дефлекта шире: 0.20 → 0.24 с.',
    why: 'убери зонт тщеславия — и дождь достигнет',
    apply: (o) => { o.parryWindow = 0.24 },
    ranks: [
      { cost: 6, desc: 'Окно дефлекта шире: 0.20 → 0.24 с.', apply: (o) => { o.parryWindow = 0.24 } },
      { cost: 9, desc: 'Окно дефлекта ещё шире: 0.24 → 0.28 с.', apply: (o) => { o.parryWindow = 0.28 } },
      { cost: 10, desc: 'Окно дефлекта самое широкое: 0.28 → 0.32 с.', apply: (o) => { o.parryWindow = 0.32 } },
    ],
  },
  {
    id: 'brahmacarya',
    name: 'Брахмачарья',
    quoteId: 'brahmacarya',
    cost: 5,
    desc: 'Запас Ци выше: 12 → 16.',
    why: 'оставаться привязанным к Брахме',
    apply: (o) => { o.psychicMax = 16 },
    ranks: [
      { cost: 5, desc: 'Запас Ци выше: 12 → 16.', apply: (o) => { o.psychicMax = 16 } },
      { cost: 8, desc: 'Запас Ци ещё выше: 16 → 22.', apply: (o) => { o.psychicMax = 22 } },
      { cost: 9, desc: 'Запас Ци наибольший: 22 → 30.', apply: (o) => { o.psychicMax = 30 } },
    ],
  },

  // ── ОСТАВШИЕСЯ ПРИНЦИПЫ (Caryācarya 1–2, Guide to Human Conduct) ────
  // Десять принципов Ямы и Ниямы. Шесть уже были — эти шесть закрывают
  // список. Не выдуманы: каждый принцип назван в «A Guide to Human Conduct»
  // (Яма: ахимса, сатья, астея, брахмачарья, апариграха; Нияма: шауча,
  // сантоша, тапах, свадхьяя, ишвара-пранидхана).
  {
    id: 'yama_satya',
    name: 'Яма · Satya',
    quoteId: 'satya',
    cost: 4,
    desc: 'Расхождение гун замечается: порог прамы 8.',
    why: 'истина — видеть расхождение, а не подгонять',
    apply: (o) => { o.pramaWindow = 8 },
    ranks: [
      { cost: 4, desc: 'Расхождение гун замечается: порог прамы 8.', apply: (o) => { o.pramaWindow = 8 } },
      { cost: 7, desc: 'Порог прамы ниже: 8 → 5.', apply: (o) => { o.pramaWindow = 5 } },
      { cost: 9, desc: 'Порог прамы совсем низкий: 5 → 3.', apply: (o) => { o.pramaWindow = 3 } },
    ],
  },
  {
    id: 'yama_asteya',
    name: 'Яма · Астея',
    quoteId: 'asteya',
    cost: 4,
    desc: 'Монет с комнаты больше: ×1.25.',
    why: 'не присваивать чужое — даже если можешь',
    apply: (o) => { o.coinMul = Math.round((o.coinMul || 1) * 1.25 * 100) / 100 },
    ranks: [
      { cost: 4, desc: 'Монет с комнаты больше: ×1.25.', apply: (o) => { o.coinMul = Math.round((o.coinMul || 1) * 1.25 * 100) / 100 } },
      { cost: 7, desc: 'Монет ещё больше: ×1.5 суммарно.', apply: (o) => { o.coinMul = Math.round((o.coinMul || 1) * 1.2 * 100) / 100 } },
      { cost: 9, desc: 'Монет заметно больше: ×1.6 суммарно.', apply: (o) => { o.coinMul = Math.round((o.coinMul || 1) * 1.25 * 100) / 100 } },
    ],
  },
  {
    id: 'niyama_santosa',
    name: 'Нияма · Сантоша',
    quoteId: 'santosa',
    cost: 5,
    desc: 'Освобождение оковы гасит неведение сильнее: 12 → 16.',
    why: 'довольство тем, что уже есть',
    apply: (o) => { o.avidyaCalmPacify = 16 },
    ranks: [
      { cost: 5, desc: 'Освобождение оковы гасит неведение сильнее: 12 → 16.', apply: (o) => { o.avidyaCalmPacify = 16 } },
      { cost: 8, desc: 'Гасит ещё сильнее: 16 → 20.', apply: (o) => { o.avidyaCalmPacify = 20 } },
      { cost: 9, desc: 'Освобождение гасит неведение сильнее всех: 20 → 26.', apply: (o) => { o.avidyaCalmPacify = 26 } },
    ],
  },
  {
    id: 'niyama_tapah',
    name: 'Нияма · Тапах',
    quoteId: 'tapah',
    cost: 5,
    desc: 'Рывок возвращается чаще: 0.85 → 0.72 с.',
    why: 'аскеза: терпеть трудность ровно столько, сколько нужно',
    apply: (o) => { o.dashCooldown = 0.72 },
    ranks: [
      { cost: 5, desc: 'Рывок возвращается чаще: 0.85 → 0.72 с.', apply: (o) => { o.dashCooldown = 0.72 } },
      { cost: 8, desc: 'Рывок ещё чаще: 0.72 → 0.60 с.', apply: (o) => { o.dashCooldown = 0.60 } },
      { cost: 9, desc: 'Рывок почти не ждёт: 0.60 → 0.50 с.', apply: (o) => { o.dashCooldown = 0.50 } },
    ],
  },
  {
    id: 'niyama_svadhyaya',
    name: 'Нияма · Свадхьяя',
    quoteId: 'svadhyaya',
    cost: 4,
    desc: 'Мантра обходится на 1 севу дешевле.',
    why: 'самоизучение: повторяя, понимаешь',
    apply: (o) => { o.mantraCostCut += 1 },
    ranks: [
      { cost: 4, desc: 'Мантра обходится на 1 севу дешевле.', apply: (o) => { o.mantraCostCut += 1 } },
      { cost: 7, desc: 'Мантра обходится ещё на 1 севу дешевле.', apply: (o) => { o.mantraCostCut += 1 } },
      { cost: 9, desc: 'Мантра обходится ещё на 1 севу дешевле.', apply: (o) => { o.mantraCostCut += 1 } },
    ],
  },
  {
    id: 'niyama_ishvara_pranidhana',
    name: 'Нияма · Ишвара-пранидхана',
    quoteId: 'ishvara_pranidhana',
    cost: 6,
    desc: 'Любая сева даёт 1 щит.',
    why: 'посвящение: отдавание идёт через тебя, а не мимо',
    apply: (o) => { o.sevaShield += 1 },
    ranks: [
      { cost: 6, desc: 'Любая сева даёт 1 щит.', apply: (o) => { o.sevaShield += 1 } },
      { cost: 9, desc: 'Любая сева даёт 2 щита.', apply: (o) => { o.sevaShield += 1 } },
      { cost: 10, desc: 'Каждая сева прикрывает на 3 щита.', apply: (o) => { o.sevaShield += 1 } },
    ],
  },
]

/** Сколько рангов у усиления (минимум один — ради старых сохранений). */
export function maxRank(id) {
  return WORKSHOP.find((u) => u.id === id)?.ranks?.length || 1
}

/**
 * Сколько ДРУГИХ усилений надо иметь, чтобы открыть этот ранг.
 *
 * `needs` считается по числу купленных РАНГОВ, а не усилений: игрок, купивший
 * два первых ранга одного усиления, купил одно усиление, и открывать ему
 * второй ранг другого рано. Иначе предпосылка обходится одной покупкой.
 */
export function needsOwned(id, rank) {
  if (rank <= 1) return 0
  const u = WORKSHOP.find((w) => w.id === id)
  const step = u && u.ranks ? u.ranks[rank - 1] : null
  const base = rank === 2 ? 2 : 4
  return typeof step?.needs === 'number' ? step.needs : base
}

/**
 * Сколько рангов куплено всего по профилю.
 *
 * Считается ВЫСШИЙ ранг по каждому усилению, а не по сумме ключей.
 * Первая версия сложила одну и то же три: `['a', 'a#2']` — это
 * ДВА ранга, а не три. Слузит суммой строки: усиление было бы куплено
 * выгодатно, а предпосылка для всего слободилась бы вовсе.
 *
 * Мусор в профиле не считается: неизвестные id и ранги выше максимума
 * пропускаются и достижени не дают ни одного лишнего.
 */
export function ownedCount(owned = []) {
  const best = new Map()
  for (const key of owned || []) {
    const p = parseRankKey(key)
    if (!WORKSHOP.some((w) => w.id === p.id)) continue
    const cap = maxRank(p.id)
    if (p.rank > cap) continue                 // мусор: ранга больше всех
    if (p.rank > (best.get(p.id) || 0)) best.set(p.id, p.rank)
  }
  let n = 0
  for (const r of best.values()) n += r
  return n
}

/** Ключ ранга в профиле. Ранг 1 лежит голым `id` — так было раньше. */
export function rankKey(id, rank) {
  return rank <= 1 ? id : `${id}#${rank}`
}

/** Разбирает ключ ранга обратно в `{ id, rank }`. */
export function parseRankKey(key) {
  const s = String(key || '')
  const hash = s.lastIndexOf('#')
  if (hash < 0) return { id: s, rank: 1 }
  const rank = Number(s.slice(hash + 1))
  return { id: s.slice(0, hash), rank: Number.isFinite(rank) && rank > 0 ? rank : 1 }
}

/** Купленный ранг усиления: 0 — не куплено ничего. */
export function ownedRank(id, owned = []) {
  let best = 0
  for (const key of owned) {
    const p = parseRankKey(key)
    if (p.id === id && p.rank > best) best = p.rank
  }
  return best
}

/** Цена РАНГА (не усиления). Ранга выше последнего не существует. */
export function workshopCost(id, rank = 1) {
  const u = WORKSHOP.find((w) => w.id === id)
  if (!u) return 0
  const r = u.ranks?.[rank - 1]
  if (!r) return 0
  return r.cost
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
 * Применить все купленные усиления к набору опций боя.
 * `owned` — массив ключей из профила (ранг 1 — голый `id`). Возвращает новый
 * объект (не мутирует входной).
 *
 * Ранги применяются по порядку 1 → 2 → 3 внутри одного усиления: второй
 * ранг может опираться на первый. Порядок между разными усилениями не важен,
 * потому что они трогают разные слоты, но для честности он не случаен —
 * список объявлен в `WORKSHOP`.
 */
export function applyUpgrades(opts, owned = []) {
  // Последний в цепочке варна → нефрит → дары → мастерская. Считает от
  // полных значений и страхуется от NaN — см. applyBoons.
  const o = { ...DEFAULT_FIELD_OPTIONS, ...opts }
  for (const u of WORKSHOP) {
    const have = ownedRank(u.id, owned)
    if (have <= 0) continue
    for (let r = 1; r <= have; r++) {
      const step = u.ranks?.[r - 1]
      if (typeof step?.apply === 'function') step.apply(o)
    }
  }
  for (const key of Object.keys(o)) if (typeof o[key] === 'number' && !Number.isFinite(o[key])) o[key] = DEFAULT_FIELD_OPTIONS[key]
  return o
}

/**
 * Можно ли купить РАНГ. `rank` по умолчанию — следующий непокупленный.
 *
 * Проверяется три вещи: ранг существует, предыдущий куплен, хватает очков.
 * Порядок важен: без проверки предыдущего ранга игрок купил бы второй ранг
 * «Крипа» и тихо потерял бы деньги.
 */
export function canBuy(id, points, owned = [], rank = null) {
  const u = WORKSHOP.find((w) => w.id === id)
  if (!u) return false
  const have = ownedRank(id, owned)
  const want = rank == null ? have + 1 : rank
  if (want < 1 || want > maxRank(id)) return false
  // Первый ранг — всегда. Второй и третий — только после предыдущего.
  if (want > 1 && have < want - 1) return false
  // И только когда в мастерской есть другие купленные усиления.
  // Без этого покупка идёт «все первые, потом все вторые», и выбора
  // порядка не существует вовсе.
  if (ownedCount(owned) < needsOwned(id, want)) return false
  return points >= workshopCost(id, want)
}