// ЦИФРЫ НА КАРТОЧКЕ ДОЛЖНЫ БЫТЬ ЦИФРАМИ В БОЮ.
//
// Тот же класс, что щит и самадхи: экран обещает, код отдаёт. Здесь проверяется
// ВСЁ содержимое разом — 14 даров, 8 нефритов, 12 усилений мастерской.
//
// Что было найдено. «Дар Тапаха · легендарный» обещал «бьёт на **7** сильнее»,
// а код давал `strikeBonus += 6`. Разница в единицу, но обещание — это
// обещание: игрок считает по карточке.
//
// Почему это не ловилось раньше. Проверка `audit:impact` отвечает на вопрос
// «эта награда вообще меняет то, что бой читает» — и отвечает верно. Но она не
// отвечает на вопрос «совпадает ли ЧИСЛО на карточке с числом в бою». Между
// «меняет» и «меняет на обещанное» — пропасть, и весь проект про неё.
//
// Проверка применяет награду НАСТОЯЩИМ способом (через `applyBoons` и прочие
// цепочки) и сверяет каждое число из описания с тем, что реально получилось.
// Первый вариант звал `apply` на пустом объекте и получал `NaN` почти у всего —
// и это было ложной тревогой: настоящая цепочка заполняет значения по
// умолчанию и страхует результат. Проверка обязана идти путём игры.

import { describe, it, expect } from 'vitest'
import { BOONS, applyBoons } from '@webapp/js/core/boons.js'
import { KEEPSAKES, applyKeepsake } from '@webapp/js/core/keepsakes.js'
import { WORKSHOP, applyUpgrades } from '@webapp/js/core/workshop.js'
import { applyVarna, VARNA_KITS } from '@webapp/js/core/varnaKits.js'
import { DEFAULT_FIELD_OPTIONS } from '@webapp/js/core/field.js'

/** Числа, которые встречаются в описаниях и обязаны быть настоящими. */
function numbersIn(text) {
  return [...String(text || '').matchAll(/\d+(?:[.,]\d+)?/g)]
    .map((m) => Number(m[0].replace(',', '.')))
    // Числа больше 40 — это не параметры боя, а уровни, ранги и счётчики
    // («из 104 цитат», «ранг 8», «8 владык»). Они правдивы отдельно.
    .filter((n) => n <= 40)
}

/**
 * Числа, которые можно честно предъявить награде: значения тех опций, которые
 * она ИЗМЕНИЛА, плюс их прежние значения (описание «Запас Ци выше: 12 → 16»
 * упоминает оба).
 *
 * Первая версия брала ВСЕ опции подряд, и проверка пропускала заведомую ложь:
 * число 7 находилось где-то в наборе, и карточка «бьёт на 7» проходила, хотя
 * код давал 6. Проверка, которая берёт всё сразу, не проверяет ничего —
 * она спрашивает «есть ли это число вообще», а надо «стало ли оно тем».
 */
function numbersThisRewardTouched(opts) {
  const out = new Set()
  for (const [k, v] of Object.entries(opts)) {
    const before = DEFAULT_FIELD_OPTIONS[k]
    if (v === before) continue                 // награда это не трогала
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    // Прежнее значение — тоже можно предъявить: описание «Запас Ци выше:
    // 12 → 16» цитирует его. Первая версия брала только новое, и четыре честных
    // описания падали как ложь.
    if (typeof before === 'number' && Number.isFinite(before)) {
      out.add(before); out.add(Math.abs(before)); out.add(Math.round(before))
    }
    for (const n of [v, Math.abs(v), Math.round(v), Math.round(v * 10) / 10,
      Math.abs(v - (typeof before === 'number' ? before : 0)),
      Math.round(Math.abs(v - (typeof before === 'number' ? before : 0)))]) {
      if (Number.isFinite(n)) out.add(n)
    }
  }
  return out
}

const base = () => ({ playerHp: 60 })

const GROUPS = [
  ['дар чакры', BOONS, (id) => applyBoons(base(), [id])],
  ['нефрит', KEEPSAKES, (id) => applyKeepsake(base(), id, 1)],
  ['усиление мастерской', WORKSHOP, (id) => applyUpgrades(base(), [id])],
]

describe('Число на карточке — это число в бою', () => {
  for (const [group, list, apply] of GROUPS) {
    for (const item of list) {
      const nums = numbersIn(item.desc)
      if (!nums.length) continue
      it(`${group} «${item.name}»: ${nums.join(', ')}`, () => {
        const opts = apply(item.id)
        const known = numbersThisRewardTouched(opts)
        // Сначала — награда вообще должна давать число, а не NaN.
        for (const v of Object.values(opts)) {
          if (typeof v === 'number') {
            expect(Number.isFinite(v), `награда «${item.name}» дала NaN`).toBe(true)
          }
        }
        const missing = nums.filter((n) => !known.has(n))
        expect(missing, `«${item.desc}» — а эта награда меняет только: ${[...known].sort((a, b) => a - b).join(', ') || '(ничего)'}`)
          .toEqual([])
      })
    }
  }
})

describe('Каждая награда что-то меняет', () => {
  for (const [group, list, apply] of GROUPS) {
    for (const item of list) {
      it(`${group} «${item.name}» меняет опцию боя`, () => {
        const opts = apply(item.id)
        const changed = Object.entries(opts).filter(([k, v]) => v !== DEFAULT_FIELD_OPTIONS[k])
        expect(changed.length, `«${item.name}» не меняет ничего`).toBeGreaterThan(0)
      })
    }
  }
})

describe('Каждая варна меняет опцию боя', () => {
  for (const [id, kit] of Object.entries(VARNA_KITS)) {
    it(`варна «${id}» меняет опцию боя`, () => {
      const opts = applyVarna(base(), id, 0)
      const changed = Object.entries(opts).filter(([k, v]) => v !== DEFAULT_FIELD_OPTIONS[k])
      expect(changed.length, `варна «${id}» не меняет ничего`).toBeGreaterThan(0)
    })
  }
})
