import { describe, it, expect } from 'vitest'
import { KEEPSAKES, KEEPSAKE_BY_ID, applyKeepsake, keepsakeLevelCost,
  KEEPSAKE_MAX_LEVEL, KEEPSAKE_LEVEL_COST } from '@webapp/js/core/keepsakes.js'
import { DEFAULT_FIELD_OPTIONS } from '@webapp/js/core/field.js'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const main = read('webapp/js/main.js')
const sim = read('scripts/fieldBalance.mjs')

const nums = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number'))
const noNaN = (o, where) => {
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'number') expect(Number.isFinite(v), `${where}: ${k} = ${v}`).toBe(true)
  }
}

describe('Ранг нефрита (Hades: Purifying Quartz, 8 рангов хранилища)', () => {
  it('у каждого нефрита есть шаг ранга — иначе ранг был бы подписью', () => {
    for (const k of KEEPSAKES) {
      expect(typeof k.step, `${k.id}: нет шага ранга`).toBe('function')
    }
  })

  it('ранг 8 сильнее ранга 1 по каждому нефриту, и ни одна величина не ломается', () => {
    for (const k of KEEPSAKES) {
      const a = nums(applyKeepsake({}, k.id, 1))
      const b = nums(applyKeepsake({}, k.id, KEEPSAKE_MAX_LEVEL))
      noNaN(a, `${k.id} ранг 1`)
      noNaN(b, `${k.id} ранг ${KEEPSAKE_MAX_LEVEL}`)
      const stronger = Object.keys(a).some((key) => b[key] > a[key])
      expect(stronger, `${k.id}: ранг ${KEEPSAKE_MAX_LEVEL} не сильнее первого`).toBe(true)
    }
  })

  it('ранг не делает сильнее того, что названо ценой', () => {
    // У «Вивеки» и «Аханкары» цена названа в описании. Если бы ранг усиливал
    // только пользу, высокий ранг стал бы подарком: игрок платил бы и за
    // силу, и получал её бесплатно. Поэтому обе стороны растут вместе.
    const v1 = applyKeepsake({}, 'viveka', 1), v8 = applyKeepsake({}, 'viveka', KEEPSAKE_MAX_LEVEL)
    expect(v8.deflectCalm).toBeGreaterThan(v1.deflectCalm)
    expect(v8.avidyaGainIdle).toBeGreaterThan(v1.avidyaGainIdle)
    const a1 = applyKeepsake({}, 'ahankara', 1), a8 = applyKeepsake({}, 'ahankara', KEEPSAKE_MAX_LEVEL)
    expect(a8.playerHp).toBeGreaterThan(a1.playerHp)
    expect(a8.avidyaGainStrike).toBeGreaterThan(a1.avidyaGainStrike)
  })

  it('ранг не ломает уже выбранное: опции остаются полными', () => {
    for (const k of KEEPSAKES) {
      const o = applyKeepsake({ mantraCost: 3 }, k.id, KEEPSAKE_MAX_LEVEL)
      expect(o.mantraCost, `${k.id}: переданная величина пропала`).toBe(3)
      expect(Object.keys(o).length).toBeGreaterThanOrEqual(Object.keys(DEFAULT_FIELD_OPTIONS).length)
    }
  })

  it('цена растёт и обрывается на высшем ранге', () => {
    expect(KEEPSAKE_MAX_LEVEL).toBe(8)
    expect(keepsakeLevelCost(1), 'цена второго ранга').toBe(KEEPSAKE_LEVEL_COST[1])
    // Цены сравниваются только между СУЩЕСТВУЮЩИМИ переходами: `cost(8)` —
    // это уже `null` («высший ранг купить нельзя»), и сравнивать его как
    // число бессмысленно. Этот обрыв и есть часть цены: нельзя докупить.
    for (let lv = 1; lv + 1 < KEEPSAKE_MAX_LEVEL; lv++) {
      expect(keepsakeLevelCost(lv + 1), `ранг ${lv + 1} должен быть дороже ${lv}`)
        .toBeGreaterThan(keepsakeLevelCost(lv))
    }
    expect(keepsakeLevelCost(KEEPSAKE_MAX_LEVEL), 'высший ранг должен быть недоступен для покупки').toBeNull()
  })

  it('испорченный ранг из сохранения не ломает бой', () => {
    for (const bad of [0, -3, 99, NaN, undefined, 'четыре']) {
      const o = applyKeepsake({}, 'prana', bad)
      noNaN(o, `ранг ${String(bad)}`)
      expect(o.psychicMax).toBeGreaterThan(DEFAULT_FIELD_OPTIONS.psychicMax)
      expect(o.psychicMax).toBeLessThanOrEqual(applyKeepsake({}, 'prana', 8).psychicMax)
    }
  })

  it('игра надевает нефрит того ранга, который куплен', () => {
    expect(main).toContain('applyKeepsake(applyAspect(applyVarna(base, vId, vLv), app.runAspect), app.runKeepsake, app.runKeepsakeLv)')
    expect(main, 'ранг не сбрасывается вместе с нефритом')
      .toContain('app.runKeepsake = null; app.runKeepsakeLv = null')
    expect(main, 'ранг не выбирается на экране выбора').toContain('app.runKeepsakeLv = lvOf(k.id)')
    expect(main, 'нефрит за испытание должен выдавать купленный ранг')
      .toContain('app.runKeepsakeLv = Math.max(1, meta.keepsakeLv?.[k.id] || 1)')
    expect(main, 'ранг покупается амбросией').toContain('meta.keepsakeLv = { ...(meta.keepsakeLv || {}), [k.id]: lvOf(k.id) + 1 }')
  })

  it('замер умеет надевать ранг — иначе цены в таблице выдуманы', () => {
    // Тот же класс, что с calmMul и с лимитом небоевых дверей: измеритель,
    // который не повторяет правило игры, даёт числа не про ту игру.
    expect(sim).toContain('--jade')
    expect(sim).toContain('applyKeepsake(applyVarna(base, varna, VARNA_LV), keepsake, JADE_LV)')
  })
})