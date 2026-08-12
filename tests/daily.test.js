import { describe, it, expect } from 'vitest'
import {
  EMPTY_META, dayKey, yesterdayKey, markVisit, progressDaily, challengeForDay,
} from '@webapp/js/core/save.js'
import { CHALLENGES } from '@webapp/js/core/data.js'

// Фиксированная дата, чтобы тесты были детерминированными.
const T0 = new Date('2026-08-12T12:00:00').getTime() // среда
const DAY = 24 * 60 * 60 * 1000

describe('Стрики (§15)', () => {
  it('первый визит стартует серию', () => {
    const meta = EMPTY_META()
    const { event } = markVisit(meta, T0)
    expect(event.kind).toBe('start')
    expect(meta.streak.current).toBe(1)
    expect(meta.streak.best).toBe(1)
    expect(meta.streak.lastDay).toBe(dayKey(T0))
  })

  it('повторный визит в тот же день ничего не меняет', () => {
    const meta = EMPTY_META()
    markVisit(meta, T0)
    const { event } = markVisit(meta, T0 + 1000)
    expect(event.kind).toBe('none')
    expect(meta.streak.current).toBe(1)
  })

  it('визит на следующий день увеличивает серию', () => {
    const meta = EMPTY_META()
    markVisit(meta, T0)
    const { event } = markVisit(meta, T0 + DAY)
    expect(event.kind).toBe('increase')
    expect(meta.streak.current).toBe(2)
    expect(meta.streak.best).toBe(2)
  })

  it('пропуск дня без фриза обрывает серию до 1', () => {
    const meta = EMPTY_META()
    markVisit(meta, T0)
    markVisit(meta, T0 + DAY)
    const { event } = markVisit(meta, T0 + 3 * DAY)
    expect(event.kind).toBe('break')
    expect(meta.streak.current).toBe(1)
    // рекорд сохраняется
    expect(meta.streak.best).toBe(2)
  })

  it('фриз спасает серию при пропуске', () => {
    const meta = EMPTY_META()
    meta.streak.freeze = 2
    markVisit(meta, T0)
    markVisit(meta, T0 + DAY)
    const { event } = markVisit(meta, T0 + 3 * DAY)
    expect(event.kind).toBe('freeze_used')
    expect(meta.streak.freeze).toBe(1)
    expect(meta.streak.current).toBe(2) // серия не оборвана
  })

  it('yesterdayKey возвращает вчерашний ключ', () => {
    expect(yesterdayKey(T0)).toBe(dayKey(T0 - DAY))
  })

  it('воскресенье покоя сохраняет серию без фриза', () => {
    const meta = EMPTY_META()
    markVisit(meta, T0)           // среда
    markVisit(meta, T0 + DAY)     // четверг
    markVisit(meta, T0 + 2 * DAY) // пятница → current 3
    const { event } = markVisit(meta, T0 + 4 * DAY) // воскресенье
    expect(event.kind).toBe('grace')
    expect(meta.streak.current).toBe(3)
    expect(meta.streak.freeze).toBe(0)
  })
})

describe('Ежедневные вызовы (§16.2)', () => {
  it('challengeForDay детерминирован для одной даты', () => {
    const a = challengeForDay(T0)
    const b = challengeForDay(T0 + 1000)
    expect(a.id).toBe(b.id)
  })

  it('вызов меняется между разными днями (как минимум не всегда тот же)', () => {
    const seen = new Set()
    for (let i = 0; i < 20; i++) {
      seen.add(challengeForDay(T0 + i * DAY).id)
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('вызов корректен: все kind из challenges.json', () => {
    for (const ch of Object.values(CHALLENGES)) {
      expect(typeof ch.target).toBe('number')
      expect(ch.target).toBeGreaterThan(0)
    }
  })

  it('progressDaily накапливает прогресс и завершает вызов', () => {
    const meta = EMPTY_META()
    markVisit(meta, T0)
    // для детерминированности фиксируем вызов с target > 1
    const ch = Object.values(CHALLENGES).find((c) => c.target > 1)
    meta.daily.challengeId = ch.id
    meta.daily.progress = 0
    meta.daily.done = false
    expect(meta.daily.done).toBe(false)
    // бьём только в нужный kind
    progressDaily(meta, 'kiirtana', 99, T0)
    expect(meta.daily.done).toBe(false)
    // до цели
    progressDaily(meta, ch.kind, 1, T0)
    expect(meta.daily.progress).toBe(1)
    expect(meta.daily.done).toBe(false)
    // до конца
    progressDaily(meta, ch.kind, ch.target, T0)
    expect(meta.daily.done).toBe(true)
    expect(meta.daily.progress).toBe(ch.target)
  })

  it('награда за выполнение: +1 фриз серии (кап 3)', () => {
    const meta = EMPTY_META()
    markVisit(meta, T0)
    const ch = Object.values(CHALLENGES).find((c) => c.target > 1)
    meta.daily.challengeId = ch.id
    meta.daily.progress = 0
    meta.daily.done = false
    progressDaily(meta, ch.kind, ch.target, T0)
    expect(meta.streak.freeze).toBe(1)
  })

  it('новый день перезапускает вызов', () => {
    const meta = EMPTY_META()
    markVisit(meta, T0)
    const ch = Object.values(CHALLENGES).find((c) => c.target > 1)
    meta.daily.challengeId = ch.id
    meta.daily.progress = 0
    meta.daily.done = false
    progressDaily(meta, ch.kind, ch.target, T0)
    expect(meta.daily.done).toBe(true)
    const next = markVisit(meta, T0 + DAY)
    expect(next.meta.daily.date).toBe(dayKey(T0 + DAY))
    expect(next.meta.daily.done).toBe(false)
    expect(next.meta.daily.progress).toBe(0)
  })

  it('ежедневный вызов не даёт прогресс после завершения', () => {
    const meta = EMPTY_META()
    markVisit(meta, T0)
    const ch = Object.values(CHALLENGES).find((c) => c.target > 1)
    meta.daily.challengeId = ch.id
    meta.daily.progress = 0
    meta.daily.done = false
    progressDaily(meta, ch.kind, ch.target, T0)
    const before = meta.daily.progress
    progressDaily(meta, ch.kind, 5, T0)
    expect(meta.daily.progress).toBe(before)
  })
})
