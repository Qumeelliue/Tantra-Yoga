// ПОЛЕ УМА НЕ КОРМИЛО МЕНТАЛЬНОСТИ (2026-09-30, сессия 25 ч.7).
//
// Что было. Очки ментальности начисляли ЧЕТЫРЕ места, и все четыре —
// в карточном пути: победа в бою колоды, узел практики, припоминание цитаты
// и трата Праны в лавке. `settleFieldRoom` — расчёт комнаты Поля Ума — не
// начислял ничего.
//
// Что это значит для игрока. Поле Ума — главный круг игры, туда игрок ходит
// каждый день. Отыграй хоть сто забегов поля: уровень варны и «Свет в
// площадях» не сдвинутся. Механика росла — но не от того, чем играли.
//
// Почему проверка сложнее, чем «есть вызов addVarnaPoints». Вызовы в коде
// были и остались — просто ни один из них не был на пути Поля Ума. Поэтому
// проверяется именно связка «функция расчёта комнаты поля → рост очков», а
// не наличие символа в файле.
//
// Второе, что проверяется здесь же: замер поля не применял уровень варны
// вообще (`playerHp: 60`), то есть проценты проходимости считались по бою, в
// котором прокачанный игрок никогда не стоит.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { MENTALITY_ORDER, MENTALITY_LEVELS } from '@webapp/js/core/data.js'
import { addVarnaPoints, EMPTY_META, varnaState } from '@webapp/js/core/save.js'
import { createField } from '@webapp/js/core/field.js'
import { floorVarnaFood } from '@webapp/js/core/mentalityFood.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const main = read('webapp/js/main.js')
const food = read('webapp/js/core/mentalityFood.js')
const sim = read('scripts/fieldBalance.mjs')

/** Комната Поля Ума после боя: оковы сняты, у одной есть смысл. */
function settledRoom({ served = false, broken = 0, learned = true } = {}) {
  const meta = EMPTY_META()
  const foes = []
  for (let i = 0; i < 2; i++) {
    foes.push({
      pacified: true, dead: false,
      def: learned && i === 0 ? { quoteId: 'ahimsa' } : {},
    })
  }
  for (let i = 0; i < broken; i++) foes.push({ pacified: false, dead: true, def: {} })
  const st = { foes, served: new Set(served ? ['ware-1'] : []), __settled: false }
  return { meta, st }
}

/**
 * Начисление — НАСТОЯЩИМ правилом игры, без экранов.
 *
 * Здесь была своя копия правила, и копия была СТАРОЙ: очки за комнату, без
 * потолка. Игра давно считает раз за чакру (`settleFloor`), потолок различения
 * и присутствия — два. Пока правило жило внутри `main.js`, взять его было
 * нельзя, и проверка повторяла его у себя. Теперь правило в
 * `core/mentalityFood.js`, и проверка зовёт его — вместе с игрой и замером.
 *
 * Сравниваются ОЧКИ, а не уровень: уровень — ступень лестницы, и в первых
 * чакрах он не растёт вовсе, даже когда очки честно капают.
 */
function settleLikeGame(meta, st) {
  const before = { ...(meta.varnas || {}) }
  // Факты комнаты — как их копит `settleFieldRoom`.
  const pacified = st.foes.filter((f) => f.pacified)
  const facts = {
    varnaPacifiedRooms: pacified.length ? 1 : 0,
    varnaBloodlessRooms: (pacified.length && !st.foes.some((f) => f.dead)) ? 1 : 0,
    varnaServedRooms: (st.served && st.served.size > 0) ? 1 : 0,
    varnaLearned: 0,
  }
  for (const f of pacified) {
    const qid = f.def && f.def.quoteId
    if (qid && !(meta.lived && meta.lived[qid])) {
      meta.lived = meta.lived || {}
      meta.lived[qid] = true
      facts.varnaLearned++
    }
  }
  // Очки — правилом игры, раз за чакру.
  for (const [kind, n] of floorVarnaFood(facts)) addVarnaPoints(meta, kind, n)
  return MENTALITY_ORDER.filter((k) => (meta.varnas[k] || 0) > (before[k] || 0))
}

describe('Поле Ума кормит ментальности', () => {
  it('чистая комната без единого удара растит и смелость, и различение', () => {
    const { meta, st } = settledRoom()
    const grew = settleLikeGame(meta, st)
    expect(grew, 'после комнаты Поля Ума не выросла ни одна ментальность').toContain('kshatriya')
    expect(grew, 'узнанный смысл оковы не кормит различение').toContain('vipra')
  })

  it('сева кормит присутствие', () => {
    const { meta, st } = settledRoom({ served: true })
    expect(settleLikeGame(meta, st)).toContain('shudra')
  })

  it('комната, где только кровь, не растит никого', () => {
    // Все оковы сломаны, ни одна не снята терпением: смелость здесь
    // нечего кормить, а знание нечего узнавать. Наивная версия начисляла
    // очки за «комнату пройдена», и мирный путь переставал бы отличаться
    // от силового.
    const meta = EMPTY_META()
    const st = { foes: [{ pacified: false, dead: true, def: {} }], served: new Set(), __settled: false }
    expect(settleLikeGame(meta, st)).toEqual([])
  })

  it('сломанная ока уменьшает награду за комнату вдвое', () => {
    // Одна и та же комната — две оковы сняты терпением — но в одном случае
    // рядом ещё лежит сломанная. Награда за смелость должна упасть вдвое:
    // освобождение без крови стоит дороже, чем освобождение с кровью.
    const clean = settledRoom()
    const blood = settledRoom()
    blood.st.foes.push({ pacified: false, dead: true, def: {} })
    const a = EMPTY_META(), b = EMPTY_META()
    settleLikeGame(a, clean.st)
    settleLikeGame(b, blood.st)
    const gained = (m, k) => (m.varnas[k] || 0)
    expect(gained(a, 'kshatriya'), 'чистая комната').toBe(2)
    expect(gained(b, 'kshatriya'), 'комната с кровью').toBe(1)
  })

  it('повторно узнанный смысл не платит дважды', () => {
    // Иначе одна и та же ока кормила бы различение каждой комнатой, и
    // ментальность росла бы быстрее всех остальных.
    const { meta, st } = settledRoom()
    settleLikeGame(meta, st)
    const first = meta.varnas.vipra
    settleLikeGame(meta, st)
    expect(meta.varnas.vipra, 'смысл засчитан повторно').toBe(first)
  })

  it('мудрость кормит вложенное в лавке поля, а не накопленное', () => {
    // В карточном пути это трата Праны. Здесь — покупка за монеты. Бесплатный
    // дар не считается: вложить было нечего.
    expect(main).toContain("if (price > 0) gainMentality('vaeshya', 1, { silent: true })")
    // И НЕ кормит сам факт наличия монет: начисление должно быть в ветке
    // покупки, а не в `collectCoins`.
    const collect = main.slice(main.indexOf('function collectCoins'), main.indexOf('function collectCoins') + 400)
    expect(collect, 'монеты кормят мудрость сами по себе — это накопление, а не трата')
      .not.toContain('gainMentality')
  })

  it('подъём ментальности виден игроку один раз за комнату', () => {
    // Четыре ментальности могут вырасти в одной комнате (снял оку, узнал
    // смысл, постоял на севе) — четыре тоста подряд были бы шумом.
    expect(main).toContain('function flushVarnaToast')
    expect(main).toMatch(/grew\.map\(\(g\) => g\.name\)\.join\(' · '\)/)
  })

  it('в расчёте комнаты поля копятся факты — а очки идут раз за чакру', () => {
    // Единица — чакра, не комната. По комнате лестница вырождалась: 28 очков
    // смелости за забег при пороге третьей ступени 18, то есть потолок
    // падал на первом же забеге и вся лестница из четырёх ступеней была
    // одной ступенью.
    const roomFn = main.slice(main.indexOf('function settleFieldRoom'), main.indexOf('function settleFieldRoom') + 6000)
    expect(roomFn, 'settleFieldRoom не копит факты для очков ментальности')
      .toContain('varnaPacifiedRooms')
    const floorFn = main.slice(main.indexOf('function settleFloor'), main.indexOf('function settleFloor') + 2000)
    expect(floorFn, 'settleFloor не начисляет очки ментальности')
      .toContain('floorVarnaFood')
  })

  it('факты чакры обнуляются — иначе чакры суммируются', () => {
    const floorFn = main.slice(main.indexOf('function settleFloor'), main.indexOf('function settleFloor') + 2000)
    for (const f of ['varnaPacifiedRooms', 'varnaBloodlessRooms', 'varnaServedRooms', 'varnaLearned']) {
      expect(floorFn, `${f} не обнуляется на новой чакре`).toContain(`${f} = 0`)
    }
  })

  it('проверка берёт НАСТОЯЩЕЕ правило, а не пересказ', () => {
    // Поломка, найденная в сессии 27: тест повторял правило у себя — причём
    // СТАРУЮ его версию (очки за комнату, без потолка). Он был зелёный, и
    // при этом проверял не то, чем играет человек. Это МЕХАНИКА 43 в
    // проверках: «покрыто» — а измерено не то.
    //
    // Проверяется не «файл существует», а то, что правило читают ВСЕ трое:
    // игра, замер и сама проверка. Останется двое — и снова появится копия.
    expect(main, 'игра не зовёт общее правило').toContain('floorVarnaFood(run)')
    expect(sim, 'замер не зовёт общее правило').toContain('floorVarnaFood({')
    expect(sim, 'замер держит свою копию правила').not.toMatch(/MENTAL\.kshatriya \+=/)
    expect(sim, 'замер держит свою копию правила').not.toMatch(/Math\.min\(FLOORFOOD\.learned, 2\)/)
  })

  it('единица Поля Ума — чакра: по комнате лестница вырождается', () => {
    // Восемь комнат за чакру, и лестница из четырёх ступеней. Начисляя по
    // комнате, игрок получил бы 8–16 очков за чакру — замерено 28 за забег
    // при пороге третьей ступени 18. То есть вся лестница была одной ступенью,
    // а ментальность росла не от того, чем игрок занимался.
    //
    // Проверяется на настоящем правиле: восемь «комнат с окой» внутри одной
    // чакры всё равно дают 1–2 очка.
    const ROOMS_PER_CHAKRA = 8
    const clean = floorVarnaFood({ varnaPacifiedRooms: ROOMS_PER_CHAKRA, varnaBloodlessRooms: ROOMS_PER_CHAKRA })
    const bloody = floorVarnaFood({ varnaPacifiedRooms: ROOMS_PER_CHAKRA })
    const k = (rows) => rows.find(([key]) => key === 'kshatriya')[1]
    expect(k(clean), 'чистая чакра').toBe(2)
    expect(k(bloody), 'чакра с кровью').toBe(1)
    // А если бы правило снова стало комнатным, чакра заплатила бы в 8 раз
    // больше. Считаем явно, чтобы падение теста объясняло, ЧТО именно сломано.
    const perRoomRule = ROOMS_PER_CHAKRA * 1
    expect(k(clean), 'правило снова комнатное — лестница выродится')
      .toBeLessThan(perRoomRule)
  })

  it('различение и присутствие ограничены двумя за чакру', () => {
    // Иначе присутствие росло бы вдвое быстрее прочих, а рост должен быть
    // ПАРАЛЛЕЛЬНЫМ (§12): четыре ментальности развиваются вместе, и отстающая
    // тянет остальных вниз.
    expect(floorVarnaFood({ varnaLearned: 9 })).toEqual([['vipra', 2]])
    expect(floorVarnaFood({ varnaServedRooms: 9 })).toEqual([['shudra', 2]])
  })

  it('чистая чакра стоит вдвое больше — это единственная награда за кровь', () => {
    expect(floorVarnaFood({ varnaPacifiedRooms: 1, varnaBloodlessRooms: 1 }))
      .toEqual([['kshatriya', 2]])
    expect(floorVarnaFood({ varnaPacifiedRooms: 1, varnaBloodlessRooms: 0 }))
      .toEqual([['kshatriya', 1]])
  })

  it('лестница не вырождается: потолок не падает на первом забеге', () => {
    // Замерено `npm run varna-rate`: Поле Ума даёт ~12 очков смелости за
    // забег, карточный путь — ~23. Значит потолок лестницы обязан быть
    // заметно выше 18, иначе верхняя ступень недостижима как ступень.
    const TOP = MENTALITY_LEVELS[MENTALITY_LEVELS.length - 1]
    expect(TOP, `потолок ${TOP} очков — он берётся за один забег, лестница вырождена`)
      .toBeGreaterThan(60)
  })
})

describe('Замер поля считает бой, в котором игрок реально стоит', () => {
  it('уровень варны доходит до опций боя', () => {
    // Раньше в замере стояло ровно `playerHp: 60` — ни уровня, ни бонуса
    // ментальности к жизни. То есть все проценты проходимости поля были
    // посчитаны по бою без прокачки.
    expect(sim, 'замер не применяет уровень варны').toMatch(/playerHp: 60 \+ \(lv \* 4\)/)
    expect(sim, 'замер не читает бонус варны к жизни').toContain('MENTALITIES[varna]')
  })

  it('в замере есть флаг уровня — иначе его нечем проверить', () => {
    expect(sim).toContain('--varna=')
    expect(sim).toContain('уровень варны')
  })
})

describe('Четыре ментальности растут параллельно, а не одна', () => {
  it('у каждой есть своя пища в Поле Ума', () => {
    // Правило вынесено в `core/mentalityFood.js` — и это проверяется тоже:
    // вернуть его внутрь `main.js` значит снова получить проверку, которая
    // повторяет правило у себя и спокойно проверяет мёртвую копию.
    expect(main, 'правило вернулось в main.js — проверка снова станет копией').not.toContain('function floorVarnaFood')
    const fn = food
    for (const k of ['kshatriya', 'vipra', 'shudra']) {
      expect(fn, `ментальность ${k} не имеет пищи в Поле Ума`).toContain(`'${k}'`)
    }
    // Вайшья — в лавке, поэтому в этой функции её нет.
    expect(main).toContain("gainMentality('vaeshya', 1, { silent: true })")
  })

  it('пища названа теми же словами, что и в карточном пути', () => {
    // Смелость — за освобождение. Различение — за знание. Присутствие — за
    // труд. Мудрость — за осознанную трату. Срез берётся ДО ключевого слова
    // функции, чтобы попасть и в её объяснение.
    const at = food.indexOf('ПИЩА ДЛЯ МЕНТАЛЬНОСТЕЙ')
    expect(at, 'у правила нет объяснения').toBeGreaterThan(-1)
    const fn = food.slice(at, at + 4000)
    expect(fn).toContain('Смелость')
    expect(fn).toContain('Различение')
    expect(fn).toContain('Присутствие')
    expect(fn).toContain('Мудрость')
  })
})