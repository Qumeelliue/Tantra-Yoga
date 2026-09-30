// НИКТО НЕ ЧИТАЕТ ПЕРЕМЕННУЮ ДО ЕЁ ОБЪЯВЛЕНИЯ.
//
// Что случилось. В `webapp/js/ui/screens/field.js` подсказка в бою читала
// `isTouch`, а `const isTouch` стоял на 120 строк ниже. Это не
// «некрасивый код», а падение: `const` в той же области не поднят, и при
// первом вызове `fieldScreen` движок бросает
// `ReferenceError: Cannot access 'isTouch' before initialization`.
//
// То есть ЭКРАН БОЯ НЕ РИСУЕТСЯ ВООБЩЕ. При этом:
//   · сборка проходит — она не выполняет код;
//   · ядро зелёное — ядро про экран не знает;
//   · 660 тестов были зелёные — ни один не вызывал экран.
//
// Нашёл стенд DOM (tests/helpers/dom.js). Этот тест не даёт классу
// вернуться: статический разбор всех модулей на поиск такой ошибки.

import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findTdz } from '../scripts/auditTdz.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('зона мёртвых переменных', () => {
  it('в коде игры нет «прочитано до объявлено»', () => {
    let out = ''
    try {
      out = execFileSync('node', [join(root, 'scripts/auditTdz.mjs')], {
        cwd: root, encoding: 'utf8',
      })
    } catch (e) {
      throw new Error('найдено обращение к переменной до её объявления:\n' + (e.stdout || '') + (e.stderr || ''))
    }
    expect(out).toContain('использовано до объявления: 0')
  })

  it('проверяющий сам проверяем: на битом коде он срабатывает', () => {
    // Без этого теста первый станет зелёным вхолостую, если разбор
    // однажды перестанет видеть ошибку. Кормим его ровно той ошибкой,
    // что была в field.js, — и ждём, что он её найдёт.
    const bad = 'function f() {\n' +
      '  const hint = read(isTouch)\n' +
      '  const isTouch = 1\n' +
      '  return hint\n' +
      '}\n'
    const found = findTdz(bad)
    expect(found.length, 'ошибка должна быть найдена').toBe(1)
    expect(found[0].name).toBe('isTouch')
    expect(found[0].useLine).toBe(2)
    expect(found[0].declLine).toBe(3)
  })

  it('на здоровом коде не срабатывает', () => {
    const good = 'function f(x) {\n' +
      '  const n = x * 2\n' +
      '  const help = () => n + 1\n' +
      '  return help()\n' +
      '}\n'
    expect(findTdz(good)).toEqual([])
  })

  it('объявление функции законно читать выше (функции подняты)', () => {
    const hoisted = 'function f() {\n' +
      '  const v = later()\n' +
      '  function later() { return 1 }\n' +
      '  return v\n' +
      '}\n'
    expect(findTdz(hoisted)).toEqual([])
  })
})
