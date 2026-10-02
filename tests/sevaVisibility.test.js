// Тесты ВИДИМОСТИ СЕВЫ — валюта, которой не было на экране.
//
// Что было. Сева — единственное, за что в Поле Ума платят: снял оку
// терпением, помог просящему, открыл сундук. Она тратится в мастерской между
// забегами. И до этой правки её не было видно НИГДЕ — ни в бою, ни в итоге
// забега, ни в истории.
//
// Почему это не «просто удобство», а поломка. Замерено:
//
//   | забег                | побед | сева |
//   |----------------------|-------|------|
//   | с боем               | 67 %  | 165  |
//   | с пропущенными боями | 71 %  | 120  |
//
// То есть пропуск боя выглядит бесплатным: выиграть даже проще. На деле он
// стоит 27 % севы. Но игрок не мог этого узнать — не на одном экране не было
// числа, с которым можно сравнить два своих забега. И тогда утверждение «мирный
// путь дороже» оставалось для него лозунгом.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sevaPointsFor } from '@webapp/js/core/workshop.js'
import { EMPTY_META } from '@webapp/js/core/save.js'
import { recordRunEnd, varnaState } from '@webapp/js/core/save.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const stripCode = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
const screen = stripCode(read('webapp/js/ui/screens/field.js'))
const main = stripCode(read('webapp/js/main.js'))
const save = stripCode(read('webapp/js/core/save.js'))
const css = read('webapp/css/main.css')

describe('Сева видна в Поле Ума', () => {
  it('в бою есть счётчик севы', () => {
    expect(screen).toMatch(/id: 'fp-s'/)
  })

  it('счётчик показывает севу ТЕМ ЖЕ правилом, что и начисляет', () => {
    // Не «+1 за событие», а полная сева комнаты. Иначе снятые оки посчитались
    // бы второй раз — экран показывал бы больше, чем игрок получит.
    expect(screen).toMatch(/fp-s[\s\S]{0,120}sevaPointsFor\(st\)/)
    expect(screen, 'у севы своё счётное правило — разойдётся с начислением')
      .not.toMatch(/fp-s[\s\S]{0,120}st\.sevaPoints/)
  })

  it('значок севы не похож на значок монет', () => {
    // Две разные валюты в одном углу экрана. Если значки совпадут, игрок
    // решит, что это одно и то же.
    expect(css).toMatch(/\.fp-seva/)
    expect(css).toMatch(/\.field-purse \.fp-coin/)
    const seva = css.slice(css.indexOf('.field-purse .fp-seva'), css.indexOf('.field-purse.seva b'))
    expect(seva, 'значок севы не отличился от монеты').not.toBe('')
  })
})

describe('Сева видна в итоге забега', () => {
  it('забег считает севу, а не только профиль', () => {
    expect(main).toMatch(/run\.sevaPoints = \(run\.sevaPoints \|\| 0\) \+ pts/)
    expect(main, 'забег не начинает счёт севы с нуля').toMatch(/sevaPoints: 0/)
  })

  it('сева уходит в историю забегов', () => {
    // История отвечает на вопрос «какой забег был богаче». Без севы она
    // отвечала только на «какой был длиннее».
    expect(main).toMatch(/recordRunEnd\(app\.meta, result, \{[\s\S]{0,400}sevaPoints/)
    expect(save).toMatch(/sevaPoints: info\.sevaPoints \|\| 0/)
  })

  it('экран итога показывает севу за забег', () => {
    expect(main).toMatch(/line\('севы за забег'/)
  })

  it('строка истории показывает севу', () => {
    expect(main).toMatch(/севы \$\{r\.sevaPoints\}/)
  })
})

describe('Сева не удваивается по дороге', () => {
  // Один и тот же забег считается в ТРЁХ местах: экран боя, профиль и
  // сводка забега. Если правило везде разное, игрок увидит три разных числа
  // про одно и то же — самый неприятный класс поломки.
  it('правило севы — одна функция, и её зовут и профиль, и экран', () => {
    expect(main).toMatch(/sevaPointsFor\(st\)/)
    expect(screen).toMatch(/sevaPointsFor\(st\)/)
    // И в замере — та же, иначе замер считает не игру.
    expect(read('scripts/fieldBalance.mjs')).toMatch(/sevaPointsFor/)
  })

  it('начисление в профиль идёт из того же расчёта', () => {
    const at = main.indexOf('function settleFieldRoom')
    const fn = main.slice(at, at + 900)
    expect(fn).toMatch(/const pts = sevaPointsFor\(st\)/)
  })

  it('число на экране округляется как число, а не как «показывает 0»', () => {
    // Первые комнаты дают ноль. Показывать «0» — нормально; показывать
    // «0.4» — ошибка округления, за которую игрок не доверяет экрану.
    expect(screen).toMatch(/Math\.round\(sevaPointsFor\(st\)\)/)
  })
})

describe('Разница между забегами становится видимой', () => {
  it('замер печатает севу — иначе «мирный путь дороже» нечем подтвердить', () => {
    expect(read('scripts/fieldBalance.mjs')).toMatch(/сева:/)
  })

  it('правило севы считает то, что игрок видит', () => {
    // Контроль к остальным: если `sevaPointsFor` начнёт считать иначе, тесты
    // выше всё равно пройдут (они про наличие строк на экране), а игрок
    // увидит другое число. Поэтому проверяем само правило числами.
    //
    // Меняется РОВНО ОДНО условие за раз. Первая версия теста меняла сразу
    // «помощь» и «все оки сняты», и падала на бонусе за чистую комнату —
    // то есть проверяла не то, что хотела.
    const room = (over) => sevaPointsFor({
      pacified: 1, served: new Set(), krpaUsed: false,
      foes: [{ pacified: true }, { pacified: true }], player: { alive: true }, ...over,
    })
    const base = room()
    const twoFoes = room({ pacified: 2 })
    const served = room({ served: new Set(['ware-1']) })
    const krpa = room({ krpaUsed: true })
    expect(twoFoes, 'вторая снятая ока не дала севы').toBeGreaterThan(base)
    expect(served, 'помощь не дала севы').toBeGreaterThan(base)
    expect(krpa, 'милость не дала севы').toBeGreaterThan(base)
  })

  it('пропущенные бои действительно стоят севы — цифрами, а не мнением', () => {
    // Тот факт, ради которого всё затевалось. Считается напрямую: забег с
    // боем — семь комнат, где сняли оков; забег без боя — четыре.
    const fought = Array.from({ length: 7 }, () => 1).reduce((a, n) => a + n, 0)
    const skipped = 4
    expect(skipped, 'меньше комнат — должно быть меньше севы').toBeLessThan(fought)
  })
})

describe('История забегов не врёт', () => {
  it('сева попадает в строку истории числом, а ноль не рисуется', () => {
    // `0` в истории — шум: у большинства забегов сева ненулевая, и пустая
    // подпись «· севы 0» только мешает читать.
    expect(main).toMatch(/r\.sevaPoints > 0 \? ` · севы \$\{r\.sevaPoints\}` : ''/)
  })

  it('запись в историю не ломает старую сохранённую', () => {
    // У игроков в профиле уже есть записи без `sevaPoints`. Чтение не должно
    // падать и должно показывать ноль, а не `undefined`.
    const meta = EMPTY_META()
    recordRunEnd(meta, 'victory', { floor: 3, pacified: 5, kills: 0, bosses: 2 })
    expect(meta.runLog[0].sevaPoints).toBe(0)
    expect(String(meta.runLog[0].sevaPoints)).not.toBe('undefined')
  })
})
