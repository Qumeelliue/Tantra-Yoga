// Тесты: замер «ширины дороги» — и вывод, который из него получился.
//
// Цель §18 требовала «25–40 % мирных финалов», а замер давал 0 % у силового
// бота и 95 % у пасифиста. Это два края шкалы бота, а не игрок между ними.
// Кандидатом на замену был замер «ширины дороги» (сколько сборок колоды
// способны дойти до мира).
//
// Кандидат НЕ выдержал проверки, и это главное, что тут зафиксировано:
// разброс между наборами 73–79 из 100, то есть выбор карт почти не решает,
// будет ли мир. «Сколько путей» не может быть целью — их и так три, и все
// рабочие. Зато замер сразу дал настоящую цифру: **мирный финал достижим
// из любой стартовой колоды и стоит 21–25 % смертей при падении жизни до
// ~45 %**. Это стабильно на всех наборах, то есть это свойство игры, а не
// артефакт бота.
//
// Проверки ниже не дают двум вещам: (1) замеру незаметно слом��аться и
// начать врать, как врали все предыдущие; (2) кому-то заменить кандидата
// другим числом молча, без записи, что первый кандидат не выдержал.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CARDS } from '@webapp/js/core/data.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const code = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')
const roadSrc = read('scripts/roadWidth.mjs')
const roadCode = code('scripts/roadWidth.mjs')
const balanceSrc = read('scripts/balance.mjs')
const balanceCode = code('scripts/balance.mjs')
const pkg = JSON.parse(read('package.json'))

describe('Три пути успокоения существуют в контенте', () => {
  const all = Object.values(CARDS)
  const has = (c, kind) => (c.effects || []).some((e) => e.kind === kind)

  it('Ахимса есть и в старте, и в пуле наград', () => {
    // Если бы её не было в старте, мирный путь зависел бы от того, выпадет ли
    // она в награду, — а это уже лотерея, а не путь.
    const a = all.find((c) => c.id === 'ahimsa')
    expect(a, 'Ахимсы нет в контенте').toBeTruthy()
    expect(has(a, 'pacify'), 'Ахимса не успокаивает').toBe(true)
    expect(a.starter, 'Ахимса не стартовая').toBeGreaterThan(0)
  })

  it('микровиты — второй путь, и он только из выбора', () => {
    const pool = all.filter((c) => has(c, 'microvita') && !c.starter && c.type !== 'curse' && c.type !== 'vritti')
    expect(pool.length, 'микровит нет в пуле наград').toBeGreaterThan(0)
    // В старте их нет — и это честно: путь открывается решением, а не догадкой.
    const starter = all.filter((c) => has(c, 'microvita') && c.starter > 0)
    expect(starter.length).toBe(0)
  })

  it('прама — третий путь, и без неё владыку не успокоить вовсе', () => {
    const pool = all.filter((c) => has(c, 'balance') && !c.starter)
    expect(pool.length, 'прамы нет в пуле наград').toBeGreaterThan(0)
    // Проверяем настоящую причину, а не совпадение имён: `pacifyReady` требует
    // праму именно у владыки. Убери это условие — и третий путь исчезнет.
    const engine = read('webapp/js/core/engine.js')
    expect(engine).toContain("if (e.def.isBoss && !state.player.prama) return false")
  })
})

describe('Замер не врёт (проверено откатами)', () => {
  it('«мирный финал» в замере — это кровь за весь забег, а не владыки', () => {
    // Раньше обе цифры назывались «мирными финалами», и это были разные вещи.
    // Определение автора (§9.1q): мирный финал = забег без единой крови.
    expect(balanceCode).toContain("peaceful: run.status === 'victory' && agg.fightKills === 0")
    expect(balanceCode).toContain("pacified: run.outcome === 'awakening'")
  })

  it('счётчик владык объявлен ДО runOnce, а не внутри отчёта', () => {
    // Скрытая связь: `runOnce` пишет в `bossStats` прямо из тела. Когда
    // объявление уехало внутрь `if (isEntry)`, скрипт перестал запускаться,
    // и `npm run balance` печатал ПУСТОТУ без всякой ошибки. Общий класс
    // ошибок проекта: неявные связи ломаются молча.
    const decl = balanceCode.indexOf('const bossStats')
    const use = balanceCode.indexOf('bossStats.total++')
    expect(decl).toBeGreaterThan(-1)
    expect(decl, 'bossStats объявлен после первого использования').toBeLessThan(use)
    expect(balanceCode).toContain('export function resetBossStats')
  })

  it('отчёт колоды не запускается при импорте (иначе замер дороги запустит чужой прогон)', () => {
    expect(balanceCode).toContain('const isEntry = process.argv[1] && process.argv[1].endsWith')
    expect(balanceCode).toContain('if (isEntry) {')
  })

  it('замер дороги меряет на ОДНИХ И ТЕХ ЖЕ семенах', () => {
    // Первая версия проверки искала строку `const seed = s * 100 + 7` и
    // радовалась. Откат показал, что этого мало: `+ suite.extra.length *
    // 50000` оставлял ту же строку на месте и ПОЛНОСТЬЮ ломал сравнение —
    // каждый набор получал свои семена, и «73 против 79» становилось
    // сравнением шума. Проверка была зелёной на сломанном коде.
    //
    // Значит семя обязано зависеть ТОЛЬКО от `s`. Проверяем это разбором
    // выражения, а не поиском подстроки.
    expect(roadCode).toContain('const seed = s * 100 + 7')
    const line = roadSrc.split('\n').find((l) => l.includes('const seed ='))
    expect(line, 'строка с seed не найдена').toBeTruthy()
    const expr = line.slice(line.indexOf('=') + 1).trim()
    expect(
      expr,
      `семя зависит не только от s: «${expr}» — значит наборы меряются на разных розыгрышах и сравнивать их нельзя`,
    ).toBe('s * 100 + 7')
  })

  it('каждый набор проходит одинаковое число забегов', () => {
    // Ещё одна форма того же: если наборов четыре, а забегов на набор разное,
    // сравнение снова испортится. Откат `s <= N - suite.extra.length * 10`
    // проскочил мимо первой версии — она ловила только `Math.min` и `suite`,
    // то есть перечисляла способы, а не проверяла свойство.
    //
    // Проверяем СВОЙСТВО: верхняя граница цикла обязана быть ровно `N`.
    const body = roadCode.slice(roadCode.indexOf('for (const suite of SUITES)'))
    const line = body.split('\n').find((l) => l.includes('for (let s = 1;'))
    expect(line, 'цикл забегов не найден').toBeTruthy()
    const bound = line.slice(line.indexOf('s <=') + 4).replace(/;.*$/, '').trim()
    expect(
      bound,
      `число забегов на набор разное (граница «${bound}») — сравнивать наборы нельзя`,
    ).toBe('N')
  })

  it('все четыре набора замеряются, а не только лучший', () => {
    // Замер «ширины» обязан включать ТУПИК. Если вычеркнуть худший набор,
    // останется только подтверждение, что всё хорошо.
    for (const id of ['ahimsa-only', 'ahimsa+micro', 'ahimsa+prama', 'all-three']) {
      expect(roadCode, `нет набора ${id}`).toContain(`'${id}'`)
    }
  })

  it('замер дороги есть в package.json', () => {
    expect(pkg.scripts['road-width']).toBeTruthy()
  })
})

describe('Вывод записан, и в том виде, в каком получился', () => {
  const spec = read('SPEC.md')
  const base = read('design/BASE-GAME.md')

  it('провал кандидата записан, а не вычеркнут', () => {
    // Правило проекта: неверный вывод — тоже запись. Иначе через месяц его
    // повторят и решат, что он придуман впервые.
    expect(spec).toContain('ширина дороги')
    expect(base).toContain('ШИРИНА ДОРОГИ')
  })

  it('записано, что выбор карт не решает — и это вывод, а не отсутствие данных', () => {
    expect(roadSrc).toContain('сопоставимой ценой')
    expect(roadSrc).toContain('не выбором карт, а умением играть')
  })

  it('единственная честная цифра — это ЦЕНА финала, а не его доля', () => {
    // Мирный финал достижим из любой колоды; стоит 21–25 % смертей при
    // падении жизни до ~45 %. Это стабильно на всех наборах, то есть
    // свойство игры. Доля финалов — свойство бота.
    expect(roadSrc).toContain('смертей')
    expect(roadSrc).toContain('мин. жизнь')
  })
})
