// УДАР И СМЕРТЬ ДОЛЖНЫ БЫТЬ ВИДНЫ: НЕ ТОЛЬКО ЧТО ПРОИЗОШЛО, НО И КАК.
//
// ## Что случилось
//
// В листе Calciumtrice пять полос анимации на фигуру: idle, gesture, walk, attack,
// death. Подключены были три. И обе невидимые полосы не просто не использовались —
// они были невозможны:
//
//   `death` — отрисовка пропускала всех, у кого `dead`. То есть ока, которую
//   убили, исчезала в тот же кадр, и полоса смерти не показывалась НИ РАЗУ за всю
//   игру. Лицензионная анимация лежала в проекте мёртвым грузом.
//   `hurt` — читалась только при `state === 'stunned'`, а это состояние не
//   выставлялось нигде. Попадание по оке выглядело тем же, что отброс от дефлекта:
//   пиксельный сдвиг без реакции фигуры.
//
// ## Что сделано
//
//   `hurtT` — ока отдёргивается от удара (0.3 с), показывая полосу `hurt`.
//   `deathT` — убитая ока доигрывает падение (0.75 с) и только потом уходит
//   (`gone`). Тень у неё гаснет вместе с падением.
//
// ## Почему это проверяется на состоянии, а не на исходнике
//
// Проверка «в коде есть `deathT`» прошла бы и до правки — достаточно было бы
// написать поле и забыть им пользоваться. Здесь проверяется поведение: ока после
// смерти ещё `gone === false`, и она исчезает только когда падение доиграно.

import { describe, it, expect } from 'vitest'
import { createField, stepField, strike, DEFAULT_FIELD_OPTIONS } from '@webapp/js/core/field.js'
import { buildFieldFloor, DEFAULT_FIELD_SIZE } from '@webapp/js/core/fieldBuild.js'
import { FOE_SPRITE, ANIM_NAMES, CHARACTERS } from '../webapp/js/ui/fieldSprites.js'

/**
 * Комната собирается НАСТОЯЩИМ строителем, а не руками.
 *
 * Первая версия проверки делала оку литералом — и у неё не было поля `gone`.
 * Проверка падала с «ока не ушла за 200 шагов», и виноват был не код, а то, что
 * ока в проверке была не той, что в игре. Ровно тот класс, который ловит этот
 * файл: поле, забытое строителем, выглядит как «работает», пока не появится
 * ока, собранная по-настоящему.
 */
const mk = () => {
  // Чакра 4 — там паши, их и бьём насмерть.
  const built = buildFieldFloor(3, { room: 0, rng: () => 0.5 })
  const pasha = built.foes.filter((f) => f.kind === 'pasha')
  const foe = (pasha.length ? pasha : built.foes)[0]
  foe.speedMul = 0
  return createField({
    player: { x: built.field.w * 0.5, y: built.field.h * 0.5, hp: 60, maxHp: 60 },
    foes: [foe],
    field: built.field,
    opts: { ...DEFAULT_FIELD_OPTIONS },
  })
}

/** Бить, пока ока не сложится. Возвращает номер удара, на котором сложилась. */
function killFoe(st, maxStrikes = 60) {
  for (let i = 0; i < maxStrikes; i++) {
    const f = st.foes[0]
    if (f.dead) return i
    // Задержка удара снимается руками: между ударами в бою проходит время, а
    // здесь мы просто переносим садхаку к оке и бьём снова. Первая версия
    // проверки этого не делала и била в пустоту — ока жива, а тест писал
    // «бить нечем».
    st.player.strikeCd = 0
    st.player.x = f.x - 24
    st.player.y = f.y
    st.player.facing = 1
    strike(st, 0)
  }
  return -1
}

describe('Ока не исчезает в тот же кадр, в который её убили', () => {
  it('после смерти у оки есть время на падение', () => {
    const st = mk(true)
    expect(killFoe(st), 'ока не сложилась за 40 ударов — бить нечем').toBeGreaterThanOrEqual(0)
    const f = st.foes[0]
    expect(f.dead, 'ока жива после серии ударов').toBe(true)
    expect(f.deathT, 'у убитой оки нет времени на падение — она исчезнет мгновенно, '
      + 'и полоса смерти из лицензионного спрайта не покажется ни разу')
      .toBeGreaterThan(0)
    expect(f.gone, 'ока объявлена ушедшей в тот же кадр, в который убита').toBe(false)
  })

  it('ока уходит только когда падение доиграно', () => {
    const st = mk(true)
    killFoe(st)
    const f = st.foes[0]
    // Шаг за шагом: пока `deathT` не кончилась — ока на месте.
    let steps = 0
    while (!f.gone && steps < 200) { stepField(st, 1 / 60, {}); steps++ }
    expect(f.gone, `ока не ушла за ${steps} шагов — она навсегда останется на экране`).toBe(true)
    // И ушла не мгновенно: на весь таймер смерти ушло заметное число кадров.
    expect(steps, `падение длилось ${steps} шагов — ока не показывает падение, а просто исчезает`)
      .toBeGreaterThan(10)
  })

  it('падение длится примерно столько, сколько объявлено опцией', () => {
    const st = mk(true)
    killFoe(st)
    const f = st.foes[0]
    const declared = st.o.deathTime
    let t = 0
    while (!f.gone && t < 5) { stepField(st, 1 / 60, {}); t += 1 / 60 }
    // Разница в четверть секунды — это нормально: шаг дискретный.
    expect(Math.abs(t - declared),
      `падение шло ${t.toFixed(2)} с, а объявлено ${declared} с — анимация не совпадает с тем, что нарисовано`)
      .toBeLessThan(0.25)
  })
})

describe('Попадание видно на фигуре, а не только сдвигом', () => {
  it('после удара у оки есть время на отдёргивание', () => {
    const st = mk(true)
    st.player.x = st.foes[0].x - 24
    st.player.y = st.foes[0].y
    strike(st, 0)
    expect(st.foes[0].hurtT, 'у оки нет реакции на удар — попадание не отличить от отброса')
      .toBeGreaterThan(0)
  })

  it('отдёргивание кончается само, а не висит вечно', () => {
    const st = mk(true)
    st.player.x = st.foes[0].x - 24
    st.player.y = st.foes[0].y
    strike(st, 0)
    for (let i = 0; i < 120; i++) stepField(st, 1 / 60, {})
    expect(st.foes[0].hurtT, 'отдёргивание не кончилось за две секунды — ока будет дрожать вечно')
      .toBe(0)
  })
})

describe('Обе полосы анимации из лицензионного листа теперь используются', () => {
  it('полосы `hurt` и `death` объявлены', () => {
    expect(ANIM_NAMES, 'полоса hurt или death потерялась при настройке листа')
      .toEqual(expect.arrayContaining(['hurt', 'death']))
  })

  it('в игре есть состояния, которые включают эти полосы', () => {
    // Проверка против прошлой поломки: полоса была в справочнике и при этом
    // была недостижима — `stunned` не выставлялся никогда.
    const dead = mk(true)
    killFoe(dead)
    expect(dead.foes[0].deathT, 'смерть не запускает полосу смерти').toBeGreaterThan(0)
    const hurt = mk(true)
    hurt.player.x = hurt.foes[0].x - 24
    hurt.player.y = hurt.foes[0].y
    strike(hurt, 0)
    expect(hurt.foes[0].hurtT, 'удар не запускает полосу hurt').toBeGreaterThan(0)
  })

  it('у каждой оки есть фигура — иначе часть полос не видно никогда', () => {
    for (const id of Object.keys(FOE_SPRITE)) {
      expect(CHARACTERS[FOE_SPRITE[id]], `у оки «${id}» нет фигуры`).toBeTruthy()
    }
  })
})