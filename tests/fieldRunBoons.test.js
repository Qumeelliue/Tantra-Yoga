// ДАРЫ ЖИВУТ ОДИН ЗАБЕГ.
//
// Дыра, найденная симуляцией: `meta.boons` копились забег за забегом.
// Пул из десяти даров кончался к третьему пути — и дальше поле шло вообще
// без единого выбора и без силы. Это не сложность, а поломка петли: забег
// переставал что-то значить.
//
// В Hades дары умирают вместе с побегом. Между побегами остаётся знание
// (цитаты, прожитого) — оно и должно копиться, а не боевая мощь.

import { describe, it, expect } from 'vitest'
import { BOONS, rollBoons } from '@webapp/js/core/boons.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rollKeepsakes, KEEPSAKES } from '@webapp/js/core/keepsakes.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const main = readFileSync(join(root, 'webapp/js/main.js'), 'utf8')

describe('Дары не копятся между забегами', () => {
  it('в бою применяются дары забега, а не все накопленные', () => {
    expect(main).toContain('applyBoons(applyKeepsake(applyAspect(applyVarna(base, vId, vLv), app.runAspect), app.runKeepsake, app.runKeepsakeLv), runBoons())')
    expect(main).not.toMatch(/applyBoons\([^)]*meta\.boons/)
  })

  it('выбор дара берёт список забега', () => {
    expect(main).toContain('const owned = runBoons()')
    expect(main).not.toContain('meta.boons || (meta.boons = [])')
  })

  it('забег начинается с пустого списка даров', () => {
    // три места, где забег начинается заново
    expect(main).toMatch(/app\.boons = \[\]/)
    const resets = main.split('app.boons = []').length - 1
    expect(resets, 'сброс должен быть и на фонтане, и при смерти, и при уходе')
      .toBeGreaterThanOrEqual(3)
  })

  it('десять забегов подряд — в каждом есть выбор', () => {
    // Проверка самого pools: сколько раз за забег можно взять дар.
    for (let run = 0; run < 10; run++) {
      const owned = []           // новый забег — пусто
      let picks = 0
      for (let chakra = 0; chakra < 6; chakra++) {
        const opts = rollBoons(owned, Math.random, 3)
        expect(opts.length, `забег ${run + 1}, переход ${chakra + 1}: нечего выбрать`)
          .toBeGreaterThan(0)
        owned.push(opts[0].id)
        picks++
      }
      expect(picks, 'за забег берётся шесть даров').toBe(6)
    }
  })

  it('старый способ давал дары только в первые два забега — в этом суть поломки', () => {
    let owned = []
    let runsWithChoice = 0
    for (let run = 0; run < 10; run++) {
      let any = false
      for (let i = 0; i < 6; i++) {
        const o = rollBoons(owned, Math.random, 3)
        if (o.length) { owned.push(o[0].id); any = true }
      }
      if (any) runsWithChoice++
    }
    expect(runsWithChoice, 'при коплении между забегами выбор кончается')
      .toBeLessThan(BOONS.length)
  })
})

describe('Нефрит выбирается на забег, а не навсегда', () => {
  it('восемь нефритов кончаются — значит это выбор, а не растущий список', () => {
    expect(KEEPSAKES.length).toBeGreaterThanOrEqual(8)
    const picks = new Set()
    for (let i = 0; i < 200; i++) {
      const three = rollKeepsakes(Math.random, 3)
      expect(three.length).toBe(3)
      for (const k of three) picks.add(k.id)
    }
    // за 200 фонтанов встретились все восемь
    expect(picks.size).toBe(KEEPSAKES.length)
  })

  it('фонтан всегда даёт ровно три разных', () => {
    for (let i = 0; i < 100; i++) {
      const three = rollKeepsakes(Math.random, 3)
      expect(new Set(three.map((k) => k.id)).size).toBe(3)
    }
  })
})

describe('Лавка одноразовая', () => {
  it('товар нельзя купить дважды', () => {
    expect(main).toContain('app.fieldShopBought')
    expect(main).toContain("if (app.fieldShopBought[key]) return")
    expect(main).toContain("disabled: taken || cost > purse")
  })

  it('перерисовка лавки не возвращает товар на полку', () => {
    // Полки чистятся ОДИН раз — на входе в новую лавку. Внутри экрана
    // стоит только инициализация «если ещё нет», а не сброс: иначе клик
    // «купить» тут же возвращал бы товар на полку.
    const bare = main.match(/^\s*app\.fieldShopBought = \{\}/gm) || []
    expect(bare.length, 'безусловный сброс ровно один — при входе в новую лавку')
      .toBe(1)
    expect(main).toContain('if (!app.fieldShopBought) app.fieldShopBought = {}')
  })
})
