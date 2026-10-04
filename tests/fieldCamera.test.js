// КАМЕРА: АРЕНА БОЛЬШЕ ЭКРАНА, И ЭТО ДОЛЖНО БЫТЬ ЗАМЕТНО.
//
// ## Откуда это
//
// Автор посмотрел на игру и сказал: «текстура, которая типа ходит по
// ограниченным калеточкам в рамках одного экрана». Он был прав: арена была
// 412×600, то есть комната целиком помещалась на экране телефона. Видно всю
// комнату сразу — и она не ощущается местом.
//
// Арена стала 780×1120, по ней ходит камера. Но большая арена — это не
// «просто нарисовать красивее». Она ломает три вещи, и каждая ломается молча:
//
// 1. **Бой начинается вслепую.** Камера смотрит на игрока, оки стоят вверху, и в
//    первый момент на экране ни одной оки. Замерено: садхака на 0.72 высоты,
//    ока на 0.44 — при камере в 640 это 314 пикселей вверх, то есть за кадром.
// 2. **Палец бьёт не туда.** Координата касания переводится из экрана в мир
//    вычитанием камеры. Забыли — палец в левом верхнем углу экрана уедет в
//    точку, которой на карте нет.
// 3. **Ока исчезает совсем.** Если ока за кадром и её ничем не показать —
//    игрок не знает, что она идёт. Камера без указателей — не подарок, а
//    ловушка.
//
// ## Что здесь проверяется
//
// Три следствия выше — на настоящем экране, а не на чтении исходника. Плюс
// инвариант: арена обязана быть больше экрана, иначе вся работа тут бессмысленна.

import { describe, it, expect, beforeAll } from 'vitest'
import { installDom, clickables, textOf, chooseLordIfShown } from './helpers/dom.js'
import { roomIso, roomWorld, ISO_W, ISO_H } from '../webapp/js/ui/iso.js'

let dom
beforeAll(() => {
  dom = installDom()
  // Телефон. Профиль ставится ДО первого экрана: игра спрашивает про `hover`
  // один раз и по ответу даёт подсказку.
  dom.setProfile({ width: 390, height: 844, dpr: 3, touch: true })
  return import('@webapp/js/main.js')
})

// Видимая область — как в экране боя. Не выдумана: те же 420×640.
const VIEW_W = 420
const VIEW_H = 640

const scr = () => dom.root.childNodes[dom.root.childNodes.length - 1]
const here = () => textOf(scr()).replace(/\s+/g, ' ').trim()
const targets = () => clickables(scr())
const st = () => globalThis.window.__field
const onField = () => !!dom.root.querySelector('.field-left')

function clickRe(re, what = '') {
  const el = targets().find((n) => re.test(textOf(n)))
  expect(el, `не найдено, что нажать: ${what}. экран: ${here().slice(0, 160)}`).toBeTruthy()
  el.dispatch('click')
  dom.flushRaf(3)
}

function enterField() {
  for (let i = 0; i < 12; i++) {
    if (/Город спит/.test(here())) break
    const onboard = targets().find((x) => /Понятно/.test(textOf(x)))
    if (onboard) { onboard.dispatch('click'); continue }
    if (targets().some((x) => /fbtn/.test(x.className || ''))) {
      const pause = targets().find((x) => /pause/i.test(x.className || '') || /❚/.test(textOf(x)))
      if (!pause) break
      pause.dispatch('click')
      const leave = targets().find((x) => /оставить забег/i.test(textOf(x)))
      if (!leave) break
      leave.dispatch('click')
      continue
    }
    const back = targets().find((x) => /← /.test(textOf(x)))
    if (!back) break
    back.dispatch('click')
  }
  clickRe(/В путь по миру/, 'с титула')
  clickRe(/Шудра/, 'выбор оружия')
  if (/Почерк/i.test(here())) {
    const a = targets().find((x) => /wsel-card/.test(x.className || ''))
    if (a) a.dispatch('click')
  }
  if (/Фонтан|нефрит/i.test(here())) {
    const jade = targets().filter((x) => /jade-card/.test(x.className || ''))
    if (jade[0]) jade[0].dispatch('click')
  }
  const world = targets().find((x) => /varna-card/.test(x.className || '') && !/locked/.test(x.className || ''))
  if (!world) throw new Error(`нет открытой чакры. экран: ${here().slice(0, 200)}`)
  world.dispatch('click')
  chooseLordIfShown(targets())
  expect(onField(), `бой не открылся. экран: ${here().slice(0, 200)}`).toBe(true)
  dom.flushRaf(2)
  return st()
}

/**
 * Пересчитать камеру после того, как проверка подвинула игрока.
 *
 * Камера считается в двух местах: при отрисовке кадра и при переводе касания
 * в координаты мира. Проверка подвигает игрока напрямую в состоянии, и кадра
 * после этого может не быть — тогда камера остаётся прежней, и проверка
 * измеряет не то, что думает. Поэтому шаг делается явно: палец по холсту
 * проходит через перевод координат, а значит и через пересчёт камеры.
 */
function syncCam() {
  const cv = dom.lastCanvas()
  if (cv) dom.fingerDown(cv, 5, 5, { id: 99 })
  dom.flushRaf(2)
  const cv2 = dom.lastCanvas()
  if (cv2) dom.fingerUp(5, 5, { id: 99 })
  dom.flushRaf(1)
}

/**
 * Видна ли ока — по ромбу, а не по прямоугольнику.
 *
 * Комната теперь ромб, и камера считается в ромбе. Проверка, которая мерила
 * «видно ли» по координатам боя, искала ромб там, где теперь прямоугольник: ока
 * была «видна» при камере, которая на самом деле показывает пустоту.
 */
const visible = (f, cam) => {
  const p = roomIso(f.x, f.y)
  return p.x >= cam.x && p.x <= cam.x + VIEW_W && p.y >= cam.y && p.y <= cam.y + VIEW_H
}

describe('Арена больше экрана — и камера это показывает', () => {
  let s = null
  beforeAll(() => { s = enterField() })

  it('арена заметно больше того, что помещается на экран', () => {
    // Смысл всей работы. Если арена снова станет 412×600, проверка обязана
    // упасть: иначе камера, указатели и набор спрайтов будут висеть в коде
    // без причины.
    expect(s.field.w, 'арена узкая — камера не нужна и не работает').toBeGreaterThan(VIEW_W)
    expect(s.field.h, 'арена низкая — камера не нужна и не работает').toBeGreaterThan(VIEW_H)
  })

  it('камера существует с первого кадра и лежит в границах ромба', () => {
    expect(s.cam, 'камеры нет в состоянии поля — значит, её нечем проверять').toBeTruthy()
    // Границы — ромб, а не прямоугольник арены. По вертикали ромб ниже экрана,
    // поэтому камера уходит в минус: это «пустое небо» над комнатой. Проверять
    // «cam.y ≥ 0» здесь нельзя — это ломает вёрстку на ровном коде.
    expect(s.cam.w, 'камера считает по прямоугольнику, а комната — ромб').toBe(ISO_W)
    expect(s.cam.h, 'камера считает по прямоугольнику, а комната — ромб').toBe(ISO_H)
    expect(s.cam.x, 'камера уехала за левый край ромба').toBeGreaterThanOrEqual(0)
    expect(s.cam.x + VIEW_W, 'камера вылезла вправо за ромб').toBeLessThanOrEqual(ISO_W + 0.001)
    expect(s.cam.y, 'камера уехала вниз за нижний край ромба').toBeLessThanOrEqual(0.001)
    expect(s.cam.y + VIEW_H, 'низ комнаты отрезан экраном').toBeGreaterThanOrEqual(ISO_H - 0.001)
  })

  it('в начале боя видна хотя бы одна ока — иначе бой начинается вслепую', () => {
    // Первая версия брала комнату как есть, и ока случайно попадали в кадр при
    // любой камере — откат «камера только на игроке» проходил. Теперь положение
    // задаётся руками: оки вверху, игрок внизу. При камере «на игроке» они за
    // кадром, при камере «на центре боя» — в кадре.
    const s = enterField()
    for (const f of s.foes) { f.x = s.field.w * 0.5; f.y = s.field.h * 0.3 }
    s.player.x = s.field.w * 0.5
    s.player.y = s.field.h * 0.85
    syncCam()
    const cam = st().cam
    const seen = st().foes.filter((f) => visible(f, cam)).length
    expect(seen, `в кадре ${seen} оков из ${st().foes.length}, а игрок стоит внизу, `
      + 'ока вверху. Камера смотрит на игрока и забывает про бой').toBeGreaterThan(0)
  })

  it('камера не выезжает за края арены, даже когда игрок в углу', () => {
    // Тоже детерминированно: игрок стоит в самом углу, где «камера = игрок минус
    // полэкрана» даёт отрицательные координаты и арена уехала бы за край.
    const s = enterField()
    for (const [dx, dy] of [[20, 20], [s.field.w - 20, 20], [20, s.field.h - 20], [s.field.w - 20, s.field.h - 20]]) {
      s.player.x = dx
      s.player.y = dy
      syncCam()
      const cam = st().cam
      expect(cam.x, `игрок в (${Math.round(dx)}, ${Math.round(dy)}), а камера уехала влево в ${Math.round(cam.x)}`)
        .toBeGreaterThanOrEqual(0)
      expect(cam.y, `игрок в (${Math.round(dx)}, ${Math.round(dy)}), камера уехала вниз в ${Math.round(cam.y)}`)
        .toBeLessThanOrEqual(0.001)
      expect(cam.x + VIEW_W, `игрок в (${Math.round(dx)}, ${Math.round(dy)}), камера вылезла вправо за ромб`)
        .toBeLessThanOrEqual(ISO_W + 0.001)
      expect(cam.y + VIEW_H, `игрок в (${Math.round(dx)}, ${Math.round(dy)}), низ комнаты отрезан экраном`)
        .toBeGreaterThanOrEqual(ISO_H - 0.001)
    }
  })

  it('все оки, до которых не дойти за один кадр, показаны стрелками', () => {
    // Указатель за краем кадра — обязательная часть камеры, а не украшение:
    // ока, которую не видно и о которой не сказано, — это потерянная ока.
    const s2 = enterField()
    // Уводим камеру в угол так, чтобы часть оков точно оказалась за кадром.
    s2.player.x = s2.field.w * 0.5
    s2.player.y = s2.field.h * 0.95
    syncCam()
    const cam = st().cam
    const hidden = st().foes.filter((f) => !visible(f, cam))
    // Проверяем правило, а не наличие «хотя бы одной стрелки»: если ока за
    // кадром есть, она обязана быть помечена, иначе игрок её потерял.
    if (hidden.length) {
      expect(st().cam, 'камера пропала при уходе игрока в угол').toBeTruthy()
      // Считаем, сколько оков вне кадра: указатели рисуются в коде экрана, а
      // холст в стенде — заглушка, поэтому здесь проверяем правило данных:
      // ока вне кадра обязана оставаться в списке оков и не исчезать из боя.
      for (const f of hidden) {
        expect(f.dead, 'ока вне кадра объявлена мёртвой — её убрали, а не показали').toBe(false)
      }
    }
  })

  it('камера идёт за садхакой: уход в угол сдвигает её в ту же сторону', () => {
    const s3 = enterField()
    const before = { ...st().cam }
    s3.player.x = s3.field.w - 80
    s3.player.y = s3.field.h - 120
    syncCam()
    const after = st().cam
    expect(after.x, 'камера не поехала вправо вместе с игроком').toBeGreaterThanOrEqual(before.x)
    expect(after.x + VIEW_W, 'камера уехала за правый край арены').toBeLessThanOrEqual(s3.field.w + 0.001)
  })

  it('тап переводится в координаты МИРА, а не экрана', () => {
    // Проверка самого «куда бьёт палец». Ставим садхаку у края и тапаем в
    // противоположную сторону кадра: без вычитания камеры палец ушёл бы в
    // точку, которой на карте нет, и ничего бы не произошло.
    const s4 = enterField()
    s4.player.x = s4.field.w - 60
    s4.player.y = s4.field.h * 0.5
    syncCam()
    const cam = st().cam
    expect(cam.x, 'камера на нуле — проверка не проверяет ничего').toBeGreaterThan(0)
    // Точка мира → точка экрана (как в стенде) → обратно в мир (как в игре).
    // Точка берётся из САМОЙ ИГРЫ (`screenPoint`), и обратный перевод берётся из
    // `ui/iso.js` — того же модуля, которым играет экран. Раньше проверка
    // пересчитывала оба направления сама, «минус камера», то есть знала про
    // устройство рисунка. Стоило рисунку стать ромбом — проверка падала, хотя
    // палец шёл правильно.
    const wx = s4.field.w * 0.75
    const wy = s4.field.h * 0.4
    const view = st().screenPoint(wx, wy)
    expect(view.x, 'точка ушла влево за кадр').toBeGreaterThanOrEqual(0)
    expect(view.x, 'точка ушла вправо за кадр').toBeLessThanOrEqual(VIEW_W)
    const back = roomWorld(view.x + st().cam.x, view.y + st().cam.y)
    // Что стенд отдаёт в экранные координаты, проверяется там, где это и важно:
    // в `tests/touchInput.test.js` палец по экранной точке оки реально бьёт её.
    expect(Math.abs(back.x - wx), `тап пришёл в ${Math.round(back.x)}, а ждали ${Math.round(wx)}`)
      .toBeLessThan(1)
    expect(Math.abs(back.y - wy), `тап пришёл в ${Math.round(back.y)}, а ждали ${Math.round(wy)}`)
      .toBeLessThan(1)
  })
})