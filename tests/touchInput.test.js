// ТЕЛЕФОН: играем только пальцем.
//
// Зачем. Игра живёт в Telegram на телефоне, а всё управление полем сделано
// на указателе: палец ведёт садхаку, тап по окове — удар, двойной тап —
// рывок. Ни один тест этого не трогал: стенд умел только `click` и клавиши.
// То есть половина игры — та, в которой играют все — не была проверена ни
// разу, и «проверить руками на телефоне» было некем.
//
// Здесь стенд ставится в профиль телефона (390×844, три пикселя на точку,
// `hover: none`), и бой проходится пальцем: без единой клавиши.
//
// Правило проекта: если игра когда-нибудь заведёт новый способ ввода, палец
// должен быть в состоянии им пользоваться — иначе телефон снова окажется
// непроверенным.

import { describe, it, expect, beforeAll } from 'vitest'
import { installDom, clickables, textOf } from './helpers/dom.js'

let dom
beforeAll(() => {
  dom = installDom()
  // Телефон. Профиль ставится ДО первого экрана: игра спрашивает про
  // `hover` один раз при сборке экрана боя и по ответу даёт подсказку.
  dom.setProfile({ width: 390, height: 844, dpr: 3, touch: true })
  return import('@webapp/js/main.js')
})

const scr = () => dom.root.childNodes[dom.root.childNodes.length - 1]
const here = () => textOf(scr())
const targets = () => clickables(scr())

function clickRe(re, what = '') {
  const el = targets().find((x) => re.test(textOf(x)))
  if (!el) {
    throw new Error(
      `не нашёл «${re}»${what}.\n  есть: ${targets().map((x) => textOf(x).slice(0, 24)).join(' | ')}\n  экран: ${here().slice(0, 200)}`,
    )
  }
  el.dispatch('click')
  return el
}

/** Уйти из боя и вернуться в город — чтобы начать забег заново. */
function backToCity() {
  for (let i = 0; i < 12; i++) {
    if (/Город спит/.test(here())) return true
    // В первый запуск перед городом — онбординг.
    const onboard = targets().find((x) => /Понятно/.test(textOf(x)))
    if (onboard) { onboard.dispatch('click'); continue }
    if (targets().some((x) => /fbtn/.test(x.className || ''))) {
      const pause = targets().find((x) => /pause/i.test(x.className || '') || /❚/.test(textOf(x)))
      if (!pause) return false
      pause.dispatch('click')
      const leave = targets().find((x) => /оставить забег/i.test(textOf(x)))
      if (!leave) return false
      leave.dispatch('click')
      continue
    }
    const back = targets().find((x) => /← /.test(textOf(x)))
    if (!back) return false
    back.dispatch('click')
  }
  return /Город спит/.test(here())
}

/** Зайти в комнату поля настоящим путём: город → чакра → бой. */
function enterField() {
  if (!backToCity()) throw new Error('не вернулся в город')
  clickRe(/В путь по миру/, 'с титула')
  clickRe(/Шудра/, 'выбор оружия')
  if (/Фонтан|нефрит/i.test(here())) {
    const jade = targets().filter((x) => /jade-card/.test(x.className || ''))
    if (jade[0]) jade[0].dispatch('click')
  }
  const world = targets().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
  if (!world) throw new Error(`нет открытой чакры. экран: ${here().slice(0, 200)}`)
  world.dispatch('click')
  const st = globalThis.window.__field
  if (!st) throw new Error('бой не открылся')
  return st
}

const st = () => globalThis.window.__field
const cv = () => dom.lastCanvas()

/** Точка мира (как в отрисовке) → палец на экране. */
const finger = (wx, wy) => dom.worldPoint(cv(), wx, wy)

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

/** Свободное место: подальше от оков, просящих и садхаки. */
function freeSpot(st, wantX, wantY) {
  const spots = [[wantX, wantY], [24, 24], [396, 24], [24, 616], [396, 616], [210, 40], [210, 600], [40, 320], [380, 320]]
  for (const [x, y] of spots) {
    const far = (o) => Math.hypot(o.x - x, o.y - y) > 70
    if (st.foes.every(far) && st.wares.every(far) && far(st.player)) return { x, y }
  }
  return { x: 210, y: 320 }
}

describe('телефон: подсказка и кнопки', () => {
  it('на телефоне подсказка про палец, а не про WASD', () => {
    enterField()
    const t = here()
    expect(t, 'подсказка должна учить пальцу').toMatch(/пальц/i)
    expect(t, 'клавиатура на телефоне не нужна').not.toMatch(/WASD/i)
    // Настоящий смысл проверки: экран боя вообще нарисовался.
    expect(t.length).toBeGreaterThan(3)
    expect(['NaN', 'undefined', '[object Object]'].filter((b) => t.includes(b))).toEqual([])
  })

  it('две кнопки действия нажимаются пальцем и не роняют экран', () => {
    enterField()
    const fbtn = targets().filter((x) => /fbtn/.test(x.className || ''))
    expect(fbtn.length, 'в бою две кнопки — дефлект и мантра').toBe(2)
    dom.errors.length = 0
    for (const b of fbtn) {
      b.dispatch('click')            // палец по кнопке = click
      dom.flushRaf(2)
    }
    expect(dom.errors.map((e) => e.message)).toEqual([])
    const s = st()
    expect(Number.isFinite(s.player.shakti)).toBe(true)
    expect(Number.isFinite(s.avidya)).toBe(true)
  })
})

describe('телефон: палец ведёт', () => {
  it('палец на земле ведёт садхаку к этому месту', () => {
    const s = enterField()
    const to = freeSpot(s, 24, 24)
    const before = { x: s.player.x, y: s.player.y }
    const p = finger(to.x, to.y)
    dom.fingerDown(cv(), p.x, p.y, { id: 1 })
    dom.flushRaf(20)
    const after = { x: s.player.x, y: s.player.y }
    expect(dist(before, after), 'садхака должен был сдвинуться к пальцу').toBeGreaterThan(4)
    expect(dist(after, to), 'и дойти до места, где палец').toBeLessThan(dist(before, to))
    dom.fingerUp(p.x, p.y, { id: 1 })
  })

  it('палец отпущен — садхака стоит, а не «убегает» сам', () => {
    const s = enterField()
    const to = freeSpot(s, 24, 24)
    const p = finger(to.x, to.y)
    dom.fingerDown(cv(), p.x, p.y, { id: 1 })
    dom.flushRaf(12)
    dom.fingerUp(p.x, p.y, { id: 1 })
    const rest = { x: s.player.x, y: s.player.y }
    dom.flushRaf(30)
    expect(Math.hypot(s.player.x - rest.x, s.player.y - rest.y),
      'после отпускания пальца садхака стоит на месте').toBeLessThan(1)
  })

  it('второй палец не уводит садхаку: ведёт тот, кто коснулся первым', () => {
    const s = enterField()
    const first = freeSpot(s, 24, 24)
    const second = freeSpot(s, 396, 616)
    expect(second, 'второе место должно отличаться от первого').not.toEqual(first)
    const p1 = finger(first.x, first.y)
    const p2 = finger(second.x, second.y)
    const d0 = { first: dist(s.player, first), second: dist(s.player, second) }
    dom.fingerDown(cv(), p1.x, p1.y, { id: 1 })
    dom.flushRaf(6)
    dom.fingerDown(cv(), p2.x, p2.y, { id: 2 })          // второй палец на поле
    dom.flushRaf(6)
    dom.fingerMove(cv(), p2.x, p2.y, { id: 2 })          // и ведёт его прочь
    dom.flushRaf(12)
    // Он шёл к первому месту: расстояние до первого уменьшилось, а до второго
    // — нет. Иначе «палец на дефлекте» увёл бы игрока в сторону.
    const d1 = { first: dist(st().player, first), second: dist(st().player, second) }
    expect(d1.first, 'идём туда, где коснулся первый палец').toBeLessThan(d0.first)
    expect(d1.second, 'второй палец не перехватил').toBeGreaterThan(d0.second)
    dom.fingerUp(p1.x, p1.y, { id: 1 })
    dom.fingerUp(p2.x, p2.y, { id: 2 })
  })
})

describe('телефон: палец бьёт и рвётся', () => {
  it('тап по окове — удар', () => {
    const s = enterField()
    const i = s.foes.findIndex((f) => !f.dead && !f.pacified)
    expect(i, 'в комнате есть ока').toBeGreaterThanOrEqual(0)
    const f = s.foes[i]
    const before = { calm: f.calm, hp: f.hp, avidya: s.avidya }
    const p = finger(f.x, f.y)
    dom.fingerTap(cv(), p.x, p.y, { id: 1 })
    const after = st().foes[i]
    const struck = after.calm < before.calm || after.hp < before.hp || st().avidya > before.avidya
    expect(struck, 'палец по окове должен ударить').toBe(true)
    expect(st().player.strikeCd, 'удар был — пауза на него встала').toBeGreaterThan(0)
  })

  it('двойной тап — рывок (без клавиатуры это единственный рывок)', () => {
    const s = enterField()
    const a = freeSpot(s, 24, 616)
    const b = freeSpot(s, 396, 24)
    const pa = finger(a.x, a.y)
    const pb = finger(b.x, b.y)
    dom.fingerTap(cv(), pa.x, pa.y, { id: 1 })
    dom.clock.advance(60)                    // второй палец быстро — это «двойной»
    dom.fingerTap(cv(), pb.x, pb.y, { id: 1 })
    expect(st().player.dash, 'рывок должен начаться').toBeGreaterThan(0)
    dom.flushRaf(2)
  })

  it('одиночный тап не рывок — иначе любой шаг был бы рывком', () => {
    const s = enterField()
    const a = freeSpot(s, 24, 616)
    const p = finger(a.x, a.y)
    dom.fingerTap(cv(), p.x, p.y, { id: 1 })
    dom.clock.advance(600)                   // палец оторвался надолго
    const b = freeSpot(s, 396, 24)
    const q = finger(b.x, b.y)
    dom.fingerTap(cv(), q.x, q.y, { id: 1 })
    expect(st().player.dash, 'медленный тап — это шаг, не рывок').toBe(0)
  })

  it('тап по просящему — помощь одним касанием, без окна выбора', () => {
    const s = enterField()
    const i = s.wares.findIndex((w) => !w.done)
    expect(i, 'в комнате есть просящий').toBeGreaterThanOrEqual(0)
    const w = s.wares[i]
    const p = finger(w.x, w.y)
    dom.fingerTap(cv(), p.x, p.y, { id: 1 })
    dom.flushRaf(3)
    expect(st().served.size, 'помощь засчитана').toBeGreaterThan(0)
    expect(st().served.has(i), 'именно этому просящему').toBe(true)
  })
})

describe('телефон: пауза и обрыв связи', () => {
  it('в паузе палец по полю ничего не делает', () => {
    const s = enterField()
    const pause = targets().find((x) => /pause/i.test(x.className || '') || /❚/.test(textOf(x)))
    expect(pause, 'в бою есть пауза — без неё на телефоне не остановиться').toBeTruthy()
    pause.dispatch('click')
    const to = freeSpot(s, 24, 24)
    const rest = { x: s.player.x, y: s.player.y }
    const p = finger(to.x, to.y)
    dom.fingerDown(cv(), p.x, p.y, { id: 1 })
    dom.flushRaf(20)
    dom.fingerUp(p.x, p.y, { id: 1 })
    expect(Math.hypot(st().player.x - rest.x, st().player.y - rest.y),
      'в паузе садхака стоит').toBeLessThan(1)
    const resume = targets().find((x) => /продолж/i.test(textOf(x)))
    expect(resume, 'в паузе есть «продолжить»').toBeTruthy()
    resume.dispatch('click')
  })

  it('палец, уведённый за край холста, не оставляет садхаку «залипшим»', () => {
    const s = enterField()
    const to = freeSpot(s, 24, 24)
    const p = finger(to.x, to.y)
    dom.fingerDown(cv(), p.x, p.y, { id: 1 })
    dom.flushRaf(8)
    // Палец увели за пределы экрана — событие приходит в window, а не в холст.
    dom.fingerUp(-40, -40, { id: 1 })
    const rest = { x: s.player.x, y: s.player.y }
    dom.flushRaf(20)
    expect(Math.hypot(st().player.x - rest.x, st().player.y - rest.y),
      'после отпускания за краем всё равно стоит').toBeLessThan(1)
  })

  it('палец в момент, когда холст схлопнулся, не ломает поле', () => {
    // Найдено на стенде: на телефоне холст на кадр получает размер 0
    // (анимация шапки Telegram, поворот, клавиатура). Перевод координат
    // через ноль давал Infinity, и позиция садхаки становилась NaN
    // НАВСЕГДА: поле переставало играться до конца забега.
    const s = enterField()
    dom.setRect(cv(), { left: 0, top: 0, width: 0, height: 0 })
    dom.press('resize')
    dom.fingerDown(cv(), 120, 400, { id: 1 })
    dom.flushRaf(4)
    dom.fingerUp(120, 400, { id: 1 })
    expect(Number.isFinite(s.player.x) && Number.isFinite(s.player.y),
      'позиция садхаки должна остаться числом').toBe(true)
    // И после возврата размера игрок снова живой: ходит и бьёт.
    dom.setRect(cv(), { left: 0, top: 0, width: 390, height: 844 })
    dom.press('resize')
    dom.flushRaf(3)
    const to = freeSpot(st(), 24, 24)
    const before = { x: st().player.x, y: st().player.y }
    const p = finger(to.x, to.y)
    dom.fingerDown(cv(), p.x, p.y, { id: 1 })
    dom.flushRaf(20)
    dom.fingerUp(p.x, p.y, { id: 1 })
    expect(Math.hypot(st().player.x - before.x, st().player.y - before.y),
      'после схлопывания холста поле опять играется').toBeGreaterThan(3)
  })

  it('телефон не ломает холст: ноль пикселей и потом снова картинка', () => {
    enterField()
    // Поле не должно превратиться в ноль-на-ноль навсегда — иначе игрок
    // вернётся в чёрный экран.
    dom.setRect(cv(), { left: 0, top: 0, width: 0, height: 0 })
    dom.press('resize')                 // телефон реально шлёт resize
    dom.flushRaf(2)
    dom.setRect(cv(), { left: 0, top: 0, width: 390, height: 844 })
    dom.press('resize')
    dom.flushRaf(3)
    expect(dom.errors.map((e) => e.message)).toEqual([])
    expect(Number.isFinite(st().time)).toBe(true)
    // И палец после этого всё ещё попадает в цель: координаты не «уехали».
    const s = st()
    const i = s.foes.findIndex((f) => !f.dead && !f.pacified)
    if (i >= 0) {
      const f = s.foes[i]
      const p = finger(f.x, f.y)
      const calm = f.calm, hp = f.hp, avidya = s.avidya
      dom.fingerTap(cv(), p.x, p.y, { id: 1 })
      const a = st().foes[i]
      expect(a.calm < calm || a.hp < hp || st().avidya > avidya,
        'после подгонки холста палец всё ещё бьёт').toBe(true)
    }
  })
})
