// Тесты даров чакры.
//
// Дары — это сердце забега в Hades: после каждой комнаты боги дают
// божественный дар, игрок берёт ОДИН из трёх, и они складываются. Здесь
// проверяем: (1) дары настоящие, с цитатами; (2) каждый меняет ОДИН
// существующий слот; (3) выбор честный — без повторов.

import { describe, it, expect } from 'vitest'
import { BOONS, rollBoons, applyBoons } from '@webapp/js/core/boons.js'
import { DEFAULT_FIELD_OPTIONS, createField, castMantra } from '@webapp/js/core/field.js'
import BOONS_DATA from '@content/boons.json'

describe('Дары чакры: настоящие, с цитатами', () => {
  it('у каждого дара есть термин, санскрит и quoteId', () => {
    expect(BOONS.length).toBeGreaterThanOrEqual(10)
    for (const b of BOONS) {
      expect(b.quoteId).toBeTruthy()
      expect(b.name).toBeTruthy()
      expect(b.sanskrit).toBeTruthy()
      expect(b.desc).toBeTruthy()
    }
  })

  it('id и цитаты совпадают с content/boons.json — не выдуманы', () => {
    for (const b of BOONS) {
      const src = BOONS_DATA[b.id]
      expect(src).toBeTruthy()
      expect(src.quoteId).toBe(b.quoteId)
      expect(src.sanskrit).toBe(b.sanskrit)
    }
  })

  it('личность дара берётся из контента, а не из кода: имя и редкость — тоже', () => {
    // Список даров был написан дважды. Совпадение строк — не гарантия:
    // переименование в контенте тихо оставило бы старое имя в бою.
    for (const b of BOONS) {
      expect(BOONS_DATA[b.id].name).toBe(b.name)
      expect(BOONS_DATA[b.id].rarity).toBe(b.rarity)
    }
  })

  it('оба пути предлагают один и тот же набор — дубль не рассыпался', () => {
    // Поле и колода — два способа пройти один забег. Если у дара появится
    // только одна половинка, игрок второго пути его не увидит.
    const cardIds = Object.keys(BOONS_DATA).filter((k) => !k.startsWith('_')).sort()
    expect(BOONS.map((b) => b.id).sort()).toEqual(cardIds)
  })

  it('описание боя не говорит словами колоды, и наоборот', () => {
    // Два пути правят разными слотами (дефлект против энергии), поэтому
    // слова у них разные. Но смешивать их нельзя: «+1 карта в ход» на арене
    // ничего не значит, а «щит» в колоде — тоже.
    const cardWords = ['карта', 'карту', 'карты', 'колод', 'энергия', 'энергии']
    const fieldWords = ['дефлект', 'Ци', 'щит', 'пелена']
    const text = (s) => s.toLowerCase()
    for (const b of BOONS) {
      for (const line of [b.desc, b.field]) {
        for (const w of cardWords) expect(text(line), `поле: ${b.id}`).not.toContain(w.toLowerCase())
      }
    }
    for (const id of Object.keys(BOONS_DATA)) {
      if (id.startsWith('_')) continue
      const line = text(BOONS_DATA[id].desc || '')
      for (const w of fieldWords) expect(line, `колода: ${id}`).not.toContain(w.toLowerCase())
    }
  })

  it('id уникальны', () => {
    const ids = BOONS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('у каждого дара есть слот в бою: apply обязан что-то менять', () => {
    const before = { ...DEFAULT_FIELD_OPTIONS }
    for (const b of BOONS) {
      const copy = { ...before }
      b.apply(copy)                                  // apply мутирует копию
      const added = Object.keys(copy).filter((k) => !(k in before))
      expect(added).toEqual([])                     // новых слотов не заводим
      const changed = Object.keys(copy).filter((k) => copy[k] !== before[k])
      expect(changed.length).toBeGreaterThan(0)     // а что-то меняется
    }
  })

  it('входные опции не мутируются', () => {
    const src = { ...DEFAULT_FIELD_OPTIONS }
    applyBoons(src, BOONS.map((b) => b.id))
    expect(src.parryWindow).toBe(DEFAULT_FIELD_OPTIONS.parryWindow)
  })
})

describe('Дары чакры: выбор 1 из 3 (Hades)', () => {
  it('даров на выбор ровно три', () => {
    const three = rollBoons([], () => 0.5, 3)
    expect(three).toHaveLength(3)
  })

  it('в выборе нет повторов', () => {
    const got = rollBoons([], Math.random, 3)
    expect(new Set(got.map((b) => b.id)).size).toBe(3)
  })

  it('уже взятый дар не предлагается снова', () => {
    const got = rollBoons(['ahimsa', 'kiirtana'], () => 0.4, 3)
    expect(got.map((b) => b.id)).not.toContain('ahimsa')
    expect(got.map((b) => b.id)).not.toContain('kiirtana')
  })

  it('все дары кончились — выбор не ломает игру', () => {
    const all = BOONS.map((b) => b.id)
    expect(rollBoons(all, () => 0.5, 3)).toEqual([])
  })

  it('рандом не ломает: 300 прокрутов дают ровно три разных', () => {
    for (let i = 0; i < 300; i++) {
      const got = rollBoons([], () => Math.random(), 3)
      expect(got).toHaveLength(3)
      expect(new Set(got.map((b) => b.id)).size).toBe(3)
    }
  })

  it('редкие выпадают реже обычных (веса как в Hades)', () => {
    let common = 0, rare = 0
    for (let i = 0; i < 4000; i++) {
      const got = rollBoons([], () => Math.random(), 3)
      for (const b of got) { if (b.rarity === 'common') common++; if (b.rarity === 'rare') rare++ }
    }
    expect(common).toBeGreaterThan(rare)
  })
})

describe('Дары реально меняют бой', () => {
  it('Дар Ахимсы: дефлект даёт больше спокойствия', () => {
    const o = applyBoons({ ...DEFAULT_FIELD_OPTIONS }, ['ahimsa'])
    expect(o.deflectCalm).toBeGreaterThan(DEFAULT_FIELD_OPTIONS.deflectCalm)
  })

  it('Дар Мантры: мантра дешевле на 1 Ци', () => {
    const o = applyBoons({ ...DEFAULT_FIELD_OPTIONS }, ['mantra'])
    const st = createField({
      player: { x: 0, y: 0, hp: 60 }, foes: [], rng: () => 0.5,
      opts: { ...o, mantraId: 'madhuvidya' },
    })
    st.player.psychic = 1     // ровно 1 — со скидкой хватит, без неё нет
    const ev = castMantra(st)
    expect(ev.some((e) => e.type === 'mantra')).toBe(true)
  })

  it('Дар Пранаямы: вход с бо́льшим запасом Ци', () => {
    const o = applyBoons({ ...DEFAULT_FIELD_OPTIONS }, ['pranayama'])
    const st = createField({ player: { x: 0, y: 0, hp: 60 }, foes: [], rng: () => 0.5, opts: o })
    expect(st.player.psychic).toBe(o.psychicStart)
  })

  it('Дар Каруны: вход со щитом', () => {
    const o = applyBoons({ ...DEFAULT_FIELD_OPTIONS }, ['karuna'])
    const st = createField({ player: { x: 0, y: 0, hp: 60 }, foes: [], rng: () => 0.5, opts: o })
    expect(st.player.shield).toBe(4)
  })

  it('Дар Сатьи: пелена неведения отступает позже', () => {
    const o = applyBoons({ ...DEFAULT_FIELD_OPTIONS }, ['satya'])
    expect(o.auraVeilAt).toBeGreaterThan(DEFAULT_FIELD_OPTIONS.auraVeilAt)
  })
})
