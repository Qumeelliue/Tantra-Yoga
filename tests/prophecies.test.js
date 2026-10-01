// ПРОРИЦАНИЯ — копия из Hades (Prophecies).
//
// Проверяется то, что делает список целей рабочим, а не украшением:
//
//   1. **прогресс читается из профиля, а не из событий** — счётчик событий можно
//      забыть сбросить, можно сбросить дважды, можно не сбросить после
//      импорта старого сохранения;
//   2. **выполненное не откатывается назад** — иначе цель, за которую выдали
//      севу, могла бы снова стать «невыполненной» при импорте старого профиля;
//   3. **награда забирается один раз** — иначе сева лилась бы при каждом
//      открытии экрана;
//   4. **награда идёт в ту же валюту, что и постоянные усиления** — в Hades
//      это нектар → зеркало ночи, здесь сева → мастерская. Награда «в никуда»
//      была бы подписью;
//   5. **прогресс не показывает больше 100 %** — счётчик, уехавший выше цели
//      (25 забегов при цели 20), не должен давать полоску за краем;
//   6. **у каждой цели есть цитата** — правило проекта: без цитаты цели нет;
//   7. **список виден, а не спрятан** — иначе это не цели, а сюрприз.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  PROPHECIES, prophecyState, unclaimedPoints, claimProphecy, claimAll,
} from '@webapp/js/core/prophecies.js'
import { EMPTY_META } from '@webapp/js/core/save.js'
import { QUOTES } from '@webapp/js/core/data.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const main = read('webapp/js/main.js')
const save = read('webapp/js/core/save.js')
const base = read('design/BASE-GAME.md')

const metaWith = (o = {}) => {
  const m = EMPTY_META()
  Object.assign(m, o)
  return m
}

describe('Прорицания: цели настоящие и измеримые', () => {
  it('список не пуст, и у каждой цели есть цитата из шастр', () => {
    expect(PROPHECIES.length).toBeGreaterThanOrEqual(6)
    for (const p of PROPHECIES) {
      expect(p.quoteId, `${p.id}: без цитаты`).toBeTruthy()
      expect(QUOTES[p.quoteId], `${p.id}: цитаты ${p.quoteId} нет в корпусе`).toBeTruthy()
      expect(p.text, p.id).toBeTruthy()
      expect(p.reward, `${p.id}: награда`).toBeGreaterThan(0)
      expect(p.target, `${p.id}: цель`).toBeGreaterThan(0)
    }
  })

  it('id уникальны — иначе две цели слиплись бы в одну', () => {
    expect(new Set(PROPHECIES.map((p) => p.id)).size).toBe(PROPHECIES.length)
  })

  it('прогресс читается из счётчиков профиля, а не из событий', () => {
    const m = metaWith({ stats: { ...EMPTY_META().stats, awakened: 5, runs: 30, pacified: 400 } })
    const st = prophecyState(m)
    expect(st.find((p) => p.id === 'peaceful_5').done).toBe(true)
    expect(st.find((p) => p.id === 'runs_20').done).toBe(true)
    expect(st.find((p) => p.id === 'pacified_300').done).toBe(true)
  })

  it('на пустом профиле ничего не выполнено', () => {
    // Иначе новичку показывают «выполнено» за то, чего он не делал.
    for (const p of prophecyState(EMPTY_META())) {
      expect(p.done, `${p.id} выполнено на пустом профиле`).toBe(false)
      expect(p.progress).toBe(0)
    }
  })

  it('прогресс не показывает больше 100 %', () => {
    // Счётчик уехал выше цели: 25 забегов при цели 20.
    const m = metaWith({ stats: { ...EMPTY_META().stats, runs: 25 } })
    const p = prophecyState(m).find((x) => x.id === 'runs_20')
    expect(p.progress).toBe(20)
    expect(p.pct).toBe(100)
  })

  it('пустой профиль не ломает расчёт — ни один счётчик не должен', () => {
    // У каждого счётчика свой путь в профиле (`quotesUnlocked`, `upgrades`,
    // `varnaBranches`, `daily`), и один забытый ломал бы весь экран.
    for (const p of prophecyState({})) {
      expect(p.progress, p.id).toBe(0)
    }
    expect(unclaimedPoints({})).toBe(0)
  })
})

describe('Награда забирается один раз и не теряется', () => {
  it('за выполненную цель дают севу', () => {
    const m = metaWith({ stats: { ...EMPTY_META().stats, awakened: 1 } })
    const r = claimProphecy(m, 'peaceful_1')
    expect(r.ok).toBe(true)
    expect(r.points).toBeGreaterThan(0)
    expect(m.sevaPoints).toBe(r.points)
  })

  it('второй раз не дают', () => {
    // Иначе сева лилась бы при каждом открытии экрана — «награда» перестала бы
    // быть наградой.
    const m = metaWith({ stats: { ...EMPTY_META().stats, awakened: 1 } })
    claimProphecy(m, 'peaceful_1')
    const again = claimProphecy(m, 'peaceful_1')
    expect(again.ok).toBe(false)
    expect(m.sevaPoints).toBe(PROPHECIES.find((p) => p.id === 'peaceful_1').reward)
  })

  it('невыполненную цель не забирают', () => {
    const m = EMPTY_META()
    expect(claimProphecy(m, 'peaceful_5').ok).toBe(false)
    expect(claimProphecy(m, 'peaceful_5').points).toBe(0)
    expect(m.sevaPoints || 0).toBe(0)
  })

  it('несуществующую цель не забирают', () => {
    expect(claimProphecy(EMPTY_META(), 'нет-такой').ok).toBe(false)
    expect(claimProphecy(null, 'peaceful_1').ok).toBe(false)
  })

  it('забрать всё готовое — один раз и без двойного счёта', () => {
    const m = metaWith({ stats: { ...EMPTY_META().stats, awakened: 5, runs: 25 } })
    const first = claimAll(m)
    expect(first.points).toBeGreaterThan(0)
    expect(unclaimedPoints(m)).toBe(0)
    expect(claimAll(m).points).toBe(0)
    expect(m.sevaPoints).toBe(first.points)
  })

  it('выполненное не откатывается назад', () => {
    // Главное свойство. Цель, за которую уже выдали севу, не может снова
    // стать «невыполненной» — даже если счётчик уехал вниз (например, после
    // импорта старого сохранения с меньшими числами).
    const m = metaWith({ stats: { ...EMPTY_META().stats, awakened: 5 } })
    claimProphecy(m, 'peaceful_5')
    m.stats.awakened = 0
    const p = prophecyState(m).find((x) => x.id === 'peaceful_5')
    expect(p.claimed, 'забранное перестало быть забранным').toBe(true)
    expect(p.done).toBe(true)
    expect(claimProphecy(m, 'peaceful_5').ok).toBe(false)
  })

  it('награда идёт в ту же валюту, что и мастерская', () => {
    // В Hades награда за прорицание — нектар, а нектар покупает усиления в
    // зеркале ночи. Награда «в никуда» была бы подписью.
    // Формулировка берётся по смыслу, а не по переносу строки: таблица в
    // BASE-GAME переносится при правках, и проверка молча валилась бы на
    // оформлении.
    const flat = base.replace(/\n/g, ' ')
    expect(flat).toContain('\u043d\u0430\u0433\u0440\u0430\u0434\u0430 \u0438\u0434\u0451\u0442 \u0432 \u0432\u0430\u043b\u044e\u0442\u0443 \u043f\u043e\u0441\u0442\u043e\u044f\u043d\u043d\u044b\u0445 \u0443\u0441\u0438\u043b\u0435\u043d\u0438\u0439 (\u043d\u0435\u043a\u0442\u0430\u0440 → \u0437\u0435\u0440\u043a\u0430\u043b\u043e \u043d\u043e\u0447\u0438) | \u0441\u0435\u0432\u0430 → \u043c\u0430\u0441\u0442\u0435\u0440\u0441\u043a\u0430\u044f \u0441\u0435\u0432\u044b')
    // И сам модуль реально платит севой, а не «чем-то похожим».
    expect(read('webapp/js/core/workshop.js')).toContain('sevaPointsFor')
    expect(read('webapp/js/core/prophecies.js')).toContain('meta.sevaPoints = (meta.sevaPoints || 0) + p.reward')
  })
})

describe('Прорицания видны игроку', () => {
  it('карточка есть на титуле', () => {
    expect(main).toContain('const prophecyBlock = prophecyCard(meta)')
    expect(main).toContain('challengeBlock, prophecyBlock')
  })

  it('экран списка существует и показывает прогресс', () => {
    expect(main).toContain('function showProphecies()')
    expect(main).toContain('${p.progress} / ${p.target}')
  })

  it('список назван «прорицания», а не «задания»', () => {
    // Это копия из Hades под своим именем. Переименование в экране привело бы
    // к тому, что механика есть, а название чужое.
    expect(main).toContain("'\u043f\u0440\u043e\u0440\u0438\u0446\u0430\u043d\u0438\u044f'")
    expect(main).toContain('function prophecyCard')
  })

  it('старые сохранения не ломают экран', () => {
    // У игроков сохранения уже есть, а поля `prophecies` у них не будет.
    expect(save).toContain('if (!m.prophecies || typeof m.prophecies')
    expect(save).toContain('prophecies: { claimed: [] }')
  })
})

describe('Прорицания — копия, а не своя идея', () => {
  it('записаны в BASE-GAME со своим источником', () => {
    expect(base).toContain('\u041c\u0415\u0425\u0410\u041d\u0418\u041a\u0410 51')
    expect(base).toContain('Prophecies')
  })
})
describe('Отпустить практику — копия, а не своя идея', () => {
  it('записана в BASE-GAME со своим источником', () => {
    expect(base).toContain('МЕХАНИКА 52')
    expect(base).toContain('Slay the Spire')
  })

  it('колода умеет легчать: узел практики даёт выбор', () => {
    // Раньше узел просто лечил, и колода за забег только росла. «Ум» мог
    // стать гуще, но никогда — легче.
    const m = read('webapp/js/main.js')
    const i = m.indexOf('function showMeditation()')
    const fn = m.slice(i, m.indexOf('\nfunction ', i + 10))
    expect(fn).toContain('Отпустить практику')
    expect(fn).toContain('const letGo')
    expect(fn).toContain('const breathe')
    // Выбор ПЕРВЫМ экраном: если сначала дыхание, «отпустить» читается как
    // наказание за лечение.
    // Вызов экрана выбора — ПОСЛЕДНИЙ оператор функции. Ищем последнее вхождение
    // `choose()`: первое — это объявление `const choose = ...`, и сравнение с ним
    // проверяло бы не порядок, а место объявления.
    const lastChoose = fn.lastIndexOf('choose()')
    const lastBreathe = fn.lastIndexOf('const breathe')
    expect(lastChoose, 'экран выбора должен зваться в конце').toBeGreaterThan(lastBreathe)
    // Хвост функции — `choose()`, а после него комментарий-разделитель идёт
    // уже ПОСЛЕ тела функции, поэтому сравнение идёт по последнему оператору
    // без учёта хвостовых комментариев.
    const body = fn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(body.trimEnd().endsWith('choose()\n}'), 'последним должен зваться экран выбора').toBe(true)
  })

  it('снимаются ВСЕ копии карты, а не одна', () => {
    const m = read('webapp/js/main.js')
    const i = m.indexOf('function showMeditation()')
    const fn = m.slice(i, m.indexOf('\nfunction ', i + 10))
    expect(fn).toContain('app.run.deck.filter((x) => x !== id)')
  })

  it('выбираются только уникальные карты', () => {
    const m = read('webapp/js/main.js')
    const i = m.indexOf('function showMeditation()')
    const fn = m.slice(i, m.indexOf('\nfunction ', i + 10))
    expect(fn).toContain('[...new Set((app.run.deck || [])')
  })
})
