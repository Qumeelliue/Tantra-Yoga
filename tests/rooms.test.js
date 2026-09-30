// Этап = несколько комнат подряд, потом комната владыки (Hades).
// Проверяем, что комнаты разные и что их становится тяжелее.

import { describe, it, expect } from 'vitest'
import { buildFieldFloor, worldLook, calmMulFor } from '@webapp/js/core/fieldBuild.js'
import { worldForFloor } from '@webapp/js/core/data.js'
import { LAST_FLOOR, isLastFloor } from '@webapp/js/core/stageRoute.js'
import { DEFAULT_FIELD_OPTIONS } from '@webapp/js/core/field.js'

const F = { w: 412, h: 600 }
const at = (room) => buildFieldFloor(1, { field: F, room })

describe('Комнаты этапа', () => {
  it('комнаты в этапе не повторяются', () => {
    const seen = new Set()
    for (let r = 0; r < 4; r++) seen.add(at(r).foes.map((f) => `${Math.round(f.x)},${Math.round(f.y)}`).join('|'))
    expect(seen.size).toBe(4)
  })

  it('с каждой комнатой оков становится больше', () => {
    const counts = [0, 1, 2, 3].map((r) => at(r).foes.length)
    expect(counts[1]).toBeGreaterThan(counts[0])
    expect(counts[2]).toBeGreaterThan(counts[1])
    expect(counts[3]).toBeGreaterThan(counts[2])
  })

  it('владыка нигде не сидит в обычной комнате', () => {
    for (let r = 0; r < 4; r++) {
      expect(at(r).foes.some((f) => f.isBoss)).toBe(false)
      expect(at(r).boss).toBeTruthy()
    }
  })

  it('глубина чакры тоже добавляет оков', () => {
    const shallow = buildFieldFloor(0, { field: F, room: 0 }).foes.length
    const deep = buildFieldFloor(5, { field: F, room: 0 }).foes.length
    expect(deep).toBeGreaterThanOrEqual(shallow)
  })

  it('стихия локации не меняется от номера комнаты', () => {
    for (let r = 0; r < 3; r++) expect(at(r).look.motif).toBe(worldLook(1).motif)
  })
})

// ── Запас спокойствия оковы в Поле Ума ─────────────────────────────────
// Три комнаты подряд, потом владыка. Слишком короткий бой — тоже поломка:
// окову снимали три возврата удара, и комната щёлкала за десять секунд.
describe('Длина боя', () => {
  it('у оковы свой множитель запаса — карточный путь он не трогает', () => {
    // calmMax в content — это значение карточного пути. Поднятие там
    // 2 → 3 уронило число мирных финалов с 20 до 15. Поле Ума получило
    // отдельный рычаг, ровно как bossCalmScale.
    expect(calmMulFor(0)).toBeGreaterThan(1)
    expect(calmMulFor(6)).toBeLessThanOrEqual(2.5)
  })

  it('множитель применяется, и запас округляется', () => {
    const withMul = buildFieldFloor(1, { field: F, room: 0, opts: { calmMul: 2 } })
    const without = buildFieldFloor(1, { field: F, room: 0, opts: { calmMul: 1 } })
    expect(withMul.foes[0].calmMax).toBeGreaterThan(without.foes[0].calmMax)
    for (const f of withMul.foes) expect(Number.isInteger(f.calmMax)).toBe(true)
  })

  it('без множителя оковы остаются как в контенте', () => {
    const a = buildFieldFloor(1, { field: F, room: 0, opts: { calmMul: 1 } })
    expect(a.foes[0].calmMax).toBe(2)
  })

  it('с каждой чакрой оковы крепче, а не только многочисленнее', () => {
    // В Hades сложность растёт крепостью врага, а не числом мишеней.
    const calm = []
    for (let f = 0; f < 7; f++) calm.push(calmMulFor(f))
    expect(calm[0]).toBe(1.5)
    expect(calm[6]).toBeGreaterThan(calm[0])
    for (let i = 1; i < calm.length; i++) expect(calm[i]).toBeGreaterThanOrEqual(calm[i - 1])
  })

  it('владыка крепнеет вместе с чакрой', () => {
    const first = buildFieldFloor(0, { field: F, room: 3 }).boss.calmMax
    const last = buildFieldFloor(6, { field: F, room: 3 }).boss.calmMax
    expect(last).toBeGreaterThan(first)
  })

  it('оковы паузят короче — натиск не прерывается', () => {
    expect(DEFAULT_FIELD_OPTIONS.enemyCooldown).toBeLessThan(1.1)
  })
})

// ── Мир не начинается заново на восьмой чакре ───────────────────────────
// `worldForFloor` сворачивает по кругу: для восьмой чакры уже не существует
// локации. Пока финала не было, дар после седьмого владыки вёл именно туда —
// и игрок крутился по первому миру вечно.
describe('Конец пути', () => {
  it('после седьмой чакры новой локации нет', () => {
    expect(worldForFloor(LAST_FLOOR).name).toBeTruthy()
    // восьмая — это снова первая: значит заходить туда нельзя
    expect(worldForFloor(LAST_FLOOR + 1).name).toBe(worldForFloor(0).name)
  })

  it('у седьмой чакры есть владыка, и он последний', () => {
    const b = buildFieldFloor(LAST_FLOOR, { field: F, room: 3 })
    expect(b.boss).toBeTruthy()
    expect(isLastFloor(LAST_FLOOR)).toBe(true)
  })
})
