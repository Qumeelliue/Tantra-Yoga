// РЕЛИКВИЯ В НАСТОЯЩЕМ ЗАБЕГЕ, А НЕ В ЕДИНИЧНЫХ ТЕСТАХ.
//
// Проверки `fieldRelics.test.js` отвечают на вопрос «работает ли функция».
// Эта отвечает на вопрос «доедет ли реликвия до игрока за забег» — а это
// четыре разных места, и расхождение в любом из них даёт механику, которой нет.
//
// Путь реликвии:
//
//   владыка пал → покой → дар → ВЫБОР РЕЛИКВИИ → app.fieldRun.relics
//     → applyFieldRelics в сборке КАЖДОЙ комнаты → чипы в бою → строка на финале
//
// Замер: та же раскладка комнат с флагом `--relics=off`, потому что розыгрыш
// реликвии обязан иметь свой генератор — иначе сравнение измеряет две разные
// игры (см. `design/BASE-GAME.md`, МЕХАНИКА 66).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { RELICS } from '@webapp/js/core/data.js'
import { applyFieldRelics } from '@webapp/js/core/fieldRelics.js'
import { DEFAULT_FIELD_OPTIONS } from '@webapp/js/core/field.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const main = read('webapp/js/main.js')

describe('Путь реликвии от владыки до боя', () => {
  it('выбор реликвии стоит в цепочке ПОСЛЕ владыки, а не после любой комнаты', () => {
    // Слот из Slay the Spire — «после босса». Если вставить выбор после любой
    // комнаты, реликвии станут ещё одним даром: их будет 25 за забег, и слота
    // не будет — будет второй источник `sevaShield` и `deflectCalm`.
    const i = main.indexOf('showBoonDraft(next, ')
    expect(i, 'выбор реликвии не найден в afterRest').toBeGreaterThan(0)
    const afterRest = main.slice(i, i + 200)
    expect(afterRest).toMatch(/showRelicDraft/)
    // И НЕ после обычной комнаты: там вызывается `showBoonDraft(nextFloor)` без
    // продолжения. Проверяем, что продолжение есть ровно в одном месте.
    const calls = [...main.matchAll(/showBoonDraft\(/g)].length
    // Раскрытая скобка внутри аргументов: `[^)]*` обрывался на первом `)` и
    // мимо. Именно так выглядит проверка, которая «почти работает».
    const withRelic = (main.match(/showBoonDraft\([\s\S]{0,120}?showRelicDraft\(\)/g) || []).length
    expect(withRelic, 'выбор реликвии привязан не к ветке после владыки').toBe(1)
    expect(calls, 'showBoonDraft вызывается в неожиданном числе мест').toBeGreaterThan(1)
  })

  it('взятая реликвия попадает в забег и применяется к каждой комнате', () => {
    // Связка целиком: забег → сборка опций → бой.
    expect(main).toMatch(/run\.relics = \[\.\.\.\(run\.relics \|\| \[\]\), view\.id\]/)
    expect(main).toMatch(/applyFieldRelics\(/)
    expect(main, 'в бой не передаётся список реликвий — экрану нечего рисовать')
      .toMatch(/relics: app\.fieldRun\?\.relics \|\| \[\]/)
  })

  it('реликвия обнуляется вместе с забегом', () => {
    // Первая версия этой проверки искала `relics` рядом с обнулением тронов при
    // смерти — и не нашла. Потому что путь другой: реликвии лежат В ЗАБЕГЕ
    // (`app.fieldRun.relics`), а `finishFieldRun` обнуляет весь забег целиком.
    // Проверять надо именно этот путь: пока он не найден, можно поверить, что
    // реликвии копятся в новом побеге бесплатно.
    expect(main).toMatch(/relics: \[\]/)
    const fin = main.slice(main.indexOf('function finishFieldRun'), main.indexOf('function finishFieldRun') + 400)
    expect(fin, 'забег не обнуляется при выходе — реликвии пережили бы смерть')
      .toMatch(/app\.fieldRun = null/)
    // И новый забег начинается пустым списком — это и есть обнуление.
    const begin = main.slice(main.indexOf('function beginFieldRun'), main.indexOf('function beginFieldRun') + 700)
    expect(begin).toMatch(/relics: \[\]/)
  })

  it('взятая реликвия видна в итоге забега', () => {
    // Иначе на финале нельзя понять, из чего был собран забег, а «рекорд за
    // забег» без списка сборки — это рекорд без содержания.
    expect(main).toMatch(/реликвии за забег/)
  })
})

describe('Реликвия действительно меняет бой, когда применена к забегу', () => {
  it('каждая реликвия из пула даёт измеримую разницу в опциях', () => {
    // Не «функция вернула число», а «бой с ней отличается от боя без неё» —
    // это то, что имеет значение для игрока.
    for (const id of Object.keys(RELICS)) {
      const base = { ...DEFAULT_FIELD_OPTIONS, playerHp: 60 }
      const withRelic = applyFieldRelics(base, [id])
      const diff = Object.entries(withRelic).filter(([k, v]) => v !== base[k])
      expect(diff.length, `«${id}»: бой с реликвией не отличается от боя без неё`)
        .toBeGreaterThan(0)
    }
  })

  it('набор реликвий не ломает потолки опций', () => {
    // Шесть реликвий подряд — предел забега (7 владык). Опции обязаны остаться
    // осмысленными: щит не выше потолка, Ци не выше потолка, цена мантры не
    // отрицательная.
    const all = Object.keys(RELICS).slice(0, 6)
    const o = applyFieldRelics({ ...DEFAULT_FIELD_OPTIONS, playerHp: 60 }, all)
    expect(o.shieldStart).toBeLessThanOrEqual(o.shieldMax)
    expect(o.psychicStart).toBeLessThanOrEqual(o.psychicMax)
    expect(o.mantraCostCut).toBeGreaterThanOrEqual(0)
    for (const v of Object.values(o)) {
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true)
    }
  })
})
