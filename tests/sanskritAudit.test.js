// АУДИТ САНСКРИТА ДОЛЖЕН ЛОВИТЬ ОШИБКУ, А НЕ МОЛЧАТЬ.
//
// Случилось обратное. Аудит показывал «расхождение: Самшая» и требовал
// написать «Самая» — обычное русское слово «самая» (81 раз в корпусе:
// «самая грубая точка»). Он сравнивал нашу РУССКУЮ транслитерацию с
// корпусом, а корпус эти термины оставляет ЛАТИНИЦЕЙ (ghrńá, shauṋká).
// Требование было неверным, и «чинить» по нему — значило испортить.
//
// Теперь у аудита есть самопроверка на эталоне, который поймал автор:
// «санскары» → «самскары» должно ловиться, «грна» → «гуна» — нет.
//
// Сам полный прогон по корпусу (3329 файла, 14,6 млн знаков) занимает
// почти минуту и в тестах не гоняется — это `npm run audit:sanskrit`.
// Здесь проверяется правило и то, что переименованные термины не вернулись.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { selfTest, runAudit } from '../scripts/auditSanskrit.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

describe('аудит санскрита', () => {
  it('импорт модуля не читает корпус (иначе тест ждал бы минуту)', () => {
    // Корпус — 3329 файлов. Если он читается на верхнем уровне, любой
    // импорт в тесте встаёт на чтение всего этого объёма.
    expect(typeof runAudit).toBe('function')
    expect(typeof selfTest).toBe('function')
  })

  it('правило сходства верно на эталонных случаях', () => {
    // Эталон — то, что автор поймал лично: «санскары» вместо «самскары».
    // Если правило перестанет это видеть, аудит снова станет тихим зелёным.
    const lower = 'самскары самскар самскары санскары гуна грна '
    expect(selfTest(lower)).toEqual([])
  })

  it('санскрит терминов совпадает с тем, как их называет корпус', () => {
    // Корпус пишет: ghrńá (ненависть), shauṋká (сомнение), shiila
    // (комплекс культуры). У нас было: «Гхрна» (лишняя х), «Самшая»
    // (деванагари при этом शङ्कа — то есть сам термин был правильный, а
    // русское имя нет), «Холодная» (śīla — это среда, а не холод).
    const enemies = read('content/enemies.json')
    const art = read('webapp/js/ui/fieldArt.js')

    for (const bad of ['Гхрна', 'Самшая', 'Холодная']) {
      expect(enemies.includes(bad), `enemies.json всё ещё содержит «${bad}»`).toBe(false)
    }
    expect(art.includes('Гхрна'), 'fieldArt.js всё ещё содержит «Гхрна»').toBe(false)
    expect(art.includes('Самшая'), 'fieldArt.js всё ещё содержит «Самшая»').toBe(false)

    expect(enemies).toContain('"name": "Грна"')
    expect(enemies).toContain('"name": "Шаунка"')
    expect(enemies).toContain('"epithet": "Гордая культурой"')
    expect(art).toContain('Грна (ghrńá)')
    expect(art).toContain('Шаунка (shauṋká)')
  })

  it('деванагари оставы совпадают с русским именем', () => {
    // शङ्का — это шанкА. Имя «Самшая» было от другого слова (saṃśaya) и
    // расходилось с собственной деванагари в данных. Такое расхождение
    // внутри одного файла — источник ошибок, которых не видно.
    const enemies = JSON.parse(read('content/enemies.json'))
    const want = { ghrna: 'Грна', samshaya_pasha: 'Шаунка', sila: 'Шила' }
    for (const [id, name] of Object.entries(want)) {
      expect(enemies[id], `враг ${id}`).toBeTruthy()
      expect(enemies[id].name, `имя ${id} должно быть «${name}»`).toBe(name)
    }
    // śīla = среда/среда человека, а не «холод» (śīta)
    expect(enemies.sila.sanskrit).toBe('शील')
    expect(enemies.sila.epithet).not.toMatch(/холод/i)
  })
})
