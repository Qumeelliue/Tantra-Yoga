// РЕКОРДЫ — копия из Dead Cells и Slay the Spire (BASE-GAME, МЕХАНИКА 44).
//
// Проверяется то, что рекорд вообще нужен и что он честный:
//
//   1. **смерть не рекорд** — иначе мера мастерства начнёт показывать худшие
//      забеги. Это главный способ испортить такую механику;
//   2. **сравнение по окам, а не по времени** — время забега зависит от того,
//      сколько раз игрок смотрел в экран, и рекордом по нему быть не может;
//   3. **при равных оках побеждает меньше крови** — иначе можно освободить
//      столько же, перерезав лишнее, и это не улучшение;
//   4. **рекорд показывается там, где решают входить** — молчаливый рекорд
//      не мотивирует ничего;
//   5. **старые сохранения не ломаются** — у игроков они уже есть, и без
//      миграции `meta.records` был бы `undefined`.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { recordRun, bestRecord, reasonsToRun } from '@webapp/js/core/records.js'
import { EMPTY_META } from '@webapp/js/core/save.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const main = read('webapp/js/main.js')
const save = read('webapp/js/core/save.js')
const base = read('design/BASE-GAME.md')

const win = (o = {}) => ({ result: 'victory', bosses: 7, pacified: 30, kills: 0, time: 900, ...o })

describe('Рекорд измеряет мастерство, а не переживание', () => {
  it('первая победа становится рекордом', () => {
    const meta = EMPTY_META()
    const r = recordRun(meta, win())
    expect(r.isRecord).toBe(true)
    expect(bestRecord(meta).pacified).toBe(30)
  })

  it('смерть рекордом НЕ является', () => {
    // Ключевая проверка. Если смерть записывается, «рекорд» начнёт расти от
    // худших забегов и перестанет значить хоть что-нибудь.
    const meta = EMPTY_META()
    expect(recordRun(meta, win({ result: 'death' })).isRecord).toBe(false)
    expect(recordRun(meta, win({ result: 'retreat' })).isRecord).toBe(false)
    expect(bestRecord(meta)).toBeNull()
  })

  it('лучше = больше освобождённых оков', () => {
    const meta = EMPTY_META()
    recordRun(meta, win({ pacified: 30 }))
    expect(recordRun(meta, win({ pacified: 31 })).isRecord).toBe(true)
    expect(bestRecord(meta).pacified).toBe(31)
    expect(recordRun(meta, win({ pacified: 25 })).isRecord).toBe(false)
    expect(bestRecord(meta).pacified).toBe(31)
  })

  it('при равных оках побеждает меньше крови', () => {
    // Иначе можно освободить столько же, перерезав лишнее, и это не
    // улучшение. Игра учит не бить, значит и мера обязана это ценить.
    const meta = EMPTY_META()
    recordRun(meta, win({ pacified: 30, kills: 3 }))
    expect(recordRun(meta, win({ pacified: 30, kills: 0 })).isRecord).toBe(true)
    expect(bestRecord(meta).kills).toBe(0)
    expect(recordRun(meta, win({ pacified: 30, kills: 5 })).isRecord).toBe(false)
  })

  it('время не влияет на сравнение', () => {
    // Забег длится 15–30 минут, и время зависит от того, сколько раз игрок
    // смотрел в экран. Рекорд по времени был бы мерой скорости пальцев.
    const meta = EMPTY_META()
    recordRun(meta, win({ pacified: 30, time: 2000 }))
    expect(recordRun(meta, win({ pacified: 30, time: 100 })).isRecord).toBe(false)
    expect(bestRecord(meta).time).toBe(2000)
  })
})

describe('Рекорд виден там, где решают входить', () => {
  it('строка рекорда есть на экране входа в Поле Ума', () => {
    // Deep Cells держит best time на экране уровня, Slay the Spire — в
    // статистике. Молчаливый рекорд не мотивирует ничего.
    expect(main).toContain('reasonsToRun(meta).line')
  })

  it('рекорд и жар стоят на одном экране', () => {
    // Оба отвечают на один вопрос. Разносить их по разным меню — значит
    // показать по одному поводу из двух.
    // Ищем по МЕТКЕ, а не по строке с `class: 'lbl'`: разметка меняется
    // (вторая проверка за день ловилась на оформлении, а не на смысле),
    // а смысл — в слове «Жар».
    const at = main.indexOf('reasonsToRun(meta).line')
    const heat = main.indexOf("'Жар'")
    expect(heat, 'жар не найден').toBeGreaterThan(-1)
    expect(at, 'рекорд не рядом с жаром').toBeGreaterThan(heat)
  })

  it('экран финала говорит, побит рекорд или нет, и не молчит', () => {
    // Обещание «жар платит» и рекорд должны быть видны, иначе это враньё
    // (BASE-GAME, МЕХАНИКА 41).
    expect(main).toContain('Рекорд побит')
    expect(main).toContain('Первый рекорд')
    expect(main).toContain('summary?.isRecord')
  })

  it('экран берёт рекорд из finishFieldRun, а не считает заново', () => {
    // Если посчитать дважды, экран и профиль разойдутся при первом же
    // пересчёте — и игрок увидит «рекорд», которого нет.
    expect(main).toContain('summary.isRecord = rec.isRecord')
    expect(main).not.toContain('summary.isRecord = kills === 0')
  })
})

describe('Рекорд не ломает старые сохранения', () => {
  it('поля есть в пустой мете', () => {
    const m = EMPTY_META()
    expect(m.records).toEqual({})
    expect(m.heatLevel).toBe(0)
  })

  it('есть миграция для сохранений без полей', () => {
    // У игроков эти сохранения уже есть. Без миграции `meta.records` был бы
    // `undefined` и `reasonsToRun` показывал бы «рекорда нет» после десяти
    // побед.
    expect(save).toContain('if (!m.records || typeof m.records !==')
    expect(save).toContain("if (typeof m.heatLevel !== 'number')")
  })

  it('жар ограничен снизу, чтобы миграция не дала отрицательный', () => {
    expect(save).toContain('m.heatLevel = Math.max(0, m.heatLevel)')
  })
})

describe('Рекорд — копия, а не своя идея', () => {
  it('записан в BASE-GAME со своим источником', () => {
    expect(base).toContain('МЕХАНИКА 44')
    expect(base).toContain('Dead Cells')
    expect(base).toContain('Slay the Spire')
  })

  it('причина повторить названа обе', () => {
    // Без `**`: в BASE-GAME слова обёрнуты в выделение, и искать их с ним —
    // значит искать оформление, а не мысль. Ровно тот класс ошибок, который
    // ловил наборы пять раз за сессию.
    expect(base).toContain('зачем начать забег сильнее')
    expect(base).toContain('пройти его быстрее')
  })
})
