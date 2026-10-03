// Маршрут забега внутри этапа: комната → комната → комната → владыка.
// Здесь ловится настоящая поломка прошлого: переход между комнатами читал
// переменную, которой нет, и падал молча — игрок не мог уйти из первой
// комнаты, а тесты этого не видели.

import { describe, it, expect } from 'vitest'
import { nextStage, ROOMS_PER_STAGE } from '@webapp/js/core/stageRoute.js'
import { buildFieldFloor, DEFAULT_FIELD_SIZE } from '@webapp/js/core/fieldBuild.js'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../webapp/js/main.js', import.meta.url), 'utf8')
const F = { ...DEFAULT_FIELD_SIZE }

describe('Маршрут этапа', () => {
  it('этап — это несколько комнат, потом владыка', () => {
    expect(ROOMS_PER_STAGE).toBe(3)
    expect(nextStage('room', 0, true)).toEqual({ kind: 'room', room: 1 })
    expect(nextStage('room', 1, true)).toEqual({ kind: 'room', room: 2 })
    expect(nextStage('room', 2, true)).toEqual({ kind: 'boss', room: 3 })
    expect(nextStage('boss', 3, true)).toEqual({ kind: 'done' })
  })

  it('этап без владыки просто заканчивается', () => {
    expect(nextStage('room', 2, false)).toEqual({ kind: 'done' })
  })

  it('весь этап проходится ровно за ROOMS_PER_STAGE шагов — и ни на одном не застревает', () => {
    let room = 0, stage = 'room', steps = 0
    while (steps < 40) {
      const n = nextStage(stage, room, true)
      if (n.kind === 'done') break
      stage = n.kind; room = n.room; steps++
    }
    expect(steps).toBe(ROOMS_PER_STAGE)          // три перехода: комната→комната→комната→владыка
    expect(stage).toBe('boss')
  })

  it('главный файл берёт номер комнаты из параметра, а не из пустоты', () => {
    // ровно эта ошибка стоила целого забега: `opts.room` — несуществующее имя
    expect(main).toContain('const step = nextStage(stage, room, stageHasBoss(floor))')
    expect(main).not.toContain('opts.room')
    // и `room` — параметр самой функции
    expect(main).toContain("function startFieldRun(floor, stage = 'room', room = 0)")
  })

  it('комнаты по маршруту действительно разные и тяжелеют', () => {
    const counts = []
    let stage = 'room', room = 0, guard = 0
    while (guard++ < 10 && stage === 'room') {
      counts.push(buildFieldFloor(3, { field: F, room }).foes.length)
      const n = nextStage(stage, room, true)
      stage = n.kind; room = n.room
    }
    expect(counts).toHaveLength(ROOMS_PER_STAGE)
    expect(counts[1]).toBeGreaterThan(counts[0])
    expect(counts[2]).toBeGreaterThan(counts[1])
  })
})

// ── Фонтан амбросии стоит перед владыкой (Hades) ──────────────────────
describe('Амбросия перед владыкой', () => {
  it('фонтан ставится в последней комнате этапа, а не в первой', () => {
    const main = readFileSync(new URL('../webapp/js/main.js', import.meta.url), 'utf8')
    expect(main).toContain('spring: stage === \'room\' && room === ROOMS_PER_STAGE - 1')
  })

  it('в комнате владыки фонтана нет — там уже не лечат', () => {
    const main = readFileSync(new URL('../webapp/js/main.js', import.meta.url), 'utf8')
    expect(main).toMatch(/spring: stage === 'room'/)
  })

  it('маршрут доводит до комнаты с фонтаном перед владыкой', () => {
    let stage = 'room', room = 0, guard = 0, sawSpring = false
    while (guard++ < 10 && stage === 'room') {
      if (room === ROOMS_PER_STAGE - 1) sawSpring = true
      const n = nextStage(stage, room, true)
      stage = n.kind; room = n.room
    }
    expect(sawSpring).toBe(true)
    expect(stage).toBe('boss')
  })
})
