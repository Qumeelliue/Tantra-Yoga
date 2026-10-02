// ПОЧЕРК (Hades: weapon aspects) — второй слой выбора поверх варны.
//
// Проверяется то, что делает почерк выбором, а не украшением:
//
//   1. **у каждой варны есть почерки** — иначе «выбери почерк» превращается в
//      экран с одной кнопкой;
//   2. **почерк — развилка с обеими сторонами**: и сила, и цена. Почерк без
//      цены просто лучше, а значит не выбор;
//   3. **меняет только существующие величины** (тот же закон, что у даров);
//   4. **у почерка есть цитата из шастр** — правило проекта;
//   5. **почерк не переживает забег** — иначе после смерти игрок continued бы
//      играть не тем, чем начал;
//   6. **применяется после варны и до нефрита** — порядок слоёв зафиксирован,
//      и перестановка тихо меняла бы смысл выбора.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ASPECTS, aspectsFor, aspectById, applyAspect } from '@webapp/js/core/aspects.js'
import { VARNA_KITS } from '@webapp/js/core/varnaKits.js'
import { DEFAULT_FIELD_OPTIONS } from '@webapp/js/core/field.js'
import { QUOTES } from '@webapp/js/core/data.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const main = read('webapp/js/main.js')
const base = read('design/BASE-GAME.md')

describe('Почерк: у каждой варны есть развилка', () => {
  it('у всех четырёх варн есть почерки, и их не меньше двух', () => {
    for (const varna of Object.keys(VARNA_KITS)) {
      expect(aspectsFor(varna).length, `${varna}: почерков`).toBeGreaterThanOrEqual(2)
    }
  })

  it('id уникальны — иначе два почерка слиплись бы в один', () => {
    const ids = Object.values(ASPECTS).flat().map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('несуществующий почерк — это null, а не тихий no-op с чужим эффектом', () => {
    expect(aspectById('нет-такого')).toBeNull()
    const none = applyAspect({ ...DEFAULT_FIELD_OPTIONS }, 'нет-такого')
    expect(none.parryWindow).toBe(DEFAULT_FIELD_OPTIONS.parryWindow)
  })
})

describe('Почерк — развилка, а не «лучше»', () => {
  it('у каждого есть и польза, и цена, и обе названы игроку', () => {
    for (const list of Object.values(ASPECTS)) {
      for (const a of list) {
        expect(a.gain, `${a.id}: нет пользы`).toBeTruthy()
        expect(a.cost, `${a.id}: нет цены — значит это просто «лучше»`).toBeTruthy()
        expect(a.desc, `${a.id}: нет описания`).toBeTruthy()
        expect(a.field, `${a.id}: не сказано, что меняется в бою`).toBeTruthy()
      }
    }
  })

  it('каждый почерк реально меняет бой и меняет БОЛЬШЕ одного слота', () => {
    // Один слот — это не почерк, это мини-усиление. Развилка — это когда
    // игрок жертвует одним ради другого.
    for (const list of Object.values(ASPECTS)) {
      for (const a of list) {
        const before = { ...DEFAULT_FIELD_OPTIONS }
        const after = applyAspect(before, a.id)
        const changed = Object.keys(after).filter((k) => after[k] !== before[k])
        expect(changed.length, `${a.id}: меняет ${changed.length} величин`).toBeGreaterThanOrEqual(2)
        expect(Object.keys(after).filter((k) => !(k in before)), `${a.id}: ввёл новый слот`).toEqual([])
      }
    }
  })

  it('почерки различаются тем, что и на что меняют, — иначе это не выбор', () => {
    // Считается не «лучше/хуже» (у почерков разные валюты, и одна шкала была бы
    // выдумкой), а ПОДПИСЬ: какие слоты тронуты и в какую сторону. Восемь
    // одинаковых подписей означали бы, что выбор ничего не выбирает.
    const sig = (id) => {
      const before = { ...DEFAULT_FIELD_OPTIONS }
      const after = applyAspect(before, id)
      return Object.keys(after)
        .filter((k) => after[k] !== before[k])
        .sort()
        .map((k) => `${k}${after[k] > before[k] ? '+' : '-'}`)
        .join(',')
    }
    const sigs = Object.values(ASPECTS).flat().map((a) => sig(a.id))
    expect(new Set(sigs).size, 'почерки меняют одно и то же').toBe(sigs.length)
  })

  it('у почерков разные выгоды — а не только разные цены', () => {
    const gains = new Set(Object.values(ASPECTS).flat().map((a) => a.gain))
    expect(gains.size, 'выгоды повторяются').toBe(Object.values(ASPECTS).flat().length)
  })
})

describe('Почерк настоящий и живёт по законам проекта', () => {
  it('у каждого почерка есть цитата из шастр', () => {
    for (const list of Object.values(ASPECTS)) {
      for (const a of list) {
        expect(a.quoteId, `${a.id}: без цитаты`).toBeTruthy()
        expect(QUOTES[a.quoteId], `${a.id}: цитаты ${a.quoteId} нет в корпусе`).toBeTruthy()
      }
    }
  })

  it('числа почерка остаются конечными', () => {
    // Слой применяется в цепочке варна → почерк → нефрит; NaN здесь тихо
    // портит весь бой, и заметить это можно только замером.
    for (const list of Object.values(ASPECTS)) {
      for (const a of list) {
        const o = applyAspect({ ...DEFAULT_FIELD_OPTIONS }, a.id)
        for (const [k, v] of Object.entries(o)) {
          if (typeof v === 'number') expect(Number.isFinite(v), `${a.id}: ${k} = ${v}`).toBe(true)
        }
      }
    }
  })

  it('входные опции не мутируются', () => {
    const src = { ...DEFAULT_FIELD_OPTIONS }
    applyAspect(src, Object.values(ASPECTS)[0][0].id)
    expect(src.parryWindow).toBe(DEFAULT_FIELD_OPTIONS.parryWindow)
  })

  it('выбирается ПОСЛЕ оружия и ДО нефрита, и экран существует', () => {
    expect(main).toContain('function showAspectSelect(varnaId)')
    expect(main).toContain('showFountain()')
    // Порядок слоёв в бою: варна → почерк → нефрит → дары → мастерская.
    expect(main).toContain('applyKeepsake(applyAspect(applyVarna(base, vId, vLv), app.runAspect)')
  })

  it('почерк не переживает забег', () => {
    // Иначе после смерти игрок продолжил бы играть не тем, чем начал, а
    // «Вершина Света» показывала бы не тот почерк, которым дошли.
    expect(main, 'почерк не сбрасывается на смерти').toMatch(/app\.runAspect = false|app\.runAspect = null/)
  })

  it('записан в BASE-GAME со своим источником', () => {
    expect(base).toContain('МЕХАНИКА 54')
    expect(base).toContain('weapon aspects')
  })
})