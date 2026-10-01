// ВОЗВРАТ (Nine Sols: Revival) — возродиться один раз за забег, отдав нефрит.
//
// Проверяется то, что делает «возврат» выбором, а не отменой смерти:
//
//   1. **кнопка есть только когда возврат РЕАЛЬНО возможен** — иначе на
//      экране смерти стояла бы кнопка, которая ничего не делает;
//   2. **раз за забег** — иначе это не выбор, а бессмертие;
//   3. **плата — нефрит, и он действительно исчезает** — обещание без цены
//      было бы подменой: игрок получил бы и дар, и возврат;
//   4. **жизни — половина**, а не полная;
//   5. **комната НЕ засчитывается** — иначе монеты платят дважды за одну
//      комнату;
//   6. **правило сказано ДО забега** (на фонтане, где нефрит и берётся), а не
//      на экране смерти: узнать о правиле в момент выбора — не выбор;
//   7. **возврат не отменяет конца забега** — «оставил забег» закрывает и его;
//   8. **возвраты видны в отчёте** — забег с возвратом это другой забег, и
//      прятать это было бы враньём.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import BOONS_DATA from '@content/boons.json'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const main = read('webapp/js/main.js')
const fieldScreen = read('webapp/js/ui/screens/field.js')
const base = read('design/BASE-GAME.md')
void BOONS_DATA

describe('Возврат из смерти: правило одно и платное', () => {
  it('кнопка появляется только когда возврат возможен', () => {
    // Кнопка, которая ничего не делает, — враньё ровно того же класса, что
    // и обещание, которое нельзя исполнить.
    expect(main).toContain("onRevive: (app.runKeepsake && !app.runRevived) ? (st2) => {")
    expect(main).toContain('} : null,')
    expect(fieldScreen).toContain('opts.onRevive')
  })

  it('раз за забег: второй раз нельзя', () => {
    expect(main).toContain('app.runRevived = true')
    // И возврат не переживает ни смерть, ни «оставил забег»: иначе это не
    // «раз за забег», а «раз за попытку отварачивания».
    const resets = main.match(/app\.runRevived = true/g) || []
    expect(resets.length, 'возврат должен быть закрыт и смертью, и выходом').toBeGreaterThanOrEqual(3)
  })

  it('плата — нефрит, и он исчезает из забега', () => {
    expect(main).toContain('app.runKeepsake = null')
    // Нефрит пропадает ДО входа в следующую комнату, а не «когда-нибудь»:
    // иначе игрок вернулся бы и заодно сохранил дар, то есть получил бы и
    // возврат, и силу за одну плату.
    const at = main.indexOf('app.runKeepsake = null')
    const start = main.indexOf('startFieldRun(floor, stage, room)')
    expect(at).toBeGreaterThan(-1)
    expect(start).toBeGreaterThan(at)
  })

  it('жизни — половина, а не полная', () => {
    // Вернуться полным было бы второй попыткой без цены.
    // Половину считает `startFieldRun`, а не обработчик: нефрит только что
    // отдан и меняет запас жизни, и по старому запасу игрок возвращался с 43
    // при запасе 40 — то есть больше половины.
    expect(main).toContain('app.runReviveHalf = true')
    expect(main).toContain('app.runReviveHalf')
    expect(main).toMatch(/app\.runReviveHalf\s*\?\s*Math\.max\(1, Math\.ceil\(fullHp \/ 2\)\)/)
    const fn = main.slice(main.indexOf('onRevive: (app.runKeepsake'))
    const end = fn.indexOf('onRetry:')
    expect(end > 0 ? fn.slice(0, end) : fn, 'возврат сам считает половину от старого запаса')
      .not.toContain('runHp = Math.max')
  })

  it('комната при возврате не засчитывается', () => {
    // Возврат перезапускает комнату с оками на месте (Nine Sols). Если бы мы
    // засчитали её сейчас, монеты и знание платили бы дважды за одну комнату.
    const fn = main.slice(main.indexOf('onRevive: (app.runKeepsake'))
    const end = fn.indexOf('onRetry:')
    const body = end > 0 ? fn.slice(0, end) : fn
    expect(body, 'возврат засчитывает комнату — монеты платят дважды').not.toContain('settleFieldRoom')
  })

  it('правило сказано ДО забега, на фонтане', () => {
    // Узнать о возврате на экране смерти — не выбор, а сюрприз. То же, что
    // «убить их нельзя»: обещание вслепую одинаково плохо.
    const fountain = main.slice(main.indexOf('function showFountain'))
    expect(fountain).toContain('Пока нефрит в руках, у смерти есть третий выход')
  })

  it('возвраты попадают в отчёт забега', () => {
    expect(main).toContain('run0.revivals = (run0.revivals || 0) + 1')
    expect(main).toContain('возвратов из смерти')
    expect(main).toContain('revivals: 0')
  })

  it('смерть по-прежнему остаётся путём, а не отменой', () => {
    // Кнопка «ещё раз» не должна исчезать: возврат — дополнение, а не замена.
    expect(fieldScreen).toContain("'ещё раз'")
    expect(fieldScreen, 'при возврате «ещё раз» стал тихим').toContain("class: opts.onRevive ? 'btn ghost' : 'btn primary'")
  })
})

describe('Возврат — копия, а не своя идея', () => {
  it('записан в BASE-GAME со своим источником', () => {
    expect(base).toContain('МЕХАНИКА 49')
    expect(base).toContain('Nine Sols')
  })
})