// Тесты честности щита: экран обещает — код отдаёт.
//
// Класс поломки, который проект ненавидит (МЕХАНИКА 41). Дар «Мудра севы»
// на карточке нефрита обещает «любая сева даёт 5 щита». Три способа это
// обещание обмануть, и все три были в игре:
//
//   1. МОЛЧАНИЕ. Сева сработала, щит был полон, ничего не прибавилось — и
//      игрок не получал ни слова. Он нажал, ничего не получил и решил, что
//      дар сломан.
//   2. ВРАНЬЁ В СТРОКЕ МАНТРЫ. `addShield` возвращал новое ЗНАЧЕНИЕ щита, а
//      сколько именно прибавилось — никто не считал. Мантра писала «щит +4»
//      даже тогда, когда прибавилось 0.
//   3. ЩИТ БЕЗ ЧИСЛА. На экране только полоска. Сколько в ней щита, надо
//      угадывать на глаз по ширине (Slay the Spire и Dead Cells показывают
//      блок цифрой всегда).
//
// Правило здесь: **обещание либо сбылось и названо, либо сорвалось и названо.**

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createField, serveWare, castMantra, stepField, DEFAULT_FIELD_OPTIONS } from '@webapp/js/core/field.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const stripCode = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

function field(opts = {}) {
  return createField({
    player: { x: 100, y: 200, hp: 60 }, foes: [], rng: () => 0.5, opts,
  })
}

function ware() {
  return {
    id: 'w1', x: 100, y: 200, name: 'у колодца',
    call: 'помоги', need: 'вода', debt: false,
  }
}

function serve(st, opts = {}) {
  st.wares = [ware()]
  return serveWare(st, 0, opts.kind || 'shudrocita', [])
}

function servedEvent(st, opts = {}) {
  const ev = serve(st, opts)
  return ev.find((e) => e.type === 'served')
}

describe('Дар «щит от севы» говорит правду', () => {
  it('сева называет, сколько щита прибавила', () => {
    const st = field({ sevaShield: 5 })
    const e = servedEvent(st)
    expect(st.player.shield).toBe(5)
    expect(e.shield).toBe(5)
    expect(e.shieldFull).toBe(false)
  })

  it('сева при полном щите говорит, что щит полон — а не молчит', () => {
    // То самое молчание: игрок нажал, ничего не получил, и решил, что дар
    // сломан. Замерено: 58 сев из 617 (9 %) упираются в потолок.
    const st = field({ sevaShield: 5 })
    st.player.shield = DEFAULT_FIELD_OPTIONS.shieldMax
    const e = servedEvent(st)
    expect(e.shield).toBe(0)
    expect(e.shieldFull, 'полный щит не распознан — экран промолчит').toBe(true)
  })

  it('щит не превышает потолок ни при каком даре', () => {
    const st = field({ sevaShield: 5 })
    st.player.shield = DEFAULT_FIELD_OPTIONS.shieldMax - 2
    const e = servedEvent(st)
    expect(st.player.shield).toBe(DEFAULT_FIELD_OPTIONS.shieldMax)
    expect(e.shield).toBe(2)          // не 5 — ровно сколько влезло
    expect(e.shieldFull).toBe(false)  // влезло хоть что-то — это не «впустую»
  })

  it('без дара о щите не говорится вовсе', () => {
    // Лишнее слово «щит +0» было бы враньём другого рода.
    const st = field()
    const e = servedEvent(st)
    expect(e.shield).toBe(0)
    expect(e.shieldFull).toBe(false)
  })

  it('помощь с расчётом не считается севой и щита не даёт', () => {
    const st = field({ sevaShield: 5 })
    st.wares = [{ ...ware(), debt: true }]
    const ev = serveWare(st, 0, 'shudrocita', [])
    expect(ev.some((e) => e.type === 'seva_debt')).toBe(true)
    expect(st.player.shield).toBe(0)
  })
})

describe('Строка мантры не врёт о щите', () => {
  // Все мантры с блоком: пранаяма, мадхувидья, самьяма, упаваса, тандава.
  const shielding = ['pranayama', 'madhuvidya', 'samyama', 'upavasa', 'tandava']

  function mantraText(id, full = false) {
    const st = field()
    st.player.mantraId = id
    st.player.psychic = 99
    if (full) st.player.shield = DEFAULT_FIELD_OPTIONS.shieldMax
    const ev = castMantra(st, [])
    return (ev.find((e) => e.type === 'mantra') || {}).text || ''
  }

  for (const id of shielding) {
    it(`${id}: при пустом щите называет, сколько прибавила`, () => {
      expect(mantraText(id)).toMatch(/щит \+\d/)
    })

    it(`${id}: при полном щите НЕ обещает щита`, () => {
      // Вторая ложь того же класса. Здесь она жила в шести местах сразу.
      const t = mantraText(id, true)
      expect(t, `«${t}» обещает щит, хотя щит полон`).not.toMatch(/щит \+\d/)
    })
  }
})

describe('Экран показывает щит числом и говорит о нём', () => {
  const screen = stripCode(read('webapp/js/ui/screens/field.js'))
  const css = read('webapp/css/main.css')

  it('у щита есть цифра на экране', () => {
    // Slay the Spire и Dead Cells: блок всегда виден числом, а не шириной
    // полоски. Без цифры игрок не знает, сколько ещё выдержит.
    expect(screen).toMatch(/id: 'fshield-n'/)
  })

  it('цифра щита обновляется из состояния боя', () => {
    expect(screen).toMatch(/fshield-n[\s\S]{0,160}Math\.round\(p\.shield\)/)
  })

  it('полный щит помечен — «полосу не видно» и «щит полон» не путаются', () => {
    expect(screen).toMatch(/fshield-n[\s\S]{0,200}classList\.toggle\('full'/)
  })

  it('экран говорит «щит полон», когда награда не влезла', () => {
    // Ключевая строка: без неё игрок нажимает, ничего не получает и думает,
    // что дар сломан.
    expect(screen).toMatch(/щит полон/)
  })

  it('экран называет и щит, и полный щит в одном месте — разбор случая', () => {
    const i = screen.indexOf("case 'served'")
    expect(i).toBeGreaterThan(0)
    const block = screen.slice(i, i + 700)
    expect(block).toMatch(/щит \+\$\{e\.shield\}/)
    expect(block).toMatch(/щит полон/)
  })

  it('цифра щита не занимает место, когда щита нет', () => {
    // Поле уже жаловались на «кучу информации на экране». Пустой щит = нет
    // цифры, а не «0» в углу.
    expect(css).toMatch(/\.fhp-n:empty \{ display: none; \}/)
  })
})

describe('Замер это видит, а не только код', () => {
  const sim = stripCode(read('scripts/fieldBalance.mjs'))

  it('замер считает, сколько дар сработал вхолостую', () => {
    // Без этого числа «дар работает» проверялось только чтением кода, а
    // игрок видел пустоту и не мог понять, почему.
    expect(sim).toMatch(/SHIELDLOG/)
    expect(sim).toMatch(/shieldFull/)
  })

  it('строка замера печатается всегда — ноль тоже ответ', () => {
    expect(sim).toMatch(/щит от севы:/)
  })
})
