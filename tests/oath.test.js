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
import { OATHS, oathById, checkOath } from '@webapp/js/core/oath.js'
import { EMPTY_META } from '@webapp/js/core/save.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const main = read('webapp/js/main.js')
const base = read('design/BASE-GAME.md')

const clean = () => ({ kills: 0, revivals: 0, chaos: 0, elites: 0, legendary: 0 })

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
    // Забег, который кончился до первого выбора, всё равно проходит проверку.
    for (const o of OATHS) expect(checkOath(o.id, {}).kept).toBe(true)
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