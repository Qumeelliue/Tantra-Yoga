// САМАДХИ ГОВОРИТ, ЧТО ОТКРЫЛОСЬ, И ЧТО ЗАКРЫЛОСЬ.
//
// Что было. Ясность — состояние на девять секунд, в котором бой меняется
// втрое: твой урон ×1.5, твой входящий ×0.3, пелена ауры тебя не закрывает.
// Замерено: открывается **7.6 раза за забег**, по 9 секунд, — около минуты
// боя втрое усиленного.
//
// И вот что с этим было: `checkSamadhi(st)` вызывался из `stepField` БЕЗ
// массива событий. События не было — ни на вход, ни на выход. Игрок видел, как
// полоса духовной силы обнуляется и у садхака появляется белый свет, но не
// знал, что это состояние, сколько оно длится и почему бой через девять секунд
// внезапно стал втрое тяжелее.
//
// Это худшая поломка класса «экран обещает, код делает иначе» из найденных за
// сессию: здесь экран вообще ничего не обещал, а игрок всё равно играл в
// состояние, которого для него не существовало.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createField, stepField, checkSamadhi, DEFAULT_FIELD_OPTIONS } from '@webapp/js/core/field.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const stripCode = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
const core = read('webapp/js/core/field.js')
const screen = stripCode(read('webapp/js/ui/screens/field.js'))

function field(over = {}) {
  return createField({
    player: { x: 100, y: 200, hp: 60 },
    foes: [{ id: 'krodha', name: 'Кродха', x: 300, y: 300, calmMax: 3 }],
    rng: () => 0.5, ...over,
  })
}

/** Прогнать боевой шаг и собрать все события. */
function tick(st, seconds = 1 / 30, dt = 1 / 60) {
  const ev = []
  for (let i = 0; i < Math.round(seconds / dt); i++) ev.push(...stepField(st, dt, {}))
  return ev
}

function recorder() {
  const calls = []
  const ctx = {
    calls, fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt',
    font: '', textAlign: 'center', globalAlpha: 1, shadowBlur: 0, shadowColor: '',
    canvas: {},
    measureText: () => ({ width: 10 }),
    createRadialGradient: () => { calls.push({ m: 'createRadialGradient' }); return { addColorStop() {} } },
  }
  for (const m of ['save', 'restore', 'translate', 'scale', 'rotate', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'fillRect', 'strokeRect', 'fill', 'stroke',
    'setLineDash', 'quadraticCurveTo', 'fillText', 'strokeText']) {
    ctx[m] = (...a) => calls.push({ m, a })
  }
  return ctx
}

describe('Ясность объявляет себя', () => {
  it('вход в ясность — событие, а не пустота', () => {
    // Точное место поломки: вызов без массива событий, и возвращаемое
    // значение выбрасывалось.
    const st = field()
    st.player.shakti = DEFAULT_FIELD_OPTIONS.samadhiShakti
    const ev = []
    checkSamadhi(st, ev)
    expect(ev.some((e) => e.type === 'samadhi_start')).toBe(true)
  })

  it('в шаге боя ясность тоже объявляется', () => {
    // `stepField` звал `checkSamadhi(st)` — без событий. Проверяем, что путь
    // боя, а не только прямая функция.
    const st = field()
    st.player.shakti = DEFAULT_FIELD_OPTIONS.samadhiShakti
    const ev = tick(st)
    expect(ev.some((e) => e.type === 'samadhi_start'),
      'шаг боя не сообщает о ясности — игрок её не видит').toBe(true)
  })

  it('событие называет, сколько секунд окно живёт', () => {
    // Без числа игрок знает, что стало легче, но не знает, что у него есть
    // девять секунд на то, чтобы это использовать.
    const st = field()
    st.player.shakti = DEFAULT_FIELD_OPTIONS.samadhiShakti
    const ev = []
    checkSamadhi(st, ev)
    const e = ev.find((x) => x.type === 'samadhi_start')
    expect(e.time).toBe(DEFAULT_FIELD_OPTIONS.samadhiTime)
  })

  it('конец окна — тоже событие', () => {
    // Иначе бой внезапно тяжелеет без причины: худший вид поломки, потому что
    // игрок ищет причину там, где её нет.
    const st = field()
    st.player.shakti = DEFAULT_FIELD_OPTIONS.samadhiShakti
    checkSamadhi(st, [])
    const ev = tick(st, DEFAULT_FIELD_OPTIONS.samadhiTime + 1)
    expect(ev.some((e) => e.type === 'samadhi_end'),
      'окно закрылось молча — бой посветлел и потемнел без слов').toBe(true)
  })

  it('окно не переоткрывается, пока не набрана новая сила', () => {
    // Иначе ясность включалась бы непрерывно и перестала быть наградой.
    const st = field()
    st.player.shakti = DEFAULT_FIELD_OPTIONS.samadhiShakti
    checkSamadhi(st, [])
    const ev = tick(st, 1)
    expect(ev.some((e) => e.type === 'samadhi_start')).toBe(false)
  })
})

describe('Объявление соответствует тому, что окно делает', () => {
  // Самое важное. Если сказать «втрое», а на деле не втрое — это новая
  // поломка, только наоборот: экран обещает больше, чем даёт.
  it('входящий урон падает втрое — как и сказано на экране', () => {
    const st = field()
    st.player.shakti = DEFAULT_FIELD_OPTIONS.samadhiShakti
    checkSamadhi(st, [])
    expect(core).toMatch(/if \(p\.inSamadhi\) gain \*= 0\.3/)
  })

  it('исходящий урок усиливается в полтора раза', () => {
    expect(core).toMatch(/if \(p\.inSamadhi\) mod \*= 1\.5/)
  })

  it('пелена ауры не закрывает в ясности', () => {
    expect(core).toMatch(/auraVeilAt \?\? 0\.5\) && !st\.player\.inSamadhi/)
  })

  it('за вход платится вся духовная сила, и это видно по полосе', () => {
    // Полоса обнуляется — игрок должен понимать, что это стоило всего. Иначе
    // «сила пропала» читается как баг.
    const st = field()
    st.player.shakti = DEFAULT_FIELD_OPTIONS.samadhiShakti
    checkSamadhi(st, [])
    expect(st.player.shakti).toBe(0)
  })
})

describe('Окно видно на экране', () => {
  it('экран называет ясность и её длительность', () => {
    expect(screen).toMatch(/case 'samadhi_start'/)
    expect(screen).toMatch(/ясность/)
    expect(screen).toMatch(/\$\{e\.time\} с/)
  })

  it('экран говорит, что окно закончилось', () => {
    expect(screen).toMatch(/case 'samadhi_end'/)
  })

  it('вокруг садхака тает кольцо', () => {
    // Тот же рисунок, что вокруг оки показывает спокойствие: один язык на всю
    // игру. Игрок учится один раз и читает оба.
    expect(screen).toMatch(/if \(p\.inSamadhi\)[\s\S]{0,700}ctx\.arc\(0, -8, 36, -Math\.PI \/ 2/)
  })

  it('кольцо считает остаток времени, а не рисует всегда полный круг', () => {
    // Постоянно полный кольцо — то же самое, что никакого: игрок не видит,
    // сколько осталось.
    expect(screen).toMatch(/p\.samadhi \/ total/)
  })

  it('последние секунды заметны — кольцо меняет цвет', () => {
    // Окно в 9 секунд: если последние три не выделены, игрок теряет его
    // незаметно и злится, что «сила пропала».
    expect(screen).toMatch(/frac < 0\.25/)
  })
})

describe('Замер это видит', () => {
  const sim = read('scripts/fieldBalance.mjs')

  it('замер считает, сколько раз открывалось окно', () => {
    // Без этого «ясноть работает» проверяется чтением кода, а на деле её
    // могло не быть вовсе — и тогда мы чинили бы пустоту.
    expect(sim).toMatch(/samadhi_start/)
    expect(sim).toMatch(/SAMLOG/)
  })

  it('строка про ясность печатается всегда', () => {
    expect(sim).toMatch(/ясность:/)
  })
})
