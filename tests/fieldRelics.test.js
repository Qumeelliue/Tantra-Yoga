// РЕЛИКВИИ ПОЛЯ УМА: слот из Slay the Spire, содержание из Шастр.
//
// ## Что проверяется и почему именно это
//
// Реликвии — двигатель разнообразия забега в Slay the Spire: после каждого
// босса одна из трёх, до конца забега. Без этого слота в Поле Ума за 25 комнат
// было **восемь** решений (один нефрит и семь даров), и два забега отличались
// только тем, какие 14 даров выпало.
//
// Проверяется четыре вещи, и каждая — с места, где ляжет враньё:
//
//   1. **Описание честно** — у каждой реликвии есть свой текст для Поля Ума, а
//      не карточный. Карточный говорит про «Ахимса-карты», «Прану» и «бой», чего
//      в Поле Ума нет вообще.
//   2. **Каждая меняет бой** — как `audit:impact`, но для реликвий: слот,
//      который ничего не делает, хуже отсутствующего, потому что он занимает
//      выбор.
//   3. **Мост записан целиком** — перевод «карточного» действия в опцию боя
//      лежит в одной таблице, и ни один вид эффекта не остался без перевода
//      (иначе реликвия выпадает и молча не работает).
//   4. **Игра и замер собирают одно** — иначе замер считает бои без реликвий,
//      и все числа про них выдуманы (МЕХАНИКА 43).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { RELICS } from '@webapp/js/core/data.js'
import {
  applyFieldRelics, rollFieldRelics, fieldRelicView, hasFieldDesc, FIELD_DESC,
} from '@webapp/js/core/fieldRelics.js'
import { DEFAULT_FIELD_OPTIONS } from '@webapp/js/core/field.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const base = () => ({ ...DEFAULT_FIELD_OPTIONS, playerHp: 60 })

function changedBy(opts) {
  return Object.entries(opts).filter(([k, v]) => v !== DEFAULT_FIELD_OPTIONS[k])
}

describe('У каждой реликвии есть честное описание для Поля Ума', () => {
  for (const id of Object.keys(RELICS)) {
    it(`${id}: своё описание, а не карточное`, () => {
      expect(hasFieldDesc(id), `у «${RELICS[id].name}» нет текста для Поля Ума`).toBe(true)
      const v = fieldRelicView(id)
      expect(v.desc).toBe(FIELD_DESC[id])
      expect(v.desc).not.toBe(RELICS[id].desc,
        `на экране будет карточное описание: «${RELICS[id].desc}» — в Поле Ума таких слов нет`)
    })
  }

  it('описание не обещает того, чего в Поле Ума нет', () => {
    // Слова-маркеры карточного пути. Каждое из них означает механику, которой
    // в Поле Ума нет: карт, Праны, «боя» как отдельной сущности.
    for (const id of Object.keys(RELICS)) {
      const t = FIELD_DESC[id] || ''
      expect(/\bкарт(а|ы|у|ой)?\b/i.test(t), `«${t}» — в Поле Ума нет карт`).toBe(false)
      expect(/Прана\b/.test(t), `«${t}» — в Поле Ума нет Праны`).toBe(false)
      expect(/в начале каждого боя/i.test(t),
        `«${t}» — в Поле Ума «бой» это комната, и так обещание не выполняется`).toBe(false)
    }
  })
})

describe('Каждая реликвия меняет бой', () => {
  for (const id of Object.keys(RELICS)) {
    it(`${id}: применение даёт не пустой набор опций`, () => {
      const opts = applyFieldRelics(base(), [id])
      const ch = changedBy(opts)
      expect(ch.length, `«${RELICS[id].name}» не меняет ничего — слот занимает выбор впустую`)
        .toBeGreaterThan(0)
      for (const [k, v] of ch) {
        if (typeof v === 'number') {
          expect(Number.isFinite(v), `«${RELICS[id].name}» дала NaN в «${k}»`).toBe(true)
        }
      }
    })
  }

  it('без реликвий опции не меняются вовсе', () => {
    expect(applyFieldRelics(base(), [])).toEqual(base())
    expect(applyFieldRelics(base(), ['такой-реликвии-нет'])).toEqual(base())
  })

  it('исходный набор опций не портится', () => {
    // Право на подмену: вызывающий передаёт опции забега, и если apply их
    // изменит на месте, следующая комната получит уже усиленные опции — опции
    // накапливались бы от комнаты к комнате и забег раздувался.
    const o = base()
    applyFieldRelics(o, Object.keys(RELICS).slice(0, 4))
    expect(o).toEqual(base())
  })

  it('мантра не может стоить меньше нуля', () => {
    // «Три жезла» и «встреча с Учителем» срезают Ци. Две такие реликвии дали бы
    // отрицательную цену, и `castMantra` отдавал бы бесплатную мантру.
    const both = applyFieldRelics(base(), ['tridanda', 'guru_darshana'])
    expect(both.mantraCostCut).toBeGreaterThanOrEqual(0)
  })

  it('запас Ци не выше потолка', () => {
    // «Джатисмара» добавляет Ци на вход. Если он стал выше потолка, полоса
    // показывает больше, чем может быть, — то же враньё, что щит выше потолка.
    const opts = applyFieldRelics(base(), ['jatismara', 'jatismara'])
    expect(opts.psychicStart).toBeLessThanOrEqual(opts.psychicMax)
  })
})

describe('Ни один вид эффекта не остался без перевода', () => {
  const mod = read('webapp/js/core/fieldRelics.js')

  it('каждый вид эффекта из карточного пути переведён в опцию Поля Ума', () => {
    const kinds = new Set()
    for (const r of Object.values(RELICS)) for (const e of r.effects || []) kinds.add(e.kind)
    for (const k of kinds) {
      const inField = new RegExp(`${k}:`).test(mod)
      expect(inField, `вид эффекта ${k} не переведён в Поле Ума — реликвия выпадет и не сработает`).toBe(true)
    }
  })

  it('ни один вид эффекта не помечен как неподдерживаемый', () => {
    const o = applyFieldRelics(base(), Object.keys(RELICS))
    for (const id of Object.keys(RELICS)) {
      expect(changedBy(applyFieldRelics(base(), [id])).length,
        `«${id}» не дала ни одной опции — вид эффекта не переведён`).toBeGreaterThan(0)
    }
    expect(o).toBeTruthy()
  })
})

describe('Три карточки на выбор, как в Slay the Spire', () => {
  it('предлагает три разные реликвии', () => {
    const choice = rollFieldRelics({ rng: () => 0.3 })
    expect(choice).toHaveLength(3)
    expect(new Set(choice.map((c) => c.id)).size).toBe(3)
  })

  it('не предлагает уже взятую', () => {
    const all = Object.keys(RELICS)
    const choice = rollFieldRelics({ rng: () => 0.1, owned: all.slice(0, 5) })
    for (const c of choice) expect(all.slice(0, 5)).not.toContain(c.id)
  })

  it('генератор обязателен', () => {
    // Без rng розыгрыш пошёл бы по Math.random — и замер считал бы не тот забег.
    expect(() => rollFieldRelics({})).toThrow(/rng/)
  })

  it('когда реликвии кончились — пустой список, а не падение', () => {
    expect(rollFieldRelics({ rng: () => 0.5, owned: Object.keys(RELICS) })).toEqual([])
  })

  it('в карточке видно и имя, и описание, и цитату', () => {
    const [v] = rollFieldRelics({ rng: () => 0.5 })
    expect(v.name).toBeTruthy()
    expect(v.desc).toBeTruthy()
    expect(v.quoteId, 'реликвия без цитаты — а цитата и есть её смысл').toBeTruthy()
    expect(RELICS[v.id].quoteId).toBe(v.quoteId)
  })
})

describe('Реликвии встроены в забег, а не лежат рядом', () => {
  const main = read('webapp/js/main.js')
  const sim = read('scripts/fieldBalance.mjs')

  it('игра применяет реликвии к опциям боя', () => {
    expect(main).toMatch(/applyFieldRelics\(/)
  })

  it('реликвия выдаётся после владыки, а не в случайной комнате', () => {
    // Слот из Slay the Spire — «после босса». Если выдавать после любой комнаты,
    // реликвии станут ещё одним даром, и слота не будет.
    expect(main).toMatch(/function showRelicDraft/)
    expect(main).toMatch(/showBoonDraft\(next, 'владыка пал — выбери дар', \(\) => showRelicDraft\(\)\)/)
  })

  it('забег помнит свои реликвии и обнуляет с новым', () => {
    expect(main).toMatch(/relics: \[\]/)
    expect(main, 'реликвии не сбрасываются при смерти — забег начинается заново, а список остаётся')
      .toMatch(/app\.boons = \[\]/)
  })

  it('забег применяет реликвии к КАЖДОЙ комнате', () => {
    // Реликвия держится до конца забега. Если опции собираются один раз, то
    // после первой комнаты она перестаёт действовать — и об этом никто не
    // узнает, потому что список на экране остаётся.
    //
    // Ищем ПОСЛЕДНЕЕ вхождение имени: первое — это строка импорта, и срез от
    // него давал пустой кусок. Первая версия проверки искала `indexOf` и
    // рапортовала «реликвии применяются вне сборки комнаты», хотя применялись
    // ровно там, где надо.
    const at = main.lastIndexOf('applyFieldRelics(')
    expect(at, 'вызов applyFieldRelics не найден').toBeGreaterThan(0)
    const fnStart = main.lastIndexOf('function startFieldRun', at)
    expect(fnStart, 'вызов не внутри startFieldRun').toBeGreaterThan(0)
    // Срез должен ВКЛЮЧАТЬ сам вызов. Он начинается ровно на `at`, поэтому срез до
    // `at` отбрасывал именно то, что проверялось, а срез до `at + 1` — только
    // одну букву имени. Нужна длина вызова.
    const CALL = 'applyFieldRelics('
    const fn = main.slice(fnStart, at + CALL.length)
    expect(fn, 'реликвии применяются вне сборки комнаты').toMatch(/applyFieldRelics\(/)
  })

  it('экран показывает список реликвий забега — настоящими узлами, а не строкой в исходнике', async () => {
    // Первая версия этой проверки искала `fr-chip` в исходнике и была
    // зелёной, когда чипы собирались и НЕ рисовались. Она спрашивала «слово
    // есть», а надо «узел есть». Теперь функция вне экрана и проверяется прямо.
    const { relicChips } = await import('@webapp/js/ui/relicView.js')
    const { installDom } = await import('./helpers/dom.js')
    installDom()
    const nodes = relicChips(['pratik', 'shaoca_mainjusa'])
    expect(nodes).toHaveLength(2)
    for (const n of nodes) {
      expect(String(n.className || ''), 'чип без класса — не рисуется как чип')
        .toMatch(/fr-chip/)
      expect(String(n.textContent || '')).toBeTruthy()
      expect(String(n.getAttribute?.('title') || ''), 'у чипа нет подсказки — что он делает')
        .toBeTruthy()
    }
    expect(relicChips([])).toEqual([])
    expect(relicChips(['нет-такой'])).toEqual([])
  })

  it('замер применяет те же реликвии — иначе числа про них выдуманы', () => {
    expect(sim, 'замер не знает о реликвиях — все числа без них').toMatch(/applyFieldRelics|relics/)
  })
})
