// ЕЖЕДНЕВНЫЙ ЗАБЕГ — копия из Dead Cells, Slay the Spire и Duolingo.
//
// У нас уже был «ежедневный вызов», но это СЧЁТЧИК ЗАДАНИЙ (Duolingo): «успокой
// 2 врагов», «достигни самадхи». Полезно, но это не вызов.
//
// Чего не хватало. В **Dead Cells Daily Challenge** это не задание, а **один и
// тот же путь для всех**: конкретные комнаты, конкретная сложность, у всех
// игроков планка одна. Игрок не «собирает два освобождения» — он проходит одну и
// ту же локацию и сравнивает с миром, а не с собой.
//
// Три игры — три части механики, все копируются:
//
//   · **Dead Cells** — одинаковый путь по дате, у всех один;
//   · **Slay the Spire** — ежедневное seed-разнообразие вместо честной нагрузки;
//   · **Duolingo** — «одна попытка в день»: нельзя набить, возвращаешься завтра.
//
// Отличие и зачем. Ежедневный забег у нас **бесплатный и дополнительный**: он
// не отнимает жар и не ломает обычный. В Telegram Mini App не существует
// «обязательно сыграй сегодня», и требовать этого нельзя, а обещать награду за
// вход, которая ничего не стоит, — обман. Значит он даёт **то, чего не даёт
// обычный: честный один и тот же путь**.
//
// Проверяется три вещи, и все три — про честность:
//
//   1. **один и тот же путь у всех в один день** — иначе это «сегодня у меня
//      выпало трудно», а не вызов;
//   2. **генератор тот же, что у игры** — два разных генератора означают, что
//      «честный» замер и «честный» ежедневный забег — разные игры;
//   3. **задание и ежедневный забег не путаются** — выполнил задание ≠ закрыл
//      день. Первая версия хранила флаг в общем поле, и это было бы ложью.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dailySeed, dailyRng, dailyOffer, markDailyRunPlayed } from '@webapp/js/core/dailyRun.js'
import { mulberry32 } from '@webapp/js/core/engine.js'
import { EMPTY_META } from '@webapp/js/core/save.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const src = read('webapp/js/core/dailyRun.js')
const base = read('design/BASE-GAME.md')

describe('Путь один и тот же у всех', () => {
  it('один день даёт один seed на любое число проверок', () => {
    const k = '2026-09-30'
    expect(dailySeed(k)).toBe(dailySeed(k))
    expect(dailyRng(k)()).toBe(dailyRng(k)())
  })

  it('разные дни дают разный seed', () => {
    // Иначе «ежедневный» путь был бы одним и тем же всегда.
    expect(dailySeed('2026-09-30')).not.toBe(dailySeed('2026-10-01'))
  })

  it('seed всегда положительный', () => {
    // Отрицательное состояние у `mulberry32` делает результат зависимым от
    // знака — то есть «честный» путь становится нечестным на всех датах,
    // где хеш ушёл в минус.
    for (const k of ['2026-01-01', '2026-06-15', '2026-12-31', '2027-03-03', '1970-01-01']) {
      const s = dailySeed(k)
      expect(s, `seed для ${k} отрицательный или дробный`).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThan(4294967296)
    }
  })

  it('генератор — ТОТ ЖЕ, что у игры, а не похожий', () => {
    // Главная проверка подмены. Свой генератор означает, что ежедневный путь
    // и обычный считаются разными играми, и игрок не может сравнить свой
    // результат с тем, что видят другие.
    const k = '2026-09-30'
    const mine = dailyRng(k)
    const game = mulberry32(dailySeed(k))
    for (let i = 0; i < 5; i++) expect(mine()).toBe(game())
    // И в коде обязан быть именно импорт, а не копия алгоритма.
    expect(src).toContain("import { mulberry32 } from './engine.js'")
    expect(src).not.toContain('0x6d2b79f5')
  })
})

describe('Задание и ежедневный забег — разные вещи', () => {
  it('выполненное задание НЕ закрывает день', () => {
    // Ежедневный вызов-задание уже есть и лежит в `meta.daily`. Если бы флаг
    // ежедневного забега жил там же, игрок выполнил бы задание и решил, что
    // день закрыт — а путь остался бы непроигранным.
    const meta = EMPTY_META()
    meta.daily = { date: '2026-09-30', challengeId: 'pacify_2', progress: 2, done: true, claimed: false }
    const offer = dailyOffer(meta, '2026-09-30')
    expect(offer.on).toBe(true)
    expect(offer.done, 'выполненное задание сочтено за сыгранный ежедневный забег').toBe(false)
  })

  it('после ежедневного забега день закрыт', () => {
    const meta = EMPTY_META()
    meta.daily = { date: '2026-09-30' }
    markDailyRunPlayed(meta, '2026-09-30')
    expect(dailyOffer(meta, '2026-09-30').done).toBe(true)
  })

  it('вчерашний забег не закрывает сегодняшний день', () => {
    const meta = EMPTY_META()
    markDailyRunPlayed(meta, '2026-09-30')
    expect(dailyOffer(meta, '2026-10-01').done).toBe(false)
  })

  it('насто��айки без сегодняшнего дня вызов не предлагают', () => {
    const meta = EMPTY_META()
    meta.daily = { date: '2026-09-20' }
    expect(dailyOffer(meta, '2026-09-30').on).toBe(false)
  })
})

describe('Ежедневный забег — копия, а не своя идея', () => {
  it('записан в BASE-GAME с тремя источниками', () => {
    expect(base).toContain('МЕХАНИКА 45')
    for (const g of ['Dead Cells', 'Slay the Spire', 'Duolingo']) {
      expect(base, `источник ${g} не назван`).toContain(g)
    }
  })

  it('записано, почему он бесплатный — иначе это обман', () => {
    expect(base).toContain('не отнимает жар')
    expect(base).toContain('ничего не стоит, — обман')
  })

  it('отличие от счётчика заданий названо прямо', () => {
    expect(base).toContain('счётчик заданий')
  })
})

describe('Ежедневный путь действительно один и тот же', () => {
  const main = read('webapp/js/main.js')

  it('комната дня строится на seed из даты, а не на случайность', () => {
    // Главная проверка: если бы комната строилась на случайность,
    // одинаковый seed ничего не давал бы, и «один и тот же путь у всех»
    // было бы лозунгом. Слотов с `Math.random` быть не должно.
    expect(main).toContain("rng: daily ? dailyRng(`${daily.dayKey}|${floor}|${room}`)")
    expect(main).not.toContain('buildFieldFloor(floor, { room })')
  })

  it('seed включает номер комнаты, а не только дату', () => {
    // Иначе первая комната дня «съедает» случайность, и вторая зависит от
    // того, сколько раз игрок туда заходил: путь перестаёт быть целиком
    // одинаковым, хотя по дате выглядит одинаковым.
    expect(main).toContain('${daily.dayKey}|${floor}|${room}')
  })

  it('день закрывается на ЛЮБОЕ завершение, а не только на победу', () => {
    // Иначе умерший на седьмой чакре получал бы второй шанс в тот же день,
    // а выигравший — нет. Правило получилось бы наоборот тем, что наказывает
    // за успех.
    const at = main.indexOf('markDailyRunPlayed(app.meta, app.daily.dayKey)')
    const fin = main.indexOf('function finishFieldRun')
    expect(fin).toBeGreaterThan(-1)
    expect(at, 'отметка не в finishFieldRun').toBeGreaterThan(fin)
    expect(main).toContain('app.daily = null')
  })

  it('кнопка есть на экране входа, а не в отдельном меню', () => {
    // Игрок решает, играть ли сегодня, именно на этом экране.
    // Ищем по МЕТКЕ на экране, а не по слову в комментарии: комментарий
    // «Ежедневный путь предлагается только сегодняшним» стоит выше разметки,
    // и поиск находил его — тест проверял бы комментарий, а не кнопку.
    const label = "class: 'varna-label' }, 'Ежедневный путь')"
    expect(main).toContain(label)
    const at = main.indexOf(label)
    const heat = main.indexOf("'Жар'")
    expect(heat, 'жар не найден').toBeGreaterThan(-1)
    expect(at, 'кнопка не рядом с жаром').toBeGreaterThan(heat)
  })

  it('предлагается только сегодняшним днём', () => {
    // Вчерашний закрыт, завтрашний ещё не существует.
    expect(main).toContain('dailyOffer(meta, dayKey())')
  })

  it('честно говорит, что жар не тратится', () => {
    // Обещание, которое не стоит ничего, — обман (МЕХАНИКА 41). Здесь
    // сказано прямо, что ежедневный забег бесплатный.
    expect(main).toContain('Жар не тратится')
  })
})
