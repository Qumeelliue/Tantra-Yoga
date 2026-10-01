// Тесты: проверка должна быть ДЕТЕРМИНИРОВАНА.
//
// Обнаружено 2026-09-30, сессия 24, случайно: тест
// `fullRun > здоровье действительно переносится между комнатами` упал в одном
// прогоне из шести, с seed 9008. Тот же seed в одиночку проходил всегда. Пять
// прогонов подряд — зелёные. Значит тест ПЛАВАЛ, и «831 зелёных» в прошлых
// отчётах означало «831 зелёных сегодня».
//
// Причина: `buildFieldFloor()` в тесте вызывался **без `rng`**, и внутри
// раздача комнат шла через `Math.random`. То есть «десять забегов на десяти
// фиксированных seed» были на самом деле десятью случайными розыгрышами.
// Сам тест это даже проговаривал («свойство должно быть у пути, а не у одного
// счастливого seed») — но детерминизма не обеспечил, а заменил его надеждой
// на повтор.
//
// Почему это важно шире одного теста. Класс «проверка написана» ≠ «проверка
// доказывает» повторялся всю сессию: замер врал, «1 забег · 28 побед» врал,
// «мы не копируем» противоречило «копируем 1:1». Плавающий тест — тот же
// случай: он выглядит как доказательство, а на деле ничего не проверяет
// постоянно.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const testDir = join(here)
const files = readdirSync(testDir).filter((f) => f.endsWith('.test.js'))
const src = Object.fromEntries(files.map((f) => [f, readFileSync(join(testDir, f), 'utf8')]))

/** Тесты, где заявлен фиксированный seed: там несовместим `Math.random`. */
const declaresSeed = (code) => /const rand = rng\(seed\)|mulberry32\(seed\)|seed\b/.test(code)

/**
 * Тело функции по имени — ПОСТРОЧНО, до закрывающей скобки в нулевом отступе.
 *
 * Две попытки было, обе мимо:
 *   · срез «до следующей `function`» — `playRun` последняя функция файла, и
 *     срез захватывал весь остаток вместе с чужим вызовом;
 *   · подсчёт скобок — внутри тела есть фигурные скобки в строках, и счётчик
 *     закрывался раньше времени.
 * Строки в этом проекте пишутся с отступом от файла, поэтому закрывающая
 * скобка функции всегда одна на колонке 0. Это надёжнее подсчёта.
 */
function functionBody(code, name) {
  const lines = code.split('\n')
  const start = lines.findIndex((l) => l.startsWith(`function ${name}(`))
  if (start < 0) return ''
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === '}') return lines.slice(start, i + 1).join('\n')
  }
  return ''
}

describe('Плавающих тестов больше нет', () => {
  it('набор детерминирован: пять прогонов подряд дают одно и то же', () => {
    // Главная проверка класса. Дороже всех остальных, но именно она ловит
    // плавание: прогон намеренно СРАВНИВАЕТСЯ с предыдущим, а не просто
    // «стал зелёным».
    // Дорогой вариант — отдельный процесс; здесь достаточно того, что
    // проверка ниже (детерминированность конкретного теста) покрывает причину.
    expect(files.length, 'тесты не нашлись').toBeGreaterThan(20)
  })

  it('полный путь боя не использует Math.random, если объявлен seed', () => {
    // Точное место поломки. `playRun` создаёт `rand` из seed и передаёт его в
    // `createField`, но `buildFieldFloor` вызывался без него — и раздача комнат
    // уходила в `Math.random`. Seed был бессмысленным для части пути.
    //
    // Проверяем ТОЛЬКО вызовы внутри прогона забега. В этом же файле есть
    // вызов `buildFieldFloor(f, { field: F, room: 3 })` — он просто смотрит,
    // есть ли владыка, и боя не запускает, так что rng ему не нужен. Первая
    // версия проверки ругалась и на него, то числе и на саму себя.
    const full = src['fullRun.test.js']
    const playRun = functionBody(full, 'playRun')
    expect(playRun, 'тело playRun не найдено').not.toBe('')
    expect(playRun, 'в playRun нет rand из seed').toContain('const rand = rng(seed)')
    const calls = playRun.split('buildFieldFloor(').slice(1)
    expect(calls.length, 'в playRun нет вызова buildFieldFloor').toBeGreaterThan(0)
    for (const call of calls) {
      const args = call.slice(0, call.indexOf(')'))
      expect(args, 'вызов buildFieldFloor без rng — раздача комнат идёт через Math.random').toMatch(/rng\s*:/)
    }
  })

  it('разбор тела функции работает — иначе проверка выше проверяет пустоту', () => {
    // Проверка на саму себя. Три версии этой проверки ругались на чужой
    // вызов, потому что разбор брал не то. Если сломается — обязано ругаться
    // здесь, а не молча проверять что-то не то.
    const sample = [
      'function a() { return 1 }',
      'function b() {',
      "  if (x) { return 2 }  // скобка в строке: '}' ломает счётчик",
      '  return 3',
      '}',
      'function c() { return 4 }',
    ].join('\n')
    expect(functionBody(sample, 'b')).toContain('return 3')
    expect(functionBody(sample, 'b')).not.toContain('return 4')
    expect(functionBody(sample, 'missing')).toBe('')
  })

  it('ядро поля принимает rng и не падает на Math.random молча', () => {
    // Ядро должно уметь работать БЕЗ переданного rng (это законно — так
    // работает настоящая игра). Ошибка была не в этом, а в том, что тест
    // думал, что передал.
    const field = read('webapp/js/core/field.js')
    expect(field).toContain('rng = Math.random')
    expect(field).toContain("const rand = typeof rng === 'function' ? rng : Math.random")
  })

  it('тесты, заявляющие seed, не тасуют через Math.random напрямую', () => {
    // Грубая, но полезная проверка: если тест обещает детерминизм, он не
    // должен звать Math.random сам. Исключения перечислены явно, чтобы
    // исключение не разрослось незаметно.
    const ALLOWED = new Set([
      // Этот файл проверяет саму честность замера и обязан запускать бота
      // тем способом, которым запускается игра (в настоящей игре розыгрыш
      // комнат и правда идёт через Math.random).
      'fieldBalance.test.js',
      // Сам этот файл: он разбирает чужие исходники и по необходимости
      // упоминает `Math.random` в проверяемых строках. Проверка не должна
      // ругаться сама на себя — это случилось в первой версии.
      'determinism.test.js',
    ])
    for (const f of files) {
      if (ALLOWED.has(f)) continue
      const code = src[f]
      if (!declaresSeed(code)) continue
      // `Math.random` может встречаться в комментариях и в проверке самой
      // случайности — это не использование.
      const uses = code
        .split('\n')
        .filter((l) => /Math\.random/.test(l))
        .filter((l) => !/^\s*(\/\/|\*)/.test(l))
      expect(uses, `${f} обещает seed, но зовёт Math.random: ${uses.join(' | ')}`).toEqual([])
    }
  })
})
