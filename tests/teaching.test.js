// ПРЕПОДАВАНИЕ: знание приходит от места, а не от карты.
//
// Цитат в корпусе 100, а открывалось 52. Остальные 48 были написаны, сверены
// с источниками, лежали в content/ — и были не видны игроку никогда. Это не
// «запас на будущее», а мусор: он занимает место, время автора и создаёт
// иллюзию, что игра больше, чем она есть.

import { describe, it, expect } from 'vitest'
import {
  WORLD_QUOTES, TEACHER_QUOTES, PLACE_QUOTES,
  nextTeacherQuote, teacherChain, placeQuotes, chakraQuote,
  reachableQuoteIds, brokenTeaching,
} from '@webapp/js/core/teaching.js'
import { QUOTES, CITY_TEACHERS, WORLDS, ENEMIES, CARDS, RELICS } from '@webapp/js/core/data.js'

describe('Каждая цитата проживаема', () => {
  it('все цитаты корпуса доступны', () => {
    const all = Object.keys(QUOTES).filter((k) => !k.startsWith('_'))
    // 100 было «сто цитат корпуса» до тронов чакры (МЕХАНИКА 58), которые
    // добавили 4: кула-кундалини, самкальпа, викальпа, санчара. Число
    // проверяется не само по себе, а тем, что НИ ОДНА цитата не потеряла
    // путь проживания: следующая строка и есть эта проверка.
    expect(all).toHaveLength(104)
    // полный набор — с учётом оков, карт, реликвий, даров и преподвания
    const reach = new Set(reachableQuoteIds())
    for (const e of Object.values(ENEMIES)) if (e && e.quoteId) reach.add(e.quoteId)
    for (const c of Object.values(CARDS)) if (c && c.quoteId) reach.add(c.quoteId)
    for (const r of Object.values(RELICS)) if (r && r.quoteId) reach.add(r.quoteId)
    const missing = all.filter((k) => !reach.has(k))
    expect(missing).toEqual([])
  })

  it('привязки ведут к существующим цитатам', () => {
    expect(brokenTeaching()).toEqual([])
  })

  it('у каждой чакры есть своя цитата', () => {
    const chakras = Object.keys(WORLDS).filter((k) => !k.startsWith('_'))
    expect(chakras).toHaveLength(7)
    for (const c of chakras) {
      const q = chakraQuote(c)
      expect(q, `чакра ${c}`).toBeTruthy()
      expect(QUOTES[q], `чакра ${c}`).toBeTruthy()
    }
  })

  it('у каждого учителя есть цепочка учения', () => {
    const ids = Object.keys(CITY_TEACHERS)
    expect(ids).toHaveLength(7)
    for (const id of ids) {
      const chain = teacherChain(id)
      expect(chain.length, id).toBeGreaterThanOrEqual(2)
      for (const q of chain) expect(QUOTES[q], `${id}/${q}`).toBeTruthy()
    }
  })

  it('учитель отдаёт учение по одной цитате, а не всё сразу', () => {
    const id = 'moha'
    const chain = teacherChain(id)
    const lived = {}
    const given = []
    for (let i = 0; i < 10; i++) {
      const q = nextTeacherQuote(id, lived)
      if (!q) break
      expect(given, 'повторно не выдаёт').not.toContain(q)
      given.push(q)
      lived[q] = true
    }
    expect(given).toEqual(chain)
  })

  it('истощённый учитель больше ничего не даёт', () => {
    const id = 'moha'
    const lived = {}
    for (const q of teacherChain(id)) lived[q] = true
    expect(nextTeacherQuote(id, lived)).toBeNull()
  })

  it('учитель без цепочки не ломает экран', () => {
    expect(nextTeacherQuote('такого-нет', {})).toBeNull()
    expect(teacherChain('такого-нет')).toEqual([])
  })

  it('места тоже учат, и у каждого есть цитата', () => {
    for (const place of ['spring', 'rest', 'shop', 'chaos', 'death']) {
      const q = placeQuotes(place)
      expect(q.length, place).toBeGreaterThan(0)
      expect(QUOTES[q[0]], place).toBeTruthy()
    }
  })

  it('финал отдаёт сразу несколько цитат', () => {
    expect(placeQuotes('finale').length).toBeGreaterThanOrEqual(5)
  })

  it('неизвестное место не ломает ничего', () => {
    expect(placeQuotes('такого-нет')).toEqual([])
    expect(chakraQuote('такой-нет')).toBeNull()
  })
})
