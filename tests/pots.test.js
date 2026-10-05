// Тесты СОКРОВИЩА в Поле Ума — копия контейнеров Dead Cells и горшков Hades.
//
// Что копируется и зачем: в Dead Cells и в Hades в комнате стоят разбиваемые
// объекты. Их ломают, из них падает монеты, и это повод свернуть с боя в угол.
// Мы берём это 1:1. Наша подстановка: амбросия — общая монета игры (она уже
// была, из оков), а из сундука — очки севы в мастерскую.
//
// Главное правило, которое здесь защищается: **горшок не должен быть дешевле
// боя**. За лёгкие деньги темнеет самшкара, и милость (крипа) после этого не
// достаёт. Это цена, а не «бесплатные монеты».

import { describe, it, expect } from 'vitest'
import { roomIso } from '../webapp/js/ui/iso.js'
import { readFileSync } from 'node:fs'
import {
  createField, stepField, smashPot, potAt, checkKrpa, DEFAULT_FIELD_OPTIONS,
} from '@webapp/js/core/field.js'
import { buildFieldFloor } from '@webapp/js/core/fieldBuild.js'
import { sevaPointsFor } from '@webapp/js/core/workshop.js'
import { drawPotArt } from '@webapp/js/ui/fieldArt.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const stripCode = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

function field(pots = [], opts = {}) {
  return createField({
    player: { x: 100, y: 200, hp: 60 }, foes: [], pots, rng: () => 0.5, opts,
  })
}

function pot(over = {}) {
  return { id: 'p1', x: 100, y: 200, kind: 'pot', hp: 2, maxHp: 2, name: 'горшок', coins: 3, broken: false, ...over }
}

function run(st, seconds, dt = 1 / 60) {
  const ev = []
  for (let i = 0; i < Math.round(seconds / dt); i++) ev.push(...stepField(st, dt, {}))
  return ev
}

describe('Сокровище ставится в комнату', () => {
  it('в комнате есть горшок', () => {
    const b = buildFieldFloor(0, { field: { w: 1200, h: 900 }, room: 0 })
    expect(b.pots.length).toBeGreaterThan(0)
    expect(b.pots.some((p) => !p.chest)).toBe(true)
  })

  it('горшок стоит в углу, а не на пути к окам', () => {
    // Иначе это не «свернуть в угол», а ещё одна цель на пути. Игрок должен
    // ВЫБИРАТЬ, пойти ли за лёгкими деньгами.
    //
    // Первая версия считала расстояние до ОК, а раскладка комнаты —
    // розыгрыш (`rng` по умолчанию `Math.random`). Тест был случайным: из
    // шести прогонов один падал, и он проверял бы удачу, а не правило.
    // Поэтому `rng` задан, и проверяется ПОЛОСА угла, а не случайная ока.
    const b = buildFieldFloor(3, { field: { w: 1200, h: 900 }, room: 1, rng: () => 0.5 })
    for (const p of b.pots) {
      const inCornerBand = (p.x < 1200 * 0.5 && p.y > 900 * 0.7)
        || (p.x > 1200 * 0.55 && p.y < 900 * 0.4)
      expect(inCornerBand, `сокровище стоит в середине комнаты: ${p.x.toFixed(0)},${p.y.toFixed(0)}`).toBe(true)
    }
  })

  it('сундук ровно один за этап и только в последней комнате', () => {
    const chests = [0, 1, 2].map((room) =>
      buildFieldFloor(2, { field: { w: 1200, h: 900 }, room }).pots.filter((p) => p.chest).length)
    expect(chests).toEqual([0, 0, 1])
  })

  it('сундук крепче горшка — иначе он не отличается от него', () => {
    const b = buildFieldFloor(1, { field: { w: 1200, h: 900 }, room: 2 })
    const chest = b.pots.find((p) => p.chest)
    const jar = b.pots.find((p) => !p.chest)
    expect(chest.maxHp).toBeGreaterThan(jar.maxHp)
  })

  it('сокровище не наезжает на просящего', () => {
    // Просящего служат одним тапом. Если два объекта стоят рядом, игрок
    // получает не то, что думает, — а это поломка МЕХАНИКИ 41.
    for (let room = 0; room < 3; room++) {
      const b = buildFieldFloor(0, { field: { w: 1200, h: 900 }, room })
      for (const p of b.pots) {
        for (const w of b.wares) {
          expect(Math.hypot(p.x - w.x, p.y - w.y), `горшок и просящий в одной точке (комната ${room})`)
            .toBeGreaterThan(60)
        }
      }
    }
  })
})

describe('Горшок ломается ударом', () => {
  it('с первого удара только трещина, монет нет', () => {
    const st = field([pot()])
    const ev = []
    expect(smashPot(st, 0, ev), 'функция отвечает «сломан ли», а не «что случилось»').toBe(false)
    expect(ev.some((e) => e.type === 'pot_chipped')).toBe(true)
    expect(st.pots[0].broken).toBe(false)
    expect(st.coins).toHaveLength(0)
  })

  it('со второго — разбит, и монеты ПАДАЮТ на пол', () => {
    const st = field([pot()])
    smashPot(st, 0); smashPot(st, 0)
    expect(st.pots[0].broken).toBe(true)
    // Ключевая проверка: деньги не в кармане, а лежат. Игра рисует монеты и
    // учит подбирать шагом; первая версия выдавала их сразу в `coinsTaken` —
    // две разные экономики в одном бою.
    expect(st.coins.length).toBe(3)
    expect(st.coinsTaken).toBe(0)
  })

  it('амбросия подбирается подходом, как из оков', () => {
    const st = field([pot()])
    smashPot(st, 0); smashPot(st, 0)
    st.player.x = 40; st.player.y = 40
    run(st, 0.5)
    expect(st.coinsTaken).toBe(0)          // ушёл далеко — не подобрал
    st.player.x = st.coins[0].x; st.player.y = st.coins[0].y
    run(st, 0.3)
    expect(st.coinsTaken).toBeGreaterThan(0)
  })

  it('разбитый горшок не ломается снова', () => {
    // Иначе одна и та же добыва бесконечна — а это уже не игра, а печатный
    // станок. Проверка ловит именно повторный удар, а не «монет много».
    const st = field([pot()])
    smashPot(st, 0); smashPot(st, 0)
    const n = st.coins.length
    expect(smashPot(st, 0)).toBe(false)
    expect(st.coins).toHaveLength(n)
  })

  it('множитель вайшьи действует на сокровище так же, как на оков', () => {
    // Раньше монеты из горшка шли мимо множителя — выходило, что вайшья
    // работает только на врагов. Один кошелёк должен умножаться одинаково.
    const plain = field([pot()], {})
    smashPot(plain, 0); smashPot(plain, 0)
    const rich = field([pot()], { coinMul: 2 })
    smashPot(rich, 0); smashPot(rich, 0)
    expect(rich.coins.length).toBe(plain.coins.length * 2)
  })

  it('попадание по горшку ищется радиусом, а не словом', () => {
    const st = field([pot({ x: 100, y: 200 }), pot({ id: 'p2', x: 500, y: 500 })])
    expect(potAt(st, 104, 204)).toBe(0)
    expect(potAt(st, 500, 500)).toBe(1)
    expect(potAt(st, 40, 40)).toBe(-1)
    smashPot(st, 0); smashPot(st, 0)
    expect(potAt(st, 104, 204), 'разбитый горшок всё ещё ловит тап').toBe(-1)
  })
})

describe('За сокровище платит самшкара', () => {
  it('разбитый горшок поднимает самшкару и неведение', () => {
    const st = field([pot()])
    const s0 = st.samskaraPressure, a0 = st.avidya
    smashPot(st, 0); smashPot(st, 0)
    expect(st.samskaraPressure).toBeGreaterThan(s0)
    expect(st.avidya).toBeGreaterThan(a0)
  })

  it('после сокровища милость не достаёт — зонт поднят', () => {
    // Это и есть цена. Горшок не должен быть «бесплатными деньгами»: разбил
    // угол — и в беде крипа уже не сработает.
    const st = field([pot()])
    st.player.hp = 1
    st.player.maxHp = 60
    smashPot(st, 0); smashPot(st, 0)
    const ev = []
    checkKrpa(st, ev)
    expect(st.krpaUsed).toBe(false)
    expect(st.krpaMissed).toBe(true)
    expect(ev.some((e) => e.type === 'krpa_missed')).toBe(true)
  })

  it('без сокровища крипа достаёт — значит поломка именно в горшке', () => {
    // Контроль к предыдущему тесту: иначе «знт поднят» ничего не значит.
    const st = field([])
    st.player.hp = 1
    st.player.maxHp = 60
    st.avidya = 0
    checkKrpa(st)
    expect(st.krpaUsed).toBe(true)
  })
})

describe('Сундук даёт севу в мастерскую', () => {
  it('открытый сундук считается в очках севы', () => {
    const st = field([pot({ kind: 'chest', chest: true, hp: 3, maxHp: 3, name: 'сундук', coins: 0 })])
    const before = sevaPointsFor(st)
    smashPot(st, 0); smashPot(st, 0); smashPot(st, 0)
    expect(st.chests).toBe(1)
    expect(sevaPointsFor(st)).toBeGreaterThan(before)
  })

  it('сундук не сыпет монетами — он про севу', () => {
    // Два разных «между забегами» в одной комнате путают игрока: он не знает,
    // что собирает. Сундук — только сева.
    const st = field([pot({ kind: 'chest', chest: true, hp: 3, maxHp: 3, name: 'сундук', coins: 0 })])
    smashPot(st, 0); smashPot(st, 0); smashPot(st, 0)
    expect(st.coins).toHaveLength(0)
  })

  it('поломанный сундук не открывается повторно', () => {
    const st = field([pot({ kind: 'chest', chest: true, hp: 3, maxHp: 3, name: 'сундук', coins: 0 })])
    smashPot(st, 0); smashPot(st, 0); smashPot(st, 0)
    smashPot(st, 0); smashPot(st, 0); smashPot(st, 0)
    expect(st.chests).toBe(1)
  })
})

describe('Замер и игра видят одно и то же сокровище', () => {
  const mainSrc = stripCode(read('webapp/js/main.js'))
  const simSrc = stripCode(read('scripts/fieldBalance.mjs'))

  it('игра передаёт сокровища в бой', () => {
    // Нет этого — комната собралась бы без горшка, и игрок увидел бы пустой
    // угол там, где у него сокровище. Замер при этом был бы зелёным.
    expect(mainSrc).toMatch(/pots:\s*built\.pots/)
  })

  it('замер передаёт сокровища в бой', () => {
    // Проверка на «замер врал» (МЕХАНИКА 43): замер обязан считать бои с тем
    // же сокровищем, что и игра. Иначе цифры про сокровище — выдумка.
    expect(simSrc).toMatch(/pots:\s*built\.pots/)
  })

  it('замер умеет ломать сокровища и ведёт счёт', () => {
    expect(simSrc).toMatch(/smashPot/)
    expect(simSrc).toMatch(/--pots/)
  })

  it('цена сокровища видна в замере, а не только в коде', () => {
    // Строка «сокровища:» печатается ВСЕГДА, даже когда ноль. Ноль — это
    // ответ «бот прошёл мимо», а не «механики нет».
    expect(simSrc).toMatch(/сокровища:/)
  })
})

describe('Сокровище не ломает честность боя', () => {
  it('из горшка нельзя получить ока больше, чем есть', () => {
    // Горшок не роняет оков и не снимает ока: он про вещи, а не про бой.
    const st = field([pot()])
    const s0 = st.player.guna.s
    smashPot(st, 0); smashPot(st, 0)
    expect(st.pacified).toBe(0)
    expect(st.player.guna.s).toBe(s0)
  })

  it('из горшка не идёт духовная сила', () => {
    // Сила в Поле Ума — за снятую оку и за севу. Если бы лампа давала силу,
    // она стала бы третьим путём прокачки, и молчание обрело бы смысл.
    const st = field([pot()])
    const s0 = st.player.shakti
    smashPot(st, 0); smashPot(st, 0)
    expect(st.player.shakti).toBe(s0)
  })

  it('без сокровищ бой идёт как раньше', () => {
    const st = field([])
    expect(st.pots).toEqual([])
    expect(st.chests).toBe(0)
    expect(st.coins).toHaveLength(0)
  })

  it('набор опций боя не знает про сокровища', () => {
    // Сокровище — часть комнаты, а не переключатель отладки. Мёртвая опция
    // в DEFAULT_FIELD_OPTIONS — это ровно тот класс, который ловится только
    // здесь (см. `simMatchesGame.test.js` про `foeCalmMul`).
    expect(Object.keys(DEFAULT_FIELD_OPTIONS).join(' ')).not.toMatch(/pot|chest|treasure/)
  })
})

describe('Горшок виден на экране — а не только в состоянии', () => {
  it('отрисовка рисует горшок ровно там, где он стоит', async () => {
    // Проверка «состояние есть, а на экране нет» — класс, который не ловится
    // ни тестами ядра, ни замером: обе они смотрят в `st`, а игрок смотрит в
    // холст. Поэтому здесь настоящий кадр отрисовки на подставном ctx.
    const { installDom, textOf, clickables, chooseLordIfShown } = await import('./helpers/dom.js')
    const dom = installDom()

    // Записываем холст ДО загрузки игры: экран поля берёт контекст один раз
    // при сборке, и подменить его позже уже поздно. Холстов в игре несколько
    // (поле, кнопка дефлекта, мастерская), поэтому запоминаем ВСЕ контексты и
    // ищем по всем: первый вариант теста держал только последний холст и
    // проверял не тот.
    //
    // Основой служит НАСТОЯЩИЙ контекст стенда, а не свой список методов:
    // свой список забыл `setTransform`, `fit()` падал, кадр не рисовался, и
    // проверка тихо ничего не проверяла.
    const recs = []
    const doc = globalThis.document
    const origCreate = doc.createElement
    doc.createElement = function (tag) {
      const el = origCreate.call(doc, tag)
      if (String(tag).toLowerCase() !== 'canvas') return el
      const ctx = el.getContext('2d')
      const rec = { calls: [], ctx }
      for (const key of Object.keys(ctx)) {
        const v = ctx[key]
        if (typeof v === 'function') ctx[key] = (...a) => { rec.calls.push({ m: key, a }); return v.apply(ctx, a) }
      }
      recs.push(rec)
      // Стенд выдаёт НОВЫЙ контекст на каждый вызов `getContext`. Без этого
      // обёртки мы бы записали вызовы в тот контекст, которым игра не рисует,
      // и проверка тихо прошла бы, не нарисовав ни одного кадра.
      el.getContext = () => ctx
      return el
    }

    await import('@webapp/js/main.js')
    const targets = () => clickables(dom.root)
    const here = () => textOf(dom.root)
    for (let i = 0; i < 10; i++) {
      const b = targets().find((x) => /← /.test(textOf(x)))
      if (!b) break
      b.dispatch('click')
    }
    if (/Понятно/.test(here())) targets().find((x) => /Понятно/.test(textOf(x))).dispatch('click')
    if (/Кем ты идёшь/.test(here())) targets().find((x) => /Шудра/.test(textOf(x))).dispatch('click')
    if (/Почерк/i.test(here())) targets().find((x) => /wsel-card/.test(x.className || '')).dispatch('click')
    const jade = targets().filter((x) => /jade-card/.test(x.className || ''))
    if (jade[0]) jade[0].dispatch('click')
    targets().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || '')).dispatch('click')
    chooseLordIfShown(targets())

    const st = globalThis.window.__field
    expect(st, 'бой не начался').toBeTruthy()
    expect(st.pots.length, 'в бою нет сокровища — рисовать нечего').toBeGreaterThan(0)

    for (const r of recs) r.calls.length = 0
    dom.flushRaf(1)
    const all = recs.flatMap((r) => r.calls)
    expect(recs.length, 'в игре не оказалось ни одного холста').toBeGreaterThan(0)
    expect(all.length, 'кадр не нарисован — проверка ничего не значит').toBeGreaterThan(50)

    for (const p of st.pots) {
      // Экранная точка — через ромб. Проверка искала координаты боя как
      // экранные, то есть искала ромб там, где теперь прямоугольник, и «находила»
      // отсутствие горшка при горшке на месте.
      const pi = roomIso(p.x, p.y)
      const drawn = all.some((c) => c.m === 'translate'
        && Math.round(c.a[0]) === Math.round(pi.x) && Math.round(c.a[1]) === Math.round(pi.y))
      expect(drawn, `сокровище стоит в бою (${Math.round(p.x)},${Math.round(p.y)}), но на экране его нет`).toBe(true)
    }
  })

  it('разбитое сокровище рисуется ОТКРЫТЫМ ящиком, а не целым и не никак', () => {
    // Первая версия этой проверки требовала обратного: «разбитое не рисуется —
    // на его месте пусто». Это была поломка обещания. Игра учит: ударил ящик —
    // выпала добыча; а исчезновение ящика читалось как «промахнулся». Особенно
    // на сундуке: он отдаёт севу, и игрок не видел, что вообще его открыл.
    //
    // Теперь на месте разбитого — ОТКРЫТЫЙ ящик (тот же набор, без крышки).
    // Проверка требует именно этого, потому что «открытый ящик» и «ящик» — два
    // разных состояния, и подмена одного другим здесь молчаливая: обе картинки
    // лежат рядом, обе рисуются одинаково.
    const ctx = { calls: [], fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'center', globalAlpha: 1, shadowBlur: 0, shadowColor: '', measureText: () => ({ width: 10 }) }
    for (const m of ['save', 'restore', 'translate', 'beginPath', 'closePath', 'moveTo', 'lineTo',
      'ellipse', 'rect', 'fill', 'stroke', 'quadraticCurveTo']) ctx[m] = (...a) => ctx.calls.push(m)
    drawPotArt(ctx, { chest: false, hp: 0, maxHp: 2, broken: true })
    expect(ctx.calls.length, 'векторный запасной путь не рисуется вовсе').toBeGreaterThan(0)

    // Экран: сокровище лежит в общем списке «всё живое» и сортируется по
    // глубине вместе с оками и просящими. Отдельным проходом его рисовать нельзя
    // — тогда порядок глубины для него сломается.
    //
    // Комментарии вырезаются: без этого правило «не пропускать разбитое» ловило
    // бы СВОЙ ЖЕ комментарий, где это самое правило описано. Проверка, которая
    // падает на собственном пояснении, бесполезна.
    const src = read('webapp/js/ui/screens/field.js').replace(/\/\/[^\n]*/g, '')
    expect(src, 'сокровище снова рисуется отдельным проходом — сломается порядок глубины')
      .not.toMatch(/drawPotArt\(ctx, o\)[\s\S]{0,400}for \(const f of st\.foes\)/)
    expect(src, 'на экране нет выбора между целым и открытым ящиком')
      .toMatch(/broken \? 'chestOpen' : 'chest'/)
    // И ящик после удара не прячется: пропускать `broken` нельзя, именно это и
    // было поломкой. Проверяется на собранном экране в `propsTruth.test.js`;
    // здесь — что в коде такого пропуска нет.
    expect(src, 'экран пропускает разбитое сокровище — оно исчезает вместо «уже открыто»')
      .not.toMatch(/if \(pot\.broken\) continue/)
  })

  it('по разбитому сокровище нельзя ударить ещё раз', () => {
    // Открытый ящик остаётся на экране, поэтому надо проверить, что он не стал
    // мишенью: иначе игрок будет бить пустой ящик и ждать добычу.
    const st = field([pot()])
    expect(potAt(st, 100, 200), 'целое сокровище не находится').toBe(0)
    for (let i = 0; i < 2; i++) smashPot(st, 0)
    expect(st.pots[0].broken, 'два удара по сокровищу с hp=2 не разбили его').toBe(true)
    expect(potAt(st, 100, 200), 'разбитое сокровище снова находится — по нему можно бить в пустоту')
      .toBe(-1)
    expect(smashPot(st, 0), 'разбитое сокровище снова ломается и роняет добычу').toBe(false)
  })
})
