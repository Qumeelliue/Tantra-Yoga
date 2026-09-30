// ЩИТ ПЕРЕСТАЛ КОПИТЬСЯ — И ЭТО ВИДНО ТОЛЬКО ЗАМЕРОМ.
//
// Что было. В Поле Ума щит скопирован из Slay the Spire, но скопирован не
// весь: в Spire блок снимается в начале твоего хода и дальше не живёт, а у
// нас блок просто копился до потолка 12 и стоял на нём всю комнату.
//
// Почему это было не видно. Замер считал ТОЛЬКО попадания по жизни и молчал
// про «съеденное щитом». Строка выглядела как «попаданий 25 · урона 0» и
// читалась как читерство бота. На деле щит стоял на потолке в 25 попаданиях
// из 25 и съедал 200 урона из 200. Поле сообщало «мягко», и это была правда
// — просто не про то, о чём думали.
//
// Что стало. Щит тает на «ходе Spire» — тем же переводом хода на время,
// который в проекте уже сделан для «слабости» (`weakTurn`): в Spire ходов у
// нас нет, а срок у обоих эффектов один и тот же — в начале хода.

import { describe, it, expect } from 'vitest'
import { createField, stepField, castMantra } from '@webapp/js/core/field.js'
import { playRun, setSloppy, mulberry32, STATS } from '../scripts/fieldBalance.mjs'

function field(opts = {}) {
  return createField({ player: { x: 100, y: 200, hp: 60 }, foes: [], rng: () => 0.5, opts })
}
function run(st, sec, dt = 1 / 60) {
  for (let t = 0; t < sec; t += dt) stepField(st, dt, { dx: 0, dy: 0 })
}

// Щит копился — и именно этим поле прощало промах.
describe('Щит не копится', () => {
  it('щит тает на «ходе Spire» — как блок в Spire', () => {
    const st = field()
    st.player.shield = 6
    run(st, st.o.shieldTurn + 0.1)
    expect(st.player.shield, 'щит, оставшийся без поддержки, должен истечь').toBe(0)
  })

  it('до хода щит держится — мантра не бессмертна, но и не пустая', () => {
    const st = field()
    st.player.shield = 6
    run(st, st.o.shieldTurn - 0.5)
    expect(st.player.shield).toBe(6)
  })

  it('щит не копится выше потолка, даже если мантру жать без остановки', () => {
    // Раньше бот на 0.8 с мантры стоял на потолке постоянно. Смысл замера
    // в том, чтобы потолок стал ПРЕДЕЛОМ, а не вечным состоянием.
    const st = field()
    st.player.psychic = 999
    for (let i = 0; i < 40; i++) { st.player.shieldT = 0; castMantra(st) }
    expect(st.player.shield).toBeLessThanOrEqual(st.o.shieldMax)
    run(st, st.o.shieldTurn + 0.1)
    expect(st.player.shield).toBe(0)
  })

  it('ход щита — тот же, что ход слабости (одна величина на оба эффекта)', () => {
    // Слабость и блок в Spire снимаются в начале хода. Если у них разные
    // сроки, значит один из них переведён на глаз.
    const st = field()
    expect(st.o.shieldTurn).toBe(st.o.weakTurn)
  })

  it('shieldTurn = 0 не вешает бой (страховка для бонусов)', () => {
    // Бонус может обнулить срок. При 0 цикл «пока накопится» не кончается
    // никогда, и бой замирает навсегда — молча, без ошибки.
    const st = field({ shieldTurn: 0 })
    st.player.shield = 8
    run(st, 2)
    expect(st.player.shield).toBe(8)
    expect(st.time).toBeGreaterThan(0)
  })

  it('щит, погашенный крипой, тоже истекает — иначе милость = вечная неуязвимость', () => {
    const st = field()
    st.player.shield = st.o.shieldMax
    run(st, st.o.shieldTurn + 0.1)
    expect(st.player.shield).toBe(0)
  })
})

// Реальная проверка свойства, а не величины.
describe('Промах в окне стоит жизни', () => {
  it('щит не делает садхаку бессмертной при идеальной игре', () => {
    // Главная проверка. Раньше бот на безупречном парировании всё равно
    // не терял ни одной жизни: щит съедал всё, и замер об этом молчал —
    // строка «попаданий 25 · урона 0» читалась как читерство бота.
    setSloppy(0)
    const before = STATS.dmg
    const r = playRun(mulberry32(31))
    const taken = STATS.dmg - before
    expect(r.win).toBe(true)
    expect(taken, 'идеальный бот всё равно получает урон — щит не бессмертие').toBeGreaterThan(0)
    // 28 комнат по 60 жизни с запасом: урон конечен, забег не «бесконечный».
    expect(taken).toBeLessThan(60 * 28 * 10)
  })
})