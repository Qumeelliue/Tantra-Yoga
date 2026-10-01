// НАГРАДА ВЛИЯЕТ: ни один дар, нефрит, усиление или ментальность не должны
// быть пустышкой.
//
// Зачем. Проверка `auditObtainable` отвечает на вопрос «выдаётся ли контент».
// Второй вопрос важнее: «меняет ли он бой». Награда может выдаваться,
// записывать величину в опции — и ничего не делать, потому что боевой код
// её не читает. Игрок берёт «Дар Кииртана» и не чувствует ничего. Это
// худший вид помойки, и дешевле всего поймать его сразу.
//
// Проверка честная и грубая: записать, какие поля опций трогает награда,
// и поискать эти поля во всём `webapp/js`. Поле, которое никто не читает, —
// награда-пустышка.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { BOONS, BOON_RARITY } from '../webapp/js/core/boons.js'
import { KEEPSAKES } from '../webapp/js/core/keepsakes.js'
import { WORKSHOP } from '../webapp/js/core/workshop.js'
import { VARNA_KITS } from '../webapp/js/core/varnaKits.js'

const here = dirname(fileURLToPath(import.meta.url))
const jsDir = join(here, '..', 'webapp', 'js')

function allJs(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(allJs(p))
    else if (name.endsWith('.js')) out.push(readFileSync(p, 'utf8'))
  }
  return out.join('\n')
}
const CODE = allJs(jsDir)

/** Какие поля опций пишет награда. */
function touched(apply) {
  const keys = new Set()
  const proxy = new Proxy({}, {
    get: (t, k) => (typeof k === 'string' && k in t ? t[k] : 0),
    set(t, k, v) { keys.add(k); t[k] = v; return true },
  })
  try { apply(proxy) } catch { /* apply читает поле — get отдаёт 0 */ }
  return [...keys]
}
const isRead = (key) => new RegExp(`(?:st\\.o|st\\.opts|opts|\\bo|\\bo2)\\.${key}\\b`).test(CODE)

const groups = [
  ['дар чакры', BOONS],
  ['нефрит', KEEPSAKES],
  ['мастерская', WORKSHOP],
  ['ментальность', Object.values(VARNA_KITS)],
]

describe('награды влияют на бой', () => {
  it('все награды меняют то, что бой читает', () => {
    const dead = []
    const empty = []
    for (const [group, list] of groups) {
      for (const item of list) {
        const keys = touched(item.apply)
        const label = `${group} «${item.name || item.label || item.id}»`
        if (!keys.length) empty.push(label)
        const bad = keys.filter((k) => !isRead(k))
        if (bad.length) dead.push(`${label} → ${bad.join(', ')}`)
      }
    }
    expect(empty, 'награда без эффекта — игрок берёт, а ничего не меняется').toEqual([])
    expect(dead, 'величина записана, но бой её не читает').toEqual([])
  })

  it('у каждой награды есть цитата из шастр', () => {
    // Правило проекта: нет цитаты — нет награды.
    const noQuote = []
    for (const [group, list] of groups) {
      for (const item of list) {
        const q = item.quoteId
        if (!q && group !== 'ментальность') noQuote.push(`${group} «${item.name}»`)
      }
    }
    expect(noQuote).toEqual([])
  })

  it('каждая награда показывает игроку, что именно меняет', () => {
    // Награда без описания — тоже помойка: игрок берёт вслепую.
    const noText = []
    for (const [group, list] of groups) {
      for (const item of list) {
        if (!item.desc && !item.label) noText.push(`${group} «${item.id}»`)
      }
    }
    expect(noText).toEqual([])
  })

  it('цены и редкость заданы: мастерская не бывает бесплатной', () => {
    for (const u of WORKSHOP) {
      expect(u.cost, `${u.id} без цены`).toBeGreaterThan(0)
    }
    // Список редкостей — из кода, а не повторён здесь строкой: иначе
    // добавление легендарных даров валило бы этот тест, и правильным
    // решением выглядело бы «ослабить тест», а не «дописать редкость».
    for (const b of BOONS) {
      expect(Object.keys(BOON_RARITY), `редкость ${b.rarity} не описана словами`).toContain(b.rarity)
    }
    // Легендарный дар обязан быть тяжелее обычного — иначе «легендарность»
    // была бы только подписью на карточке.
    for (const b of BOONS.filter((x) => x.rarity === 'legendary')) {
      expect(b.requires.length, `${b.id}: легендарный без предпосылок`).toBeGreaterThan(0)
    }
  })
})
