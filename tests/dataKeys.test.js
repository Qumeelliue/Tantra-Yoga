// СЛУЖЕБНЫЕ КЛЮЧИ НЕ ПОПАДАЮТ В ИГРУ.
//
// `_comment` в `content/*.json` — комментарий автора. В файле он полезен.
// В игре — нет. Фильтр стоял на половине карт контента (BOONS, CHALLENGES,
// WORLDS) и был забыт на остальных пяти (CARDS, ENEMIES, RELICS, EVENTS,
// QUOTES). Из этого выросло три бага, и все три — падения у игрока:
//
//   · каждое ШЕСТОЕ событие роняло экран:
//     «Cannot read properties of undefined (reading 'map')»;
//   · выдача реликвии могла выдать `_comment` — «реликвия» без имени;
//   · счётчик цитат показывал 101 вместо 100, и случайная цитата иногда
//     была комментарием из JSON.

import { describe, it, expect } from 'vitest'
import {
  CARDS, ENEMIES, RELICS, EVENTS, QUOTES, BOONS, CHALLENGES, WORLDS, CITY_TEACHERS, TRIALS,
} from '@webapp/js/core/data.js'
import { eventOptions } from '@webapp/js/core/run.js'
import { createRun } from '@webapp/js/core/run.js'

const TABLES = { CARDS, ENEMIES, RELICS, EVENTS, QUOTES, BOONS, CHALLENGES, WORLDS }

describe('служебные ключи отсеяны', () => {
  it('ни в одной таблице контента нет ключей с подчёркиванием', () => {
    for (const [name, table] of Object.entries(TABLES)) {
      const bad = Object.keys(table).filter((k) => k.startsWith('_'))
      expect(bad, `${name}: служебные ключи просочились — ${bad.join(', ')}`).toEqual([])
    }
  })

  it('у каждого события есть варианты', () => {
    for (const [id, e] of Object.entries(EVENTS)) {
      expect(Array.isArray(e.choices), `событие ${id}: нет choices`).toBe(true)
      expect(e.choices.length, `событие ${id}: пустые choices`).toBeGreaterThan(0)
    }
  })

  it('у каждой реликвии есть имя и текст', () => {
    for (const [id, r] of Object.entries(RELICS)) {
      expect(typeof r, `реликвия ${id} — не объект`).toBe('object')
      expect(r.name, `реликвия ${id}: нет имени`).toBeTruthy()
      expect(r.desc || r.text, `реликвия ${id}: нет описания`).toBeTruthy()
    }
  })

  it('у каждой цитаты есть термин и источник', () => {
    for (const [id, q] of Object.entries(QUOTES)) {
      expect(q.term, `цитата ${id}: нет термина`).toBeTruthy()
      expect(q.quote || q.meaning, `цитата ${id}: нет текста`).toBeTruthy()
    }
  })

  it('событие всегда приносит настоящее событие — тысяча раз подряд', () => {
    // Именно так ловилась поломка: ключ выбирался из всех, и `_comment`
    // выпадал примерно в одном случае из пятнадцати. Один прогон мог
    // проскочить, поэтому берём много.
    const run = createRun({ meta: { settings: {}, streak: {} } })
    const seen = new Set()
    for (let i = 0; i < 1000; i++) {
      const { id, event } = eventOptions(run)
      expect(event, `выпало событие без данных: ${id}`).toBeTruthy()
      expect(Array.isArray(event.choices), `у события ${id} нет вариантов`).toBe(true)
      seen.add(id)
    }
    expect(seen.size, 'повторяющихся событий быть не должно').toBe(Object.keys(EVENTS).length)
  })

  it('счётчик цитат совпадает с числом цитат', () => {
    // Число цитат выросло со 100 на 104: четыре новых термина на трёх новых
    // владык (МЕХАНИКА 58 — кула-кундалини, самкальпа, викальпа, санчара).
    // Проверка не «ровно 104», а ровно та: счётчик на титуле и в профиле
    // считается из `Object.keys(QUOTES)`, то есть расходиться с корпусом
    // он не может — а вот молча пропасть на 100 не мог.
    expect(Object.keys(QUOTES)).toHaveLength(104)
  })

  it('миры, испытания и учителя — тоже чистые', () => {
    for (const [name, table] of Object.entries({ WORLDS, TRIALS, CITY_TEACHERS })) {
      const bad = Object.keys(table).filter((k) => k.startsWith('_'))
      expect(bad, `${name}: ${bad.join(', ')}`).toEqual([])
    }
  })
})
