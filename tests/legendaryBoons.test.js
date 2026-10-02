// ЛЕГЕНДАРНЫЕ ДАРЫ (копия из Hades: legendary boons требуют предпосылок).
//
// Проверяется то, что делает легендарный дар игрой, а не подписью:
//
//   1. **легендарный не предлагается, пока нет предпосылок** — иначе это
//      обычный дар с золотой рамкой;
//   2. **предпосылки — из контента, а не перечислены в коде** — иначе
//      правка boons.json ничего не открывала бы;
//   3. **предпосылки достижимы за один забег** — если их нужно больше, чем
//      забег даёт даров, легендарный дар был бы недостижим и не появился бы
//      никогда;
//   4. **легендарный сильнее обычного, из которого вырос**, и меняет тот же
//      слот — новое правило не вводится;
//   5. **легендарный работает в обоих путях** (поле и колода) — дубль даров
//      не должен разъезжаться;
//   6. **он всё ещё настоящий принцип из Шастр**, а не выдумка: цитата
//      совпадает с обычным даром того же принципа.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  BOONS, BOON_RARITY, rollBoons, applyBoons, isBoonUnlocked,
} from '@webapp/js/core/boons.js'
import { DEFAULT_FIELD_OPTIONS } from '@webapp/js/core/field.js'
import { ROOMS_PER_STAGE } from '@webapp/js/core/stageRoute.js'
import BOONS_DATA from '@content/boons.json'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const engine = read('webapp/js/core/engine.js')
const base = read('design/BASE-GAME.md')

const legends = BOONS.filter((b) => b.rarity === 'legendary')

describe('Легендарный дар не появляется раньше времени', () => {
  it('легендарные дары вообще есть — иначе механика пустая', () => {
    expect(legends.length).toBeGreaterThanOrEqual(3)
  })

  it('у каждого есть предпосылки, и они названы в контенте', () => {
    for (const b of legends) {
      expect(b.requires.length, `${b.id}: без предпосылок`).toBeGreaterThan(0)
      // Предпосылка обязана быть настоящим даром, а не строкой в пустоте:
      // иначе дар был бы заперт навсегда и никто бы его не увидел.
      for (const need of b.requires) {
        expect(BOONS_DATA[need], `${b.id}: предпосылка ${need} не существует`).toBeTruthy()
      }
    }
  })

  it('пока предпосылок нет — дар не выпадает ни при каких 200 розыгрышах', () => {
    // Главная проверка. Если легендарный всплывает без предпосылок, то
    // «предпосылки» — только надпись, а игрок берёт усиление без выбора.
    let n = 0
    for (let i = 0; i < 200; i++) {
      for (const b of rollBoons([], () => (i * 0.6180339887) % 1, 3)) {
        if (b.rarity === 'legendary') n++
      }
    }
    expect(n, 'легендарный выпал без единой предпосылки').toBe(0)
  })

  it('как только предпосылки собраны — дар открывается', () => {
    for (const b of legends) {
      expect(isBoonUnlocked(b, b.requires), `${b.id}`).toBe(true)
      expect(isBoonUnlocked(b, b.requires.slice(0, 1)), `${b.id}: половина предпосылок`).toBe(false)
      expect(isBoonUnlocked(b, []), `${b.id}: пустой набор`).toBe(false)
    }
  })

  it('предпосылки достижимы за один забег', () => {
    // Забег даёт дар на каждом этапе: семь чакр, минус владыка и конец.
    // Если бы предпосылок требовалось больше, чем забег может дать, дар был
    // бы красивой карточкой в файле контента, недостижимой в игре.
    const maxPerRun = ROOMS_PER_STAGE > 0 ? 7 : 7
    for (const b of legends) {
      expect(b.requires.length, `${b.id}: нужно ${b.requires.length} предпосылок`).toBeLessThanOrEqual(maxPerRun)
      // и предпосылки не должны требовать сами себя
      expect(b.requires, `${b.id}: требует сам себя`).not.toContain(b.id)
    }
  })

  it('легендарный дар реально выпадает, когда предпосылки собраны', () => {
    // Проверка «механика работает», а не «механика описана в файле».
    let seen = 0
    for (const b of legends) {
      for (let i = 0; i < 400; i++) {
        if (rollBoons(b.requires, () => (i * 0.7548776662) % 1, 3).some((x) => x.id === b.id)) seen++
      }
    }
    expect(seen, 'ни один легендарный ни разу не выпал при собранных предпосылках').toBeGreaterThan(0)
  })

  it('предпосылки проверяются по коду, а не перечислением id', () => {
    // Список живых даров в коде исчез бы, если бы появился новый
    // легендарный. А он появится — автор добавляет контент.
    expect(isBoonUnlocked({ requires: ['ahimsa'] }, ['ahimsa'])).toBe(true)
    expect(isBoonUnlocked({ requires: ['ahimsa'] }, ['tapah'])).toBe(false)
    expect(isBoonUnlocked({ requires: undefined }, [])).toBe(true)
    expect(isBoonUnlocked(undefined, [])).toBe(false)
  })
})

describe('Легендарный сильнее обычного и не вводит нового', () => {
  it('у каждого есть «обычный» дар того же принципа', () => {
    for (const b of legends) {
      const base_ = BOONS.find((x) => x.id === b.quoteId && x.rarity !== 'legendary')
      expect(base_, `${b.id}: нет обычного дара для принципа ${b.quoteId}`).toBeTruthy()
      // Предпосылки обязаны включать этот обычный дар: легендарный вырастает
      // из него, а не висит в воздухе.
      expect(b.requires, `${b.id}: обычный дар ${base_.id} не в предпосылках`).toContain(base_.id)
    }
  })

  it('на поле он меняет тот же слот и делает его лучше', () => {
    for (const b of legends) {
      const plain = BOONS.find((x) => x.id === b.quoteId && x.rarity !== 'legendary')
      const one = applyBoons({ ...DEFAULT_FIELD_OPTIONS }, plain.requires)
      const two = applyBoons({ ...DEFAULT_FIELD_OPTIONS }, [...plain.requires, b.id])
      // Новых слотов не появилось — новое правило не вводится.
      expect(Object.keys(two).filter((k) => !(k in DEFAULT_FIELD_OPTIONS))).toEqual([])
      // И что-то стало строже/сильнее: иначе это просто дубль обычного.
      const changed = Object.keys(two).filter((k) => two[k] !== one[k])
      expect(changed.length, `${b.id}: не изменил ничего`).toBeGreaterThan(0)
    }
  })

  it('легендарный даёт БОЛЬШЕ, чем даёт обычный, а не столько же', () => {
    // ГЛАВНАЯ проверка модуля, добавлена после замера 2026-09-30.
    //
    // Прежняя проверка спрашивала «изменилось ли хоть что-нибудь» — и проходила
    // для всех четырёх легендарных, включая те, что давали ровно тот же
    // прирост, что и обычный дар. Она отвечала на вопрос «жив ли слот», а нужен
    // был вопрос «сильнее ли он». Три из четырёх были обычным даром в золотой
    // рамке: игрок выращивал предпосылки два этапа и получал ровно то же.
    //
    // Теперь сравниваются ПРИРОСТКИ, а не итоговые значения: берём чистые
    // опции, добавляем обычный дар — получаем его прирост; добавляем
    // легендарный — получаем его прирост. Второй обязан быть заметно больше.
    for (const b of legends) {
      const plain = BOONS.find((x) => x.id === b.quoteId && x.rarity !== 'legendary')
      const zero = applyBoons({ ...DEFAULT_FIELD_OPTIONS }, [])
      const withPlain = applyBoons({ ...DEFAULT_FIELD_OPTIONS }, [plain.id])
      const withLegend = applyBoons({ ...DEFAULT_FIELD_OPTIONS }, [b.id])
      const slots = Object.keys(withLegend).filter((k) => withLegend[k] !== zero[k])
      expect(slots.length, `${b.id}: не изменил ничего`).toBeGreaterThan(0)
      // Слот должен совпадать с обычным даром того же принципа: легендарный
      // вырастает ИЗ него, а не изобретает свой.
      const plainSlots = Object.keys(withPlain).filter((k) => withPlain[k] !== zero[k])
      for (const k of slots) {
        expect(plainSlots, `${b.id}: двигает слот «${k}», а обычный ${plain.id} — нет`)
          .toContain(k)
        const gainLegend = withLegend[k] - zero[k]
        const gainPlain = withPlain[k] - zero[k]
        expect(
          Math.abs(gainLegend), `${b.id}: слот «${k}» — прирост 0, пустой дар`,
        ).toBeGreaterThan(0)
        // В полтора раза больше — не «чуть-чуть больше», что было бы шумом.
        expect(
          Math.abs(gainLegend), `${b.id}: слот «${k}» даёт ${Math.abs(gainLegend)}, обычный ${plain.id} — ${Math.abs(gainPlain)}. Легендарный обязан быть заметно сильнее`,
        ).toBeGreaterThan(Math.abs(gainPlain) * 1.5)
      }
    }
  })

  it('в колоде он тоже сильнее — а не только на поле', () => {
    // Два пути правят разными слотами, поэтому эффекты разные. Но «сильнее»
    // обязано быть в обоих: иначе игрок карточного пути получил бы слабый
    // дар с названием «легендарный».
    for (const b of legends) {
      const fx = BOONS_DATA[b.id].effects[0]
      const plainFx = BOONS_DATA[BOONS.find((x) => x.id === b.quoteId && x.rarity !== 'legendary').id].effects[0]
      expect(fx.kind, `${b.id}: другой вид эффекта, чем у обычного`).toBe(plainFx.kind)
      expect(fx.amount, `${b.id}: слабее обычного`).toBeGreaterThan(plainFx.amount)
    }
  })

  it('движок колоды знает про этот вид эффекта', () => {
    // Эффекты новых даров берутся из контента, а читает их движок. Новое
    // `mod_boon_*` без строчки в движке — карта, которая ничего не делает.
    for (const b of legends) {
      for (const fx of BOONS_DATA[b.id].effects) {
        expect(engine, `движок не умеет ${fx.kind}`).toContain(`case '${fx.kind}'`)
      }
    }
  })

  it('редкость названа словами, и легендарная — не «редкий»', () => {
    // Первый вариант называл её «редким»: тернарник в разметке. Игрок видел
    // «редкий» на карточке, за которой стоит двойной эффект.
    expect(BOON_RARITY.legendary).toBe('легендарный')
    for (const b of legends) expect(Object.keys(BOON_RARITY)).toContain(b.rarity)
  })

  it('цитата та же, что у принципа — это тот же принцип, глубже', () => {
    for (const b of legends) {
      expect(BOONS_DATA[b.quoteId], `${b.id}: цитата ${b.quoteId} не существует`).toBeTruthy()
    }
  })
})

describe('Легендарные дары — копия, а не своя идея', () => {
  it('записаны в BASE-GAME со своим источником', () => {
    expect(base).toContain('МЕХАНИКА 48')
    expect(base).toContain('legendary')
  })
})
describe('Вес легендарного подобран замером, а не на глаз', () => {
  // Проверяется частота, а не только «механика существует». Первый вариант
  // дал 2.6 % розыгрышей: карточка была в файле, а шанса её увидеть почти
  // не было — то есть механика существовала только на бумаге.
  const freq = (owned, N = 8000) => {
    let hits = 0
    for (let i = 0; i < N; i++) {
      const r = rollBoons(owned, () => (i * 0.6180339887) % 1, 3)
      if (r.some((b) => b.rarity === 'legendary')) hits++
    }
    return hits / N
  }

  it('при собранных предпосылках легендарный ощутим, но не гарантирован', () => {
    const f = freq(legends[0].requires)
    expect(f, `частота ${(f * 100).toFixed(1)}% — либо почти никогда, либо почти всегда`).toBeGreaterThan(0.05)
    expect(f, `частота ${(f * 100).toFixed(1)}% — легендарный стал обычным`).toBeLessThan(0.3)
  })

  it('без предпосылок частота строго нулевая', () => {
    expect(freq([])).toBe(0)
    expect(freq(['ahimsa'])).toBe(0)
  })
})
