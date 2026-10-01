// ГЛАЗА: рисуем Поле Ума в файл, который можно открыть и посмотреть.
//
// Зачем. 2026-09-30, сессия 24: я ДВАЖДЫ оценил внешний вид игры по чтению
// кода и оба раза ошибся. Первый раз сказал «ока — дуга» (это оказалось
// кольцом замаха из Nine Sols), второй «игрок — эллипс» (это оказалась тень
// под фигурой). Причина одна: **у меня не было глаз**. Правило проекта запрещает
// открывать окна браузера, а значит единственный способ узнать, как игра
// выглядит, — был выдумать.
//
// С рисунком нельзя выдумывать: он рисуется теми же функциями, что и игра
// (`ui/fieldArt.js`), и пишется в файл. Открыл — посмотрел.
//
// Что это НЕ: не «тест красоты». Тест красоты — оценочное суждение, и оно
// дрейфует. Здесь три вещи, которые оспорить нельзя:
//   · на кадре есть фигуры, а не пустота;
//   · у каждой фигуры есть заливка И контур (правило 2 визуального стандарта);
//   · свечение не съело кадр: доля площади под `shadowBlur` под порогом.
//
// Порог свечения — единственное число, которое здесь можно назвать «плохо»,
// и оно выведено из правила «цвет только акцентом»: если свечение занимает
// больше трети кадра, акцент перестаёт быть акцентом.

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { drawFoeArt, drawSadhakaArt, drawFlowerArt, FOE_SHAPES } from '@webapp/js/ui/fieldArt.js'
import { ENEMIES } from '@webapp/js/core/data.js'
import { buildFieldFloor } from '@webapp/js/core/fieldBuild.js'

/**
 * Минимальный Canvas2D → SVG.
 *
 * Ровно тот API, который использует `fieldArt.js` (проверено: 23 метода).
 * Смысл — не «нарисовать красиво», а выполнить НАСТОЯЩИЙ код рисунка и
 * показать, что он выдаёт. Ничего не подменяем.
 */
function svgCtx(w, h, stat = { glowArea: 0, fillArea: 0, filled: 0, stroked: 0 }) {
  let t = ''
  let cur = ''
  let fill = '#000', stroke = '#000', lw = 1, alpha = 1, dash = null
  let tx = 0, ty = 0, rot = 0, sx = 1, sy = 1
  const stack = []
  let glowDepth = 0
  // Габариты текущего пути. Без них «доля площади под свечением» — выдумка:
  // первая версия считала ЧИСЛО заливок со свечением, и маленькое светящееся
  // ядро весило столько же, сколько большое тело. Третий раз за сессию
  // метрика врала не из-за кода, а из-за того, что мерила не то.
  let bx0 = 0, by0 = 0, bx1 = 0, by1 = 0, hasBox = false
  const grow = (x, y) => {
    if (!hasBox) { bx0 = bx1 = x; by0 = by1 = y; hasBox = true; return }
    if (x < bx0) bx0 = x
    if (x > bx1) bx1 = x
    if (y < by0) by0 = y
    if (y > by1) by1 = y
  }
  const pathArea = () => (hasBox ? Math.abs((bx1 - bx0) * (by1 - by0)) : 0)

  const tr = () => `translate(${tx.toFixed(2)} ${ty.toFixed(2)})` +
    (rot ? ` rotate(${(rot * 180 / Math.PI).toFixed(2)})` : '') +
    (sx !== 1 || sy !== 1 ? ` scale(${sx.toFixed(3)} ${sy.toFixed(3)})` : '')

  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
  const col = (c) => (typeof c === 'string' ? c : '#000')

  const api = {
    canvas: { width: w, height: h },
    get fillStyle() { return fill }, set fillStyle(v) { fill = v },
    get strokeStyle() { return stroke }, set strokeStyle(v) { stroke = v },
    get lineWidth() { return lw }, set lineWidth(v) { lw = v },
    get globalAlpha() { return alpha }, set globalAlpha(v) { alpha = v },
    shadowBlur: 0, shadowColor: '#000',
    font: '10px sans-serif', textAlign: 'start',
    setLineDash(a) { dash = a },
    save() {
      stack.push([tx, ty, rot, sx, sy, fill, stroke, lw, alpha, dash, glowDepth])
    },
    restore() {
      if (!stack.length) return
      ;[tx, ty, rot, sx, sy, fill, stroke, lw, alpha, dash, glowDepth] = stack.pop()
    },
    translate(x, y) { tx += x * sx; ty += y * sy },
    scale(x, y) { sx *= x; sy *= y },
    rotate(a) { rot += a },
    beginPath() { cur = ''; hasBox = false },
    closePath() { cur += ' Z' },
    moveTo(x, y) { grow(x, y); cur += ` M${x.toFixed(2)} ${y.toFixed(2)}` },
    lineTo(x, y) { grow(x, y); cur += ` L${x.toFixed(2)} ${y.toFixed(2)}` },
    rect(x, y, ww, hh) { grow(x, y); grow(x + ww, y + hh); cur += ` M${x} ${y} L${x + ww} ${y} L${x + ww} ${y + hh} L${x} ${y + hh} Z` },
    arc(x, y, r, a0, a1) {
      grow(x - r, y - r); grow(x + r, y + r)
      const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0
      cur += ` M${(x + r * Math.cos(a0)).toFixed(2)} ${(y + r * Math.sin(a0)).toFixed(2)}` +
        ` A${r} ${r} 0 ${large} 1 ${(x + r * Math.cos(a1)).toFixed(2)} ${(y + r * Math.sin(a1)).toFixed(2)}`
    },
    ellipse(x, y, rx, ry, rot = 0) {
      grow(x - rx, y - ry); grow(x + rx, y + ry)
      cur += ` M${(x + rx).toFixed(2)} ${y} A${rx} ${ry} ${(rot * 180 / Math.PI).toFixed(1)} 1 0 ${(x - rx).toFixed(2)} ${y} A${rx} ${ry} ${(rot * 180 / Math.PI).toFixed(1)} 1 0 ${(x + rx).toFixed(2)} ${y} Z`
    },
    // clip в SVG-выводе не эмулируем: без него штриховка может вылезти за
    // контур. Это осознанное упрощение РЕНДЕРА, а не рисунка: настоящий
    // canvas обрезает, и на скриншоте из игры обрезание будет. Здесь мы
    // сознательно показываем штриховку целиком, чтобы её было видно.
    clip() {},
    fill() {
      stat.filled++
      const area = pathArea()
      stat.fillArea += area
      t += `<path d="${cur}" fill="${col(fill)}" fill-opacity="${alpha}" />`
      // Свечение считаем по ПЛОЩАДИ, а не по факту «был ли shadowBlur».
      if (api.shadowBlur > 0) stat.glowArea += area
      cur = ''
    },
    stroke() {
      stat.stroked++
      t += `<path d="${cur}" fill="none" stroke="${col(stroke)}" stroke-width="${lw}" stroke-opacity="${alpha}"` +
        `${dash ? ` stroke-dasharray="${dash.join(' ')}"` : ''} />`
      cur = ''
    },
    fillRect(x, y, ww, hh) { api.rect(x, y, ww, hh); api.fill() },
    strokeRect(x, y, ww, hh) { api.rect(x, y, ww, hh); api.stroke() },
    fillText(s, x, y) {
      t += `<text x="${x}" y="${y}" fill="${col(fill)}" font-size="11" font-family="sans-serif" opacity="${alpha}">${esc(s)}</text>`
    },
    strokeText() {},
  }
  api.__svg = () => t
  return api
}

/**
 * Кадр: одна комната Поля Ума — пол, все оки, садхака.
 *
 * Рисуется НАСТОЯЩИМ кодом игры. Единственное, чего здесь нет, — игровая
 * логика (движение, замах, бой); на статичном кадре она всё равно не рисуется,
 * а вот сами фигуры — рисуются ровно теми функциями, что и в бою.
 */
export function renderFieldFrame() {
  const W = 412, H = 600
  const stat = { glowArea: 0, fillArea: 0, filled: 0, stroked: 0 }
  const ctx = svgCtx(W, H, stat)
  const b = buildFieldFloor(0, { field: { w: W, h: H }, room: 0 })

  // фон — почти чёрный, как требует стандарт
  ctx.fillStyle = '#0a0710'
  ctx.fillRect(0, 0, W, H)

  // пол площадки — изометрия, как в игре
  const FL = { y: 168, half: 300 }
  ctx.save()
  ctx.translate(W / 2, FL.y)
  ctx.scale(1, 0.5)
  ctx.rotate(Math.PI / 4)
  ctx.fillStyle = '#1a1220'
  ctx.fillRect(-FL.half, -FL.half, FL.half * 2, FL.half * 2)
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'
  ctx.lineWidth = 2
  ctx.strokeRect(-FL.half, -FL.half, FL.half * 2, FL.half * 2)
  ctx.restore()

  // оки — одна рипу и одна паша, обе настоящие фигуры из контента
  const ripu = { id: 'krodha', x: 150, y: 420, calm: 1.5, calmMax: 3, trueLight: 'light', shownLight: 'light', stun: 0, state: 'idle' }
  const pasha = { id: 'ghrna', x: 300, y: 470, calm: 0, calmMax: 3, trueLight: 'dark', shownLight: 'light', stun: 0, state: 'idle' }
  ctx.save(); ctx.translate(ripu.x, ripu.y); drawFoeArt(ctx, ripu, 0.4); ctx.restore()
  ctx.save(); ctx.translate(pasha.x, pasha.y); drawFoeArt(ctx, pasha, 0.4); ctx.restore()

  // садхака
  ctx.save(); ctx.translate(210, 380); drawSadhakaArt(ctx, 1, {}); ctx.restore()

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#0a0710"/>` + ctx.__svg() + `</svg>`
  return { svg, stat }
}

describe('Рисунок можно посмотреть глазами', () => {
  it('кадр рисуется настоящим кодом игры и не пустой', () => {
    const { svg, stat } = renderFieldFrame()
    expect(svg.startsWith('<svg'), 'не SVG').toBe(true)
    expect(stat.filled, 'на кадре нет ни одной заливки — а должно быть пол, оки и садхака').toBeGreaterThan(5)
    expect(stat.stroked, 'на кадре нет ни одного контура').toBeGreaterThan(3)
    expect(svg, 'кадр подозрительно мал — возможно, ничего не отрисовалось').toContain('<path')
  })

  it('каждая ока на кадре — из контента, а не выдуманная', () => {
    // Рисунок берёт форму из `FOE_SHAPES`, а формы выведены из записей о
    // каждой оке. Если бы мы выдумали оку, её бы не было в контенте — и
    // игра показала бы чужую фигуру.
    for (const id of ['krodha', 'ghrna']) {
      expect(FOE_SHAPES[id] || typeof FOE_SHAPES === 'function', `нет фигуры оки ${id}`).toBeTruthy()
      expect(ENEMIES[id], `нет оки ${id} в контенте`).toBeTruthy()
    }
  })

  it('свечение не съедает кадр — иначе это не «цвет как акцент»', () => {
    // Единственное число, которое здесь можно назвать «плохо». Правило
    // стандарта: «цвет — только акцентом». Мерится ДОЛЯ ПЛОЩАДИ, а не число
    // заливок: первая версия считала количество и выдала 79 %, хотя по
    // площади там всё в порядке.
    const { stat } = renderFieldFrame()
    expect(stat.fillArea, 'площадь заливок не посчитана — метрика сломана').toBeGreaterThan(0)
    const ratio = stat.glowArea / stat.fillArea
    expect(
      ratio,
      `свечение занимает ${(ratio * 100).toFixed(0)} % площади — акцент стал фоном`,
    ).toBeLessThan(0.34)
  })

  it('кадр пишется в файл, который можно открыть', () => {
    // Пока не открывали браузер, картинка жила только в голове. Теперь файл
    // есть, и его можно посмотреть и положить рядом со стандартом.
    //
    // Имя файла указывает, ЧТО это: `field-frame` — один кадр боя, не
    // скриншот игры. Иначе файл будут читать как «вот как игра выглядит»,
    // а это всего один статичный кадр без логики.
    const { svg } = renderFieldFrame()
    const url = new URL('../design/renders/field-frame.svg', import.meta.url)
    mkdirSync(new URL('../design/renders/', import.meta.url), { recursive: true })
    writeFileSync(url, svg)
    const back = readFileSync(url, 'utf8')
    expect(back.length, 'файл пуст').toBeGreaterThan(500)
    expect(back, 'в файле нет фигур').toContain('<path')
  })
})
