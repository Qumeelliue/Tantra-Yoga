// СИМУЛЯТОР ПОЛЯ ЛЕЖАЛ НА СВОЁМ ЗАМЕРЕ — И ЭТО ВИДНО ТОЛЬКО ТЕСТОМ.
//
// Что было. Когда бот умирал, `playRun` делал `break` из внутреннего цикла,
// внешний цикл крутил следующую чакру, а функция в конце возвращала
// `win: true`. Забег, где садхака пала в первой комнате первой чакры,
// отличался от полного только тем, что в нём НЕ БЫЛО последних шести чакр —
// и всё равно попадал в «победы». Итог: «поле 60/60 побед» и «100 % побед»
// были свойством кода, а не результатом. Поражение симулятор сообщить не мог.
//
// Как это выглядело со стороны: 100 % побед при 374 пройденных комнатах из
// 560 (20 забегов × 28 комнат). Пройти 28 комнат и выиграть 20 забегов,
// сходив 374, невозможно физически — но цифра стояла зелёная.
//
// Второе: симулятор писал в список даров выдуманные id (`prana`,
// `dharma-megha`), которых в игре нет. `applyBoons` их молча пропускал, и за
// все забеги бот не получал НИ ОДНОГО дара — то есть замер шёл по игре,
// ослабленной относительно настоящей.
//
// Здесь эти три вещи закрыты проверками, а не «посмотрел отчёт и поверил».

import { describe, it, expect } from 'vitest'
import { playRun, setSloppy, mulberry32, STATS, DRAFTS } from '../scripts/fieldBalance.mjs'
import { BOONS } from '../webapp/js/core/boons.js'
import { ROOMS_PER_STAGE } from '../webapp/js/core/stageRoute.js'

const ROOMS_PER_RUN = 28   // 7 чакр × (3 комнаты + владыка)

describe('Симулятор поля не врёт о победе', () => {
  it('бот, который не парирует ни разу, ПРОИГРЫВАЕТ', () => {
    // Ключевая проверка. До починки эти забеги возвращали win: true.
    setSloppy(1)
    const runs = [1, 2, 3, 4].map((s) => playRun(mulberry32(s)))
    expect(runs.filter((r) => r.win)).toEqual([])
    expect(runs.filter((r) => /погиб/.test(r.why)).length).toBeGreaterThan(0)
  })

  it('победа означает ровно 28 пройденных комнат', () => {
    // Смерть посреди забега не может превратиться в победу: у настоящей
    // победы всегда 7 чакр × (3 комнаты + владыка).
    setSloppy(0)
    const before = STATS.rooms
    const r = playRun(mulberry32(7))
    const rooms = STATS.rooms - before
    expect(r.win).toBe(true)
    expect(rooms).toBe(ROOMS_PER_RUN)
    expect(ROOMS_PER_RUN % 4).toBe(0)   // структура не поехала
    expect(ROOMS_PER_STAGE).toBe(3)
  })

  it('ни один «выигранный» забег не короче настоящего', () => {
    // Тот же закон на рассеянном боте: если забег помечен победой, он обязан
    // дойти до седьмой чакры. Иначе отчёт снова сможет нарисовать 100 %.
    for (const v of [0, 0.7, 0.9]) {
      setSloppy(v)
      for (const s of [11, 12, 13]) {
        const before = STATS.rooms
        const r = playRun(mulberry32(s))
        const rooms = STATS.rooms - before
        if (r.win) expect(rooms, `рассеянность ${v}, seed ${s}`).toBe(ROOMS_PER_RUN)
        else expect(rooms).toBeLessThan(ROOMS_PER_RUN)
      }
    }
  })
})

describe('Симулятор поля играет в ту же игру, что и человек', () => {
  it('после каждого владыки бот получает ровно один настоящий дар', () => {
    setSloppy(0)
    for (const k of Object.keys(DRAFTS)) delete DRAFTS[k]
    const r = playRun(mulberry32(21))
    const got = Object.keys(DRAFTS)
    expect(r.win).toBe(true)
    expect(got).toHaveLength(6)                 // 6 владык до седьмой
    for (const id of got) {
      expect(BOONS.some((b) => b.id === id), `дар «${id}» есть ли в игре`).toBe(true)
    }
  })

  it('выдуманных id в коде симулятора больше нет', async () => {
    // Прежние «prana» и «dharma-megha» проходили мимо applyBoons молча.
    // Комментарии про них остаются — они объясняют, почему их не должно быть.
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../scripts/fieldBalance.mjs', import.meta.url), 'utf8')
    const code = src.split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n')
    expect(code.includes("'dharma-megha'")).toBe(false)
    expect(code.includes("'prana'")).toBe(false)
    expect(code).toContain('rollBoons')
  })
})
