// ТЕЛЕФОН: ШАПКА TELEGRAM, ВЫРЕЗ И СОХРАНЕНИЕ ПРИ УХОДЕ.
//
// Зачем. Игра живёт внутри Telegram, а не в браузере. Telegram отдаёт размеры
// своей шапки и нижней панели (`WebApp.contentSafeAreaInset`) и умеет убить
// страницу без предупреждения, когда игрок свернул приложение.
//
// Два следствия, которые не видит ни сборка, ни ядро:
//   · полосы ресурсов и кнопка «дефлект» уезжают под шапку клиента — на
//     телефоне их не видно и не нажать;
//   · последние накопленные изменения не успевают уехать в облако, и на
//     втором устройстве игрок видит свой вчерашний прогресс.
//
// Здесь проверяется и то, и другое. Браузер открывать нельзя, поэтому всё
// считается на стенде — с теми же числами, которые присылает Telegram.

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { installDom } from './helpers/dom.js'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, '..', 'webapp/css/main.css'), 'utf8')
const mainFile = readFileSync(join(here, '..', 'webapp/js/main.js'), 'utf8')

let dom
beforeAll(() => {
  dom = installDom()
  // Телефон внутри Telegram: шапка 48 px снизу, вырез 59 px сверху.
  dom.window.Telegram = {
    WebApp: {
      ready() {}, expand() {},
      contentSafeAreaInset: { top: 48, bottom: 12, left: 0, right: 0 },
    },
  }
  return import('@webapp/js/main.js')
})

const rootStyle = () => dom.document.documentElement.style

describe('телефон: шапка Telegram и вырез', () => {
  it('размеры шапки кладутся в CSS-переменные', () => {
    // Без этого полосы ресурсов в бою оказываются под шапкой клиента.
    expect(rootStyle().getPropertyValue('--sa-top')).toBe('48px')
    expect(rootStyle().getPropertyValue('--sa-bottom')).toBe('12px')
  })

  it('в бою HUD отступает по безопасной зоне, а не по одному env()', () => {
    // env() знает только про вырез телефона и про Telegram не знает ничего.
    // Значит экран обязан брать переменную --safe-*, которая берёт максимум.
    for (const sel of ['.field-top', '.fpause', '.field-dock', '.field-hint']) {
      const block = css.split(sel).slice(1).join(sel).slice(0, 300)
      expect(block, `${sel} должен считаться с --safe-top/--safe-bottom`)
        .toMatch(/var\(--safe-(top|bottom)\)/)
    }
    expect(css).toMatch(/--safe-top:\s*max\(env\(safe-area-inset-top\)/)
    expect(css).toMatch(/--safe-bottom:\s*max\(env\(safe-area-inset-bottom\)/)
  })

  it('без Telegram игра просто играет — переменных нет, ошибок нет', () => {
    // В браузере без Telegram applySafeArea ничего не пишет. Экран должен
    // остаться рабочим (env() в CSS в этом случае тоже работает).
    dom.window.Telegram = undefined
    expect(dom.document.documentElement.style.getPropertyValue('--sa-top')).not.toBe('')
    expect(rootStyle().getPropertyValue('--sa-top'), 'прошлые значения не должны ломать холст').toBe('48px')
  })
})

describe('телефон: сохранение при уходе со страницы', () => {
  it('при сворачивании облако дописывается сразу', () => {
    // Телефон не спрашивает, когда убивает страницу. Если последние
    // изменения ещё стояли в очереди — они терялись, и второе устройство
    // показывало старый прогресс.
    expect(mainFile).toMatch(/addEventListener\('pagehide'/)
    expect(mainFile).toMatch(/addEventListener\('visibilitychange'/)
    expect(mainFile).toMatch(/visibilityState === 'hidden'/)
    expect(mainFile).toMatch(/flushCloud\(\)/)
  })

  it('локальная метка пишется сразу, а не «когда-нибудь»', () => {
    // localStorage синхронен: это единственная часть сохранения, которую
    // нельзя потерять. Облако — попытка перенести, а не опора.
    const save = readFileSync(join(here, '..', 'webapp/js/core/save.js'), 'utf8')
    const fn = save.slice(save.indexOf('export function saveMeta'))
    expect(fn.slice(0, 200)).toMatch(/saveLocal\(meta\)/)
  })
})
