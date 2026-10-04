// Сборка локации «Поле Ума» из контента: враги берутся из enemies.json,
// места и просящие — из worlds.json. Ничего не выдумывается: только
// подлинные термины и их характеры.

import { ENEMIES, QUOTES, worldForFloor } from './data.js'
import { lordFor, stageHasLord } from './lords.js'

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
  // Троны чакры (МЕХАНИКА 58): аура владыки — та же, что у его оковы в
  // комнатах. Читается так же: у части вивека обманывается авидьёй, и
  // правдивую метку надо подтвердить ударом.
  lord_nidra: 'dark', lord_kula_kundalini: 'dark',
  lord_bhaya: 'dark', lord_ghrna: 'light',
  lord_samshaya: 'light', lord_jugupsa: 'dark',
  lord_mana: 'light', lord_lajja: 'dark',
  lord_shila: 'dark', lord_kula: 'light',
  lord_sankalpa: 'dark', lord_vikalpa: 'dark',
  lord_karta: 'dark', lord_sanchara: 'dark',
}
// У Моха идёт подделка: светится белым, но на деле — авидья. Так учится
// различение: свет не значит истину.
const FAKE_AURA = { moha: 'light' }

// ── Размещение по чакре ──
// Позиции в координатах поля field.js, нормированы 0..1, чтобы работало на
// любом экране.
//
// Раньше арена была 412×600 — то есть целиком помещалась на экране телефона.
// Автор посмотрел на игру и сказал: «текстура, которая ходит по клеточкам в
// рамках одного экрана». Он был прав: когда видно всю комнату целиком, она не
// ощущается местом, а ощущается схемой. Теперь арена 780×1120 — почти вдвое
// больше экрана, и по ней ходит камера (`camX/camY` в экране боя).
//
// Оговорка честная: это не только картинка. Расстояния между садхакой и оками
// выросли, а значит выросло время на сближение — то есть меняется сложность.
// Поэтому после смены размера проходимость перемерена на 240 забегах, а не
// объявлена «на глаз» (см. `design/BASE-GAME.md`, НАХОДКА СЕССИИ 28 (6)).
function place(i, n, slots) {
  const s = slots[i % slots.length]
  return s
}

// Раскладки комнат. В Hades каждая комната этажа выглядит по-своему, и их
// несколько подряд, а не одна. Здесь четыре раскладки, чередуются.
// Оковы стоят в средней полосе арены, а не во всю её высоту.
//
// Раскладка задана долями: 0 — верх арены, 1 — низ. При арене 780×1120 и
// камере 420×640 ока на 0.26 и садхака в 0.5 расходятся больше чем на пол-экрана,
// то есть в начале боя оки просто не видно. Полоса 0.30–0.70 держит весь бой в
// кадре, а крайние четверти остаются местом для отступления и загона.
//
// Проверка на это — не «на глаз», а `tests/fieldCamera.test.js`: при первом
// кадре все оки обязаны быть видны.
const RINGS = [
  [[0.70, 0.44], [0.30, 0.38], [0.50, 0.62], [0.34, 0.56], [0.66, 0.58], [0.50, 0.34], [0.38, 0.48], [0.62, 0.66]],
  [[0.32, 0.60], [0.68, 0.60], [0.50, 0.36], [0.34, 0.40], [0.66, 0.40], [0.50, 0.68], [0.36, 0.48], [0.64, 0.48]],
  [[0.34, 0.38], [0.66, 0.38], [0.34, 0.64], [0.66, 0.64], [0.50, 0.50], [0.42, 0.34], [0.58, 0.34], [0.50, 0.66]],
  [[0.50, 0.34], [0.38, 0.50], [0.62, 0.50], [0.50, 0.66], [0.34, 0.42], [0.66, 0.42], [0.32, 0.60], [0.68, 0.60]],
]

const RING = RINGS[0]

/**
 * Размер арены Поля Ума.
 *
 * Вынесен отдельно и импортируется симулятором. Раньше размер был написан
 * в трёх местах — здесь как значение по умолчанию и дважды в
 * `scripts/fieldBalance.mjs` — и симулятор с игрой разошлись молча: правка
 * арены не изменила ни одного числа замера, а выглядело так, будто сложность
 * не тронута. Прошлое значение было 412×600, то есть комната целиком влезала
 * на экран телефона.
 *
 * Теперь 780×1120 — почти вдвое больше экрана, по арене ходит камера.
 */
/**
 * Размер арены Поля Ума = ровно изометрическая комната.
 *
 * Число одно и проверяется: `tests/roomSize.test.js` требует, чтобы размер
 * арены совпадал с комнатой из `ui/iso.js`. Раньше число жило в трёх местах, и
 * когда рисунок стал ромбом, арена осталась прямоугольной — оки уходили за
 * край ромба, а камера показывала пустоту.
 *
 * Прежние значения и почему они больше не подходят: 412×600 (комната целиком в
 * экране — автор: «текстура ходит по клеточкам в рамках одного экрана»), 620×900
 * (камера ездит; замер: победы 63 %), 780×1120 (победы 57 %). Измерено: чем
 * больше арена, тем труднее. 896×896 — это 14×14 плиток, ромб 896×448, и весь
 * бой помещается в кадр по ширине.
 */
export const DEFAULT_FIELD_SIZE = { w: 896, h: 896 }

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

/**
 * Множитель крепости ВЛАДЫКИ — измерительный, а не игровой.
 *
 * Зачем он в коде игры, если игра его не читает. Замерено: смертей в комнате
 * владыки **2 из 512** дошедших, в обычных комнатах **19 из 1579**. То есть трон,
 * который игра называет кульминацией (выбор владыки, имя на двери, трон открывает
 * чакру), втрое БЕЗОПАСНЕЕ обычной комнаты.
 *
 * Это не жалоба на числа, а недостающий инструмент: пока нечем задать вопрос
 * «насколько крепким должен быть трон», обсуждать его приходится голословно.
 * Значение по умолчанию — 1, то есть игра не меняется ни на единицу.
 *
 * Источник: `setLordCalmMul()` — его вызывает замер (`--lord-mul`), и больше
 * никто. Проверка `tests/lordDanger.test.js` требует, чтобы вне замера это
 * значение оставалось единицей.
 */
let LORD_CALM_MUL = 1
export function setLordCalmMul(v) {
  const n = Number(v)
  LORD_CALM_MUL = Number.isFinite(n) && n > 0 ? n : 1
  return LORD_CALM_MUL
}
export function lordCalmMul() { return LORD_CALM_MUL }

/**
 * Есть ли у этапа владыка.
 *
 * Отдельная функция, потому что «есть ли владыка у ЭТАПА» и «есть ли владыка в
 * СОБРАННОЙ КОМНАТЕ» — разные вопросы. В испытании силы владыки в комнате нет,
 * и код, бравший ответ из собранной комнаты, при выборе двери «испытание» на
 * последней комнате этапа **пропускал владыку целиком**. Забег становился
 * короче на одного босса, и игрок этого не видел.
 *
 * С 2026-09-30 у этапа не один владыка, а три трона на выбор (МЕХАНИКА 58),
 * поэтому ответ берётся из пула чакры, а не из одного `lordId`.
 */
export function stageHasBoss(floor) {
  return stageHasLord(floor)
}

export function buildFieldFloor(
  floor,
  { field = DEFAULT_FIELD_SIZE, includeBoss = true, room = 0, opts = {}, rng = Math.random, elite = false, lordId = null } = {},
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

  let boss = null

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

  // Владыка чакры — в центре. Кто именно — выбирает игрок на троне (МЕХАНИКА
  // 58); `lordFor` сверяет выбор с пулом чакры и не пускает чужого владыку.
  // Приёмы, намерения и порог 50% берутся из `content/enemies.json` дословно:
  // ничего не выдумывается.
  boss = null
  const chosenLord = includeBoss ? lordFor(floor, lordId) : null
  if (includeBoss && chosenLord && ENEMIES[chosenLord]) {
    const d = ENEMIES[chosenLord]
    boss = {
      id: d.id,
      name: d.name,
      epithet: d.epithet || '',
      kind: 'pasha',
      x: field.w / 2,
      y: field.h * 0.44,
      hp: Math.round(d.maxHp * 0.5),
      calmMax: Math.round((d.calmMax || 3) * calmMulFor(floor) * lordCalmMul()),
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

  // ── ИСПЫТАНИЕ СИЛЫ (StS: elite; Hades: Challenge) ──────────────────
  // Обычная комната ПЛЮС чемпион: та же ока из пула чакры, но вдвое живучей и
  // вдвое злее. Копия элитного боя — игрок САМ выбирает его дверью, и плата за
  // него — нефрит на забег (см. `doors.js` и `main.js`).
  //
  // Обычные оковы при этом остаются. Первая версия делала наоборот (испытание
  // ВМЕСТО комнаты, один чемпион вместо двоих-четырёх), и замер показал, что
  // так ЛЕГЧЕ: 95 % побед против 80 % у обычных комнат при одинаковой
  // рассеянности. То есть чемпион был не сложнее комнаты. Слово «элита» без
  // измерения — это подпись, а не механика.
  //
  // Точка отсчёта — та же ока из пула, поэтому испытание остаётся узнаваемым:
  // игрок видит, КТО его бьёт, и узнаёт этого врага.
  if (elite) {
    const poolE = (usePasha ? pashaPool : ripuPool).slice()
    for (let k = poolE.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1)) % (k + 1)
      const tmp = poolE[k]; poolE[k] = poolE[j]; poolE[j] = tmp
    }
    const pickE = poolE[0]
    const defE = ENEMIES[pickE]
    if (defE) {
      const behE = usePasha ? PASHA_BEHAVIOR[pickE] : RIPU_BEHAVIOR[pickE]
      foes.push({
        id: defE.id,
        name: defE.name,
        epithet: defE.epithet || '',
        kind: usePasha ? 'pasha' : 'ripu',
        x: field.w * 0.5,
        y: field.h * 0.22,
        hp: Math.round(defE.maxHp * 1.6),
        calmMax: Math.round((defE.calmMax || 3) * (opts.calmMul ?? calmMulFor(floor)) * 2),
        light: AURA_TABLE[pickE] || 'dark',
        fakeLight: FAKE_AURA[pickE] || null,
        speedMul: (behE?.speedMul || 1) * 1.15,
        reach: behE?.reach || 42,
        note: 'испытание силы',
        quoteId: defE.quoteId,
        isElite: true,
      })
    }
  }

  // ── СОКРОВИЩЕ (Dead Cells: containers; Hades: горшки) ─────────────────
  // Ломаемый объект в комнате: тапнул — разбился, из него амбросия. Стоит
  // в углу, чтобы свернуть с боя и рискнуть: за лёгкие деньги растёт самшара.
  //
  // Почему не дверь: дверь — это выбор «бой или не бой», а горшок — то, что
  // лежит по пути и ради чего стоит свернуть. Одно на другое навешивать нельзя
  // (МЕХАНИКА 47: дверь, которая врёт о содержимом, хуже, чем её нет).
  //
  // Один горшок на комнату и СУНДУК в последней — сундук даёт очки севы в
  // мастерскую, то есть вещь МЕЖДУ забегами. Монеты живут тоже между
  // забегами, но сундук — единственный источник севы в Поле Ума, поэтому
  // решение «ломать или не ломать» стоит там, где оно что-то значит.
  const pots = []
  {
    // Добыча 2–4. Первая версия дала 8–14, и замер показал: горшки стали
    // 80 % всего золота (20.6 против 3.8 за комнату), а полный набор рангов
    // нефритов падал с 59 забегов до 11. В Dead Cells контейнеры —
    // ДОПОЛНЕНИЕ к добыче с врагов, а не её замена. 2–4 дают ~7 за комнату
    // вместо 3.8: вдвое быстрее, но фонтан не превращается в копилку.
    const potCoins = () => 2 + Math.floor(rng() * 3)
    const px = field.w * (0.30 + rng() * 0.10)
    const py = field.h * (0.72 + rng() * 0.12)
    pots.push({
      id: `p${floor}-${room}-a`, x: px, y: py, kind: 'pot', hp: 2, maxHp: 2,
      name: 'горшок', coins: potCoins(), broken: false,
    })
    // Второй — не всегда: пустая комната не должна выглядеть обворованной.
    if (rng() < 0.55) {
      pots.push({
        id: `p${floor}-${room}-b`, x: field.w * (0.60 + rng() * 0.10), y: field.h * (0.30 + rng() * 0.10),
        kind: 'pot', hp: 2, maxHp: 2, name: 'горшок', coins: potCoins(), broken: false,
      })
    }
    // Сундук — в ПОСЛЕДНЕЙ комнате этапа, у двери владыки. Ровно один за
    // этап: иначе сундук перестаёт быть решением и становится фоном.
    if (room === 2) {
      pots.push({
        id: `chest${floor}`, x: field.w * 0.20, y: field.h * 0.14, kind: 'chest',
        hp: 3, maxHp: 3, name: 'сундук', chest: true, coins: 0, broken: false,
      })
    }
  }

  const allWares = [
    { id: `w${floor}-a`, x: field.w * 0.14, y: field.h * 0.22, name: 'у колодца',
      call: 'Колодец пуст… помоги', need: 'вода', debt: false },
    { id: `w${floor}-b`, x: field.w * 0.86, y: field.h * 0.74, name: 'у стены',
      call: 'Я не могу идти', need: 'опора', debt: rng() < 0.3 },
  ]
  const wares = rng() > 0.35 ? allWares : allWares.slice(0, 1)

  return { world, floor, room, foes, boss, wares, pots, field, look: worldLook(floor) }
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
