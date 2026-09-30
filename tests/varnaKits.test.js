// Ментальности как оружие: у каждой варны свой набор движений (Hades).
// Проверяем главное — что это НЕ просто разные числа, а разный бой,
// и что наборы не выдумывают новых слотов.

import { describe, it, expect } from 'vitest'
import { VARNA_KITS, applyVarna } from '@webapp/js/core/varnaKits.js'
import { DEFAULT_FIELD_OPTIONS, createField, stepField, parry } from '@webapp/js/core/field.js'

const base = () => ({ ...DEFAULT_FIELD_OPTIONS, playerHp: 60 })

describe('Ментальности = оружие (Hades: у оружия свой набор движений)', () => {
  it('все четыре варны имеют свой набор', () => {
    expect(Object.keys(VARNA_KITS).sort()).toEqual(['kshatriya', 'shudra', 'vaeshya', 'vipra'])
  })

  it('набор варны не заводит новых слотов', () => {
    const before = base()
    for (const id of Object.keys(VARNA_KITS)) {
      const after = applyVarna(before, id)
      expect(Object.keys(after).filter((k) => !(k in before))).toEqual([])
      expect(Object.keys(after).filter((k) => after[k] !== before[k]).length).toBeGreaterThan(0)
    }
  })

  it('входные опции не мутируются', () => {
    const src = base()
    applyVarna(src, 'vipra')
    expect(src.auraVeilAt).toBe(DEFAULT_FIELD_OPTIONS.auraVeilAt)
  })

  it('неизвестная варна не ломает бой', () => {
    const o = applyVarna(base(), 'такой-нет')
    expect(o.parryWindow).toBe(DEFAULT_FIELD_OPTIONS.parryWindow)
  })

  it('Шудра: больше жизни и спокойствие тает меньше', () => {
    const o = applyVarna(base(), 'shudra')
    expect(o.playerHp).toBe(70)
    expect(o.calmDecayEnemy).toBeLessThan(DEFAULT_FIELD_OPTIONS.calmDecayEnemy)
  })

  it('Кшатрия: дефлект сильнее, но неведение растёт быстрее', () => {
    const o = applyVarna(base(), 'kshatriya')
    expect(o.deflectCalm).toBeGreaterThan(DEFAULT_FIELD_OPTIONS.deflectCalm)
    expect(o.avidyaGainIdle).toBeGreaterThan(DEFAULT_FIELD_OPTIONS.avidyaGainIdle)
  })

  it('Випра: аура держится дольше, снятая ока даёт Ци', () => {
    const o = applyVarna(base(), 'vipra')
    expect(o.auraVeilAt).toBeGreaterThan(DEFAULT_FIELD_OPTIONS.auraVeilAt)
    expect(o.qiOnPacify).toBeGreaterThan(0)
  })

  it('Вайшья: вдвое больше монет и скидка в лавке', () => {
    const o = applyVarna(base(), 'vaeshya')
    expect(o.coinMul).toBe(2)
    expect(o.shopDiscount).toBeGreaterThan(0)
  })

  it('монеты действительно множатся в бою', () => {
    const mk = (id) => createField({
      player: { x: 100, y: 300, hp: 60 },
      foes: [{ id: 'k', name: 'К', x: 100, y: 300, calmMax: 0.5 }],
      rng: () => 0.5, opts: applyVarna(base(), id),
    })
    const plain = mk('shudra')
    const rich = mk('vaeshya')
    for (const st of [plain, rich]) {
      const f = st.foes[0]
      f.state = 'telegraph'; f.timer = st.o.parryWindow * 0.5; f.charge = 1
      f.stun = 0; f.cooldown = 0
      st.player.x = f.x; st.player.y = f.y + 14; st.player.parryCd = 0
      parry(st)
    }
    expect(plain.foes[0].pacified).toBe(true)
    expect(rich.foes[0].pacified).toBe(true)
    expect(rich.coins.length).toBe(plain.coins.length * 2)
  })
})
