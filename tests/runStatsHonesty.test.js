// Тесты честности статистики забега.
//
// Пять сессий подряд замер или игра врали, и каждый раз это была одна и та же
// болезнь: число, обещанное на экране, и число, которое реально считалось,
// были разными вещами. Закрываем именно эту болезнь — не «правильные числа»,
// а «число считает то, что названо своим именом».
//
// Что было сломано (2026-09-30, сессия 24):
//   · `recordRunEnd` звался на выходе из КАЖДОЙ комнаты, а комнат в забеге
//     28 (3 комнаты + владыка на чакру, × 7 чакр). Итог в Городу: «1 забег ·
//     28 побед», «% побед» = 2800 %.
//   · «пробуждений» росло дважды за событие: +1 за каждого успокоенного
//     владыка (в `settleFieldRun`) и ещё +1 на экране финала.
//   · «мирный финал» считался как `kills === 0` в ПОСЛЕДНЕЙ, седьмой комнате.
//     Перебить всех по дороге и услышать «Вершина Света — без крови» было
//     можно.
//   · Экран «Вершина Света» был недостижим: `onNext` звали только при
//     `nextFloor <= 6` (floor ≤ 5), а `isLastFloor` значит floor ≥ 6.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { recordRunEnd, EMPTY_META } from '@webapp/js/core/save.js'
import { ROOMS_PER_STAGE, LAST_FLOOR } from '@webapp/js/core/stageRoute.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

/**
 * Код без комментариев.
 *
 * Обнаружено на себе: проверка «в коде не должно остаться `won &&
 * nextFloor <= 6`» падала, потому что эта строка осталась В КОММЕНТАРИИ, где
 * я объяснял, что её убрал. Читать комментарии вместо кода — это ровно та
 * ошибка, которую мы здесь лечим: «написано» ≠ «работает». Значит, проверка
 * обязана видеть только код.
 */
const code = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')
  // Шаблонные строки НЕ вырезаем: в них живут подписи экрана, которые
  // проверка обязана видеть. Вырезание шаблонов в первой версии этого теста
  // съедало ровно то, что он искал.

const main = read('webapp/js/main.js')
const mainCode = code('webapp/js/main.js')
const fieldUi = read('webapp/js/ui/screens/field.js')
const fieldCode = code('webapp/js/ui/screens/field.js')

const fresh = () => {
  const meta = EMPTY_META()
  meta.stats = { runs: 0, deaths: 0, victories: 0, pacified: 0, kills: 0, awakened: 0 }
  return meta
}

/** Сколько боёв в полном забеге: 3 комнаты + владыка, на каждой чакре. */
const ROOMS_IN_RUN = (LAST_FLOOR + 1) * (ROOMS_PER_STAGE + 1)

describe('Границы забега', () => {
  it('в забеге столько боёв, сколько мы и говорили игроку', () => {
    // Три комнаты и владыка на каждой из семи чакр.
    expect(ROOMS_PER_STAGE).toBe(3)
    expect(LAST_FLOOR).toBe(6)
    expect(ROOMS_IN_RUN).toBe(28)
  })

  it('исход забега НЕ пишется на каждую комнату', () => {
    // Главная проверка. Падает, если `recordRunEnd` вернётся в
    // `settleFieldRoom` — то есть если статистика снова станет счётчиком
    // комнат. Раньше именно это давало 28 «побед» на один забег.
    const body = mainCode.slice(mainCode.indexOf('function settleFieldRoom'))
    const fn = body.slice(0, body.indexOf('\n}\n'))
    expect(fn, 'settleFieldRoom не должна звать recordRunEnd').not.toContain('recordRunEnd')
    // И не должна трогать счётчики забегов напрямую.
    expect(fn).not.toContain('stats.victories')
    expect(fn).not.toContain('stats.awakened')
    expect(fn).not.toContain('stats.deaths')
  })

  it('исход пишется ровно в трёх местах — конец забега, и нигде больше', () => {
    // смерть через «ещё раз», победа (седьмой владыка), уход самому.
    const calls = mainCode.match(/finishFieldRun\(/g) || []
    // три вызова + одно объявление функции
    expect(calls.length).toBe(4)
  })

  it('finishFieldRun закрывает забег один раз и отдаёт сводку экрану', () => {
    expect(mainCode).toContain('function finishFieldRun(result)')
    expect(mainCode).toContain('app.fieldRun = null')
    expect(mainCode).toContain('return summary')
  })

  it('счётчики забега копятся в комнате, а не в профиле напрямую', () => {
    const body = mainCode.slice(mainCode.indexOf('function settleFieldRoom'))
    const fn = body.slice(0, body.indexOf('\n}\n'))
    expect(fn).toContain('run.kills += 1')
    expect(fn).toContain('run.pacified += 1')
    expect(fn).toContain('run.bosses += 1')
  })
})

describe('Мирный финал = забег без единой крови', () => {
  it('счётчик растёт один раз за забег, а не на комнату', () => {
    const meta = fresh()
    // 28 «комнат» НЕ должны записать ни одной победы: исход пишет
    // finishFieldRun, а не комната.
    for (let i = 0; i < ROOMS_IN_RUN; i++) {
      meta.stats.pacified += 3
    }
    expect(meta.stats.victories).toBe(0)
    expect(meta.stats.awakened).toBe(0)
    expect(meta.stats.pacified).toBe(ROOMS_IN_RUN * 3)
  })

  it('победа без единой крови на всём пути — мирный финал', () => {
    const meta = fresh()
    recordRunEnd(meta, 'victory', { floor: 7, kills: 0, pacified: 31, bosses: 7 })
    expect(meta.stats.victories).toBe(1)
    expect(meta.stats.awakened).toBe(1)
  })

  it('один сломанный паша в любой комнате — финал не мирный', () => {
    // Решение автора: «мирный финал» = ВЕСЬ забег без единой крови.
    // Раньше экран смотрел только на седьмую комнату.
    const meta = fresh()
    recordRunEnd(meta, 'victory', { floor: 7, kills: 1, pacified: 30, bosses: 7 })
    expect(meta.stats.victories).toBe(1)
    expect(meta.stats.awakened).toBe(0)
  })

  it('путь не пройден целиком — «Вершина Света» не достигнута', () => {
    // Игрок может войти в Поле Ума с пятой чакры: меню чакр это позволяет.
    // Без единой крови, но три владыки из семи — не финал.
    const meta = fresh()
    recordRunEnd(meta, 'victory', { floor: 7, kills: 0, pacified: 12, bosses: 3 })
    expect(meta.stats.victories).toBe(1)
    expect(meta.stats.awakened).toBe(0)
  })

  it('смерть не бывает мирным финалом, даже без крови', () => {
    const meta = fresh()
    recordRunEnd(meta, 'death', { floor: 3, kills: 0, pacified: 9, bosses: 2 })
    expect(meta.stats.deaths).toBe(1)
    expect(meta.stats.awakened).toBe(0)
  })

  it('«% побед» больше не может стать 2800 %', () => {
    // Формула стояла `(victories + awakened) / runs`, где `awakened` рос за
    // КАЖДОГО владыка (7 за забег) и ещё раз на экране финала. Значит один
    // забег давал 8 в слагаемом при `runs = 1`.
    //
    // Проверяем ровно это: сколько бы владык игрок ни снял, процент побед
    // обязан считаться ТОЛЬКО из побед. Считаем так, как считает экран.
    const pct = (m) => Math.round((m.stats.victories / m.stats.runs) * 100)
    const meta = fresh()
    meta.stats.runs = 1
    // Один забег, семь владык, ни одного сломанного паши.
    for (let bosses = 1; bosses <= 7; bosses++) {
      meta.stats.pacified += 4
    }
    recordRunEnd(meta, 'victory', { floor: 7, kills: 0, pacified: 28, bosses: 7 })
    expect(meta.stats.awakened).toBe(1)
    expect(pct(meta)).toBe(100)

    // А вот как было: «пробуждений» набежало 8 при одном забеге, и
    // формула с их суммой дала 900 % на тех же данных.
    const old = (m) => Math.round(((m.stats.victories + m.stats.awakened) / m.stats.runs) * 100)
    meta.stats.awakened = 8
    expect(old(meta)).toBe(900)
    expect(pct(meta)).toBe(100)
  })
})

describe('Экран финала достижим', () => {
  it('победа в комнате всегда уходит вызывающему коду', () => {
    // Именно это условие раньше запирало «Вершину Света»: `nextFloor <= 6`
    // означало floor ≤ 5, а `isLastFloor` требовал floor ≥ 6.
    expect(fieldCode).toContain('if (won && opts.onNext) {')
    expect(fieldCode).not.toContain('nextFloor <= 6')
  })

  it('роутинг финала решает main.js, а не экран поля', () => {
    expect(mainCode).toContain('if (isLastFloor(floor)) {')
    expect(mainCode).toContain("showFieldVictory(meta, floor, finishFieldRun('victory'))")
  })

  it('экран берёт кровь из сводки забега, а не из последней комнаты', () => {
    expect(mainCode).toContain('const kills = summary?.kills || 0')
    expect(mainCode).not.toContain('st.foes.filter((f) => f.dead).length : 0')
  })
})

describe('Профиль не врёт словами', () => {
  it('счётчик оков подписан как освобождения, а не как «мирных» финалов', () => {
    // `stats.pacified` — накопительное число оков за всё время. Раньше
    // под ним стояла подпись «мирных», и читалось как число финалов.
    expect(mainCode).toContain("h('div', { class: 'lbl' }, 'освобождений')")
    expect(mainCode).toContain("h('div', { class: 'lbl' }, 'мирных финалов')")
    expect(mainCode).not.toContain("h('div', { class: 'lbl' }, 'мирных')")
  })

  it('«% побед» считается только от побед, без «пробуждений» в сумме', () => {
    // `victories + awakened` давало число больше 100 %: awakened росло за
    // каждого владыка, а не за забег.
    expect(mainCode).not.toContain('meta.stats.victories + meta.stats.awakened')
    expect(mainCode).toContain('Math.round((meta.stats.victories / meta.stats.runs) * 100)')
  })

  it('Город просыпается по владыкам — как и написано в его же тексте', () => {
    // Стояло `pacified + awakened`: накопительные оковы (десятки за забег)
    // плюс счётчик, росший дважды за событие. Четыре ступени города
    // проходились за первый же забег.
    expect(mainCode).toContain('const cityStage = Math.min(4, bossesFreed)')
    expect(mainCode).not.toContain('Math.min(4, meta.stats.pacified + meta.stats.awakened)')
  })

  it('история забега говорит, сколько владык снято и сколько сломано силой', () => {
    expect(mainCode).toContain('владык ${r.bosses}/7')
    expect(mainCode).toContain('сломано силой ${r.kills}')
    expect(mainCode).toContain('retreat:')
  })

  it('карточный путь не прибавляет «пробуждение» второй раз руками', () => {
    // Тот же двойной счёт, но в карточной ветке: `recordRunEnd` уже
    // прибавил «пробуждение» для `outcome === 'awakening'`, и следом стояла
    // строка `app.meta.stats.awakened += 1`.
    expect(mainCode).not.toContain('app.meta.stats.awakened += 1')
    expect(mainCode).toContain('bosses: run.bossesPacified || 0')
  })

  it('карточный путь пишет исход только на смерти и на последнем владыке', () => {
    // В отличие от Поля Ума, здесь границы не разъехались: ровно два вызова
    // `recordRunEnd` плюс один — общий на оба пути.
    const calls = mainCode.match(/recordRunEnd\(/g) || []
    expect(calls.length).toBe(3)
  })
})
