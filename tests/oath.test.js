// ОБЕТ (Hades: Nya) — назвать то, чего ты НЕ будешь делать, и получить награду
// за дисциплину.
//
// Проверяется то, что делает обет ставкой, а не декларацией:
//
//   1. **выбирается до забега, а не в середине** — иначе это не условие, а
//      подгонка результата;
//   2. **нарушение не отменяет задним числом** — «соблюдён» нельзя объявить
//      после факта;
//   3. **чем строже условие, тем дороже награда** (Hades);
//   4. **проверка идёт по фактам забега** (`legendary`, `revivals`, `chaos`,
//      `elites`, `kills`), а не по флагам: флаг можно забыть сбросить;
//   5. **счётчики — в забеге, а не в модуле-константе**, иначе второй забег
//      унаследовал бы первый;
//   6. **награда — в севу мастерской**, та же валюта, что у прорицаний и жара.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { OATHS, oathById, checkOath, fullPathRun } from '@webapp/js/core/oath.js'
import { CHAKRAS } from '@webapp/js/core/run.js'
import { EMPTY_META } from '@webapp/js/core/save.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const main = read('webapp/js/main.js')
const base = read('design/BASE-GAME.md')

/**
 * «Чистый забег» — это забег, который ДОШЁЛ до конца и ничего не сломал.
 *
 * Раньше здесь стояло `{kills: 0, revivals: 0, ...}` — без исхода и без числа
 * владык. Такая сводка описывает не «чистый забег», а «забег, который начался».
 * Пока «Без крови» проверял только `kills`, разница была не видна: оба варианта
 * давали «соблюдён». Теперь видна сразу — и в этом, собственно, смысл правки.
 */
const clean = (over = {}) => ({
  result: 'victory', bosses: CHAKRAS.length,
  kills: 0, revivals: 0, chaos: 0, elites: 0, legendary: 0, ...over,
})

describe('Обет — ставка на дисциплину, а не декларация', () => {
  it('список не пуст, и у каждого обета есть условие и награда', () => {
    expect(OATHS.length).toBeGreaterThanOrEqual(4)
    for (const o of OATHS) {
      expect(o.text, o.id).toBeTruthy()
      expect(o.reward, o.id).toBeGreaterThan(0)
      expect(typeof o.broken, o.id).toBe('function')
    }
  })

  it('чистый забег соблюдает любой обет', () => {
    for (const o of OATHS) {
      const chk = checkOath(o.id, clean())
      expect(chk.kept, `${o.id}: чистый забег нарушил обет — ${chk.why}`).toBe(true)
    }
  })

  it('«пройти весь забег» — это требование, а не украшение', () => {
    // ПОЛНОМКА СЕССИИ 27. Обет «Без крови» читается «Пройди весь забег, не
    // сломав ни одной оки» и платит больше всех (8 севы). Код проверял ТОЛЬКО
    // `kills`, поэтому награда за самый строгий обет выдавалась за смерть в
    // первой комнате. Забег двадцати секунд приносил столько же, сколько
    // выигранный — и это был самый дешёвый способ добраться до мастерской.
    const deadEarly = clean({ result: 'death', bosses: 0 })
    const chk = checkOath('no_blood', deadEarly)
    expect(chk.kept, 'обет «пройти весь забег» соблюдён после смерти в первой комнате').toBe(false)
    expect(chk.why, 'не сказано, что забег не пройден').toBeTruthy()
  })

  it('награда платится только за соблюдённый обет', () => {
    // `checkOath` возвращает `reward` и для нарушенного — это СКОЛЬКО обет
    // стоит, а не сколько игрок получит. Платит `finishFieldRun`, и только
    // когда `kept`. Первая версия этой проверки требовала `reward === 0` и
    // падала — то есть проверяла несуществующее свойство.
    expect(checkOath('no_blood', clean({ result: 'death' })).reward,
      'стоимость обет должна быть названа — иначе игрок не знает, на что ставит').toBe(8)
    const settle = main.slice(main.indexOf('function finishFieldRun'))
    const tail = settle.slice(0, settle.indexOf('\n}\n'))
    expect(tail, 'награда за обет платится без проверки «соблюдён»').toMatch(/if \(chk\.kept\)/)
    expect(tail, 'нарушенный обет всё равно что-то платит')
      .not.toMatch(/sevaPoints[\s\S]{0,120}if \(!chk\.kept\)|if \(!chk\.kept\)[\s\S]{0,120}sevaPoints/)
  })

  it('шесть владык из семи — ещё не «весь забег»', () => {
    // Именно эта ошибка была и в мирном финале (`awakened`), и здесь: счётчик
    // «сколько владык» не равен «прошёл весь путь».
    const almost = checkOath('no_blood', clean({ bosses: CHAKRAS.length - 1 }))
    expect(almost.kept).toBe(false)
  })

  it('остальные обеты не требуют закончить забег — их обещание другое', () => {
    // Обратная сторона той же правки. Четыре обетa обещают «не брать X», а не
    // «пройти весь забег», поэтому смерть их не нарушает: ты и правда ничего не
    // взял. Навязывать им требование, которого в тексте нет, — значит выдумать
    // правило (проект так не делает).
    for (const o of OATHS.filter((x) => x.id !== 'no_blood')) {
      const chk = checkOath(o.id, clean({ result: 'death', bosses: 0 }))
      expect(chk.kept, `${o.id}: обещание «${o.text}» не нарушено, но обет не засчитан`).toBe(true)
    }
  })

  it('определение «весь забег» одно на игру', () => {
    // Не вторая семёрка в коде, а длина лестницы. Две семёрки разъезжаются, и
    // одна из них потом врёт — ровно как врёт обет, который требовал «весь
    // забег», но требовал его словами.
    expect(fullPathRun(clean())).toBe(true)
    expect(fullPathRun(clean({ result: 'death' }))).toBe(false)
    expect(fullPathRun(clean({ result: 'retreat' }))).toBe(false)
    expect(fullPathRun(clean({ bosses: 0 }))).toBe(false)
  })

  it('текст обещания и проверка согласованы: «весь забег» есть в тексте ровно у тех, кто его требует', () => {
    // Проверка на согласованность, а не на список: если новый обет напишут с
    // словом «забег», он обязан требовать его и в коде.
    for (const o of OATHS) {
      const claimsFullPath = /весь забег|целиком/i.test(o.text)
      const chk = checkOath(o.id, clean({ result: 'death', bosses: 0 }))
      expect(chk.kept,
        `«${o.text}» обещает пройти забег, но смерть обет не нарушает`).toBe(!claimsFullPath)
    }
  })

  it('каждый обет ловит именно своё нарушение', () => {
    // Ключевая проверка: обет, который нельзя нарушить, — это подпись. И обет,
    // который ловится чужой вещью, — тоже подпись.
    const cases = {
      no_legend: { legendary: 1 },
      no_revive: { revivals: 1 },
      no_chaos: { chaos: 1 },
      no_elite: { elites: 1 },
      no_blood: { kills: 1 },
    }
    for (const o of OATHS) {
      const chk = checkOath(o.id, { ...clean(), ...cases[o.id] })
      expect(chk.kept, `${o.id}: нарушение не поймано`).toBe(false)
      expect(chk.why, `${o.id}: не сказано, что именно нарушено`).toBeTruthy()
    }
  })

  it('нарушение одного обета не ломает другие', () => {
    // Иначе «без крови» отменял бы «без возврата»: вернулся из смерти без
    // единого удара — и оба обета пали бы, хотя один был соблюдён.
    const r = { ...clean(), revivals: 1 }
    expect(checkOath('no_revive', r).kept).toBe(false)
    expect(checkOath('no_blood', r).kept).toBe(true)
    expect(checkOath('no_chaos', r).kept).toBe(true)
  })

  it('несуществующий обет не «соблюдён» — он просто не считается', () => {
    // Иначе можно было бы назвать несуществующий обет и получить награду.
    const chk = checkOath('нет-такого', clean())
    expect(chk.kept).toBe(false)
    expect(chk.reward).toBe(0)
    expect(oathById('нет-такого')).toBeNull()
  })

  it('пустая сводка не ломает проверку', () => {
    // Забег, который кончился до первого выбора, не роняет проверку. Но
    // «Без крови» при этом НЕ соблюдён: пустая сводка — это не пройденный
    // забег, и требование «весь забег» на пустом не выполняется.
    for (const o of OATHS.filter((x) => x.id !== 'no_blood')) {
      expect(checkOath(o.id, {}).kept, o.id).toBe(true)
    }
    expect(checkOath('no_blood', {}).kept, 'пустая сводка сочтена пройденным забегом').toBe(false)
    expect(checkOath('no_legend', undefined).kept).toBe(true)
  })

  it('чем строже обет, тем дороже награда — как в Hades', () => {
    // Самая строгая — «без крови»: в ней запрещено всё, что оставляет кровь.
    const noBlood = OATHS.find((o) => o.id === 'no_blood')
    const noRevive = OATHS.find((o) => o.id === 'no_revive')
    expect(noBlood.reward, 'обет без крови должен быть самым дорогим')
      .toBeGreaterThan(noRevive.reward)
  })
})

describe('Обет живёт по законам честности', () => {
  it('выбирается ДО забега, на экране входа', () => {
    // Выбор в середине забега — это подгонка результата, а не условие.
    expect(main).toContain('const oath = OATHS.find((o) => o.id === app.oath)')
    expect(main).toContain("onclick: () => { app.oath = app.oath === o.id ? null : o.id")
    // Экран входа — единственное место, где обет выбирается.
    const i = main.indexOf('function showFieldChakra()')
    const j = main.indexOf('\nfunction showFieldChakra2')
    const fn = main.slice(i, j > 0 ? j : i + 20000)
    expect(fn, 'обет выбирается не на экране входа').toContain('OATHS.map')
  })

  it('обет показан игроку до забега, а не всплывает в конце', () => {
    // Условие, о котором игрок не знает, нельзя соблюсти.
    expect(main).toContain('Соблюдён — ')
    expect(main).toContain('Обет не обязателен')
  })

  it('счётчики ведутся в забеге, а не висят между забегами', () => {
    // Счётчик в модуле унаследовался бы вторым забегом, и обет «без
    // легендарных» падал бы из-за чужого забега.
    expect(main).toContain('legendary: 0, chaos: 0, elites: 0')
    expect(main).toContain('rn.legendary = (rn.legendary || 0) + 1')
    expect(main).toContain('rn1.chaos = (rn1.chaos || 0) + 1')
    expect(main).toContain('rn3.elites = (rn3.elites || 0) + 1')
    expect(main, 'возвраты не считаются — обет «без возврата» проверял бы пустоту')
      .toContain('revivals: 0')
  })

  it('обет виден В БОЮ, а не только на экране входа', () => {
    // Обещание, записанное в шапке модуля: «обет виден во время забега».
    // Если его нет в бою, условие надо помнить наизусть — а это не условие,
    // это загадка. Обещание в модуле и код в бою должны совпадать.
    const ui = read('webapp/js/ui/screens/field.js')
    expect(ui, 'в бою нет плашки обета').toContain('opts.oathName')
    expect(ui).toContain('`⇤ обет: ${oathName}`')
    expect(main, 'обет не передаётся в экран боя').toContain('oathName: (OATHS.find((o) => o.id === app.oath) || {}).name || null')
  })

  it('нарушенный обет пишется в отчёт, а не списывается молча', () => {
    expect(main).toContain('нарушен:')
    expect(main).toContain('соблюдён: +${summary.oathPoints} севы')
  })

  it('награда — сева, та же валюта, что у прорицаний и мастерской', () => {
    expect(main).toContain('app.meta.sevaPoints = (app.meta.sevaPoints || 0) + chk.reward')
    expect(EMPTY_META().sevaPoints).toBeUndefined()
  })

  it('обет не тянется в профиль — это выбор на забег, а не прогресс', () => {
    // Обет, сохранённый в meta, пережил бы забег и «повис» на следующем.
    expect(main).toContain('app.oath = null')
  })
})

describe('Обет — копия, а не своя идея', () => {
  it('записан в BASE-GAME со своим источником', () => {
    expect(base).toContain('МЕХАНИКА 53')
    expect(base).toContain('Nya')
  })
})