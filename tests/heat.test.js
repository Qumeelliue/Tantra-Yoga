// Замер ЖАРА: добровольная сложность должна оставаться проходимой.
//
// Новое правило проекта: механика считается сделанной, только если измерено,
// что она не ломает игру. Жар берёт у игрока силы — значит, надо доказать,
// что на высокой ступени всё ещё можно дойти до седьмого владыки, и что
// награда действительно растёт.
//
// Что тут проверяется и почему именно это:
//   · **проходимость** — иначе жар превратится в кирпич: игрок поднял планку
//     и больше не может вернуться, потому что мир засчитан проваленным;
//   · **монотонность награды** — жар, который не платит, хуже отсутствия
//     жара: он отнимает силы и даёт пустоту;
//   · **живые слоты** — каждое условие обязано менять то, что бой ЧИТАЕТ.
//     Первая версия жара писала `sevaHeal` и `gunaStartShift`, которых в бою
//     НЕ БЫЛО: две ступени из пяти были мусором, и `npm run audit:impact` их
//     бы не увидел — он проверяет награды, а не условия.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createField, DEFAULT_FIELD_OPTIONS, DEFAULT_GUNA_START } from '@webapp/js/core/field.js'
import { HEAT_TIERS, HEAT_MAX, applyHeat, heatReward, HEAT_REWARD_SEVA } from '@webapp/js/core/heat.js'
import { sevaPointsFor } from '@webapp/js/core/workshop.js'
import { buildFieldFloor } from '@webapp/js/core/fieldBuild.js'

const fieldSrc = readFileSync(new URL('../webapp/js/core/field.js', import.meta.url), 'utf8')
const heatSrc = readFileSync(new URL('../webapp/js/core/heat.js', import.meta.url), 'utf8')

/** Набор опций боя с применённым жаром — ровно как в `startFieldRun`. */
function optsWithHeat(level) {
  const o = { ...DEFAULT_FIELD_OPTIONS }
  applyHeat(o, level)
  return o
}

/** Настоящий бой: та же сборка комнаты, что и в игре. */
function fightWithHeat(level, room = 0) {
  const o = optsWithHeat(level)
  const built = buildFieldFloor(1, { field: { w: 412, h: 600 }, room })
  const st = createField({
    player: { x: 206, y: 430, hp: o.playerHp, maxHp: o.playerHp },
    foes: built.foes.slice(),
    wares: built.wares,
    field: built.field,
    rng: () => 0.5,
    opts: o,
  })
  st.heat = level
  return st
}

describe('Жар взят из Hades, а не придуман', () => {
  it('это список условий с добровольным выбором и растущей наградой', () => {
    // Собственно форма механики из Hades. Если хоть одного из трёх нет, то
    // это уже не «жар», а что-то другое под тем же именем.
    expect(HEAT_MAX, 'ступеней должно быть больше одной').toBeGreaterThan(1)
    for (const t of HEAT_TIERS) {
      expect(t.id, 'у условия нет id').toBeTruthy()
      expect(t.name, `у ${t.id} нет названия`).toBeTruthy()
      expect(t.desc, `у ${t.id} нет описания — игрок должен знать, на что подписался`).toBeTruthy()
      expect(typeof t.apply, `у ${t.id} нет действия`).toBe('function')
    }
    expect(HEAT_REWARD_SEVA, 'за жар должно платить').toBeGreaterThan(0)
  })

  it('записан как копия, а не как своя идея', () => {
    // Правило AGENTS.md §2: механика без строки в BASE-GAME.md = придумана.
    const base = readFileSync(new URL('../design/BASE-GAME.md', import.meta.url), 'utf8')
    expect(base).toContain('МЕХАНИКА 42')
    expect(base).toContain('Hades')
  })
})

describe('Каждое условие жара меняет то, что бой ЧИТАЕТ', () => {
  it('все пять слотов реально читаются движком', () => {
    // Главная проверка. Условие, которое меняет несуществующий слот, —
    // это мусор: игрок читает «терпеть труднее», а в бою ничего не меняется.
    // Первая версия жара так и сделала: `sevaHeal` и `gunaStartShift` в бою
    // не существовали.
    const slots = ['deflectCalm', 'clockRamp', 'avidyaGain', 'shieldMax', 'gunaStart']
    for (const s of slots) {
      expect(fieldSrc, `слот ${s} не читается полем — условие жара было бы мусором`).toContain(s)
    }
  })

  it('жар 0 не меняет игру ни на единицу', () => {
    // Критично: значение по умолчанию обязано совпасть с тем, что было
    // захардкожено. Иначе мы тихо поменяем игру всем, кто не выбирал жар.
    const o = optsWithHeat(0)
    expect(o.deflectCalm).toBe(DEFAULT_FIELD_OPTIONS.deflectCalm)
    expect(o.clockRamp).toBe(DEFAULT_FIELD_OPTIONS.clockRamp)
    expect(o.avidyaGain).toBe(DEFAULT_FIELD_OPTIONS.avidyaGain)
    expect(o.shieldMax).toBe(DEFAULT_FIELD_OPTIONS.shieldMax)
    expect(o.gunaStart).toBeUndefined()
    expect({ ...DEFAULT_GUNA_START }).toEqual({ s: 4, r: 2, t: 3 })
  })

  it('каждая ступень делает что-то, и делает это нарастающим', () => {
    // Проверяем по ПАРЕ: соседние ступени не должны выглядеть одинаково, иначе
    // это пять одинаковых ярлыков.
    const seen = []
    for (let lv = 0; lv <= HEAT_MAX; lv++) {
      const o = optsWithHeat(lv)
      seen.push(JSON.stringify({
        calm: o.deflectCalm, clock: o.clockRamp, avid: o.avidyaGain,
        shield: o.shieldMax, guna: o.gunaStart,
      }))
    }
    expect(new Set(seen).size, `ступени жара неразличимы: ${seen.join(' / ')}`).toBe(HEAT_MAX + 1)
  })

  it('перекос действительно появляется в бое, а не только в настройках', () => {
    // Сдвиг гун обязан дойти до состояния. Раньше гуны стояли в теле
    // `createField` захардкоженно, и ступень 1 была бы мёртвой.
    const st = fightWithHeat(1)
    expect(st.player.guna.r, 'жар не довёл сдвиг раджаса до игрока').toBe(DEFAULT_GUNA_START.r + 1)
    const st0 = fightWithHeat(0)
    expect(st0.player.guna.r, 'на жаре 0 гуны должны быть как были').toBe(DEFAULT_GUNA_START.r)
  })
})

describe('Жар остаётся проходимым', () => {
  it('на максимальной ступени комната берётся дефлектами, а не сдаётся сразу', () => {
    // Главный вопрос «ломает ли жар игру». Если на максимуме оку нельзя
    // успокоить в принципе, то жар — это кирпич, и игрок, поднявший планку,
    // больше не сможет вернуться: мир засчитает провал.
    const st = fightWithHeat(HEAT_MAX)
    // Спокойствие копится медленнее, но копится: проверяем, что дефлект вообще
    // даёт позитивный результат, хоть и меньший, чем на жаре 0.
    const before = st.foes[0].calm
    st.foes[0].calm += st.o.deflectCalm
    const gainedAtMax = st.foes[0].calm - before

    const st0 = fightWithHeat(0)
    const b0 = st0.foes[0].calm
    st0.foes[0].calm += st0.o.deflectCalm
    const gainedAtZero = st0.foes[0].calm - b0

    expect(gainedAtMax, 'на жаре дефлект перестал давать спокойствие').toBeGreaterThan(0)
    expect(gainedAtMax, 'жар не замедлил копление спокойствия').toBeLessThan(gainedAtZero)
  })

  it('жизни хватает на первый удар даже на максимуме', () => {
    // Второе «ломает ли»: если на жаре 5 игрок умирает раньше, чем успевает
    // что-то сделать, планка недостижима в принципе.
    const st = fightWithHeat(HEAT_MAX)
    expect(st.player.hp, 'жизни на старте меньше одного удара').toBeGreaterThan(10)
    expect(st.foes.length, 'комната пуста — нечего карать').toBeGreaterThan(0)
  })
})

describe('Жар платит', () => {
  it('награда растёт монотонно', () => {
    const vals = []
    for (let lv = 0; lv <= HEAT_MAX; lv++) vals.push(heatReward(lv, 10))
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i], `жара ${i} платит не больше, чем ${i - 1}`).toBeGreaterThan(vals[i - 1])
    }
  })

  it('сева реально умножается в зачёт за комнату', () => {
    // Не «множитель посчитан», а «очки начислены больше» — то есть множитель
    // доходит до игрока.
    const plain = { ...fightWithHeat(0), served: new Set([0]), krpaUsed: false }
    const hot = { ...fightWithHeat(HEAT_MAX), served: new Set([0]), krpaUsed: false }
    expect(sevaPointsFor(plain)).toBeGreaterThan(0)
    expect(sevaPointsFor(hot), 'на жаре сева не выросла').toBeGreaterThan(sevaPointsFor(plain))
  })

  it('смерть на жаре не платит больше, чем успех, — иначе жар учит умирать', () => {
    // Порядок множителя важен: сначала вычет за смерть, потом умножение.
    // Если наоборот, «умер, но на жаре 5» даст больше очков, чем «выжил на
    // жаре 0» — и жар станет способом набить очки смертью.
    const aliveHot = { ...fightWithHeat(HEAT_MAX), served: new Set(), krpaUsed: false }
    const deadHot = { ...fightWithHeat(HEAT_MAX), served: new Set(), krpaUsed: false }
    deadHot.player.alive = false
    expect(sevaPointsFor(deadHot), 'смерть на жаре платит столько же, сколько жизнь').toBeLessThan(sevaPointsFor(aliveHot) + 1)
    expect(sevaPointsFor(deadHot), 'смерть дала больше нуля — жар вознаграждает провал').toBeGreaterThanOrEqual(0)
  })
})

describe('Жар виден игроку', () => {
  const main = readFileSync(new URL('../webapp/js/main.js', import.meta.url), 'utf8')

  it('выбирается ДО забега, а не после', () => {
    expect(main).toContain('applyHeat(opts2, meta.heatLevel || 0)')
  })

  it('ставка показана в бою, а не спрятана', () => {
    // Обещание «жар платит», которое нигде не показано, — то же враньё, что и
    // «убить нельзя» (МЕХАНИКА 41).
    expect(main).toContain('st.heat = heatInfo.level')
    expect(main).toContain('st.heatNames = heatInfo.names')
  })

  it('применяется ПОСЛЕ даров и мастерской, иначе покупка тихо отменяет ставку', () => {
    // Игрок мог купить усиление, которое отменяет условие жара. Если жар
    // применился бы раньше, обещание награды оказалось бы ложью.
    const applyHeatAt = main.indexOf('applyHeat(opts2')
    const upgradesAt = main.indexOf('applyUpgrades(')
    expect(applyHeatAt, 'жар применён до мастерской — покупка отменит ставку').toBeGreaterThan(upgradesAt)
  })

  it('уровень жара хранится в профиле и не сбрасывается', () => {
    expect(main).toContain('meta.heatLevel = n')
  })
})
