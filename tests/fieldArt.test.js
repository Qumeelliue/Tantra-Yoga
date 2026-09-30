// Тесты рисунка. Смысл: автор жаловался, что игра выглядит «как овалы»,
// и это повторялось, потому что стиль рисунка ничем не контролировался.
// Теперь контроль есть: правила стиля проверяются кодом.
//
// Проверяем на подставном ctx, который записывает все вызовы. Это не «тест
// красоты», а тест СОГЛАШЕНИЯ, которое нарушить нельзя.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  drawFoeArt, drawSadhakaArt, drawWareArt, drawFlowerArt, ART, FOE_SHAPES, foeShape } from '@webapp/js/ui/fieldArt.js'
import { ENEMIES } from '@webapp/js/core/data.js'

function recorder() {
  const calls = []
  // Записываем не только аргументы, но и ТЕКУЩИЙ стиль — иначе нельзя
  // проверить, какой цвет реально лёг на фигуру.
  const snap = (name, a) => calls.push({
    name, a, fill: ctx.fillStyle, stroke: ctx.strokeStyle, lw: ctx.lineWidth,
  })
  const rec = (name) => (...a) => snap(name, a)
  const ctx = {
    calls,
    canvas: {},
    save: rec('save'), restore: rec('restore'), translate: rec('translate'),
    scale: rec('scale'), rotate: rec('rotate'), clip: rec('clip'),
    beginPath: rec('beginPath'), closePath: rec('closePath'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'), arc: rec('arc'),
    ellipse: rec('ellipse'), rect: rec('rect'), fillRect: rec('fillRect'),
    strokeRect: rec('strokeRect'), setLineDash: rec('setLineDash'),
    fill: rec('fill'), stroke: rec('stroke'), fillText: rec('fillText'),
    strokeText: rec('strokeText'),
    measureText: () => ({ width: 40 }),
    createRadialGradient: () => { snap('createRadialGradient', []); return { addColorStop() {} } },
    createLinearGradient: () => { snap('createLinearGradient', []); return { addColorStop() {} } },
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
    textAlign: 'center', lineCap: 'butt', globalAlpha: 1,
    shadowBlur: 0, shadowColor: '',
  }
  return ctx
}

function mkFoe(over = {}) {
  return {
    kind: 'ripu', trueLight: 'light', shownLight: 'light', isBoss: false,
    x: 0, y: 0, dead: false, pacified: false, ...over,
  }
}

let ctx
beforeEach(() => { ctx = recorder() })

describe('Стиль: тушь пером, а не размытые пятна', () => {
  it('тело оковы — многоугольник с контуром, а НЕ эллипс', () => {
    drawFoeArt(ctx, mkFoe(), 0)
    const lines = ctx.calls.filter((c) => c.name === 'lineTo').length
    const ell = ctx.calls.filter((c) => c.name === 'ellipse')
    expect(lines).toBeGreaterThanOrEqual(20)     // рваный многоугольник
    // эллипсы допустимы только у тени и ядра (всего 2)
    expect(ell.length).toBeLessThanOrEqual(3)
  })

  it('у тела есть жёсткий чёрный контур', () => {
    drawFoeArt(ctx, mkFoe(), 0)
    const strokes = ctx.calls.filter((c) => c.name === 'stroke')
    expect(strokes.length).toBeGreaterThanOrEqual(2)
    // контур рисуется именно чёрным, и он жирный
    const ink = strokes.filter((c) => String(c.stroke).toLowerCase().includes('#000'))
    expect(ink.length).toBeGreaterThanOrEqual(1)
    expect(Math.max(...ink.map((c) => c.lw))).toBeGreaterThanOrEqual(1.5)
  })

  it('на теле есть штриховка — объём без градиента', () => {
    drawFoeArt(ctx, mkFoe(), 0)
    // харчинг обрезает текущий путь и рисует наклонные линии
    expect(ctx.calls.some((c) => c.name === 'clip')).toBe(true)
    const strokes = ctx.calls.filter((c) => c.name === 'stroke').length
    expect(strokes).toBeGreaterThanOrEqual(5)
  })

  it('на теле НЕТ радиального градиента (это был «мусор»)', () => {
    drawFoeArt(ctx, mkFoe(), 0)
    expect(ctx.calls.some((c) => c.name === 'createRadialGradient')).toBe(false)
  })

  it('садхака — фигура с робой, воротником, головой и руками', () => {
    drawSadhakaArt(ctx, 1, {})
    const strokes = ctx.calls.filter((c) => c.name === 'stroke').length
    expect(strokes).toBeGreaterThanOrEqual(4)   // роба, воротник, руки, голова
    const fills = ctx.calls.filter((c) => c.name === 'fill').length
    expect(fills).toBeGreaterThanOrEqual(4)
  })

  it('у садхаки есть тень на земле — он стоит, а не висит', () => {
    drawSadhakaArt(ctx, 1, {})
    const ell = ctx.calls.filter((c) => c.name === 'ellipse')
    expect(ell.length).toBeGreaterThanOrEqual(1)
  })

  it('просящий рисуется фигурой, а не овалом', () => {
    drawWareArt(ctx, { done: false, call: 'помоги' }, 0)
    const lines = ctx.calls.filter((c) => c.name === 'lineTo').length
    expect(lines).toBeGreaterThanOrEqual(8)
  })

  it('у просящего есть зов — пунктирная линия вверх', () => {
    drawWareArt(ctx, { done: false, call: 'помоги' }, 0)
    const dash = ctx.calls.filter((c) => c.name === 'setLineDash')
    expect(dash.length).toBeGreaterThanOrEqual(1)
  })

  it('сделанному просящему зов не рисуется', () => {
    drawWareArt(ctx, { done: true, call: 'помоги' }, 0)
    expect(ctx.calls.some((c) => c.name === 'setLineDash')).toBe(false)
  })

  it('цветок — многоугольник с контуром', () => {
    drawFlowerArt(ctx, 0)
    expect(ctx.calls.filter((c) => c.name === 'lineTo').length).toBeGreaterThanOrEqual(4)
    expect(ctx.calls.some((c) => c.name === 'stroke')).toBe(true)
  })

  it('подписи обведены тенью — иначе не читаются на тёмном', () => {
    drawFoeArt(ctx, mkFoe(), 0)
    const outlined = ctx.calls.filter((c) => c.name === 'strokeText')
    expect(outlined.length).toBeGreaterThanOrEqual(1)   // подпись ауры
    // обводка идёт ЧЁРНЫМ и толще заливки
    expect(String(outlined[0].stroke)).toContain('0,0,0')
    expect(outlined[0].lw).toBeGreaterThanOrEqual(3)
  })
})

describe('Цвета гун — строго по источнику', () => {
  it('саттва — белый, раджас — красный, тамас — чёрный, вайшья — жёлтый', () => {
    // «sattvaguńa is white, rajoguńa is red and tamoguńa is black»
    expect(ART.sattva.toLowerCase()).toBe('#f2f0e8')
    expect(ART.rajas.toLowerCase()).toBe('#ff2d2d')
    expect(ART.tamas.toLowerCase()).toBe('#000000')
    expect(ART.vaeshya.toLowerCase()).toBe('#ffc61a')
  })

  it('у оковы с тёмной аурой ядро фиолетовое, со светлой — белое', () => {
    const dark = recorder()
    drawFoeArt(dark, mkFoe({ trueLight: 'dark', shownLight: 'dark' }), 0)
    const fills = dark.calls.filter((c) => c.name === 'fill').map((c) => String(c.fill).toLowerCase())
    expect(fills.some((v) => v.includes('b06bff'))).toBe(true)
    expect(fills.some((v) => v.includes('f2f0e8'))).toBe(false)

    const light = recorder()
    drawFoeArt(light, mkFoe(), 0)
    const lf = light.calls.filter((c) => c.name === 'fill').map((c) => String(c.fill).toLowerCase())
    expect(lf.some((v) => v.includes('f2f0e8'))).toBe(true)
  })

  it('под пеленой авидьи аура прячется штрихованным квадратом, а не пятном', () => {
    const u = recorder()
    drawFoeArt(u, mkFoe({ shownLight: 'unknown' }), 0)
    const texts = u.calls.filter((c) => c.name === 'fillText').map((c) => c.a[0])
    expect(texts).toContain('?')
    expect(u.calls.some((c) => c.name === 'fillRect')).toBe(true)
  })
})

describe('Владыка отличается от обычной оковы размером и заливкой', () => {
  it('у владыки тело крупнее и контур толще', () => {
    const a = recorder(), b = recorder()
    drawFoeArt(a, mkFoe(), 0)
    drawFoeArt(b, mkFoe({ isBoss: true }), 0)
    // тело — общая форма (10 вершин → 20 lineTo) у обоих: владыка должен
    // читаться как «тот же, но больше», а не как кто-то другой
    const bodyPts = (r) => r.calls.filter((c) => c.name === 'lineTo').slice(0, 20)
    expect(bodyPts(a).length).toBe(20)
    expect(bodyPts(b).length).toBe(20)
    const maxA = Math.max(...bodyPts(a).map((c) => c.a[0]))
    const maxB = Math.max(...bodyPts(b).map((c) => c.a[0]))
    expect(maxB).toBeGreaterThan(maxA * 2)          // владыка заметно крупнее
    const lwA = Math.max(...a.calls.filter((c) => c.name === 'stroke').map((c) => c.lw))
    const lwB = Math.max(...b.calls.filter((c) => c.name === 'stroke').map((c) => c.lw))
    expect(lwB).toBeGreaterThan(lwA)
  })
})

// ── СИЛУЭТЫ ОК ─────────────────────────────────────────────────────────
// Раньше все оки выглядели одинаково: отличался только цвет ядра, и в
// бою толпа читалась как одна масса. В Hades у каждого типа врага своя
// форма. Теперь форма выведена из содержания ока.
describe('Силуэты оков', () => {
  it('у каждой оки свой силуэт — и у каждой внешней оковы тоже', () => {
    const ids = ['krodha', 'lobha', 'kama', 'mada', 'matsarya', 'nidra',
      'bhaya_pasha', 'lajja', 'ghrna', 'samshaya_pasha',
      'kula', 'sila', 'mana_pasha', 'jugupsa']
    for (const id of ids) expect(FOE_SHAPES[id], id).toBeTypeOf('function')
  })

  it('силуэты есть у всех оков, которые реально ставятся в бой', () => {
    // Имена берём из контента, а не выписываем руками: если добавишь оку в
    // content/enemies.json, тест сразу скажет, что ей не нарисовали фигуру
    const playable = Object.keys(ENEMIES).filter((id) => ENEMIES[id] && !ENEMIES[id].isBoss && !id.startsWith('_'))
    const missing = playable.filter((id) => !FOE_SHAPES[id])
    expect(missing).toEqual([])
  })

  it('силуэты не совпадают между собой', () => {
    const ids = Object.keys(FOE_SHAPES)
    const sig = (id) => JSON.stringify(FOE_SHAPES[id](100))
    const uniq = new Set(ids.map(sig))
    expect(uniq.size).toBe(ids.length)
  })

  it('каждый силуэт замкнутый и влезает в кадр', () => {
    for (const [id, fn] of Object.entries(FOE_SHAPES)) {
      const pts = fn(18)
      expect(pts.length, id).toBeGreaterThanOrEqual(8)
      for (const [x, y] of pts) {
        expect(Number.isFinite(x) && Number.isFinite(y), id).toBe(true)
        expect(Math.abs(x), id).toBeLessThanOrEqual(30)     // R=18 → не вылезает
        expect(Math.abs(y), id).toBeLessThanOrEqual(30)
      }
    }
  })

  it('у кродхи острые шипы, у лобхи широкий низ — они должны отличаться характером', () => {
    const k = FOE_SHAPES.krodha(100)
    const l = FOE_SHAPES.lobha(100)
    const top = (p) => Math.min(...p.map(([, y]) => y))
    const width = (p) => Math.max(...p.map(([x]) => x)) - Math.min(...p.map(([x]) => x))
    expect(top(k)).toBeLessThan(-100)          // кродха дотягивается выше
    expect(width(l)).toBeGreaterThan(width(k)) // лобха шире в разы
  })

  it('у ладжи фигура самая низкая — она прячется', () => {
    const lajja = FOE_SHAPES.lajja(100)
    const ghrna = FOE_SHAPES.ghrna(100)
    const top = (p) => Math.min(...p.map(([, y]) => y))
    expect(top(lajja)).toBeGreaterThan(-80)        // прячется — не торчит
    expect(top(ghrna)).toBeLessThan(-100)          // жжёт — достаёт высоко
  })

  it('неизвестная ока получает обычную форму и не ломает отрисовку', () => {
    const pts = foeShape('такой-нет')(18)
    expect(pts.length).toBe(10)
    expect(pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
  })

  it('владыка сохраняет общую форму — он и должен читаться как общий', () => {
    const bossShape = foeShape()(44)
    const pashaShape = FOE_SHAPES.pasha(44)
    expect(JSON.stringify(bossShape)).not.toBe(JSON.stringify(pashaShape))
  })
})
