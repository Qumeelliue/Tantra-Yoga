// ПРИЁМЫ УРОВНЕЙ ВАРНЫ (Hades: у оружия с уровнем появляются новые движения).
//
// Что было. Уровень ментальности давал ТОЛЬКО +4 макс. жизни на ступень.
// Лестница из четырёх ступеней читалась как «живучий понемногу», и это был
// ровно тот случай «красиво без последствий», который уже находили в жаре,
// дверях и легендарных дарах.
//
// Проверяется здесь три разные вещи, и их смешение — главная ошибка прошлых
// проверок:
//
//   1. приём СУЩЕСТВУЕТ (три на варну, это видно в коде);
//   2. приём двигает ДРУГОЙ слот, чем приём самой варны — иначе это тот же
//      приём, посчитанный дважды;
//   3. приём стоит на слоте, который замер признал ЖИВЫМ.
//
// Третье — самое важное и самое дорогое: список живых слотов измерен пробой
// (`--slots`), и на мёртвом слоте приём был бы текстом без последствий.
// Проба живых слотов лежит здесь же константой, и сверяется с кодом замера:
// если в бою появится новый слот, проверка потребует его внести, а не
// молча пропустит.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { VARNA_KITS, applyVarna, varnaRiders } from '@webapp/js/core/varnaKits.js'
import { DEFAULT_FIELD_OPTIONS } from '@webapp/js/core/field.js'
import { MENTALITY_ORDER, MENTALITY_LEVELS } from '@webapp/js/core/data.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const sim = read('scripts/fieldBalance.mjs')

const base = () => ({ ...DEFAULT_FIELD_OPTIONS })
const SLOTS = Object.keys(DEFAULT_FIELD_OPTIONS)

/**
 * Слоты ОДНОГО приёма — без базового набора варны.
 *
 * Важно: `applyVarna` применяет и базовый набор, и ступени. Сравнивать его
 * вывод с пустыми опциями нельзя — в разнице всегда будут слоты самой варны
 * (`playerHp` у шудры и так далее), и проверка «приём двигает другой слот»
 * ругалась бы на то, чего приём не касался. Поэтому приём применяется сам по
 * себе, а не через `applyVarna`.
 */
function riderSlots(id, i) {
  const o = base()
  varnaRiders(id)[i](o)
  return SLOTS.filter((k) => o[k] !== base()[k])
}

/**
 * Слоты, которые проба (`--slots`) признала живыми: изменяют исход забега.
 *
 * Отдельно — `coinMul` и `shopDiscount`. Проба даёт по ним «0 и 0» в
 * ПРОХОДИМОСТИ, и это правда: выиграть больше от скидки нельзя. Но они живы
 * в ДЕНЬГАХ, и вайшьины приёмы стоят именно на них. Измерено: 5 → 6 → 9 монет
 * за забег от уровня 0 к уровню 3. Слоты, которые бот не использует
 * (`strikeBonus`, `sevaShield`, `dashCooldown`, `qiOnPacify`, `auraVeilAt`),
 * в список НЕ входят: они мертвы не «для бота», а по-настоящему, и приём
 * на них был бы обещанием без последствий.
 */
const ALIVE = new Set([
  'parryWindow', 'krpaCalm', 'pramaWindow', 'calmRadius', 'bossCalmScale',
  'enemySpeed', 'deflectCalm', 'comboWindow', 'enemyReach', 'enemyCooldown',
  'weakTurn', 'bossTelegraph', 'bossCooldown', 'shieldTurn', 'deflectAvidya',
  'avidyaGainIdle', 'avidyaMax',
  'coinMul', 'shopDiscount',   // живы в деньгах, не в проходимости
])

/** Вайшья — исключение из правила «приём не повторяет приём своей варны». */
const MONEY_VARNA = 'vaeshya'

describe('Уровень варны даёт приёмы, а не только life', () => {
  it('у каждой варны три приёма — по числу ступеней', () => {
    for (const id of MENTALITY_ORDER) {
      expect(varnaRiders(id).length, `${id}: приёмов ${varnaRiders(id).length}, а ступеней ${MENTALITY_LEVELS.length - 1}`)
        .toBe(MENTALITY_LEVELS.length - 1)
    }
  })

  it('каждый приём двигает слот — а не ничего', () => {
    for (const id of MENTALITY_ORDER) {
      varnaRiders(id).forEach((rider, i) => {
        expect(riderSlots(id, i).length, `${id}: приём ${i + 1} ничего не меняет`).toBeGreaterThan(0)
      })
    }
  })

  it('приём уровня НЕ повторяет приём своей варны', () => {
    // Главная проверка. Если уровень усиливает тот же слот, что и сама
    // варна, то ступень — это тот же приём, посчитанный дважды: игрок видит
    // «новый приём», а получает «тот же приём, но чуть сильнее». Ровно та
    // болезнь, что нашлась в легендарных дарах.
    //
    // ИСКЛЮЧЕНИЕ — вайшья. Её набор целиком про деньги (`coinMul`,
    // `shopDiscount`), и её лестница в карточном пути тоже про скидки в
    // лавке. Требовать от неё «нового приёма» значило бы сделать её не
    // вайшьей. Вместо запрета требуется, чтобы приём УГЛУБЛЯЛ её же
    // размерность, а не повторял: значение обязано расти, а не быть тем же.
    for (const id of MENTALITY_ORDER) {
      const own = applyVarna(base(), id, 0)
      const ownSlots = SLOTS.filter((k) => own[k] !== base()[k])
      expect(ownSlots.length, `${id}: у варны нет своего приёма — нечего проверять`).toBeGreaterThan(0)
      varnaRiders(id).forEach((rider, i) => {
        const o = base()
        rider(o)
        for (const s of riderSlots(id, i)) {
          if (!ownSlots.includes(s)) continue
          expect(
            id, `${id}, приём ${i + 1}: двигает «свой» слот «${s}» — это не вайшья и не ${MONEY_VARNA}, а тот же приём дважды`,
          ).toBe(MONEY_VARNA)
          // Углубление проверяется НАКОПЛЕННО: приём применяется поверх
          // базового набора, поэтому в одиночку он даёт 0.15, а в бою —
          // 0.5 + 0.15 = 0.65. Считать надо по тому, что видит бой.
          const atLevel = applyVarna(base(), id, i + 1)[s]
          const beforeLevel = applyVarna(base(), id, i)[s]
          expect(
            atLevel, `${id}, приём ${i + 1}: слот «${s}» не углублён (${beforeLevel} → ${atLevel})`,
          ).toBeGreaterThan(beforeLevel + 0.001)
        }
      })
    }
  })

  it('приём стоит на ЖИВОМ слоте — измеренном пробой', () => {
    for (const id of MENTALITY_ORDER) {
      varnaRiders(id).forEach((rider, i) => {
        for (const s of riderSlots(id, i)) {
          expect(
            ALIVE.has(s),
            `${id}, приём ${i + 1}: слот «${s}» не признан живым пробой — приём будет текстом без последствий. Живые: ${[...ALIVE].join(', ')}`,
          ).toBe(true)
        }
      })
    }
  })

  it('приёмы не заводят новых слотов боя', () => {
    for (const id of MENTALITY_ORDER) {
      for (let lv = 1; lv <= MENTALITY_LEVELS.length - 1; lv++) {
        const o = applyVarna(base(), id, lv)
        expect(SLOTS.filter((k) => !(k in DEFAULT_FIELD_OPTIONS)), `${id} ур.${lv} заводит новый слот`)
          .toEqual([])
      }
    }
  })

  it('ступени накапливаются, а не заменяют друг друга', () => {
    // Уровень 3 обязан быть сильнее уровня 1 на КАЖДОМ слоте, который он
    // трогает. Иначе ранг 2 или 3 стирал бы предыдущий — и покупка ступени
    // была бы платой за воздух (ровно как с рангом нефрита).
    for (const id of MENTALITY_ORDER) {
      const one = applyVarna(base(), id, 1)
      const three = applyVarna(base(), id, 3)
      const firstRider = SLOTS.filter((k) => one[k] !== base()[k])
      for (const s of firstRider) {
        const grew = id === 'vaeshya'
          ? three[s] > one[s]                    // деньги: больше
          : Math.abs(three[s] - base()[s]) >= Math.abs(one[s] - base()[s])
        expect(grew, `${id}: ур.3 по слоту «${s}» слабее ур.1 (${one[s]} → ${three[s]})`).toBe(true)
      }
    }
  })

  it('уровень передаётся в бой — и в игре, и в замере', () => {
    // Уровень приходит третьим аргументом. Без этого замер мерил бой
    // нулевого уровня, а игрок видел совсем другой.
    const main = read('webapp/js/main.js')
    expect(main).toContain('applyVarna(base, vId, vLv)')
    expect(sim).toContain('applyVarna(base, varna, VARNA_LV)')
  })

  it('у замера есть режим парного сравнения уровней', () => {
    // Варна в забеге случайна, поэтому «прогон уровня 0» и «прогон уровня 3»
    // — разные наборы забегов. Первый замер дал 53 → 65 → 52 → 60 %, что
    // выглядело лестницей и было шумом.
    expect(sim).toContain('--vpairs')
    expect(sim).toContain('--varna-fix=')
  })

  it('вайшьины приёмы про деньги, а не про бой — и это сказано', () => {
    // Её лестница и в карточном пути про скидки. Проба слотов даёт по
    // `coinMul` и `shopDiscount` «0 и 0» в проходимости, и это правда.
    const src = read('webapp/js/core/varnaKits.js')
    const at = src.indexOf('// Мудрость — в обращении с тем, что есть')
    expect(at, 'у вайшьи нет пояснения, почему её приёмы про деньги').toBeGreaterThan(-1)
    expect(src.slice(at, at + 1200)).toContain('проходимости')
    const three = applyVarna(base(), 'vaeshya', 3)
    expect(three.coinMul, 'уровень 3 не даёт больше монет').toBeGreaterThan(base().coinMul)
    expect(three.shopDiscount, 'уровень 3 не даёт скидки').toBeGreaterThan(0)
  })
})