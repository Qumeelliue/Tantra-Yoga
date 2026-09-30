// Сборка локации «Поле Ума» из контента: враги берутся из enemies.json,
// места и просящие — из worlds.json. Ничего не выдумывается: только
// подлинные термины и их характеры.

import { ENEMIES, QUOTES, worldForFloor } from './data.js'

/**
 * Характер оковы → как она ведёт себя в локации.
 * Источники характеров — те же, что и в карточном бою (§9, §9.5):
 *   • 6 рипу присущ уму, их СДЕРЖИВАЮТ (Elementary Philosophy, гл. 6);
 *   • 8 паш порождены внешним миром, их ПРЕОДОЛЕВАЮТ (Prout 12/2).
 * Поэтому рипу: быстрые, настойчивые, сбивают дыхание, но не ранят.
 * Паши: имеют плотность (ХП), бьют больнее, но берутся терпением.
 */
const RIPU_BEHAVIOR = {
  krodha: { speedMul: 1.35, reach: 44, calCard: 'ahimsa', note: 'гнев: быстр и слеп' },
  lobha: { speedMul: 0.8, reach: 40, calCard: 'aparigraha', note: 'жадность: копит и не отступает' },
  kama: { speedMul: 1.1, reach: 42, calCard: 'brahmacarya', note: 'влечение: тянет к себе' },
  mada: { speedMul: 0.9, reach: 40, calCard: 'santosa', note: 'гордость: стоит и смотрит' },
  matsarya: { speedMul: 1.0, reach: 41, calCard: 'satya', note: 'зависть: ворует силы' },
  // Шесть внутренних по источнику: кама, кродха, лобха, моха, мада, матсарья.
  // Нидра (сон) — не рипу; в локации идёт как «маятник», усыпляет.
  nidra: { speedMul: 0.7, reach: 38, calCard: 'tapah', note: 'сон: замедляет и усыпляет' },
}

const PASHA_BEHAVIOR = {
  bhaya_pasha: { speedMul: 0.85, calCard: 'tapah', note: 'страх: наводит ужас' },
  lajja: { speedMul: 0.8, calCard: 'seva', note: 'стыд: прячет и отнимает' },
  ghrna: { speedMul: 0.9, calCard: 'ahimsa', note: 'ненависть: жжёт' },
  samshaya_pasha: { speedMul: 0.85, calCard: 'svadhyaya', note: 'сомнение: подрывает' },
  kula: { speedMul: 0.75, calCard: 'aparigraha', note: 'родовитость: щит и выпад' },
  sila: { speedMul: 0.8, calCard: 'satsaunga', note: 'холодность: стена' },
  mana_pasha: { speedMul: 0.9, calCard: 'santosa', note: 'тщеславие: блеф' },
  jugupsa: { speedMul: 1.0, calCard: 'satya', note: 'злословие: шепчет' },
}

// Аура: у части оков вивека (различение) обманывается авидьёй. Правдивую
// ауру надо читать самому; поддельную проверяет удар (Into the Breach).
const AURA_TABLE = {
  krodha: 'light', lobha: 'light', kama: 'dark', mada: 'dark',
  matsarya: 'dark', nidra: 'dark',
  bhaya_pasha: 'dark', lajja: 'dark', ghrna: 'light', samshaya_pasha: 'light',
  kula: 'light', sila: 'dark', mana_pasha: 'light', jugupsa: 'dark',
}
// У Моха идёт подделка: светится белым, но на деле — авидья. Так учится
// различение: свет не значит истину.
const FAKE_AURA = { moha: 'light' }

// ── Размещение по чакре ──
// Позиции в координатах поля field.js (412×600 по умолчанию), нормированы 0..1,
// чтобы работало на любом экране.
function place(i, n, slots) {
  const s = slots[i % slots.length]
  return s
}

// Раскладки комнат. В Hades каждая комната этажа выглядит по-своему, и их
// несколько подряд, а не одна. Здесь четыре раскладки, чередуются.
const RINGS = [
  [[0.72, 0.40], [0.28, 0.34], [0.50, 0.62], [0.22, 0.58], [0.78, 0.60], [0.50, 0.30], [0.36, 0.46], [0.64, 0.70]],
  [[0.30, 0.62], [0.70, 0.62], [0.50, 0.30], [0.20, 0.34], [0.80, 0.34], [0.50, 0.78], [0.34, 0.44], [0.66, 0.44]],
  [[0.24, 0.30], [0.76, 0.30], [0.24, 0.72], [0.76, 0.72], [0.50, 0.50], [0.40, 0.26], [0.60, 0.26], [0.50, 0.80]],
  [[0.50, 0.26], [0.34, 0.50], [0.66, 0.50], [0.50, 0.74], [0.22, 0.38], [0.78, 0.38], [0.28, 0.66], [0.72, 0.66]],
]

const RING = RINGS[0]

/**
 * Собирает поле для этажа (чакры). Владыка — отдельно, в центре.
 */
/**
 * Насколько к крепким окам ты приходишь в этой чакре. В Hades сложность
 * растёт не числом врагов, а их крепостью: в первом зале они сбиваются с
 * одного удара, в последнем — держат удар. Здесь то же: запас спокойствия
 * растёт от 1.5 у первой чакры до 2.25 у седьмой.
 *
 * Число оков и так растёт (9 → 15 за этап), но без этого роста забег
 * выравнивался: седьмая чакра отличалась от первой только числом мишеней.
 */
export function calmMulFor(floor) {
  return 1.5 + Math.min(0.75, Math.floor(floor / 2) * 0.25)
}

export function buildFieldFloor(
  floor,
  { field = { w: 412, h: 600 }, includeBoss = true, room = 0, opts = {}, rng = Math.random } = {},
) {
  const world = worldForFloor(floor)
  // Раскладка комнаты — тоже розыгрыш (Hades: комната не повторяет вид от
  // побега к побегу). Раньше бралась по номеру комнаты, и десятый забег
  // выглядел как первый до буквы.
  const ring = RINGS[Math.floor(rng() * RINGS.length) % RINGS.length]
  const foes = []
  let i = 0

  // Ранние чакры — рипу (внутренние), поздние — паши (внешние), как в SPEC §9.5.
  const ripuPool = ['krodha', 'lobha', 'kama', 'mada', 'matsarya', 'nidra']
  const pashaPool = ['bhaya_pasha', 'lajja', 'ghrna', 'samshaya_pasha', 'kula', 'sila', 'mana_pasha', 'jugupsa']
  const usePasha = floor >= 3

  // оков в комнате: их больше с каждой комнатой этапа и с глубиной чакры
  const count = 2 + Math.min(3, room) + Math.min(2, Math.floor(floor / 2))

  // Состав комнаты — розыгрыш из пула чакры, без повторов внутри комнаты.
  //
  // Раньше id брались по индексу `(floor * 2 + k)`: комната была предсказуемой
  // до последнего ока, и два забега подряд были одинаковыми. Второй забег
  // должен отличаться от первого — иначе «ещё раз» не работает (Hades).
  //
  // Тасуем пул и берём сверху: повторов не бывает по определению. Раньше
  // здесь был «розыгрыш с попытками», и когда в комнате оставалась одна
  // свободная ока из шести, он промахивался и ставил дубль.
  const pool = (usePasha ? pashaPool : ripuPool).slice()
  for (let s = pool.length - 1; s > 0; s--) {
    const j = Math.floor(rng() * (s + 1)) % (s + 1)
    const tmp = pool[s]; pool[s] = pool[j]; pool[j] = tmp
  }
  const picked = []
  for (let k = 0; k < count; k++) picked.push(pool[k % pool.length])

  for (let k = 0; k < count; k++) {
    const id = picked[k]
    const def = ENEMIES[id]
    if (!def) continue
    const beh = usePasha ? PASHA_BEHAVIOR[id] : RIPU_BEHAVIOR[id]
    const [rx, ry] = place(i++, count + 1, ring)
    foes.push({
      id: def.id,
      name: def.name,
      epithet: def.epithet || '',
      kind: usePasha ? 'pasha' : 'ripu',
      x: field.w * rx,
      y: field.h * ry,
      hp: def.maxHp,
      calmMax: Math.round((def.calmMax || 3) * (opts.calmMul ?? calmMulFor(floor))),
      light: AURA_TABLE[id] || 'dark',
      fakeLight: FAKE_AURA[id] || null,
      speedMul: beh?.speedMul || 1,
      reach: beh?.reach || 42,
      note: beh?.note || '',
      quoteId: def.quoteId,
    })
  }

  // Владыка чакры — в центре. Приёмы, намерения и порог 50% берутся
  // из `content/enemies.json` дословно: ничего не выдумывается.
  let boss = null
  if (includeBoss && world && world.lordId && ENEMIES[world.lordId]) {
    const d = ENEMIES[world.lordId]
    boss = {
      id: d.id,
      name: d.name,
      epithet: d.epithet || '',
      kind: 'pasha',
      x: field.w / 2,
      y: field.h * 0.44,
      hp: Math.round(d.maxHp * 0.5),
      calmMax: Math.round((d.calmMax || 3) * calmMulFor(floor)),
      light: AURA_TABLE[d.id] || 'dark',
      fakeLight: null,
      speedMul: 0.8,
      reach: 48,
      isBoss: true,
      note: 'владыка чакры',
      quoteId: d.quoteId,
      moves: Array.isArray(d.moves) ? d.moves : null,
      onThreshold: d.onThreshold || null,
    }
  }

  // Просящие — сева. Тексты из lорa мира, но подача здесь простая.
  // Случай идёт ЧЕРЕЗ переданный rng, а не через Math.random напрямую:
  // иначе комнату нельзя воспроизвести — симулятор и тесты получают разное
  // при одном и том же забеге, и проверять тут нечего.
  const allWares = [
    { id: `w${floor}-a`, x: field.w * 0.14, y: field.h * 0.22, name: 'у колодца',
      call: 'Колодец пуст… помоги', need: 'вода', debt: false },
    { id: `w${floor}-b`, x: field.w * 0.86, y: field.h * 0.74, name: 'у стены',
      call: 'Я не могу идти', need: 'опора', debt: rng() < 0.3 },
  ]
  const wares = rng() > 0.35 ? allWares : allWares.slice(0, 1)

  return { world, floor, room, foes, boss, wares, field, look: worldLook(floor) }
}

/**
 * Внешний вид локации. Стихии — из `content/worlds.json` (`element`),
 * ничего не выдумано: «Земля · terranean», «Вода · fluidal», «Огонь ·
 * igneous», «Воздух · vāyu», «Эфир · ākāśa», «Ум · manas», «Сознание».
 * Цвета земли и силуэты подобраны под каждый элемент.
 */
export const WORLD_LOOKS = {
  0: { ground: [58, 42, 32], ground2: [40, 28, 22], accent: [214, 140, 74], motif: 'roots',
       prop: 'tree', sky: [26, 17, 14] },
  1: { ground: [28, 58, 66], ground2: [16, 40, 48], accent: [110, 220, 230], motif: 'water',
       prop: 'reeds', sky: [10, 28, 36] },
  2: { ground: [66, 26, 20], ground2: [38, 14, 12], accent: [255, 132, 52], motif: 'embers',
       prop: 'spire', sky: [30, 10, 8] },
  3: { ground: [42, 58, 50], ground2: [26, 38, 34], accent: [176, 232, 190], motif: 'wind',
       prop: 'column', sky: [16, 26, 24] },
  4: { ground: [40, 30, 68], ground2: [24, 18, 44], accent: [176, 148, 255], motif: 'sound',
       prop: 'arch', sky: [14, 10, 30] },
  5: { ground: [30, 42, 58], ground2: [18, 26, 38], accent: [186, 216, 255], motif: 'stars',
       prop: 'obelisk', sky: [8, 12, 22] },
  6: { ground: [66, 58, 44], ground2: [44, 38, 28], accent: [255, 232, 170], motif: 'petals',
       prop: 'crown', sky: [26, 22, 16] },
}

export function worldLook(floor) {
  return WORLD_LOOKS[floor] || WORLD_LOOKS[0]
}

/** Описание этажа для заголовка экрана. */
export function fieldTitle(floor) {
  return worldForFloor(floor).land || 'Поле Ума'
}

/** Имя, стихия и владыка этажа — для шапки локации. */
export function fieldHead(floor) {
  const w = worldForFloor(floor)
  return { name: w.name, chakra: w.chakra, element: w.element, elementIcon: w.elementIcon, land: w.land }
}
