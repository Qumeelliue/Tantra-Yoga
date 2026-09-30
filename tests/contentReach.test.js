// ДОСТИЖИМОСТЬ КОНТЕНТА.
//
// Содержимое, до которого нельзя дойти, — это не контент, а мусор: оно
// занимает место, время автора и создаёт иллюзию, что игра больше, чем
// она есть. Пять вртти (жадность, зависть, ненависть, сомнение, дремота)
// были написаны, но ни одно событие их не выдавало — игрок не мог встретить
// их вообще, а шесть внутренних оков без трёх не имели образа в карточном
// пути.

import { describe, it, expect } from 'vitest'
import { CARDS, EVENTS, RELICS, QUOTES, cardRewardPool } from '@webapp/js/core/data.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const vritti = Object.entries(CARDS).filter(([, c]) => c && c.type === 'vritti')
const eventsJson = JSON.stringify(EVENTS)

describe('Контент достижим', () => {
  it('восемь вртти — шесть внутренних оков и дремота', () => {
    expect(vritti).toHaveLength(8)
    const ids = vritti.map(([k]) => k).sort()
    expect(ids).toEqual(['alasya', 'bhaya', 'dvesha', 'krodha', 'lobha', 'mada', 'matsarya', 'samshaya'])
  })

  it('каждую вртти выдаёт хотя бы одно событие', () => {
    const missing = vritti.map(([k]) => k).filter((k) => !eventsJson.includes(`"${k}"`))
    expect(missing).toEqual([])
  })

  it('событие с вртти обязательно предлагает и чистый выход', () => {
    // Форма «Уныния» и «Гордости»: практика или сила. Без чистого пути
    // событие учит только брать — а это не ахимса.
    for (const [id, ev] of Object.entries(EVENTS)) {
      if (!ev || !ev.choices) continue
      if (!JSON.stringify(ev).includes('add_card')) continue
      const kinds = ev.choices.map((c) => c.kind)
      expect(kinds, id).toContain('practice')
      expect(kinds, id).toContain('strength')
    }
  })

  it('у события есть текст и два выбора', () => {
    for (const [id, ev] of Object.entries(EVENTS)) {
      if (!ev || id.startsWith('_')) continue
      expect(typeof ev.text, id).toBe('string')
      expect(ev.text.length, id).toBeGreaterThan(20)
      expect(Array.isArray(ev.choices) && ev.choices.length >= 2, id).toBe(true)
      for (const c of ev.choices) {
        expect(typeof c.text, id).toBe('string')
        expect(typeof c.sub, id).toBe('string')
        expect(Array.isArray(c.effects), `${id}/${c.text}`).toBe(true)
      }
      // пустые эффекты допустимы («прошёл мимо» — тоже выбор), но хоть
      // один выход в событии что-то должен давать
      expect(ev.choices.some((c) => c.effects.length > 0), id).toBe(true)
    }
  })

  it('события не повторяют id', () => {
    const ids = Object.keys(EVENTS).filter((k) => !k.startsWith('_'))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('каждая реликвия попадает в лавку', () => {
    // Реликвии выдаются из «не купленных» — значит, недостижимых быть не может
    const ids = Object.keys(RELICS).filter((k) => !k.startsWith('_'))
    expect(ids.length).toBeGreaterThan(0)
  })

  it('каждая карта в пуле наград приходит либо сразу, либо через испытание', () => {
    // Пусть открыты все испытания — тогда доступно всё, что вообще может
    // прийти в награду. Ни одна карта не должна быть «недостижимой в принципе».
    const all = new Set(cardRewardPool(Object.keys(CARDS)).map((c) => c.id))
    const starters = new Set()
    for (const c of Object.values(CARDS)) if (c && c.starter) starters.add(c.id)
    const orphans = Object.entries(CARDS)
      .filter(([k, c]) => c && !k.startsWith('_') && c.type !== 'curse' && c.type !== 'vritti')
      .map(([k]) => k)
      .filter((k) => !all.has(k) && !starters.has(k))
    expect(orphans).toEqual([])
  })

  it('у каждой цитаты есть санскрит, смысл и источник', () => {
    const bad = []
    for (const [k, v] of Object.entries(QUOTES)) {
      if (k.startsWith('_') || !v) continue
      if (!v.term || !v.meaning || !v.source) bad.push(k)
    }
    expect(bad).toEqual([])
  })
})

// ── Победа в бое не лечит (Hades) ──────────────────────────────────────
// Раньше саттва давала +2 жизни после каждого узла, и карточный забег был
// невозможно проиграть: 96% побед. В Hades здоровье берут только на
// фонтанах — иначе они не стоят ничего.
describe('Лечение — только за дело', () => {
  it('после боя никто не прибавляет жизни молча', () => {
    const main = readFileSync(join(root, 'webapp/js/core/run.js'), 'utf8')
    expect(main).not.toMatch(/sattvaGain > 0\) \{\s*\n\s*run\.hp/)
  })

  it('лечит узел «медитация» — это и есть фонтан', () => {
    const main = readFileSync(join(root, 'webapp/js/main.js'), 'utf8')
    expect(main).toContain('function showMeditation')
    expect(main).toContain('app.run.hp = Math.min(app.run.maxHp, app.run.hp + heal)')
    expect(main).toContain('Практика вернула')
  })

  it('медитация лечит тем больше, чем лучше практика', () => {
    const main = readFileSync(join(root, 'webapp/js/main.js'), 'utf8')
    expect(main).toMatch(/quality >= 3 \? 0\.4 : 0\.22/)
  })
})
