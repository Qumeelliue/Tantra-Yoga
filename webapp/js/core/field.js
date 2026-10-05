// ═══════════════════════════════════════════════════════════════════════════
//  Поле Ума — бой в локации (изометрия, Hades-структура)
//
//  Ключевое отличие от карточного боя: окову НЕЛЬЗЯ убить. Её можно
//  только успокоить — стоять рядом и дышать. Сила не работает на рипу
//  (Elementary Philosophy, гл. 6: рипу присущ уму, его надо сдерживать).
//
//  Силы игрока — три вида (Subháśita Saḿgraha 9: «In the human being there
//  are three kinds of energy: physical, psychic, and spiritual»):
//    • психическая  — от дыхания, быстро, низкий потолок, в самадхи не пускает
//    • духовная     — только от севы/мантр/успокоения, медленно, открывает самадхи
//    • физическая   — удары (бесполезны против рипу, полезны против паш)
//
//  Чистая логика без DOM — тестируется через Vitest.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Гуны на старте забега (саттва/раджас/тамас).
 *
 * Раньше стояли прямо в теле `createField` как `guna: { s: 4, r: 2, t: 3 }`.
 * Из-за этого перекос нельзя было задать извне — и первая ступень «жара»
 * (сдвиг раджаса, `core/heat.js`) стала бы мёртвой величиной: меняла бы
 * опцию, которую бой не читает. `npm run audit:impact` такие величины ловит.
 * Значение то же, поэтому при «жар 0» игра не меняется ни на единицу.
 */
export const DEFAULT_GUNA_START = { s: 4, r: 2, t: 3 }

export const DEFAULT_FIELD_OPTIONS = {
  playerHp: 60,
  walkSpeed: 132,        // пикселей в секунду
  dashSpeed: 430,
  dashTime: 0.16,        // сек
  dashCooldown: 0.85,
  calmRadius: 62,        // радиус, с которого начинается успокоение
  calmPerSec: 0.42,      // скорость накопления спокойствия
  calmDecayEnemy: 0.22,  // владыка сам снимает спокойствие
  calmDecayIdle: 0.30,   // оковы теряют спокойствие, если ты отошёл
  enemySpeed: 46,
  enemyTelegraph: 0.75,  // сек замах перед атакой
  enemyReach: 40,
  enemyCooldown: 0.95,   // сек пауза между замахами. В Hades враги давят
                          // непрерывно: очередь подходит, замахивается,
                          // отходит и снова бьёт. Было 1.1 с — между
                          // ударами ока успевала «отдохнуть», и натиска
                          // не было.
  // ── ДЕФЛЕКТ (Nine Sols) ────────────────────────────────────────────────
  // Ядро боя скопировано с Nine Sols: ока замахивается (сжимается кольцо),
  // игрок жмёт дефлект в последние parryWindow секунд — сила возвращается
  // в оку, тот оглушается и теряет цикл. Промах — серия сбрасывается.
  parryWindow: 0.20,     // окно парирования, сек (~12 кадров @60fps)
  attackWindow: 0.16,    // активное окно удара: в нём дефлект ещё ОТМЕНЯЕТ удар
                          // (Sekiro). Поэтому попадание глушит звук удара.
  parryRadius: 66,       // до кого можно вернуть удар
  deflectCalm: 0.85,     // сколько спокойствия даёт один дефлект
  deflectQi: 3,          // Ци за дефлект (Nine Sols: deflect → qi)
  deflectComboQi: 1,     // +Ци за каждое звено серии
  comboWindow: 3.2,      // сек на удержание серии
  stunTime: 1.4,         // оглушение после возвращённого удара
  // ── ВЛАДЫКА (Slay the Spire — intents + фазы; Hades — порог 50%) ──────
  // Владыка не «толстый рипу»: у него цикл приёмов из enemies.json,
  // каждый с объявленным намерением, и порог на 50% (onThreshold).
  // В Hades у босса втрое больше ЗДОРОВЬЯ, чем у обычного врага, потому что
  // у игрока есть быстрый меч. У нас единственный источник силы — возврат
  // удара, а он ограничен темпом приёмов босса. При тройном запасе босс
  // физически не снимается: нужно ~11 дефлектов, а за это время успевает
  // прилететь семь ударов. Поэтому тройной коэффициент нечестен — снижаем,
  // и это единственная честная поправка к балансу.
  bossCalmScale: 2,      // у владыки вдвое больше запаса, чем у обычной оковы
  // Запас спокойствия обычной оковы в Поле Ума. Карточный путь использует
  // calmMax из контента напрямую, поэтому его не трогаем: поднятие там 2 → 3
  // уронило число мирных финалов с 20 до 15.
  // Здесь дефлект снимает 0.85 — при запасе 2 окову снимали ТРИ возврата
  // удара, и бой щёлкал за десять секунд. При запасе 3 нужны четыре, и
  // комната длится столько, сколько должна.
  //
  // Раньше здесь стояло `foeCalmMul: 1.5`, и это была МЁРТВАЯ величина: поле
  // её не читало (рост спокойствия по чакрам делает `calmMulFor(floor)` в
  // `fieldBuild.js`), а читала её только проверка сложности, которая
  // подставляла константу и тем самым ПЕРЕКРЫВАЛА рост по чакрам. Из-за
  // этого замер мерил игру, которой нет: седьмая чакра выходила легче, чем
  // в настоящей игре. Удалено 2026-09-30.
  //
  // Источник истины один: `calmMulFor(floor)` в `core/fieldBuild.js`.
  bossTelegraph: 0.62,   // базовый замах владыки (короче, чем у обычной оковы)
  bossTelegraphRage: 0.42, // замах в бешенстве (после порога 50%)
  bossCooldown: 0.72,    // пауза между приёмами
  bossSpeed: 34,         // владыка медленнее идущей оковы
  bossStrengthMax: 3,    // потолок «силы» владыки (Spire держит без потолка, но у него другой бой)
  bossBlockCalm: 0.45,   // во сколько стойкость гасит спокойствие (0 = не гасит)
  weakCalmPenalty: 0.2,  // «слабость» игрока: −20% спокойствия за стак
  // Ниже — слоты, которых не было, пока не появились реликвии. Все четыре
  // величины раньше были зашиты в коде и не настраивались, из-за чего под
  // реликвию некуда было подставить: реликвия должна менять ЧТО-ТО в бою, и
  // если число зашито — ей нечем.
  //
  // Слабость от перекоса тамаса: `weakPenaltyMul` множит штраф. «Туласи»
  // ослабляет перекос вдвое (0.5), «Камбала» снимает вовсе (0). Два разных
  // предмета на одну величину — как в Slay the Spire, где урон от слабости и
  // её длительность — разные ручки.
  weakPenaltyMul: 1,
  // Самадхи-подобная «сила от каждой снятой оковы». Раньше `guna.s += 2`
  // стояло в коде; теперь это величина, и её может поднять «Шанкха»
  // (снятая ока даёт саттву дополнительно).
  sattvaPerPacify: 2,
  // Перекос гун на старте забега: «Шива-лингам» +1 саттвы, «Каупиина» +2.
  gunaStartS: 0,
  // Вход в комнату: сколько жизни вернуть («Прана-дроп») и сколько щита дать
  // («Шоча-майнджуса»). Обе величины — на ВСЕ комнаты забега, а не на первый
  // бой, потому что в Поле Ума «бой» — это комната.
  roomStartHeal: 0,
  roomStartShield: 0,
  // Виден ли замах с самого начала комнаты, а не только вблизи
  // («Дхрувасмрити» — постоянная память). Это единственная реликвия, которая
  // даёт не силу, а знание: её ценность в том, что игрок заранее знает.
  telegraphPeek: 0,
  // Насколько оки входят в комнату спокойнее («Калачакра» — колесо времени).
  // Минус, потому что значение означает «меньше нужно дефлектов». Значение по
  // умолчанию 0 — то есть без реликвии комната собирается ровно как прежде.
  foeCalmBonus: 0,
  weakTurn: 4,           // стак «слабости» спадает раз в 4 секунды (ход Spire)
  weakMax: 3,            // больше трёх стаков не накопить (Spire: дебафф длится 3 хода)
  curseAvidya: 9,        // одна Чинта в уме = +9 авидьи
  // ── КРИПА (kṛpā): «зонт тщеславия» (AV 12) ──────────────────────────
  krpaHpRatio: 0.34,     // беда: жизнь упала ниже трети
  krpaAvidyaMax: 40,     // выше — ум уже в неведении, зонт поднят
  krpaCalm: 1.2,         // оковы отпускают столько
  krpaStun: 2.2,         // и перестают наступать на это время
  // ── ЩИТ (Slay the Spire — block) ───────────────────────────────────────
  // В Spire блок снимается в начале твоего хода: он живёт ровно один ход и
  // НЕ копится. У нас ходов нет, поэтому ход — это время, ровно как для
  // «слабости» (weakTurn). Без этого щит копился до потолка и стоял на
  // нём: замер показывал «сработал в 25 попаданий из 25, на потолке 25» —
  // то есть мантра заливала щит быстрее, чем ока его тратила, и ловить
  // окно дефлекта переставало быть обязательным.
  // Потолок щита. Было 12 — и это число оказалось ТУГИМ, а не продуманным.
  // Замерено на 80 забегах: при потолке 12 сева, потраченная впустую, составляет
  // **12 %** (244 из 2091) — игрок подошёл к просящему, отдал севу и не получил
  // ничего, потому что щит и так полон. Это ровно тот класс, что был с
  // сокровищем: за действие платишь, а пользы нет.
  //
  // Кривая потолка (80 забегов, всё остальное то же):
  //
  //   | потолок | побед | на потолке | сева впустую |
  //   |---------|-------|------------|--------------|
  //   | 12      | 74 %  | 591        | 12 %         |
  //   | 16      | 79 %  | 314        | 4 %          |
  //   | 24      | 79 %  | 98         | 3 %          |
  //
  // **16 — колено.** Оно забирает весь выигрыш и почти весь waste; дальше
  // (24) побед не добавляет, а щит просто тратится впустую.
  //
  // Победы здесь — победы бота, а бот парирует безупречно, то есть это не мера
  // сложности. Причина правки — 12 % непрофитной севы, а выигрыш по проходимости
  // побочный.
  shieldMax: 16,
  shieldTurn: 4,           // «ход Spire» для щита, секунды
  shieldDecay: 0,          // сколько щита спадает за ход (0 = весь)
  // Потолок Ци (психической силы). Поднимается усилением «Брахмачарья»
  // в мастерской севы — см. core/workshop.js.
  psychicMax: 12,
  // ── ДАРЫ ЧАКРЫ (Hades: 1 из 3 между локациями) ─────────────────────
  // Каждый дар меняет ОДНУ из этих величин. Новых механик не вводится.
  mantraCostCut: 0,       // цена мантры дешевле
  psychicStart: 6,        // Ци на входе в локацию
  shieldStart: 0,         // щит на входе
  strikeBonus: 0,         // +урона ударом по паше
  sevaShield: 0,          // сева даёт щит
  deflectAvidya: 1.5,     // сколько авидьи гасит дефлект
  auraVeilAt: 0.5,        // при какой авидье пелена закрывает ауру
  coins: 0,               // монеты в кошельке (живут между забегами, Hades: drachma)
  deaths: 0,              // смертей за все побеги — видны всегда (Hades)
  // ── ВЕС УДАРА (Hades: hitstop + shake + knockback) ──────────────────
  // Без этого дефлект «проходит» и ничего не чувствуется. В Hades и Nine
  // Sols возврат удара имеет вес: доля секунды мир замирает, картинку
  // подбрасывает, оку отбрасывает. Это читается как «попал», даже если
  // цифры урона не изменились.
  hitStopDeflect: 0.075,   // заморозка при возврате удара
  hitStopPacify: 0.13,     // заморозка при снятии оковы — крупнее награда
  hitStopHurt: 0.06,       // заморозка, когда тебе больно
  shakeDeflect: 3.4,       // тряска: пик смещения в пикселях
  shakePacify: 6.0,
  shakeHurt: 7.0,
  shakeBossBreak: 11.0,    // срыв порога владыки
  knockDeflect: 26,        // отдача оковы, пиксели
  knockPacify: 0,          // снятую оку не отбрасываем — она уже ушла
  // Сколько живёт отдёргивание от удара и падение после смерти. Это НЕ украшение:
  // безdeathT ока исчезала в тот же кадр, и полоса смерти не показывалась ни разу.
  hurtTime: 0.3,
  deathTime: 0.75,
  // ── ЧАСЫ СМЕРТИ (Hades: Death Clock) ────────────────────────────────
  // В Hades примерно через 3.5 минуты забега включается «Гнев Аида»: мир
  // ускоряется, и с каждой минутой враги бьют всё чаще. Это и создаёт
  // напряжение «успею ли я». Здесь то же: после clockStart оковы злятся.
  clockStart: 75,         // секунд спокойной комнаты
  clockRamp: 26,          // на сколько процентов замедляет каждую минуту
  clockMax: 2.2,          // насколько оковы могут ускориться
  // ── ХАОС-ДВЕРЬ (Hades: Chaos Gate) ──────────────────────────────────
  // Фонтан амбросии (Hades: healing fountain). Стоит в последней комнате
  // этапа — перед владыкой. В Hades он там же, и он решает, доживёшь ли
  // ты до босса: без него игрок входит к владыке с тем, что осталось.
  spring: false,          // поставить фонтан в этой комнате
  springHeal: 0.35,       // какую долю жизни он вернёт
  chaosChance: 0.5,       // шанс, что в комнате есть вторая дверь
  chaosDamage: 2,         // проклятие: урон по тебе удваивается
  // ── МЕНТАЛЬНОСТЬ (варна) как оружие: свой набор движений ───────────
  qiOnPacify: 0,          // Ци за снятую окову (Випра)
  coinMul: 1,             // множитель монет (Вайшья)
  shopDiscount: 0,        // скидка в лавке (Вайшья)
  // Авидья (§9.1a) — фоновый враг. Дыхание и сева гасят, насилие кормит.
  avidyaMax: 100,
  avidyaGainIdle: 2.2,    // в секунду, если стоишь и не дышишь
  avidyaGainStrike: 9,    // за удар по окове (бессмысленно и вредно)
  avidyaCalmBreath: 14,   // за цикл дыхания
  avidyaCalmPacify: 12,   // за освобождение оковы
  avidyaCalmSeva: 6,      // за любую севу
  // Прана/сила
  shaktiStart: 3,
  shaktiMax: 20,
  // Прама: равновесие гун (Subhāśita 18/3, NHN 2/11 — samatābhāva)
  pramaWindow: 0,        // разница максимума и минимума для прамы
  // Самадхи (§8.4) — нужно духовной силы
  samadhiShakti: 14,
  samadhiTime: 9,        // сек ясности
}

import { behaviorOf, DEFAULT_BEHAVIOR } from './foeBehavior.js'

export const GUNA_META = {
  s: { key: 's', color: '#f4f1ea', name: 'саттва' },
  r: { key: 'r', color: '#d23b3b', name: 'раджас' },
  t: { key: 't', color: '#14121a', name: 'тамас' },
  // Цвета строго по источнику: sattvaguńa is white, rajoguńa is red,
  // tamoguńa is black (Idea and Ideology, ч. 1 «Vibration, Form and Colour»).
  // Вайшья — жёлтый (раджас + тамас), Babas_Grace.
  tamInk: '#9a90ad',
  vaeshya: '#e0b93a',
}

const PALETTE = {
  sattva: [255, 240, 210],
  rajas: [255, 120, 90],
  tamas: [40, 30, 55],
  void: [10, 8, 18],
}

// ── Модели ───────────────────────────────────────────────────────────────

// Поля владыки. Приёмы и порог берутся из enemies.json — ничего не
// придумываем: `moves` (с намерениями) и `onThreshold` уже проверены.
function bossFields(def) {
  const moves = Array.isArray(def.moves) && def.moves.length ? def.moves : null
  return {
    isBoss: !!def.isBoss,
    moves,
    moveIdx: 0,
    move: moves ? moves[0] : null,
    intent: moves ? moves[0].intent : 'attack',
    strength: 0,          // +N к урону приёма (Slay the Spire: Strength)
    block: 0,             // стойкость: гасит спокойствие (Slay the Spire: Block)
    phase: 1,             // 1 = обычный, 2 = после порога (бешенство)
    thresholdDone: false,
    thresholdMsg: def.onThreshold?.log || '',
  }
}

function makeRipu(def) {
  return {
    ...def,
    kind: 'ripu',
    x: def.x, y: def.y,
    calm: 0,
    calmMax: def.calmMax ?? 3,
    // Аура Видья/Авидья — навык различения (viveka, SS 6/4).
    // trueLight — правда; fakeLight — авторская подделка (ловушка).
    trueLight: def.light ?? def.aura ?? 'light',
    fakeLight: def.fakeLight ?? null,
    shownLight: def.fakeLight ?? def.light ?? def.aura ?? 'light',
    state: 'idle',        // idle | approach | telegraph | stunned
    timer: 0,
    charge: 0,            // 0..1 — насколько сомкнулось кольцо замаха
    teleTotal: 0.75,
    stun: 0,
    facing: 1,
    hp: 1,                // рипу не имеет ХП: его нельзя убить
    dead: false,
    pacified: false,
    // Реакция фигуры: отдёргивание от удара и падение после смерти.
    // Обе полосы — из ЛИЦЕНЗИОННОГО спрайта (ряды 3 и 4 листа Calciumtrice).
    // Появление полосы без поведения — это анимация, которую никто не видел.
    hurtT: 0,
    deathT: 0,
    gone: false,
    ...bossFields(def),
  }
}

function makePasha(def) {
  return {
    ...def,
    kind: 'pasha',
    x: def.x, y: def.y,
    hp: def.hp ?? 30,
    maxHp: def.hp ?? 30,
    calm: 0,
    calmMax: def.calmMax ?? 3,
    ...bossFields(def),
    trueLight: def.light ?? 'dark',
    fakeLight: def.fakeLight ?? null,
    shownLight: def.fakeLight ?? def.light ?? 'dark',
    state: 'idle',
    timer: 0,
    charge: 0,
    teleTotal: 0.75,
    stun: 0,
    facing: -1,
    dead: false,
    pacified: false,
  }
}

/**
 * Гуны на входе в комнату.
 *
 * Баланс задаётся извне (`gunaStart` — это делает жар), плюс сдвиг от реликвии
 * («Шива-лингам» +1 саттвы, «Каупиина» +2). Раньше сдвига не было вовсе: число
 * лежало бы в данных реликвии, и ей было бы некуда его деть.
 */
function startGuna(o) {
  const g = { ...(o.gunaStart || DEFAULT_GUNA_START) }
  g.s += o.gunaStartS || 0
  return g
}

export function createField({ player, foes = [], wares = [], pots = [], field = null, rng = Math.random, opts = {} } = {}) {
  const o = { ...DEFAULT_FIELD_OPTIONS, ...opts }
  const rand = typeof rng === 'function' ? rng : Math.random

  // Поля реакции фигуры — у ВСЕХ оков, кто попадает в поле, независимо от того,
  // кто их собрал.
  //
  // Причина практическая: `createField` принимает готовые оковы и не прогоняет их
  // через сборщик. Значит, ока из сохранения старой версии (или собранная руками
  // в проверке) придёт без `hurtT/deathT/gone`, и условие `f.dead && f.deathT > 0`
  // окажется ложным — то есть ока исчезнет в тот же кадр, в который убита. Ровно
  // тот дефект, который эта правка и чинит, вернулся бы из сохранений.
  for (const f of foes) {
    if (typeof f.hurtT !== 'number') f.hurtT = 0
    if (typeof f.deathT !== 'number') f.deathT = 0
    if (typeof f.gone !== 'boolean') f.gone = false
  }

  const st = {
    o,
    rand,
    time: 0,
    look: opts.look || null,          // стихия локации (из worlds.json)
    world: opts.world || null,
    player: {
      x: player?.x ?? 0, y: player?.y ?? 0,
      facing: 1,
      hp: player?.hp ?? o.playerHp,
      // Максимум — отдельно от текущего. Раньше maxHp просто копировался
      // из hp, из-за чего полоса всегда была полной, а лечение (амбросия,
      // комната покоя) не давало ничего: выше полной жизни не подняться.
      maxHp: player?.maxHp ?? player?.hp ?? o.playerHp,
      // «Прана-дроп»: капля жизни на входе в КАЖДУЮ комнату. Не поднимает
      // потолок — поднимает текущую жизнь, потому что «+3 к максимуму» из
      // карточного описания здесь означало бы вечную полосу, и тогда реликвия
      // была бы просто «жизнь +3» в первом бою.
      hp: Math.min((player?.maxHp ?? player?.hp ?? o.playerHp),
        (player?.hp ?? o.playerHp) + (o.roomStartHeal || 0)),
      // Три вида силы
      shakti: o.shaktiStart,          // духовная (главный ресурс)
      shaktiMax: o.shaktiMax,
      psychic: o.psychicStart ?? 6,   // Ци — психическая сила
      psychicMax: o.psychicMax ?? 12,  // потолок может поднять мастерская
      // Щит на входе: «Дар Каруны» (разово) + «Шоча-майнджуса» (каждая
      // комната). В Поле Ума «бой» — это комната, и путать эти два слова здесь
      // нельзя: `shieldStart` дают один раз за забег, `roomStartShield` — на
      // входе в каждую комнату.
      shield: (o.shieldStart ?? 0) + (o.roomStartShield || 0),
      // Гуны — состояние, а не ресурс.
      //
      // Раньше стояло `guna: { s: 4, r: 2, t: 3 }` — захардкожено, значит
      // перекос нельзя было задать извне. Из-за этого первая ступень жара
      // (сдвиг раджаса, `webapp/js/core/heat.js`) была бы мёртвой величиной:
      // меняла бы опцию, которую бой не читает, — ровно то, что ловит
      // `npm run audit:impact`. Значение по умолчанию то же, поэтому при
      // «жар 0» игра не меняется ни на единицу.
      guna: startGuna(o),
      prama: false,
      // Состояния
      dash: 0, dashCd: 0, invuln: 0,
      // «жжёт» (гхрна): урон со временем, и «сон» (нидра): замедление.
      // Оба — то, что уже есть в бою, просто срок действия.
      burn: 0, burnT: 0, slow: 0, slowT: 0,
      // «слабость» (Slay the Spire: Weak) — временная. В Spire она снимается
      // на 1 в начале каждого хода. У нас нет ходов, поэтому идёт время:
      // каждые WEAK_TURNS секунд один стак спадает. Без этого владыка
      // навешивает слабость каждый приём, и к четвёртому циклу снять окову
      // становится физически невозможно — бой превращался в стену.
      weak: 0, weakT: 0,
      // Щит и его «ход»: в Spire блок не переживает ход (см. shieldTurn).
      shieldT: 0,
      // Серия дефлектов (Nine Sols: combo)
      combo: 0, comboT: 0, bestCombo: 0,
      mantras: null,             // выбор слотов убран: мантра одна, по чакре
      mantraId: opts.mantraId || FLOOR_MANTRA[0],
      parryCd: 0,
      weak: 0,                          // «слабость» от приёмов владыки
      samadhi: 0,                     // осталось секунд ясности
      inSamadhi: false,
      alive: true,
    },
    // «Калачакра» (колесо времени): оки входят в комнату спокойнее, то есть им
    // нужно меньше дефлектов. Применяется ЗДЕСЬ, а не в `fieldBuild`: сборщик
    // комнаты не знает опций боя (у него свои `opts`, для layout), и попытка
    // прочитать боевую величину в сборщике — это две правды об одной комнате.
    foes: foes.map((f) => {
      const foe = f.kind === 'pasha' ? makePasha(f) : makeRipu(f)
      if (o.foeCalmBonus) {
        foe.calmMax = Math.max(1, Math.round(foe.calmMax + o.foeCalmBonus))
      }
      return foe
    }),
    wares,                            // просящие (сева)
    served: new Set(),
    // СОКРОВИЩА (Dead Cells: containers). Ломаются ударом, из них падает
    // амбросия. Не оковы: их нельзя успокоить, и они не мстят за себя.
    pots: pots.map((p) => ({ ...p })),
    chests: 0,
    field: field || { w: 1200, h: 900 },
    // ДВЕРЬ — как в Hades. Комната зачищена → дверь открыта → игрок
    // входит сам и попадает в следующую. Победа не выдаётся, а
    // «зарабатывается шагом вперёд». Где именно она стоит и почему именно там —
    // в DOOR_SPOT выше: там обе её поломки (недостижимость и уход за край).
    door: { x: DOOR_SPOT.x, y: DOOR_SPOT.y, r: 26, open: false, glow: 0 },
    roomCleared: false,
    // Монеты (драхмы) — как в Hades: выпадают из снятых оков, подбираются
    // подходом, тратятся в лавке между комнатами. Живут между забегами.
    coins: [],
    coinsTaken: 0,
    avidya: 0,
    // Самскары: отложенные реакции (AS 3-4). Копятся от насилия.
    samskaraPressure: 0,
    samskaraCount: 0,
    krpaUsed: false,      // милость уже падала в этой локации
    krpaMissed: false,    // зонт был поднят — милость не достала
    // Часы смерти: копятся, после порога мир ускоряется (Hades).
    clock: 0, rage: 0, rageOn: false,
    // Вес удара: сколько ещё стоит мир (заморозка) и насколько трясётся
    // картинка. Оба тают сами, поэтому забыть нельзя.
    freeze: 0, shake: 0,
    // Смерти за все побеги (Hades держит их на виду — часть напряжения).
    deaths: o.deaths || 0,
    // Хаос-дверь: необязательная, даёт дар за проклятие (Hades: Chaos Gate).
    chaos: null,
    // Нефрит, надетый на этот побег (Hades: keepsake). Один на побег —
    // хранится здесь, чтобы экран знал, что показать.
    keepsake: o.keepsake || null,
    // Фонтан амбросии: касаешься — восстанавливается часть жизни. Один раз.
    spring: null,
    outcome: null,
    pacified: 0,
    log: [],
    score: 0,
  }
  st.foes.forEach((f, i) => {
    if (f.x == null) { f.x = 300 + i * 120; f.y = 400; }
    // Владыка: запас спокойствия втрое больше (как втрое больше здоровья
    // у босса в Hades), и собственные приёмы из enemies.json.
    if (f.isBoss) {
      // Владыка крепче обычной оковы И крепче с каждой чакрой: запас
      // приходит уже умноженным на calmMulFor(floor), домножаем на масштаб.
      f.calmMax = (f.calmMax || 3) * o.bossCalmScale
      f.thresholdAt = f.calmMax * 0.5     // onThreshold: hp_lte_50 → calm_gte_50
      if (!f.moves) f.moves = null
    }
    // «У каждого типа врага свой набор приёмов» (Hades). Поведение — из
    // `foeBehavior.js`, там оно выведено из записей о каждой оке.
    f.beh = f.isBoss ? { ...DEFAULT_BEHAVIOR } : behaviorOf(f.id)
  })
  // Фонтан амбросии. Ставится в последней комнате этапа — там же, где в
  // Hades стоит кубок Амбросии: прямо перед владыкой.
  if (o.spring) {
    st.spring = { x: o.springX ?? st.field.w * 0.5, y: o.springY ?? (st.field.h * 0.86), used: false }
  }

  // Хаос-дверь: у дальней стены, в стороне от обычной. Её надо заметить и
  // решиться — в этом весь смысл (Hades: Chaos Gate).
  if (rand() < o.chaosChance) {
    st.chaos = {
      x: o.chaosX ?? (st.field.w - 74),
      y: o.chaosY ?? (st.field.h * 0.66),
      taken: false,
    }
  }

  st.player.strikeCd = 0
  recomputeGuna(st)
  recomputeTint(st)
  refreshAuras(st)
  return st
}

// ── Гуны и прама ─────────────────────────────────────────────────────────

export function recomputeGuna(st) {
  const g = st.player.guna
  const vals = [g.s, g.r, g.t]
  const mx = Math.max(...vals), mn = Math.min(...vals)
  st.player.prama = mx - mn <= st.o.pramaWindow
  return st.player
}

export function leadingGuna(st) {
  const g = st.player.guna
  const keys = ['s', 'r', 't']
  const sorted = keys.map((k) => ({ k, v: g[k] })).sort((a, b) => b.v - a.v)
  if (sorted[0].v - sorted[1].v >= 2) return sorted[0].k
  return null
}

function recomputeTint(st) {
  const g = st.player.guna
  const tw = g.s + g.r + g.t || 1
  const mix = (a, b, w) => a.map((v, i) => Math.round(v * (1 - w) + b[i] * w))
  let base = mix(PALETTE.sattva, PALETTE.void, 0.62)
  base = mix(base, PALETTE.sattva, Math.min(1, g.s / tw) * 0.30)
  base = mix(base, PALETTE.rajas, Math.min(1, g.r / tw) * 0.42)
  st.tint = mix(base, PALETTE.tamas, Math.min(1, g.t / tw) * 0.52)
  if (st.player.prama) st.tint = mix(st.tint, PALETTE.sattva, 0.20)
  if (st.player.inSamadhi) st.tint = mix(st.tint, [255, 255, 255], 0.30)
  if (st.avidya > st.o.avidyaMax * 0.66) st.tint = mix(st.tint, PALETTE.tamas, 0.40)
  return st.tint
}

// ── Движение ─────────────────────────────────────────────────────────────

/**
 * Границы, куда игрок дотягивается.
 *
 * Вынесены отдельной константой, потому что из них выросла настоящая поломка:
 * дверь поставили на кромку дальней стены (y = 64), а игрок туда не доходит —
 * и комната стала невыигрываемой. Проверка «до финала дошли» это поймала, но
 * молчаливую причину показать не могла: правило теперь одно и проверяемое.
 */
export const PLAYER_BOUNDS = { side: 56, top: 112, bottom: 90 }

/**
 * Где стоит дверь — одна точка, потому что здесь уже было две поломки.
 *
 * Первая: дверь стояла на кромке дальней стены (y = 64), а игрок до y = 64 не
 * доходит (PLAYER_BOUNDS.top = 112) — комната становилась невыигрываемой. Поймала
 * проверка «до финала дошли», но причину показать не могла.
 *
 * Вторая: дверь стояла в середине комнаты по x, и при камере, уехавшей вбок,
 * уходила за правый край кадра — выхода не было видно. Проверка «дверь видна в
 * кадре» это поймала.
 *
 * Теперь обе решаются одним условием: **x = y**, то есть дверь стоит на средней
 * вертикали ромба. Камера идёт за центром боя, а центр боя по ромбу всегда около
 * ISO_W/2, поэтому дверь видна при любом положении камеры. Проверяется в
 * `tests/isoDoor.test.js`: если число плиток изменится и точка перестанет быть
 * средней, проверка упадёт.
 */
export const DOOR_SPOT = { x: 128, y: 128 }

function clampToField(st, p) {
  const b = PLAYER_BOUNDS
  p.x = Math.max(b.side, Math.min(st.field.w - b.side, p.x))
  p.y = Math.max(b.top, Math.min(st.field.h - b.bottom, p.y))
}

export function stepField(st, dt, input = {}) {
  const ev = []
  if (st.outcome) return ev
  st.time += dt

  // «жжёт» (гхрна) и «сон» (нидра) — то, что уже есть в бою, с отсчётом.
  const pp = st.player
  if (pp.burnT > 0) {
    pp.burnT -= dt
    // ожог не даёт неуязвимости, но и не отнимает её: иначе «жжёт» просто
    // не существовал бы — удар уже дал 0.55 с защиты
    if (pp.burn > 0) damagePlayer(st, pp.burn, ev, -1, true)
    if (pp.burnT <= 0) pp.burn = 0
  }
  if (pp.slowT > 0) {
    pp.slowT -= dt
    if (pp.slowT <= 0) pp.slow = 0
  }
  if (pp.weak > 0) {
    pp.weakT += dt
    while (pp.weakT >= st.o.weakTurn) {
      pp.weakT -= st.o.weakTurn
      pp.weak = Math.max(0, pp.weak - 1)
    }
  } else if (pp.weakT > 0) pp.weakT = 0

  // Щит тает на «ходе Spire» — ровно как в самой Spire, где блок снимается
  // в начале твоего хода и не переносится дальше. Порядок тот же, что у
  // «слабости» выше: ход у нас — это время.
  if (pp.shield > 0 && st.o.shieldTurn > 0) {
    pp.shieldT += dt
    while (pp.shieldT >= st.o.shieldTurn) {
      pp.shieldT -= st.o.shieldTurn
      const drop = st.o.shieldDecay > 0 ? st.o.shieldDecay : pp.shield
      pp.shield = Math.max(0, pp.shield - drop)
      if (pp.shield > 0) ev.push({ type: 'shield_decay', left: pp.shield })
    }
  } else if (pp.shieldT > 0) pp.shieldT = 0

  // Вес удара: пока стоит заморозка, мир не идёт — только тает тряска.
  // Это и есть «удар». Пропустим — дефлект станет пустым щелчком.
  if (st.freeze > 0) {
    st.freeze = Math.max(0, st.freeze - dt)
    st.shake = decayShake(st, dt, 14)
    return ev
  }
  st.shake = decayShake(st, dt, 9)

  // ── ЧАСЫ СМЕРТИ (Hades: Death Clock) ──────────────────────────────
  // Спокойная комната → через порог мир злится: оковы быстрее и бьют чаще.
  // Это и есть «успею ли я» — то, что держит напряжение в Hades.
  st.clock += dt
  if (!st.rageOn && st.clock > st.o.clockStart) {
    st.rageOn = true
    ev.push({ type: 'rage_on', message: 'мир ускорился' })
  }
  if (st.rageOn) {
    const mins = (st.clock - st.o.clockStart) / 60
    st.rage = Math.min(st.o.clockMax, 1 + mins * st.o.clockRamp)
  }

  // ── ФОНТАН АМБРОСИИ: коснулся — восстановилась часть жизни ─────────
  if (st.spring && !st.spring.used) {
    if (Math.hypot(st.player.x - st.spring.x, st.player.y - st.spring.y) < 34) {
      st.spring.used = true
      const gain = Math.round(st.player.maxHp * st.o.springHeal)
      st.player.hp = Math.min(st.player.maxHp, st.player.hp + gain)
      st.freeze = Math.max(st.freeze, st.o.hitStopPacify)
      st.avidya = Math.max(0, st.avidya - 6)
      ev.push({ type: 'spring', healed: gain, message: `амбросия: +${gain} жизни` })
    }
  }

  // ── ХАОС-ДВЕРЬ: необязательный вход, дар за проклятие ──────────────
  if (st.chaos && !st.chaos.taken) {
    if (Math.hypot(st.player.x - st.chaos.x, st.player.y - st.chaos.y) < 30) {
      st.chaos.taken = true
      st.player.chaosCurse = true
      ev.push({ type: 'chaos', message: 'Хаос-путь открыт. Урон по тебе удвоен — но дар будет.' })
    }
  }
  if (st.door?.open) st.door.glow = Math.min(1, st.door.glow + dt * 2)
  const p = st.player
  const o = st.o

  // Дэш
  if (p.dash > 0) {
    p.dash = Math.max(0, p.dash - dt)
  } else if (p.dashCd > 0) {
    p.dashCd = Math.max(0, p.dashCd - dt)
  }

  // Потолок Ци. По умолчанию 12; его поднимает усиление мастерской
  // «Брахмачарья» (см. core/workshop.js), поэтому читаем из player.
  const psiMax = p.psychicMax || 12
  const psi = Math.min(psiMax, p.psychic)

  // Авидья всегда растёт — неведение рядом, даже когда чисто (§9.1a).
  // Гасится не «дыханием», а попаданием в поток дефлектов (Nine Sols:
  // momentum/flow) и севой.
  let gain = o.avidyaGainIdle
  if (p.combo > 0) gain = -o.avidyaCalmBreath * 0.10
  if (p.inSamadhi) gain *= 0.3
  st.avidya = Math.max(0, Math.min(o.avidyaMax, st.avidya + gain * dt))
  if (st.avidya >= o.avidyaMax) {
    applySamskara(st, ev)
  }

  // Движение игрока
  //
  // Вектор приходит из экрана, а экран переводит палец в координаты поля по
  // прямоугольнику холста. На телефоне этот прямоугольник на кадр может
  // схлопнуться в ноль (анимация шапки Telegram, поворот, клавиатура), и
  // тогда перевод даёт Infinity. Одно касание — и позиция садхаки навсегда
  // становится NaN: поле больше не играется, до конца забега. Здесь стоит
  // страховка ядра: мусорный вектор — это «не двигаться», а не порча поля.
  const vx = Number.isFinite(input.dx) ? input.dx : 0
  const vy = Number.isFinite(input.dy) ? input.dy : 0
  const mag = Math.hypot(vx, vy)
  if (mag > 0.01) {
    // «сон: усыпляет» — после удара шаг вялый (рывок не замедляется).
    const speed = p.dash > 0 ? o.dashSpeed : o.walkSpeed * (1 - (p.slow || 0))
    // Тамас — инерция: медленнее. Саттва — точнее и быстрее.
    const speedMod = p.guna.t > 5 ? 0.86 : p.guna.s > 5 ? 1.06 : 1
    p.x += (vx / mag) * speed * speedMod * dt
    p.y += (vy / mag) * speed * speedMod * dt
    if (vx !== 0) p.facing = vx > 0 ? 1 : -1
  }
  p.psychic = psi
  clampToField(st, p)
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt)
  if (p.strikeCd > 0) p.strikeCd = Math.max(0, p.strikeCd - dt)

  // Серия дефлектов (Nine Sols) — горит, пока не прошло comboWindow
  if (p.parryCd > 0) p.parryCd = Math.max(0, p.parryCd - dt)
  if (p.comboT > 0) {
    p.comboT -= dt
    if (p.comboT <= 0) { p.combo = 0; ev.push({ type: 'combo_end' }) }
  }

  // Самадхи
  if (p.inSamadhi) {
    p.samadhi -= dt
    // Конец ясности — СОБЫТИЕ. Раньше здесь просто гасили флаг, и бой
    // внезапно становился втрое тяжелее без единого слова. Окно в девять
    // секунд, меняющее бой, обязано говорить, когда закрылось.
    if (p.samadhi <= 0) { p.inSamadhi = false; p.samadhi = 0; ev.push({ type: 'samadhi_end' }) }
  }

  // Оковы
  for (let i = 0; i < st.foes.length; i++) stepFoe(st, i, dt, ev)

  // Монеты: подбираются подходом — в Hades надо подойти и собрать.
  for (const c of st.coins) {
    if (c.taken) continue
    if (Math.hypot(p.x - c.x, p.y - c.y) < 26) { c.taken = true; st.coinsTaken += 1 }
  }

  // Сева: подошёл к просящему и помог
  for (let i = 0; i < st.wares.length; i++) stepSeva(st, i, ev)

  refreshAuras(st)
  recomputeGuna(st)
  recomputeTint(st)
  checkSamadhi(st, ev)
  checkKrpa(st, ev)
  checkOutcome(st, ev)
  return ev
}

// ── ДЕФЛЕКТ — ядро боя, скопировано с Nine Sols ──────────────────────────

/**
 * Парирование. Ока замахнулась (state='telegraph', идёт отсчёт timer) —
 * в последние parryWindow секунд игрок жмёт дефлект. Попадание:
 *   • сила возвращается оке, тот оглушается и теряет цикл;
 *   • серия (combo) растёт, за неё капает Ци;
 *   • спокойствие оки скачком растёт.
 * Промах: серия обнуляется, удар придёт как обычно — наказывать дважды
 * нельзя, иначе это уже не парирование, а ловушка.
 * Попасть можно и в замахе, и в первые мгновения после удара ( forgiving
 * window, как в Sekiro) — но в latter щит не спасает.
 */
export function parry(st, ev = []) {
  const p = st.player
  if (p.parryCd > 0 || !p.alive) return ev
  p.parryCd = 0.18

  // Ищем оку, у которой кольцо уже почти сомкнулось.
  let best = null
  for (let i = 0; i < st.foes.length; i++) {
    const f = st.foes[i]
    if (f.dead || f.pacified) continue
    const d = Math.hypot(p.x - f.x, p.y - f.y)
    if (d > st.o.parryRadius) continue
    if (f.stun > 0) continue
    const window = f.state === 'telegraph'
      ? f.timer <= st.o.parryWindow
      : f.state === 'attack' && f.timer > 0
    if (!window) continue
    // Берём самую «горящую» — у которой кольцо сомкнулось сильнее.
    const span = f.telegraphSpan || st.o.enemyTelegraph
    const heat = f.state === 'telegraph' ? 1 - f.timer / span : 1
    if (!best || heat > best.heat) best = { foe: f, index: i, heat, dist: d }
  }

  if (!best) {
    p.combo = 0
    ev.push({ type: 'parry_miss', message: 'мимо окна' })
    return ev
  }

  const f = best.foe
  p.combo += 1
  p.comboT = st.o.comboWindow
  if (p.combo > p.bestCombo) p.bestCombo = p.combo

  // Ци: базовая + надбавка за серию (Nine Sols: deflect → qi, combo → больше).
  const qi = st.o.deflectQi + st.o.deflectComboQi * (p.combo - 1)
  p.psychic = Math.min(p.psychicMax, p.psychic + qi)

  // Возвращённая сила оглушает оку и ломает её цикл.
  const B = f.beh || DEFAULT_BEHAVIOR
  const wasPending = f.pending          // удар ещё не нанесён → он отменён
  f.state = 'idle'
  f.timer = 0
  f.charge = 0
  f.pending = false
  f.stun = st.o.stunTime
  f.cooldown = st.o.enemyCooldown

  // Спокойствие: дефлект — главный его источник. Прама ускоряет,
  // самадхи сильно, тамас тормозит. Стойкость владыки гасит, «слабость»
  // игрока убавляет — оба слота скопированы из Slay the Spire.
  let mod = 1
  if (p.prama) mod *= 1.2
  if (p.inSamadhi) mod *= 1.5
  if (p.guna.t > 5) mod *= 0.85
  if (p.weak > 0) mod *= Math.max(0.2, 1 - st.o.weakCalmPenalty * st.o.weakPenaltyMul * p.weak)
  const comboMul = 1 + (p.combo - 1) * 0.1
  let gain = st.o.deflectCalm * mod * comboMul
  let soaked = 0
  // «холодность: стена» гасит возврат удара сама, без приёмов владыки.
  if (B.blockCalm) gain = Math.max(gain * B.blockCalm, 0.12)
  if (f.block > 0) {
    // Возвращённая сила тратится на пробитие стойкости (Spire: Block vs урон).
    const before = gain
    gain = Math.max(gain * st.o.bossBlockCalm, 0.12)
    soaked = before - gain
    f.block = Math.max(0, f.block - 1)
  }
  f.calm = Math.min(f.calmMax, f.calm + gain)

  // Вес удара (Hades/Nine Sols): оку отбрасывает, мир на долю секунды
  // замирает, картинку подбрасывает. Без этого возврат удара не читается.
  knockback(st, f, p.x, p.y, st.o.knockDeflect * (B.knockMul ?? 1))
  st.freeze = Math.max(st.freeze, st.o.hitStopDeflect)
  // своя реакция оки на возврат удара: гнев почти не гасится, зависть ворует
  B.onDeflect?.(st, f)
  st.shake = Math.max(st.shake, st.o.shakeDeflect)

  st.avidya = Math.max(0, st.avidya - (st.o.deflectAvidya ?? 1.5))
  st.score += 15 * p.combo
  st.log.push({ t: st.time, text: `дефлект ×${p.combo}` })
  ev.push({ type: 'deflect', foe: best.index, combo: p.combo, qi, calm: f.calm,
    soaked, blocked: soaked > 0.01, negated: wasPending })

  if (f.calm >= f.calmMax) pacifyFoe(st, best.index, ev)
  return ev
}

/**
 * Тряска тает сама и в конце концов обнуляется, а не подходит к нулю
 * бесконечно: крошечное значение, оставшееся от деления, заметно глазом
 * (картинка «дышит» вечно) и ломает сравнения в тестах.
 */
function decayShake(st, dt, rate) {
  const v = st.shake - st.shake * Math.min(1, dt * rate)
  st.shake = v < 0.05 ? 0 : v
  return st.shake
}

/**
 * Отдача: сдвинуть оку прочь от садхаки, не выбрасывая её из комнаты и
 * не накладывая на других оков. Расстояние считаем по настоящему — если
 * ока слиплась с садхакой в одну точку, отдаём по своему «правому» вектору.
 */
function knockback(st, f, fromX, fromY, dist) {
  const k = dist || 0
  if (!k) return
  let dx = f.x - fromX
  let dy = f.y - fromY
  const d = Math.hypot(dx, dy)
  if (d < 0.001) { dx = 0; dy = 1 } else { dx /= d; dy /= d }
  const nx = f.x + dx * k
  const ny = f.y + dy * k
  f.x = Math.max(40, Math.min(st.field.w - 40, nx))
  f.y = Math.max(190, Math.min(st.field.h - 70, ny))
  f.vx = dx * k * 3.2
  f.vy = dy * k * 3.2
  f.knock = 1          // для рисования: ока на мгновение «отлетает» ярче
}

export function dash(st, dx, dy) {
  const p = st.player
  if (p.dashCd > 0 || p.dash > 0) return false
  const mag = Math.hypot(dx, dy) || 1
  p.facing = dx >= 0 ? 1 : -1
  p.dash = st.o.dashTime
  p.dashCd = st.o.dashCooldown
  p.invuln = st.o.dashTime + 0.08
  st.log.push({ t: st.time, text: 'рывок' })
  return true
}

// Аура врага. Показываем правдивую, а под пеленой авидьи — «unknown»:
// неведение закрывает различение (viveka, SS 6/4), и игрок вынужден дышать,
// чтобы правда проявилась. `fakeLight` — авторская подделка ауры (ловушка),
// её refreshAuras не трогает.
function refreshAuras(st) {
  const veiled = st.avidya > st.o.avidyaMax * (st.o.auraVeilAt ?? 0.5) && !st.player.inSamadhi
  for (const f of st.foes) {
    if (f.dead || f.pacified) continue
    if (f.fakeLight) { f.shownLight = f.fakeLight; continue }
    f.shownLight = veiled ? 'unknown' : f.trueLight
  }
}

function onBreathCycle(st, ev) {
  const p = st.player
  p.psychic = Math.max(0, p.psychic - 1)
  st.avidya = Math.max(0, st.avidya - st.o.avidyaCalmBreath)
  if (p.guna.t > p.guna.s) p.guna.t += 0.5
  else p.guna.s += 0.5
  p.guna.s = Math.round(p.guna.s * 2) / 2
  p.guna.t = Math.round(p.guna.t * 2) / 2
  ev.push({ type: 'breath', type2: 'cycle', avidya: st.avidya })
}

// ── МАНТРЫ = талисманы Nine Sols (тратят Ци) ──────────────────────────────

/**
 * МАНТРА = талисман Nine Sols.
 *
 * Игроку доступна **одна** мантра, и она выдаётся по чакре сама.
 * Выбора слотов больше нет: автор справедливо заметил, что четыре слота
 * с выбором — это не Hades, а бухгалтерия. В Hades одна атака и одно
 * особое умение; здесь одно умение, имя которого меняется от чакры к чакре.
 *
 * Всё содержимое скопировано дословно из `content/cards.json`: описание,
 * эффект и quoteId — те же, что проверены по шастрам.
 * Правило проекта: «эффект мантры = цитата из шастр. Нет цитаты — нет мантры».
 */
export const MANTRAS = [
  {
    id: 'japa', name: 'Джапа', sanskrit: 'जप', cost: 0, quoteId: 'omkara',
    // Джапа бесплатна, но она НЕ даёт Ци. Раньше давала, и это делало Ци
    // бесконечным: жми Джапа → получай Ци → жми Упаваса → оковa снята без
    // единого дефлекта. Весь смысл петли Nine Sols (дефлект → Ци → талисман)
    // ломался. Ци теперь приходит только из игры: за возврат удара и севу.
    desc: 'Повторение мантры: гасит неведение и прибавляет саттву.',
    apply(st) {
      st.avidya = Math.max(0, st.avidya - 5)
      st.player.guna.s += 1
      return 'авидья −5, саттва +1'
    },
  },
  {
    id: 'pranayama', name: 'Пранаяма', sanskrit: 'प्राणायाम', cost: 1, quoteId: 'pranayama',
    desc: 'Дыхание: +2 энергии и +2 блока.',
    apply(st) {
      st.player.psychic = Math.min(st.player.psychicMax, st.player.psychic + 2)
      const sh = addShield(st, 2)
      return `Ци +2, ${shieldText(sh)}`
    },
  },
  {
    id: 'madhuvidya', name: 'Мадхувидья', sanskrit: 'मधुविद्या', cost: 2, quoteId: 'pranayama',
    desc: 'Знание-мёд: 4 блока и +2 саттвы.',
    apply(st) {
      const sh = addShield(st, 4)
      st.player.guna.s += 2
      return `${shieldText(sh)}, саттва +2`
    },
  },
  {
    id: 'samyama', name: 'Самьяма', sanskrit: 'संयम', cost: 2, quoteId: 'dhyana',
    desc: 'Правильное использование: 8 урона владыке.',
    apply(st, ev = []) {
      const sh = addShield(st, 2)
      // «Самьяма — правильное использование»: бьёт не окову, а её стойкость.
      // Рипу урона не делает, владыку — да (см. strike()).
      const boss = st.foes.find((f) => f.isBoss && !f.dead && !f.pacified)
      if (boss) { boss.block = Math.max(0, boss.block - 8); st.avidya = Math.min(st.o.avidyaMax, st.avidya + 4) }
      else st.avidya = Math.min(st.o.avidyaMax, st.avidya + 4)
      return boss ? 'стойкость владыки −8' : `${shieldText(sh)}, авидья +4`
    },
  },
  {
    id: 'upavasa', name: 'Упаваса', sanskrit: 'उपवास', cost: 4, quoteId: 'upavasa',
    // Пост не отменяет работу, а дожигает начатое: окову снимает, только
    // если она уже наполовину размягчена дефлектами. Раньше снимал любую
    // за два Ци — и три таких нажатия чистили комнату без единого
    // возврата удара, то есть мимо всего смысла «Поля Ума».
    desc: 'Пост: «быть вблизи Ишвары». Дожигает окову, снятую наполовину.',
    apply(st, ev = []) {
      const sh = addShield(st, 3)
      const near = nearestFoe(st, 220)
      if (near && near.foe.calm >= near.foe.calmMax * 0.5) {
        pacifyFoe(st, near.index, ev)
        return `${shieldText(sh)}, оковa сожжена`
      }
      return near ? `${shieldText(sh)} — оковa ещё держится` : shieldText(sh)
    },
  },
  {
    id: 'tandava', name: 'Тандава', sanskrit: 'ताण्डव', cost: 2, quoteId: 'tapah',
    desc: 'Танец-борьба: сжигает мучительную авидью, +2 блока.',
    apply(st) {
      const sh = addShield(st, 2)
      st.avidya = Math.max(0, st.avidya - 26)
      st.player.combo = Math.max(st.player.combo, 1)
      st.player.comboT = st.o.comboWindow
      return `авидья −26, ${shieldText(sh)}`
    },
  },
]

/** Мантра чакры: выдаётся сама, выбирать не нужно. */
export const FLOOR_MANTRA = ['japa', 'pranayama', 'tandava', 'madhuvidya', 'samyama', 'upavasa', 'tandava']

export function mantraById(id) {
  return MANTRAS.find((m) => m.id === id) || MANTRAS[0]
}

export function mantraList(st) {
  return [mantraById(st.player.mantraId)]
}

export function castMantra(st, ev = []) {
  const p = st.player
  if (!p.alive) return ev
  const m = mantraById(p.mantraId)
  const cost = Math.max(0, m.cost - (st.o.mantraCostCut || 0))
  if (p.psychic < cost) { ev.push({ type: 'no_qi', need: cost }); return ev }
  p.psychic -= cost
  const text = m.apply(st, ev) || ''
  st.log.push({ t: st.time, text: m.name.toLowerCase() })
  ev.push({ type: 'mantra', id: m.id, name: m.name, text })
  return ev
}

/**
 * Щит. Slay the Spire / Dead Cells: блок — это ЧИСЛО, а не полоска.
 *
 * Возвращает, сколько реально прибавилось. Раньше возвращалось новое значение
 * щита, и вызывающий не мог отличить «прибавилось 5» от «щит был полон, ничего
 * не прибавилось». Из-за этого дар «Мудра севы» мог сработать вхолостую, и
 * игрок не получал об этом ни слова.
 */
function addShield(st, amount) {
  const p = st.player
  const before = p.shield
  p.shield = Math.max(0, Math.min(st.o.shieldMax, p.shield + amount))
  return p.shield - before
}

/**
 * Как сказать о щите, не соврав.
 *
 * Слово «щит +4» на экране — это обещание. Если щит уже полон, обещание не
 * сбылось, и написать надо «щит полон», а не «щит +4». Молчание здесь хуже
 * правды: игрок нажал, ничего не получил и решил, что дар сломан.
 */
function shieldText(gained) {
  return gained > 0 ? `щит +${gained}` : 'щит полон'
}

// ── Оковы ────────────────────────────────────────────────────────────────

function stepFoe(st, i, dt, ev) {
  const foe = st.foes[i]
  // Падение считается ДО раннего выхода по `dead`.
  //
  // Раньше счётчик стоял ниже, где `if (f.dead || f.pacified) return` уже отрезал
  // мёртвую оку. То есть падение никогда не доходило до конца: ока оставалась на
  // экране навсегда. Первая версия проверки это показала — «ока не ушла за 200
  // шагов».
  if (foe.dead && foe.deathT > 0) {
    foe.deathT = Math.max(0, foe.deathT - dt)
    if (foe.deathT === 0) foe.gone = true
  }
  const f = st.foes[i]
  if (f.dead || f.pacified) return
  const p = st.player
  const dx = p.x - f.x, dy = p.y - f.y
  const dist = Math.hypot(dx, dy) || 1
  f.dist = dist
  if (Math.abs(dx) > 2) f.facing = dx > 0 ? 1 : -1

  // Отдача: ока ещё летит назад, пока гасит набранную скорость. Движение
  // и собственное поведение при этом не идут — её «откинуло».
  if (f.vx || f.vy) {
    f.x = Math.max(40, Math.min(st.field.w - 40, f.x + f.vx * dt))
    f.y = Math.max(190, Math.min(st.field.h - 70, f.y + f.vy * dt))
    const damp = Math.max(0, 1 - 7 * dt)
    f.vx *= damp
    f.vy *= damp
    if (Math.abs(f.vx) < 1 && Math.abs(f.vy) < 1) { f.vx = 0; f.vy = 0 }
  }
  if (f.knock > 0) f.knock = Math.max(0, f.knock - dt * 3.4)
  if (f.hurtT > 0) f.hurtT = Math.max(0, f.hurtT - dt)

  // Порог 50% — владыка ломается один раз (Hades: berserk below half).
  // Проверяем ДО оглушения: в Hades босс вырывается из стана на половине
  // здоровья. Если ждать, пока стая пройдёт, срыв приходил бы с задержкой
  // в полторы секунды — и момент, ради которого всё затевалось, тускнел.
  if (f.isBoss && !f.thresholdDone && f.thresholdAt && f.calm >= f.thresholdAt) {
    f.thresholdDone = true
    f.phase = 2
    f.stun = 0
    f.state = 'idle'
    f.cooldown = 0
    // Срыв порога — самая громкая точка боя: длинная заморозка, сильная
    // тряска. Это момент, ради которого всё затевалось (Hades: berserk).
    st.freeze = Math.max(st.freeze, st.o.hitStopPacify * 1.8)
    st.shake = Math.max(st.shake, st.o.shakeBossBreak)
    ev.push({ type: 'boss_phase', foe: i, phase: 2, message: f.thresholdMsg || 'владыка сломался' })
    st.log.push({ t: st.time, text: f.thresholdMsg || 'владыка сломался' })
  }

  // Оглушение после возвращённого удара: ока стоит и не машнёт.
  if (f.stun > 0) {
    f.stun = Math.max(0, f.stun - dt)
    f.charge = 0
    if (f.cooldown > 0) f.cooldown = Math.max(0, f.cooldown - dt)
    return
  }

  // Владыка: собственный цикл приёмов (Slay the Spire — intent + moves).
  if (f.isBoss && f.moves && f.moves.length) { stepBoss(st, i, f, dt, ev); return }

  // Спокойствие тает, если ты отошёл (терпение нужно удерживать).
  if (dist > st.o.calmRadius * 1.5) {
    const decay = f.kind === 'pasha' ? st.o.calmDecayEnemy : st.o.calmDecayIdle
    f.calm = Math.max(0, f.calm - decay * dt)
  }

  const B = f.beh || DEFAULT_BEHAVIOR

  switch (f.state) {
    case 'idle':
    case 'approach': {
      // «гордость» и «родовитость» не подходят — бьют с места (Hades: melee
      // и ranged в одной комнате, состав решает сложность).
      const stay = B.keepsDistance ? st.o.enemyReach * 1.25 : 0
      if (dist > st.o.calmRadius * 0.9 && dist > stay) {
        // Сближение издалека НЕ ускорено — и это проверено, а не забыто.
        //
        // Арена выросла с 412×600 до 620×900 (камера вместо вида на всю комнату),
        // и проходимость упала с 77 % до 63 %. Казалось, что платит время
        // сближения, и ока издалека должна торопиться. Замерено на 240 забегах:
        // ×1.6 даёт 60 %, ×2.2 — 58 %. То есть быстрее — ХУЖЕ.
        //
        // Так же и скорость садхаки: ×1.15 → 62 %, ×1.3 → 59 % вместо 63 %.
        //
        // Вывод: обе «компенсации» бьют по тому, кто не умеет уворачиваться, и
        // на реальном игроке, который уворачивается, сработают иначе. Оставлено
        // как есть и записано здесь, чтобы механизм не вернули «на всякий
        // случай» — он измерен и отвергнут.
        const sp = st.o.enemySpeed * (f.speedMul ?? 1) * (st.rage || 1)
        f.x += (dx / dist) * sp * dt
        f.y += (dy / dist) * sp * dt
        f.state = 'approach'
      } else {
        f.state = 'idle'
      }
      // «стыд: прячет и отнимает» — отходит, когда подходишь.
      if (B.flees && dist < B.fleesAt) {
        const sp = st.o.enemySpeed * (f.speedMul ?? 1) * 1.1
        f.x -= (dx / dist) * sp * dt
        f.y -= (dy / dist) * sp * dt
      }
      break
    }
    case 'telegraph': {
      f.timer -= dt
      // «влечение: тянет к себе» — во время замаха ока тянет садхаку к себе,
      // и окно дефлекта сдвигается. Читать надо не кольцо, а себя.
      if (B.pull && p.dash <= 0) {
        const t = 1 - Math.max(0, f.timer) / (f.telegraphSpan || st.o.enemyTelegraph)
        // тянем К оке, поэтому знак минус: (dx, dy) смотрит от оки к садхаке
        p.x -= (dx / dist) * B.pull * dt * t
        p.y -= (dy / dist) * B.pull * dt * t
      }
      // «родовитость» копит стойкость, пока стоит
      if (B.gainBlock && f.block < 3) f.block = Math.min(3, f.block + B.gainBlock * dt * 0.6)
      // Кольцо замаха: 0 → разомкнуто, 1 → сомкнулось. Игрок жмёт дефлект,
      // когда кольцо почти сошлось (последние parryWindow секунд).
      // Кольцо считается от НАСТОЯЩЕГО времени замаха этой оки. Если делить
      // на общий enemyTelegraph, у быстрой оки (гнев) кольцо сомкнулось бы
      // раньше времени, и окно дефлекта врало бы игроку.
      const span = f.telegraphSpan || st.o.enemyTelegraph
      f.charge = Math.max(0, Math.min(1, 1 - f.timer / span))
      if (f.timer <= 0) {
        // «тщеславие: блеф» — замах быстрый, и часть замахов обрывается
        // ничем. Если рука привыкла молотить дефлект, её разок обманут.
        if (B.feint && st.rand() < B.feint) {
          f.state = 'idle'
          f.cooldown = st.o.enemyCooldown * B.cooldownMul / (st.rage || 1)
          ev.push({ type: 'feint', foe: i, name: f.name })
          break
        }
        // Удар ещё НЕ нанесён: сначала короткое активное окно, в котором
        // парирование отменяет удар целиком (Sekiro: return the blade).
        // Поэтому в Nine Sols попадание слышно по своему лязгу, а сам удар
        // звука не издаёт — он отменён.
        f.state = 'attack'
        f.timer = st.o.attackWindow
        f.pending = true
        f.charge = 0
        f.cooldown = st.o.enemyCooldown * B.cooldownMul / (st.rage || 1)
      }
      break
    }
    case 'attack': {
      f.timer -= dt
      if (f.timer <= 0) {
        // окно прошло — удар достаёт. (f.pending мог быть снят дефлектом.)
        if (f.pending) {
          f.pending = false
          if (f.kind === 'pasha') {
            damagePlayer(st, f.attack ?? 8, ev, i)
            // Паша бьёт больно — и с добавкой, записанной за этой окой.
            if (B.burnOnHit) { p.burn = B.burnOnHit; p.burnT = 4 }
            if (B.weakOnHit) p.weak = (p.weak || 0) + B.weakOnHit
            if (B.avidyaOnHit) st.avidya = Math.min(st.o.avidyaMax, st.avidya + B.avidyaOnHit)
            if (B.stealsShakti) addShakti(st, -B.stealsShakti)
          } else if (p.dash <= 0) {
            // Рипу не ранит — сбивает Ци и гонит (дёшево, но не убивает).
            p.psychic = Math.max(0, p.psychic - 2)
            st.avidya = Math.min(st.o.avidyaMax, st.avidya + 6)
            if (B.stealsShakti) addShakti(st, -B.stealsShakti)
            if (B.slowOnHit) { p.slow = 1 - B.slowOnHit; p.slowT = 3 }
            ev.push({ type: 'shaken', foe: i })
          }
        }
        f.state = 'idle'
      }
      break
    }
    default:
      f.state = 'idle'
  }

  // Замах: подошёл вплотную, остыл от прошлого.
  if (f.state !== 'telegraph' && f.state !== 'attack'
      && dist < st.o.enemyReach * B.reachMul && (f.cooldown ?? 0) <= 0) {
    f.state = 'telegraph'
    f.telegraphSpan = st.o.enemyTelegraph * B.telegraphMul / (st.rage || 1)
    f.timer = f.telegraphSpan
    f.charge = 0
  }
  if (f.cooldown > 0) f.cooldown = Math.max(0, f.cooldown - dt)
}

// ── ВЛАДЫКА: цикл приёмов и порог 50% ───────────────────────────────────

/**
 * Ход владыки скопирован со Slay the Spire (intent + moves) и Hades
 * (порог 50% → вторая фаза). Приёмы берутся из `content/enemies.json`.
 *
 * Перевод эффектов карточного боя в реальное время (слот-в-слот):
 *   damage(player)        → удар по тебе в конце замаха
 *   guna(which, player)    → удар качает твою гуну
 *   block(self)           → СТОЙКОСТЬ: гасит спокойствие (тот же Block)
 *   strength(self)        → +N к урону следующих приёмов
 *   status weak (player)  → «слабость»: −20% спокойствия за дефлект
 *   addCurseToDeck        → Чинта в уме: +авидья (неведение растёт)
 *   shuffleHand / discard → срыв серии (сбивает твой ритм)
 */
function bossTelegraphTime(st, f) {
  // В бешенстве (после порога) владыка замахивается заметно быстрее.
  return f.phase >= 2 ? st.o.bossTelegraphRage : st.o.bossTelegraph
}

function stepBoss(st, i, f, dt, ev) {
  const p = st.player
  const dx = p.x - f.x, dy = p.y - f.y
  const dist = Math.hypot(dx, dy) || 1
  f.dist = dist
  if (Math.abs(dx) > 2) f.facing = dx > 0 ? 1 : -1

  // Стойкость немного тает и сама (видно, что она «горит»), но главное —
  // она сгорает целиком, когда владыка берёт следующий приём (см. ниже).

  if (f.state === 'telegraph') {
    f.timer -= dt
    f.charge = Math.max(0, Math.min(1, 1 - f.timer / f.teleTotal))
    if (f.timer <= 0) {
      f.charge = 0
      // Активное окно: приём ещё не сработал. Дефлект в этом окне
      // отменяет его целиком — и звука удара не будет.
      f.state = 'attack'
      f.timer = st.o.attackWindow
      f.pending = true
      f.cooldown = st.o.bossCooldown * (f.phase >= 2 ? 0.7 : 1) / (st.rage || 1)
    }
    return
  }

  if (f.state === 'attack') {
    f.timer -= dt
    if (f.timer <= 0) {
      if (f.pending) { f.pending = false; resolveBossMove(st, i, f, ev) }
      f.state = 'idle'
    }
    return
  }

  // Подходит, если далеко, иначе просто стоит и замахивается (владыка не бегает).
  if (dist > st.o.enemyReach * 1.2) {
    const sp = st.o.bossSpeed * (f.speedMul ?? 1)
    f.x += (dx / dist) * sp * dt
    f.y += (dy / dist) * sp * dt
  }

  if ((f.cooldown ?? 0) > 0) { f.cooldown = Math.max(0, f.cooldown - dt); return }
  if (dist > st.o.parryRadius * 1.6) return   // не бьёт через полполя

  f.move = f.moves[f.moveIdx % f.moves.length]
  f.intent = f.move.intent || 'attack'
  // Стойкость сгорает в начале следующего приёма — ровно как Block в
  // Slay the Spire («блок снимается в начале твоего хода»).
  //
  // Без этого владыка копит Block каждый защитный приём быстрее, чем он
  // тает, и через полминуты становится НЕУЯЗВИМЫМ: возврат удара гаснет
  // почти полностью, и снять его становится невозможно. На забеге это
  // читалось как «стена на втором владыке» — 0 побед из 40.
  f.block = 0
  f.state = 'telegraph'
  f.teleTotal = bossTelegraphTime(st, f)
  f.timer = f.teleTotal
  ev.push({ type: 'boss_telegraph', foe: i, name: f.move.name, intent: f.intent, phase: f.phase })
}

function resolveBossMove(st, i, f, ev) {
  const p = st.player
  const m = f.move || { intent: 'attack', effects: [] }
  const effects = Array.isArray(m.effects) ? m.effects : []
  // В контенте урон описан дважды: `move.damage` И `effect {kind:'damage'}`.
  // Это одно и то же число — берём из эффекта, если он есть, иначе из поля.
  const hasDamageEffect = effects.some((e) => e.kind === 'damage')
  let dmg = (hasDamageEffect ? 0 : (m.damage || 0)) + f.strength
  let chip = 0            // «рассыпается» — рипу-подобные приёмы качают авидью

  for (const e of effects) {
    switch (e.kind) {
      case 'damage':
        dmg += e.amount || 0
        break
      case 'guna': {
        if (e.which === 's') p.guna.s = Math.max(0, p.guna.s + (e.amount || 1))
        else if (e.which === 'r') p.guna.r += e.amount || 1
        else p.guna.t += e.amount || 1
        break
      }
      case 'block':
        // Стойкость приёма держится до следующего приёма, а не копится
        f.block = Math.max(f.block, e.amount || 0)
        chip += (e.amount || 0) * 0.15
        break
      case 'strength':
        // В Slay the Spire Strength держится весь бой. У нас бой — не
        // «сколько ударов успеешь», а гонка на 6–12 дефлектов, и владыка
        // успевает набрать силу 4–5 раз. Без потолка урон растёт на 1 каждый
        // цикл и через полминуты бой становится невозможен — это и было
        // причиной, по которой владыка чакры 1 не снимался никогда.
        f.strength = Math.min(st.o.bossStrengthMax, f.strength + (e.amount || 0))
        break
      case 'status':
        if (e.status === 'weak' && e.target === 'player') {
          // Слабость копится, но не выше потолка: иначе четыре приёма подряд
          // делают игрока бессильным навсегда (см. WEAK_TURNS).
          p.weak = Math.min(st.o.weakMax, (p.weak || 0) + (e.amount || 1))
          p.weakT = 0
        }
        break
      case 'addCurseToDeck':
        // Чинта в уме → неведение растёт. Карточный слот, перенесённый
        // в поле: то, что входит в ум, идёт в авидью.
        st.avidya = Math.min(st.o.avidyaMax, st.avidya + (e.amount || 1) * st.o.curseAvidya)
        chip += (e.amount || 1) * 1.5
        break
      case 'shuffleHand':
      case 'discardRandomFromHand':
        // Сбивает ритм: сорванная серия (в поле нет «руки», есть темп).
        if (p.combo > 0) { p.combo = 0; p.comboT = 0 }
        p.psychic = Math.max(0, p.psychic - (e.amount || 1))
        break
      default:
        break
    }
  }

  // Рипу-подобный приём (0 урона, но бьёт по состоянию) качает авидью.
  if (dmg <= 0) {
    st.avidya = Math.min(st.o.avidyaMax, st.avidya + 2.5 + chip)
  }

  if (dmg > 0) damagePlayer(st, dmg, ev, i)

  f.moveIdx = (f.moveIdx + 1) % f.moves.length
  ev.push({
    type: 'boss_move', foe: i, name: m.name, intent: m.intent,
    damage: dmg, phase: f.phase, block: f.block, strength: f.strength,
  })
  st.log.push({ t: st.time, text: `${f.name}: ${m.name}` })
}

// ── КРИПА (kṛpā): «зонт тщеславия» ──────────────────────────────────────

/**
 * Милость. Из источника, дословно (AV 12 «Shortening the Radius», SS 1
 * «Brahma Krpāhi Kevalam», AV 33 «Brahma Cakra»):
 *
 *   «The Grace is everywhere, but you know, just like rainfall … there is an
 *    umbrella of vanity upon your head, that's why you are not drenched.
 *    Remove the umbrella of vanity and you will be drenched.»
 *
 * Отсюда правило механики: **милость нельзя заработать, можно только не
 * закрыть себя**. Её не тем более, что льётся она «equally on pāpīs and
 * puṇyavānas» (AV 33) — и на тех, кто не старался.
 *
 * «Зонт» в игре = `samskaraPressure` (накопитель от ударов) + `avidya`
 * (неведение). Образование: ты не бил ни разу за локацию. Тогда в момент
 * настоящей беды милость достаёт: оковы отпускают, сила возвращается.
 * Если бил — зонт поднят, милость не достаёт. Раз за локацию.
 */
export function checkKrpa(st, ev = []) {
  if (st.krpaUsed || st.krpaMissed) return false
  const p = st.player
  if (!p.alive) return false
  // только в настоящей беде — иначе «милость» станет дешёвой кнопкой
  if (p.hp / p.maxHp > st.o.krpaHpRatio) return false

  // зонт тщеславия: поднят, если была хоть одна попытка решить силой
  const umbrella = st.samskaraPressure > 0 || st.avidya > st.o.krpaAvidyaMax
  if (umbrella) {
    st.krpaMissed = true
    ev.push({ type: 'krpa_missed', quoteId: 'krpa',
      message: 'Зонт тщеславия. Милость не достаёт' })
    return false
  }

  st.krpaUsed = true
  // оковы отпускают напряжение — владыка тоже
  const gain = st.o.krpaCalm
  for (const f of st.foes) {
    if (f.dead || f.pacified) continue
    f.calm = Math.min(f.calmMax, f.calm + gain)
    f.stun = Math.max(f.stun, st.o.krpaStun)
  }
  p.shakti = p.shaktiMax
  p.psychic = p.psychicMax
  p.shield = st.o.shieldMax
  st.avidya = 0
  st.score += 150
  st.log.push({ t: st.time, text: 'крипа: ты не заслужил' })
  ev.push({ type: 'krpa', quoteId: 'krpa', calm: gain,
    message: 'Крипа. Ты не заслужил. Зонт тщеславия снят' })
  for (let i = 0; i < st.foes.length; i++) {
    const f = st.foes[i]
    if (!f.dead && !f.pacified && f.calm >= f.calmMax) pacifyFoe(st, i, ev)
  }
  return true
}

export function nearestFoe(st, maxDist = Infinity) {  let best = null
  for (let i = 0; i < st.foes.length; i++) {
    const f = st.foes[i]
    if (f.dead || f.pacified) continue
    const d = Math.hypot(st.player.x - f.x, st.player.y - f.y)
    if (d < maxDist && (!best || d < best.dist)) best = { foe: f, dist: d, index: i }
  }
  return best
}

// ── Успокоение ────────────────────────────────────────────────────────────

/**
 * Подсказка UI: какая ока сейчас в окне парирования и насколько близко
 * кольцо к сомкнутости. Данные — только чтение, ничего не меняет.
 */
export function parryHint(st) {
  let best = null
  for (let i = 0; i < st.foes.length; i++) {
    const f = st.foes[i]
    if (f.dead || f.pacified || f.stun > 0) continue
    if (f.state !== 'telegraph') continue
    const d = Math.hypot(st.player.x - f.x, st.player.y - f.y)
    if (d > st.o.parryRadius) continue
    if (!best || f.timer < best.timer) best = { foe: f, index: i, timer: f.timer, dist: d }
  }
  return best
}

function pacifyFoe(st, i, ev) {
  const f = st.foes[i]
  f.pacified = true
  st.pacified += 1
  st.player.guna.s += st.o.sattvaPerPacify
  // Из снятой оковы падает монета. Подбирается подходом — как в Hades.
  const n = Math.round((f.isBoss ? 6 : 2) * (st.o.coinMul || 1))
  for (let c = 0; c < n; c++) {
    st.coins.push({
      x: f.x + (c - n / 2) * 7,
      y: f.y + 4 + (c % 2) * 4,
      taken: false,
    })
  }
  // Освобождение даёт духовную силу — это и есть экономика ненасилия.
  addShakti(st, 2)
  st.player.psychic = Math.min(st.player.psychicMax, st.player.psychic + 3)
  st.avidya = Math.max(0, st.avidya - st.o.avidyaCalmPacify)
  st.score += 100
  // Вес удара: снятие оковы — самая крупная награда в бою, и она должна
  // читаться физически: длиннее заморозка, сильнее тряска.
  st.freeze = Math.max(st.freeze, st.o.hitStopPacify)
  st.shake = Math.max(st.shake, st.o.shakePacify)
  f.knock = 1
  st.log.push({ t: st.time, text: `${f.name} освобождён(а)` })
  ev.push({ type: 'pacified', foe: i, name: f.name, shakti: 2 })
}

/**
 * Удар. Против рипу бессмыслен (у него нет ХП — его нельзя убить) и вреден:
 * кормит авидью. Против паши работает.
 * Это учит главному: сила — не решение, а затычка, которую приходится
 * оплачивать вниманием к авидье.
 */
/**
 * Ломать горшок (Dead Cells: containers; Hades: разбиваемое).
 *
 * Отдельная функция, а не второй путь в `strike`: горшок — не ока. По нему
 * не бьют «силой», его раскалывают, и самшкару за это растёт иначе: не от
 * удара по живому, а от похода по углу за лёгкой наживой.
 *
 * @returns {boolean} сломан ли (и выпало ли что-то)
 */
export function smashPot(st, potIndex, ev = []) {
  const p = st.pots[potIndex]
  if (!p || p.broken) return false
  p.hp -= 1
  if (p.hp > 0) {
    ev.push({ type: 'pot_chipped', pot: potIndex, name: p.name })
    return false
  }
  p.broken = true
  if (p.chest) {
    st.chests += 1
    ev.push({ type: 'chest', pot: potIndex, name: p.name, message: 'сундук открыт — сева' })
  } else {
    // Монеты ПАДАЮТ и подбираются подходом — ровно как из снятой оковы.
    // Первая версия писала `st.coinsTaken += p.coins`, и это была поломка
    // МЕХАНИКИ 41: игра рисует золотые монеты на полу и учит подбирать их
    // шагом, а горшок выдавал деньги прямо в карман. Итог — две разные
    // экономики в одном бою и множитель вайшьи, который на горшки не
    // действовал вовсе. Теперь число и правило общие.
    const n = Math.round(p.coins * (st.o.coinMul || 1))
    for (let c = 0; c < n; c++) {
      st.coins.push({
        x: p.x + (c - n / 2) * 7,
        y: p.y + 4 + (c % 2) * 4,
        taken: false,
      })
    }
    ev.push({ type: 'pot', pot: potIndex, name: p.name, coins: p.coins, message: `амбросия: ${p.coins}` })
  }
  // Цена. Оковы за силу берут самшкару, и горшок не должен быть исключением:
  // иначе поживиться силой бесплатно, а мир за это не темнеет.
  st.samskaraPressure += p.chest ? 6 : 10
  st.avidya = Math.min(st.o.avidyaMax, st.avidya + (p.chest ? 8 : 14))
  return true
}

/** Ближайший целый горшок к точке — для тапа. */
export function potAt(st, x, y, radius = 34) {
  for (let i = 0; i < st.pots.length; i++) {
    const p = st.pots[i]
    if (p.broken) continue
    if (Math.hypot(p.x - x, p.y - y) < radius) return i
  }
  return -1
}

export function strike(st, targetIndex = -1, ev = []) {
  const p = st.player
  if (p.strikeCd > 0) return ev
  p.strikeCd = 0.42
  const near = targetIndex >= 0
    ? (st.foes[targetIndex] ? { foe: st.foes[targetIndex], index: targetIndex } : null)
    : nearestFoe(st, 46)
  if (!near) { ev.push({ type: 'whiff' }); return ev }
  const f = near.foe
  if (f.dead || f.pacified) return ev

  // Аура: удар по мутированной ауре (обман) — мимо, плюс самскара.
  if (f.shownLight !== f.trueLight) {
    st.avidya = Math.min(st.o.avidyaMax, st.avidya + st.o.avidyaGainStrike * 0.5)
    st.samskaraPressure += 3
    ev.push({ type: 'strike_false', foe: near.index, message: 'аура была ложной' })
    return ev
  }

  st.avidya = Math.min(st.o.avidyaMax, st.avidya + st.o.avidyaGainStrike)
  st.samskaraPressure += 5

  // Отметка «по этой оке били» — для подсказки «рипу удар не берёт». Условие
  // подсказки должно быть фактом боя, а не «первым забегом» (см. core/hints.js).
  f.sawStrike = true

  if (f.kind === 'pasha') {
    f.hp -= 6 + p.guna.r * 0.5 + (st.o.strikeBonus ?? 0)
    ev.push({ type: 'hit', foe: near.index, hp: f.hp })
    // Отдёргивание от удара: ока не умирает, но на мгновение видно, что её
    // задели. Раньше ока просто отлетала тем же пиксельным сдвигом, что и от
    // дефлекта, — то есть попадание и отброс выглядели одинаково. Теперь у
    // спрайта есть своя полоса `hurt` (ряд 3 в листе автора), и она наконец
    // используется: раньше `stunned` не выставлялся никогда, то есть полоса
    // была мёртвой.
    f.hurtT = st.o.hurtTime ?? 0.3
    if (f.hp <= 0) {
      f.dead = true
      // Ока не исчезает в тот же кадр. Раньше отрисовка пропускала всех, у кого
      // `dead`, а значит полоса смерти из листа (ряд 4) не показывалась НИ
      // РАЗУ: ока просто исчезала. Теперь она доигрывает падение и уходит.
      f.deathT = st.o.deathTime ?? 0.75
      st.score += 40
      // Пашу можно только сломать силой — и это оставляет самскары.
      st.samskaraPressure += 12
      ev.push({ type: 'killed', foe: near.index, name: f.name, message: 'сила оставила самскару' })
    }
  } else {
    // Рипу: удар не ранит, только злит и отбрасывает набранное спокойствие.
    // Это главный урок боя: сила не работает, она только разрушает терпение.
    if (f.calm > 0) f.calm = Math.max(0, f.calm - 0.5)
    st.avidya = Math.min(st.o.avidyaMax, st.avidya + 4)
    ev.push({ type: 'strike_ripu', foe: near.index, message: 'рипу не ранится — его сдерживают' })
  }
  return ev
}

function addShakti(st, amount) {
  const p = st.player
  p.shakti = Math.max(0, Math.min(p.shaktiMax, p.shakti + amount))
  return p.shakti
}

function damagePlayer(st, amount, ev, from, ignoreIframes = false) {
  const p = st.player
  if (!ignoreIframes && (p.invuln > 0 || !p.alive)) return 0
  let dmg = amount
  if (p.prama) dmg -= 1
  if (p.inSamadhi) dmg = Math.max(0, dmg - 3)
  if (p.chaosCurse) dmg *= st.o.chaosDamage
  // Щит съедает урон первым (Slay the Spire — block).
  const absorbed = Math.min(p.shield, Math.max(0, dmg))
  p.shield -= absorbed
  dmg -= absorbed
  p.hp -= Math.max(0, dmg)
  if (ignoreIframes) return Math.max(0, dmg)
  p.invuln = 0.55
  // Больно — значит трясёт. Иначе урон приходит «из ниоткуда».
  if (dmg > 0) {
    st.freeze = Math.max(st.freeze, st.o.hitStopHurt)
    st.shake = Math.max(st.shake, st.o.shakeHurt)
  }
  ev.push({ type: 'hurt', amount: Math.max(0, dmg), absorbed, from })
  if (p.hp <= 0) { p.hp = 0; p.alive = false; }
}

// ── Сева (экономика духовной силы) ───────────────────────────────────────

/**
 * Помощь. Сева односторонняя: помощь с ожиданием отдачи не засчитывается
 * (NHN 2/11: «Service is unilateral, not mutual. Where it is mutual,
 * it is not service – it is commercial transaction»).
 */
export function serveWare(st, wareIndex, kind = 'shudrocita', ev = []) {
  const w = st.wares[wareIndex]
  if (!w || w.done) return ev
  w.done = true
  st.served.add(wareIndex)
  const p = st.player

  // Дары по видам севы (AV 30/10, «The Four Kinds of Service»).
  // Первые три — временный плод, випрочита — единственный вечный.
  let gain = { shakti: 0, psychic: 0, s: 0, permanent: false, label: '' }
  switch (kind) {
    case 'shudrocita':   // телесная: лечит быстро, снимает дремоту
      gain = { shakti: 1, psychic: 3, s: 0.5, permanent: false, label: 'временный' }
      p.psychic = Math.min(p.psychicMax, p.psychic + 3)
      break
    case 'ksatriyocita': // защита
      gain = { shakti: 1, psychic: 2, s: 0.5, permanent: false, label: 'временный' }
      break
    case 'vaeshyocita':  // нужда
      gain = { shakti: 2, psychic: 1, s: 1, permanent: false, label: 'временный' }
      break
    case 'viprocita':    // знание — единственный вечный плод
      gain = { shakti: 2, psychic: 2, s: 2, permanent: true, label: 'навсегда' }
      st.avidya = Math.max(0, st.avidya - 18)
      break
  }

  // Помощь «в расчёте» не засчитывается.
  if (w.debt) {
    const before = p.shakti
    gain.shakti = 0
    gain.psychic = 0
    ev.push({ type: 'seva_debt', index: wareIndex, message: 'помощь с расчётом — не сева', shakti: p.shakti - before })
    return ev
  }

  p.guna.s += gain.s
  p.psychic = Math.min(p.psychicMax, p.psychic + gain.psychic)
  addShakti(st, gain.shakti)
  st.avidya = Math.max(0, st.avidya - st.o.avidyaCalmSeva)
  // Щит от севы. Показываем ВСЕГДА, что произошло — и что прибавилось, и что
  // щит был уже полон. Молчаливый дар хуже его отсутствия: игрок не знает,
  // работает ли «Мудра севы». Это ровно класс МЕХАНИКИ 41.
  let shield = 0
  let shieldFull = false
  if (st.o.sevaShield) {
    shield = addShield(st, st.o.sevaShield)
    shieldFull = shield === 0 && p.shield >= st.o.shieldMax
  }
  st.score += gain.permanent ? 200 : 60
  st.log.push({ t: st.time, text: `сева: ${gain.label}` })
  ev.push({ type: 'served', index: wareIndex, kind, shield, shieldFull, ...gain })
  return ev
}

function stepSeva(st, i, ev) {
  const w = st.wares[i]
  if (!w || w.done) return
  const p = st.player
  const d = Math.hypot(p.x - w.x, p.y - w.y)
  w.near = d < 70
}

// ── Самскары ─────────────────────────────────────────────────────────────

/**
 * «Реакции прошлых действий должны быть прожиты» (Ánanda Sútram 2, AS 3-4).
 * Насилие копит давление; оно приходит волной и портит состояние.
 */
function applySamskara(st, ev) {
  st.avidya = 0
  const kinds = [
    { k: 'fear', text: 'самскара: пришла тревога' },
    { k: 'anger', text: 'самскара: саттва померкла' },
    { k: 'heaviness', text: 'самскара: ум потяжелел к тамасу' },
  ]
  const idx = (st.samskaraCount || 0) % kinds.length
  const kind = kinds[idx]
  st.samskaraCount = idx + 1
  const p = st.player
  if (kind.k === 'fear') { p.psychic = Math.max(0, p.psychic - 2) }
  if (kind.k === 'anger') { p.guna.s = Math.max(0, p.guna.s - 1) }
  if (kind.k === 'heaviness') { p.guna.t += 1; p.psychic = Math.max(0, p.psychic - 1) }
  ev.push({ type: 'samskara', kind: kind.k, message: kind.text })
}

// ── Самадхи ──────────────────────────────────────────────────────────────

/**
 * Самадхи открывается духовной силой — не дыханием. Это ровно то различие,
 * которое провозглашает источник: психическая сила быстрая и низкая,
 * духовная — медленная и высшая.
 */
/**
 * Самадхи — ясность. Полная полоса духовной силы тратится на девять секунд, за
 * которые бой меняется втрое: твой урон ×1.5, твой входящий урон ×0.3, аура не
 * закрывает тебя.
 *
 * **Событие обязательно.** Раньше `checkSamadhi(st)` вызывался БЕЗ массива
 * событий, и вход в ясность проходил молча: полоса силы обнулялась, у оков
 * появлялся белый свет — и всё. Игрок не знал, что это состояние, сколько оно
 * длится и почему бой внезапно стал лёгким. Хуже: когда оно кончалось, бой так
 * же внезапно тяжелел. Окно в девять секунд, меняющее всё, обязано себя
 * называть — иначе оно не ресурс, а погода.
 *
 * @returns {boolean} началась ли ясность
 */
export function checkSamadhi(st, ev = []) {
  const p = st.player
  if (!p.inSamadhi && p.shakti >= st.o.samadhiShakti) {
    p.inSamadhi = true
    p.samadhi = st.o.samadhiTime
    p.shakti = 0
    ev.push({ type: 'samadhi_start', time: st.o.samadhiTime, spent: st.o.samadhiShakti })
    return true
  }
  return false
}

// ── Итог ─────────────────────────────────────────────────────────────────

export function checkOutcome(st, ev = []) {
  if (st.outcome) return st.outcome
  const alive = st.foes.filter((f) => !f.dead && !f.pacified).length

  if (!st.player.alive) {
    st.outcome = 'defeat'
    ev.push({ type: 'defeat' })
    return st.outcome
  }

  // Комната зачищена — открывается ДВЕРЬ. Игрок сам в неё входит: в Hades
  // ты не «выигрываешь комнату», ты из неё уходишь, и следующая комната
  // уже с твоими дарами.
  if (alive === 0 && !st.roomCleared) {
    st.roomCleared = true
    st.door.open = true
    ev.push({ type: 'room_clear', peaceful: st.foes.every((f) => !f.dead) })
  }

  // Вошёл в дверь — комната позади.
  if (st.roomCleared) {
    const d = st.door
    if (Math.hypot(st.player.x - d.x, st.player.y - d.y) < d.r + 14) {
      st.outcome = 'victory'
      st.peaceful = st.foes.every((f) => !f.dead)
      if (st.peaceful) st.score += 300
      ev.push({ type: 'victory', peaceful: st.peaceful, score: st.score })
    }
  }
  return st.outcome
}

export function fieldProgress(st) {
  const total = st.foes.length || 1
  const done = st.foes.filter((f) => f.dead || f.pacified).length
  return { done, total, ratio: done / total, avidya: st.avidya, avidyaRatio: st.avidya / st.o.avidyaMax }
}
