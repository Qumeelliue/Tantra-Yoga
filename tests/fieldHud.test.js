// Тесты «читаемости экрана боя».
//
// Автор пожаловался: «куча информации на экране, ничего не понятно».
// Оказалось — 1769 символов текста на одном экране, и шапка локации
// наезжала на полосы ресурсов и на лог. Смысл этих тестов: чтобы «куча
// информации» не вернулась незаметно.
//
// DOM в vitest (node) нет, поэтому часть проверок делается по исходнику и
// по CSS: это грубо, но ловит именно то, что ломалось.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const screen = readFileSync(join(root, 'webapp/js/ui/screens/field.js'), 'utf8')
const coreFile = readFileSync(join(root, 'webapp/js/core/field.js'), 'utf8')
const mainFile = readFileSync(join(root, 'webapp/js/main.js'), 'utf8')
const readField = () => screen
const readCore = () => coreFile
const readMain = () => mainFile
const css = readFileSync(join(root, 'webapp/css/main.css'), 'utf8')

/** Блок кода между двумя маркерами. */
function between(src, a, b) {
  const i = src.indexOf(a)
  const j = src.indexOf(b, i + 1)
  return i >= 0 && j > i ? src.slice(i, j) : ''
}

describe('Экран боя: ограничение текста', () => {
  it('лог показывает не больше двух строк', () => {
    const block = between(screen, 'function say(text', '// ── Ввод ──')
    const m = block.match(/lines\.length\s*>\s*(\d+)/)
    expect(m).toBeTruthy()
    expect(Number(m[1])).toBeLessThanOrEqual(2)
  })

  it('в бой не выводится длинное описание локации ( land )', () => {
    // Оно живёт на экране чакр. В шапке боя — только имя и стихия.
    const headBlock = between(screen, 'const head = h(', 'root.append(')
    expect(headBlock).toContain('wd.name')
    expect(headBlock).not.toContain('wd.land')
    expect(screen).not.toContain("class: 'fh-land'")
  })

  it('слотов мантр на экране нет — одна кнопка, имя на ней', () => {
    // Автор: «меньше кнопок, меньше выбора». Панели слотов быть не должно.
    expect(screen).not.toContain('buildMantraSlots')
    expect(screen).not.toContain("class: 'fm-slots'")
    expect(screen).toContain('fm-nm2')      // имя мантры на кнопке
    expect(screen).toContain('fm-cost2')    // цена на кнопке
  })

  it('выбора вида севы на экране нет — помощь по тапу', () => {
    expect(screen).not.toContain('SEVA_KINDS')
    expect(screen).toContain('autoSevaKind')
  })

  it('кнопок на панели ровно две, как в Hades', () => {
    const dock = between(screen, 'const dock = h(', 'const hint = h(')
    const buttons = (dock.match(/h\('button'/g) || []).length
    expect(buttons).toBe(2)
  })

  it('клавиш выбора мантры (1–4) на клавиатуре нет', () => {
    expect(screen).not.toContain("n === '1' || n === '2'")
  })

  it('щит не занимает отдельную панель — живёт внутри полосы жизни', () => {
    expect(screen).toContain('fhp-shield')
    expect(screen).not.toContain("id: 'fshield-v'")
  })

  it('подсказка управления гаснет, а не висит весь бой', () => {
    expect(screen).toContain('hintT = 11')
    expect(css).toMatch(/\.field-hint\s*\{[^}]*opacity:\s*0/)
  })
})

describe('Экран боя: раскладка не наезжает', () => {
  it('шапка локации не по центру над правой колонкой ресурсов', () => {
    const rules = css.slice(css.lastIndexOf('.field-head {'))
    const block = rules.slice(0, rules.indexOf('}') + 1)
    expect(block).not.toContain('left:50%')
    expect(block).toContain('left:10px')
  })

  it('шапка уже, чем правая колонка, и не выше её', () => {
    const rules = css.slice(css.lastIndexOf('.field-head {'))
    const block = rules.slice(0, rules.indexOf('}') + 1)
    const max = block.match(/max-width:\s*(\d+)%/)
    expect(max).toBeTruthy()
    expect(Number(max[1])).toBeLessThanOrEqual(48)
  })

  it('нижние кнопки и слоты мантр прижаты к низу экрана', () => {
    // dock — над «домашней полоской» телефона, слоты — над dock
    const rule = (sel) => {
      const i = css.indexOf(sel)
      return i < 0 ? '' : css.slice(i, css.indexOf('}', i) + 1)
    }
    expect(rule('.field-dock {')).toContain('bottom:')
    expect(rule('.fm-slots {')).toMatch(/bottom:\s*\d/)
  })

  it('серия дефлектов не висит в центре экрана', () => {
    // Центр экрана — это бой. Серия живёт в левой колонке.
    const rules = css.slice(css.lastIndexOf('.fcombo {'))
    const block = rules.slice(0, rules.indexOf('}') + 1)
    expect(block).toContain('position:static')
    expect(block).not.toContain('left:50%')
  })
})
