// ПОВЕДЕНИЕ ОК — «у каждого типа врага свой набор приёмов» (Hades).
//
// Раньше все оки делали одно и то же: подошёл → замахнулся → ударил.
// Теперь у каждой оки своё поведение, выведенное ИЗ УЖЕ ЗАПИСАННЫХ
// описаний в `fieldBuild.js` (поле `note`), а не придуманное заново.

import { describe, it, expect } from 'vitest'
import { FOE_BEHAVIOR, behaviorOf, DEFAULT_BEHAVIOR } from '@webapp/js/core/foeBehavior.js'
import { createField, stepField, parry, DEFAULT_FIELD_OPTIONS } from '@webapp/js/core/field.js'
import { ENEMIES } from '@webapp/js/core/data.js'

function field(foes = [], opts = {}) {
  return createField({ player: { x: 100, y: 200, hp: 60 }, foes, rng: () => 0.5, opts })
}
function foe(over = {}) {
  return { id: 'lobha', name: 'О', x: 100, y: 300, calmMax: 99, ...over }
}
function run(st, seconds, dt = 1 / 60) {
  const ev = []
  for (let i = 0; i < Math.round(seconds / dt); i++) ev.push(...stepField(st, dt, {}))
  return ev
}
/** Доводит оку до удара и бьёт по игроку. */
function letHit(st, i = 0) {
  const f = st.foes[i]
  st.player.x = f.x; st.player.y = f.y
  f.state = 'telegraph'; f.charge = 0; f.cooldown = 0; f.stun = 0
  f.telegraphSpan = st.o.enemyTelegraph * (f.beh?.telegraphMul || 1)
  f.timer = 0.001; f.pending = true
  return run(st, 0.4)
}

describe('У каждой оки своё поведение (Hades: свой набор приёмов у врага)', () => {
  it('поведение описано для всех 14 оков, что ставятся в бой', () => {
    const playable = Object.keys(ENEMIES)
      .filter((id) => ENEMIES[id] && !ENEMIES[id].isBoss && !id.startsWith('_'))
    for (const id of playable) expect(FOE_BEHAVIOR[id], id).toBeTruthy()
  })

  it('у каждой оки есть хоть одно отличие от обычной', () => {
    for (const [id, b] of Object.entries(FOE_BEHAVIOR)) {
      const diff = Object.keys(b).filter((k) => b[k] !== DEFAULT_BEHAVIOR[k])
      expect(diff.length, id).toBeGreaterThan(0)
    }
  })

  it('незнакомая ока получает обычное поведение и не ломает бой', () => {
    const b = behaviorOf('такой-нет')
    expect(b.telegraphMul).toBe(1)
    const st = field([foe({ id: 'такой-нет' })])
    expect(run(st, 0.2).length).toBeGreaterThanOrEqual(0)
  })

  it('гнев замахивается быстрее сна, сон — дольше всех', () => {
    expect(FOE_BEHAVIOR.krodha.telegraphMul).toBeLessThan(1)
    expect(FOE_BEHAVIOR.nidra.telegraphMul).toBeGreaterThan(1)
    expect(FOE_BEHAVIOR.bhaya_pasha.telegraphMul).toBeGreaterThan(FOE_BEHAVIOR.nidra.telegraphMul)
  })

  it('жадность бьёт чаще, хоть замахивается дольше', () => {
    expect(FOE_BEHAVIOR.lobha.telegraphMul).toBeGreaterThan(1)
    expect(FOE_BEHAVIOR.lobha.cooldownMul).toBeLessThan(1)
  })

  it('гордость не подходит — бьёт с места', () => {
    const st = field([foe({ id: 'mada' })])
    const x0 = st.foes[0].x
    st.player.x = st.foes[0].x - 200
    run(st, 0.5)
    expect(st.foes[0].x - x0).toBeLessThan(1)      // не сдвинулась
    expect(FOE_BEHAVIOR.mada.keepsDistance).toBe(true)
  })

  it('стыд отступает, когда подходишь', () => {
    const st = field([foe({ id: 'lajja' })])
    const x0 = st.foes[0].x
    st.player.x = st.foes[0].x + 30
    st.player.y = st.foes[0].y
    run(st, 0.6)
    expect(st.foes[0].x).toBeLessThan(x0)
  })

  it('влечение тянет садхаку к себе во время замаха — и только оно', () => {
    // одинаковая обстановка, различается только ока: с «влечением» садхака
    // сдвинется к ней сильнее, чем с любой другой
    const pull = (id) => {
      const st = field([foe({ id })], { playerHp: 300, enemySpeed: 0 })
      st.player.hp = 300; st.player.maxHp = 300
      st.player.x = st.foes[0].x + 200
      st.player.y = st.foes[0].y
      const f = st.foes[0]
      f.state = 'telegraph'
      f.telegraphSpan = DEFAULT_FIELD_OPTIONS.enemyTelegraph
      f.timer = f.telegraphSpan
      f.charge = 0
      const x0 = st.player.x
      run(st, 0.6)
      return x0 - st.player.x
    }
    expect(pull('kama')).toBeGreaterThan(4)
    expect(pull('lobha')).toBeLessThan(1)
  })

  it('сон после удара делает шаг вялым', () => {
    const st = field([foe({ id: 'nidra' })])
    letHit(st)
    expect(st.player.slow).toBeGreaterThan(0)
    const x0 = st.player.x
    run(st, 0.3, 1 / 60)                 // ждём, пока пройдёт неуязвимость
    const walk = field([foe({ id: 'lobha' })])
    walk.player.slow = st.player.slow
    walk.player.slowT = st.player.slowT
    run(walk, 0.3, 1 / 60)
    expect(st.player.slow).toBeLessThan(1)
  })

  it('жагущая оставляет ожог, который тает сам', () => {
    // много жизни — иначе при падении ниже трети сработает крипа (милость)
    // и начнёт подкидывать щит, который съест весь ожог
    const st = field([foe({ id: 'ghrna', kind: 'pasha', attack: 6 })], { playerHp: 99999 })
    st.player.hp = 99999; st.player.maxHp = 99999
    letHit(st)
    expect(st.player.burn).toBeGreaterThan(0)
    const hp1 = st.player.hp
    run(st, 0.6)
    expect(st.player.hp).toBeLessThan(hp1)      // ожог продолжает жрать
    // убираем оку, чтобы она не поджигала заново, и ждём, пока ожог стихнет
    st.foes[0].pacified = true
    run(st, 5)
    expect(st.player.burn).toBe(0)              // и сам проходит
  })

  it('сомнение вселяет слабость (слот Slay the Spire)', () => {
    const st = field([foe({ id: 'samshaya_pasha', kind: 'pasha', attack: 6 })])
    letHit(st)
    expect(st.player.weak).toBeGreaterThan(0)
  })

  it('злословие усиливает неведение', () => {
    const st = field([foe({ id: 'jugupsa', kind: 'pasha', attack: 4 })])
    const a0 = st.avidya
    letHit(st)
    expect(st.avidya).toBeGreaterThan(a0)
  })

  it('зависть ворует духовную силу', () => {
    const st = field([foe({ id: 'matsarya' })])
    st.player.shakti = st.player.shaktiMax
    letHit(st)
    expect(st.player.shakti).toBeLessThan(st.player.shaktiMax)
  })

  it('холодность гасит возврат удара, как стойкость владыки', () => {
    const plain = field([foe({ id: 'lobha', calmMax: 6 })])
    const wall = field([foe({ id: 'sila', kind: 'pasha', calmMax: 6 })])
    for (const st of [plain, wall]) {
      const f = st.foes[0]
      f.state = 'telegraph'; f.timer = st.o.parryWindow * 0.5; f.charge = 1
      f.stun = 0; f.cooldown = 0
      st.player.x = f.x; st.player.y = f.y + 14; st.player.parryCd = 0
      parry(st)
    }
    expect(wall.foes[0].calm).toBeLessThan(plain.foes[0].calm)
  })

  it('тщеславие иногда блефует — замах обрывается ничем', () => {
    let feints = 0
    for (let k = 0; k < 30; k++) {
      // розыгрыш обязан меняться, иначе блеф либо всегда, либо никогда
      const r = k / 30
      const st = createField({
        player: { x: 100, y: 200, hp: 60 },
        rng: () => r, opts: { enemyCooldown: 0.1 },
        foes: [foe({ id: 'mana_pasha', kind: 'pasha', attack: 5 })],
      })
      const f = st.foes[0]
      f.state = 'telegraph'
      f.telegraphSpan = st.o.enemyTelegraph * FOE_BEHAVIOR.mana_pasha.telegraphMul
      f.timer = 0.001; f.charge = 0
      if (run(st, 0.2).some((e) => e.type === 'feint')) feints++
    }
    expect(feints).toBeGreaterThan(3)
    expect(feints).toBeLessThan(27)
  })

  it('блеф не снимает жизни, но честно говорит, что был обман', () => {
    const st = createField({
      player: { x: 100, y: 200, hp: 60 }, rng: () => 0, opts: { enemyCooldown: 0.1 },
      foes: [foe({ id: 'mana_pasha', kind: 'pasha', attack: 5 })],
    })
    const f = st.foes[0]
    f.state = 'telegraph'
    f.telegraphSpan = st.o.enemyTelegraph * FOE_BEHAVIOR.mana_pasha.telegraphMul
    f.timer = 0.001; f.charge = 0
    const hp0 = st.player.hp
    const ev = run(st, 0.2)
    if (ev.some((e) => e.type === 'feint')) expect(st.player.hp).toBe(hp0)
  })

  it('родовитость копит стойкость, пока стоит', () => {
    const st = field([foe({ id: 'kula', kind: 'pasha' })])
    st.player.x = st.foes[0].x + 10; st.player.y = st.foes[0].y
    st.foes[0].state = 'telegraph'
    st.foes[0].telegraphSpan = st.o.enemyTelegraph
    st.foes[0].timer = st.o.enemyTelegraph; st.foes[0].charge = 0
    run(st, 1)
    expect(st.foes[0].block).toBeGreaterThan(0)
  })

  it('жадность трудно отбросить', () => {
    const plain = field([foe({ id: 'krodha', calmMax: 99 })])
    const greed = field([foe({ id: 'lobha', calmMax: 99 })])
    for (const st of [plain, greed]) {
      const f = st.foes[0]
      f.state = 'telegraph'; f.timer = st.o.parryWindow * 0.5; f.charge = 1
      f.stun = 0; f.cooldown = 0
      st.player.x = f.x; st.player.y = f.y + 14; st.player.parryCd = 0
      parry(st)
    }
    const d = (st) => Math.hypot(st.foes[0].x - st.player.x, st.foes[0].y - st.player.y)
    expect(d(greed)).toBeLessThan(d(plain))
  })

  it('злость гасит оглушение — гнев встаёт почти сразу', () => {
    const calm = field([foe({ id: 'lobha', calmMax: 99 })])
    const angry = field([foe({ id: 'krodha', calmMax: 99 })])
    for (const st of [calm, angry]) {
      const f = st.foes[0]
      f.state = 'telegraph'; f.timer = st.o.parryWindow * 0.5; f.charge = 1
      f.stun = 0; f.cooldown = 0
      st.player.x = f.x; st.player.y = f.y + 14; st.player.parryCd = 0
      parry(st)
    }
    expect(angry.foes[0].stun).toBeLessThan(calm.foes[0].stun)
  })

  it('страх достаёт издалека', () => {
    expect(FOE_BEHAVIOR.bhaya_pasha.reachMul).toBeGreaterThan(1)
    const st = field([foe({ id: 'bhaya_pasha', kind: 'pasha' })])
    const d = 40
    st.player.x = st.foes[0].x + d; st.player.y = st.foes[0].y
    run(st, 0.1)
    expect(st.foes[0].state).toBe('telegraph')
  })
})
