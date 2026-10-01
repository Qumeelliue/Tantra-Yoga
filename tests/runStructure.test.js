// Тесты структуры забега — копия петли Hades.
//
// Hades: выбрал оружие → комната с врагами → дверь → босс в СВОЕЙ комнате →
// лавка/дары → следующий этап. Проверяем, что у нас так же и что босс
// не сидит в общей комнате (это была главная «не-копия»).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildFieldFloor } from '@webapp/js/core/fieldBuild.js'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const main = readFileSync(join(here, '..', 'webapp/js/main.js'), 'utf8')

describe('Структура забега', () => {
  it('этап состоит из нескольких комнат, потом комната владыки (Hades)', () => {
    expect(main).toContain("function startFieldRun(floor, stage = 'room', room = 0)")
    expect(main).toContain('const step = nextStage(stage, room, stageHasBoss(floor))')
  })

  it('в обычной комнате владыки нет — он в своей', () => {
    const b = buildFieldFloor(1, { field: { w: 412, h: 600 }, room: 0 })
    expect(b.foes.length).toBeGreaterThan(0)
    expect(b.foes.some((f) => f.isBoss)).toBe(false)
    expect(b.boss).toBeTruthy()
  })

  it('комнаты этапа отличаются друг от друга', () => {
    const a = buildFieldFloor(0, { field: { w: 412, h: 600 }, room: 0 })
    const b = buildFieldFloor(0, { field: { w: 412, h: 600 }, room: 1 })
    const c = buildFieldFloor(0, { field: { w: 412, h: 600 }, room: 2 })
    const xy = (r) => r.foes.map((f) => Math.round(f.x)).join(',')
    expect(xy(a)).not.toBe(xy(b))
    expect(xy(b)).not.toBe(xy(c))
    // и оков с каждой комнатой становится больше — как в Hades, где комнаты
    // постепенно тяжелеют
    expect(b.foes.length).toBeGreaterThan(a.foes.length)
    expect(c.foes.length).toBeGreaterThan(b.foes.length)
  })

  it('после владыки — комната покоя: лечиться или +макс. ХП', () => {
    expect(main).toContain('function showRestRoom')
    expect(main).toContain('Комната покоя')
    expect(main).toContain('meta.hpBonus')
  })

  it('в обычной комнате владыки нет — он в своей', () => {
    const b = buildFieldFloor(1, { field: { w: 412, h: 600 } })
    expect(b.foes.length).toBeGreaterThan(0)
    expect(b.foes.some((f) => f.isBoss)).toBe(false)
    expect(b.boss).toBeTruthy()
  })

  it('дверь ведёт сначала к владыке, и только потом — дальше', () => {
    expect(main).toContain("stage === 'boss' ? [] : built.foes.slice()")
    expect(main).toContain("if (stage === 'boss') {")
    expect(main).toContain('settleFloor(meta, floor)')
  })

  it('после владыки — чакра открывается и выдаётся дар', () => {
    expect(main).toContain('function settleFloor')
    expect(main).toContain('function showAfterBoss')
  })

  it('выбор оружия — первый экран забега (Hades weapon select)', () => {
    expect(main).toContain('function showWeaponSelect')
    // титул ведёт на выбор оружия, а не сразу на карту
    expect(main).toContain("onclick: showWeaponSelect }")
  })

  it('владыка даёт знание и ведёт дальше, а не показывает экран итога', () => {
    // в босс-комнате выход — сразу к дару, без «итогов забега»
    expect(main).toContain('showAfterBoss(meta, floor, st2)')
  })
})

// ── Забег можно закончить ──────────────────────────────────────────────
// Это был худший баг: финала не существовало. Дар после седьмого владыки
// вёл в «чакру 8», которой нет, и мир снова становился первым — игрок
// крутился по кругу вечно. Пройти игру было невозможно.
describe('Финал забега', () => {
  it('после седьмого владыки забег заканчивается, а не зацикливается', () => {
    // Раньше здесь стояло `if (isLastFloor(floor)) { showFieldVictory(meta,
    // floor, st2); return }` — и эта строка была НЕДОСТИЖИМОЙ: onNext звали
    // только при `nextFloor <= 6` (floor ≤ 5), а isLastFloor значит floor ≥ 6.
    // Вместе это `5 >= 6`, всегда ложь. Экран «Вершина Света» был обещан
    // игроку и недостижим (design/BASE-GAME.md, МЕХАНИКА 37).
    expect(main).toContain('if (isLastFloor(floor)) {')
    expect(main).toContain('showFieldVictory(meta, floor, finishFieldRun(\'victory\'))')
  })

  it('победа в комнате ВСЕГДА уходит вызывающему коду, а не решается на месте', () => {
    // Второе условие, из-за которого финал был недостижим. Победа не должна
    // решаться внутри экрана поля: роутинг — у вызывающего, и путь к финалу
    // должен быть один, а не два, каждое из которых выглядит правильным.
    // Комментарии вырезаны: строка `won && nextFloor <= 6` осталась бы в
    // комментарии, где я объяснял, что её убрал, — и проверка враньём
    // жаловалась бы сама на себя.
    const ui = read('webapp/js/ui/screens/field.js')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(ui).toContain('if (won && opts.onNext) {')
    expect(ui).not.toContain('won && nextFloor <= 6')
  })

  it('последняя чакра — седьмая, и это одно число на весь проект', () => {
    expect(main).toContain("import { nextStage, ROOMS_PER_STAGE, isLastFloor }")
    const route = read('webapp/js/core/stageRoute.js')
    expect(route).toContain('export const LAST_FLOOR = 6')
    expect(route).toContain('export function isLastFloor(floor)')
  })

  it('счётчик открытых чакр не уезжает за конец', () => {
    expect(main).toContain('if (!isLastFloor(floor) && (meta.fieldFloor || 0) < floor + 1)')
    expect(main).not.toContain('floor + 1 <= 6')
  })

  it('экран итога говорит о ВСЕМ забеге, а не о последней комнате', () => {
    expect(main).toContain('function showFieldVictory')
    for (const row of ['комнат пройдено', 'освобождено за забег', 'сломано силой', 'монет', 'открыто знаний']) {
      expect(main, row).toContain(`'${row}'`)
    }
    // Кровь берётся из сводки забега. Раньше здесь было
    // `st.foes.filter((f) => f.dead).length` — то есть про СЕДЬМУЮ комнату
    // писалось «никого не убито», хотя по дороге можно было перебить всех.
    expect(main).toContain('const kills = summary?.kills || 0')
    expect(main).not.toContain('const kills = st ? st.foes.filter((f) => f.dead).length : 0')
  })

  it('мирный финал = забег без единой крови И полный путь', () => {
    // Решение автора 2026-09-30. Ударом в Поле Ума не ранится рипу вовсе,
    // ломать силой можно только пашу — так что «без крови» = «ни одного
    // сломанного паши за весь забег». Плюс полный путь: вошёл на пятую
    // чакру — «Вершина Света» не достигнута, и врать не о чем.
    expect(main).toContain('const peaceful = kills === 0 && full')
    expect(main).toContain("const quoteId = peaceful ? 'ahimsa' : 'liberation_from_staticity'")
    expect(main).toContain('Вершина Света — без крови')
  })

  it('слова на экране не спорят с числами на нём же', () => {
    // Игрок может войти в Поле Ума с любой открытой чакры, и «семь владык
    // снято» тогда — враньё. Текст обязан считать то же, что и строки.
    expect(main).toContain("const bossesWord = full ? 'Семь владык снято'")
    expect(main).toContain('Владык снято: ${bosses} из ${CHAKRAS.length}')
  })

  it('из финала есть два выхода: ещё раз и в Город', () => {
    expect(main).toContain("'Ещё раз'")
    expect(main).toContain("onclick: showTitle }, 'В Город'")
  })

  it('новая попытка из финала начинается с чистого забега', () => {
    expect(main).toContain("app.runHp = null; app.runKeepsake = null; showFountain()")
  })
})

// ── Фонтан юности: нефрит выбирается ОДИН раз перед побегом (Hades) ────
describe('Фонтан юности (Hades: Fountain of Youth)', () => {
  it('после выбора ментальности — фонтан, и только потом карта чакр', () => {
    expect(main).toContain('function showFountain')
    expect(main).toMatch(/onclick: \(\) => \{ meta\.focusVarna = id; saveMeta\(meta\); sfx\.unlock\?\.\(\); showAspectSelect\(id\) \},/)
    // из фонтана — сразу на карту чакр
    expect(main).toMatch(/app\.runKeepsake = k\.id[\s\S]{0,200}showFieldChakra\(\)/)
  })

  it('фонтан предлагает три нефрита, а не дары', () => {
    expect(main).toContain('const picks = rollKeepsakes(Math.random, 3)')
    expect(main).toContain('Фонтан юности')
    expect(main).toContain('app.runKeepsake = k.id')
  })

  it('нефрит надевается ДО даров и мастерской', () => {
    expect(main).toContain('applyKeepsake(applyAspect(applyVarna(base, vId), app.runAspect), app.runKeepsake)')
  })

  it('надетый нефрит виден в бою, а не прячется', () => {
    const field = read('webapp/js/ui/screens/field.js')
    expect(field).toContain("KEEPSAKE_BY_ID[st.keepsake]")
    expect(field).toContain("class: 'fjade'")
  })
})

// ── Телефон: палец, полоса iOS, поле во весь экран ─────────────────────
// Три настоящих поломки, найденные в браузере на узком экране:
// 1) низ поля уезжал под экран (100dvh внутри контейнера с отступами),
// 2) палец на кнопке дефлекта вёл садхаку (второй палец не различался),
// 3) подсказка писала «WASD» человеку без клавиатуры.
describe('Телефон', () => {
  it('поле занимает ровно экран и отменяет отступы контейнера', () => {
    const css = read('webapp/css/main.css')
    expect(css).toMatch(/\.field \{[^}]*height: 100dvh/)
    // Отступы отменяются по безопасной зоне. Раньше здесь стоял env() — он
    // знает только про вырез телефона и ничего не знает про шапку Telegram,
    // под которую уезжали полосы ресурсов. Теперь это --safe-* (см. :root).
    expect(css).toMatch(/\.field \{[^}]*margin: calc\(-12px - var\(--safe-top\)\)/)
    expect(css).toMatch(/\.field \{[^}]*calc\(-20px - var\(--safe-bottom\)\)/)
  })

  it('отступы безопасной зоны учтены у шапки и у кнопок', () => {
    const css = read('webapp/css/main.css')
    // --safe-* = максимум из выреза телефона (env) и размеров шапки Telegram,
    // которые игра кладёт в --sa-* при старте.
    expect(css).toMatch(/--safe-top: max\(env\(safe-area-inset-top\), var\(--sa-top\)\)/)
    expect(css).toMatch(/--safe-bottom: max\(env\(safe-area-inset-bottom\), var\(--sa-bottom\)\)/)
    expect(css).toMatch(/\.field-top \{[^}]*var\(--safe-top\)/)
    expect(css).toMatch(/\.field-dock \{[^}]*var\(--safe-bottom\)/)
    expect(css).toMatch(/\.fpause \{[^}]*var\(--safe-top\)/)
  })

  it('страница не тянется и не подсвечивается под пальцем', () => {
    const css = read('webapp/css/main.css')
    expect(css).toMatch(/overscroll-behavior-y: none/)
    expect(css).toMatch(/-webkit-tap-highlight-color: transparent/)
  })

  it('кнопки действий не скроллят поле', () => {
    const css = read('webapp/css/main.css')
    expect(css).toMatch(/\.fbtn \{[^}]*touch-action: manipulation/)
    expect(css).toMatch(/\.field-canvas \{[^}]*touch-action: none/)
  })

  it('ходит только первый палец — второй жмёт кнопки', () => {
    const field = read('webapp/js/ui/screens/field.js')
    expect(field).toContain('pointer.id = e.pointerId')
    expect(field).toContain('if (pointer.down) return')
    expect(field).toContain("if (pointer.down && pointer.id === e.pointerId) touch = localPoint(e)")
  })

  it('палец, соскользнувший с поля, отпускает ходьбу', () => {
    const field = read('webapp/js/ui/screens/field.js')
    expect(field).toContain("addEventListener('pointercancel', onUp)")
    expect(field).toContain("cv.addEventListener('lostpointercapture', onUp)")
    expect(field).toContain('setPointerCapture')
  })

  it('подсказка на телефоне говорит про палец, а не про WASD', () => {
    const field = read('webapp/js/ui/screens/field.js')
    expect(field).toContain('(hover: none) and (pointer: coarse)')
    expect(field).toContain('веди пальцем · тапни по окове · двойной тап — рывок')
  })
})

// ── Рывок пальцем ──────────────────────────────────────────────────────
// Подсказка на телефоне обещает «двойной тап — рывок». Обещание было, а
// рывка не было: tapDash вызывался только с клавиатуры. Теперь тап по полю
// дважды подряд рвёт садхаку в ту же сторону.
describe('Рывок пальцем', () => {
  it('двойной тап по полю рвёт', () => {
    const field = read('webapp/js/ui/screens/field.js')
    expect(field).toContain('let lastTapTime = 0')
    expect(field).toContain('if (now - lastTapTime < 260)')
    expect(field).toContain('doDash(dx, dy)')
  })

  it('рывок принимает направление, заданное пальцем', () => {
    const field = read('webapp/js/ui/screens/field.js')
    expect(field).toContain('function doDash(pdx, pdy)')
    expect(field).toContain('if (!dx && !dy && pdx !== undefined) { dx = pdx; dy = pdy }')
  })

  it('без направления рывок идёт туда, куда смотришь', () => {
    const field = read('webapp/js/ui/screens/field.js')
    expect(field).toContain('if (!dx && !dy) { dx = st.player.facing; dy = 0 }')
  })
})

// ── Вес удара виден на экране ───────────────────────────────────────────
describe('Вес удара', () => {
  it('тряска сдвигает всю сцену, а не только пол', () => {
    const field = read('webapp/js/ui/screens/field.js')
    expect(field).toContain('if (st.shake > 0.2)')
    expect(field).toContain('ctx.translate((Math.random() - 0.5) * k')
  })

  it('заморозка и тряска — состояние боя, а не украшение экрана', () => {
    const field = read('webapp/js/core/field.js')
    expect(field).toMatch(/freeze: 0, shake: 0/)
    expect(field).toContain('if (st.freeze > 0)')
  })
})

// ── ПАУЗА (Hades: pause menu) ───────────────────────────────────────────
// На телефоне игрок вообще не мог остановиться: выключил игру посреди боя —
// вернулся, и за него доиграли. В Hades пауза есть в любой момент, и из
// неё можно уйти, оставив забег.
describe('Пауза', () => {
  it('кнопка паузы есть в бою и открывает меню', () => {
    const field = read('webapp/js/ui/screens/field.js')
    expect(field).toContain("id: 'fpause'")
    expect(field).toContain('onclick: () => setPause(true)')
  })

  it('на паузе мир стоит, а сцена продолжает рисоваться', () => {
    const field = read('webapp/js/ui/screens/field.js')
    expect(field).toContain('if (paused) { draw(now / 1000); requestAnimationFrame(frame); return }')
  })

  it('из паузы два выхода: продолжить и оставить забег', () => {
    const field = read('webapp/js/ui/screens/field.js')
    expect(field).toContain("'продолжить'")
    expect(field).toContain("'оставить забег'")
    expect(field).toContain('opts.onClose?.(st)')
  })

  it('пауза не открывается, когда бой уже кончился', () => {
    const field = read('webapp/js/ui/screens/field.js')
    expect(field).toContain('if (paused === on || st.outcome) return')
  })

  it('с клавиатуры тоже — Esc и P, по-русски и по-английски', () => {
    const field = read('webapp/js/ui/screens/field.js')
    expect(field).toContain("if (e.key === 'Escape' || e.key === 'p' || e.key === 'з' || e.key === 'P')")
  })

  it('пауза не добавляет третью кнопку действия', () => {
    // Правило проекта: в бою две кнопки — дефлект и мантра. Пауза не
    // действие, а выход из забега, поэтому живёт в шапке, а не в доке.
    const field = read('webapp/js/ui/screens/field.js')
    const dock = field.slice(field.indexOf('const dock ='), field.indexOf('const pauseEl'))
    expect(dock).not.toContain('fpause')
    expect(field).toMatch(/class: 'fpause'/)
  })

  it('на паузе видно, сколько уже освобождено и сколько жизни', () => {
    const field = read('webapp/js/ui/screens/field.js')
    expect(field).toContain('Освобождено ${st.pacified}')
    expect(field).toContain('жизни ${Math.round((st.player.hp / st.player.maxHp) * 100)}%')
    expect(field).toContain('счёт ${st.score}')
  })
})

// ── Знание приходит от места, а не от карты ───────────────────────────
// Цитат 100, а открывалось 52. Остальные лежали в контенте и были не видны.
describe('Преподавание', () => {
  it('чакра даёт свою цитату при входе в локацию', () => {
    expect(main).toContain('chakraQuote(built.world?.id)')
    expect(main).toContain('onEnter: () => {')
  })

  it('учитель отдаёт цепочку цитат, а не одну', () => {
    expect(main).toContain('nextTeacherQuote(t.id, meta.lived || {})')
    expect(main).toContain('teacherChain(t.id)')
    expect(main).toContain('Учитель даст ещё')
  })

  it('учителя можно слушать повторно, пока у него есть что дать', () => {
    expect(main).toContain('Учитель ждёт')
  })

  it('места тоже учат: амбросия, лавка, хаос, покой, смерть', () => {
    // амбросия и хаос-путь видны в бою, остальное — на экранах между боями
    const field = read('webapp/js/ui/screens/field.js')
    expect(field).toContain('opts.placeQuotes?.spring')
    expect(field).toContain('opts.placeQuotes?.chaos')
    expect(main).toContain("placeQuotes('rest')")
    expect(main).toContain("placeQuotes('shop')")
    expect(main).toContain("placeQuotes('death')")
    // и бой получает список мест от экрана, а не ищет его сам
    expect(main).toContain('    placeQuotes,')
  })

  it('финал отдаёт сразу несколько цитат', () => {
    expect(main).toContain("placeQuotes('finale')")
    expect(main).toContain('Вершина отдала')
  })
})
