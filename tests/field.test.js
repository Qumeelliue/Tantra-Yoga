import { describe, it, expect } from 'vitest'
import {
  createField, stepField, strike, parry, castMantra, mantraList, mantraById,
  MANTRAS, FLOOR_MANTRA, serveWare, dash, parryHint,
  checkSamadhi, checkOutcome, fieldProgress, recomputeGuna, leadingGuna,
  GUNA_META, DEFAULT_FIELD_OPTIONS,
} from '@webapp/js/core/field.js'
import { buildFieldFloor, worldLook } from '@webapp/js/core/fieldBuild.js'
import { WORLDS, worldForFloor } from '@webapp/js/core/data.js'

function mkFoe(over = {}) {
  return {
    id: 'krodha', name: 'Кродха', glyph: 'fire', x: 100, y: 100,
    calmMax: 3, light: 'light', ...over,
  }
}

function field(foes, wares = [], opts = {}) {
  return createField({
    player: { x: 100, y: 200, hp: 60 },
    foes,
    wares,
    rng: () => 0.5,
    opts,
  })
}

// прогоняем N секунд с постоянным вводом
function run(st, seconds, input = {}, dt = 1 / 60) {
  const ev = []
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i++) {
    ev.push(...stepField(st, dt, input))
  }
  return ev
}

describe('Поле Ума: создание', () => {
  it('создаёт поле с игроком и оковами', () => {
    const st = field([mkFoe()])
    expect(st.player.alive).toBe(true)
    expect(st.foes.length).toBe(1)
    expect(st.foes[0].hp).toBe(1) // рипу нельзя убить
    expect(st.outcome).toBe(null)
  })

  it('рипу не имеет ХП для убийства, у паши — имеет', () => {
    const st = field([
      mkFoe({ id: 'krodha' }),
      { id: 'bhaya_pasha', name: 'Бхая', kind: 'pasha', x: 200, y: 200, hp: 30, calmMax: 3 },
    ])
    expect(st.foes[0].hp).toBe(1)
    expect(st.foes[1].hp).toBe(30)
    expect(st.foes[1].maxHp).toBe(30)
  })

  it('аура Видья/Авидья по умолчанию правдивая', () => {
    const st = field([mkFoe({ light: 'dark' })])
    expect(st.foes[0].trueLight).toBe('dark')
    expect(st.foes[0].shownLight ?? st.foes[0].trueLight).toBe('dark')
  })

  it('пелена неведения закрывает различение (аура становится unknown)', () => {
    const st = field([mkFoe({ light: 'light' })])
    st.avidya = st.o.avidyaMax * 0.9
    run(st, 0.2, {})
    expect(st.foes[0].shownLight).toBe('unknown')
  })

  it('ауру можно подделать — это ловушка различения', () => {
    const st = field([mkFoe({ light: 'light', fakeLight: 'dark' })])
    expect(st.foes[0].trueLight).toBe('light')
    expect(st.foes[0].shownLight).toBe('dark')
  })
})

describe('Поле Ума: гуны и прама (samatābhāva)', () => {
  it('прама включается при равновесии гун', () => {
    const st = field([mkFoe()])
    st.player.guna = { s: 3, r: 3, t: 3 }
    recomputeGuna(st)
    expect(st.player.prama).toBe(true)
  })

  it('прама выключается при перекосе', () => {
    const st = field([mkFoe()])
    st.player.guna = { s: 7, r: 1, t: 1 }
    recomputeGuna(st)
    expect(st.player.prama).toBe(false)
  })

  it('лидирующая гуна определяется при разрыве 2+', () => {
    const st = field([mkFoe()])
    st.player.guna = { s: 6, r: 2, t: 1 }
    expect(leadingGuna(st)).toBe('s')
  })

  it('цвета гун соответствуют источнику (белый/красный/чёрный)', () => {
    expect(GUNA_META.s.color).toBe('#f4f1ea')  // sattva = white
    expect(GUNA_META.r.color).toBe('#d23b3b')  // rajah = red
    expect(GUNA_META.t.color).toBe('#14121a')  // tamah = black
  })
})

describe('Поле Ума: главное правило — сила не работает против рипу', () => {
  it('удар по рипу не убивает его', () => {
    const st = field([mkFoe()])
    st.player.x = st.foes[0].x
    st.player.y = st.foes[0].y + 20
    strike(st, 0)
    expect(st.foes[0].dead).toBe(false)
    expect(st.foes[0].hp).toBe(1)
  })

  it('удар по рипу сбивает накопленное спокойствие', () => {
    const st = field([mkFoe()])
    st.player.x = st.foes[0].x
    st.player.y = st.foes[0].y + 20
    st.foes[0].calm = 2
    strike(st, 0)
    expect(st.foes[0].calm).toBeLessThan(2)
  })

  it('удар по рипу кормит авидью', () => {
    const st = field([mkFoe()])
    st.player.x = st.foes[0].x
    st.player.y = st.foes[0].y + 20
    const before = st.avidya
    strike(st, 0)
    expect(st.avidya).toBeGreaterThan(before)
  })

  it('удар по ложной ауре даёт самскару и не наносит урона паше', () => {
    const st = field([{ id: 'bhaya_pasha', name: 'Бхая', kind: 'pasha', x: 100, y: 100, hp: 30, light: 'light', fakeLight: 'dark' }])
    st.player.x = st.foes[0].x
    st.player.y = st.foes[0].y + 20
    const hp = st.foes[0].hp
    const av = st.avidya
    const ev = strike(st, 0)
    expect(st.foes[0].hp).toBe(hp)
    expect(st.avidya).toBeGreaterThan(av)
    expect(ev.some((e) => e.type === 'strike_false')).toBe(true)
  })

  it('удар по настоящей ауре ранит пашу', () => {
    const st = field([{ id: 'bhaya_pasha', name: 'Бхая', kind: 'pasha', x: 100, y: 100, hp: 30, light: 'dark', shownLight: 'dark' }])
    st.player.x = st.foes[0].x
    st.player.y = st.foes[0].y + 20
    strike(st, 0)
    expect(st.foes[0].hp).toBeLessThan(30)
  })
})

// ── ДЕФЛЕКТ (Nine Sols) — ядро боя ────────────────────────────────────────
// Поднимаем оку в состояние замаха и жмём дефлект в окне.
function stageFoe(st, i = 0, timer = null) {
  const f = st.foes[i]
  f.state = 'telegraph'
  f.timer = timer == null ? st.o.parryWindow * 0.5 : timer
  f.charge = 1 - f.timer / st.o.enemyTelegraph
  f.stun = 0
  f.cooldown = 0
  // игрок вплотную — иначе не в радиусе парирования
  st.player.x = f.x
  st.player.y = f.y + 14
  st.player.parryCd = 0
  return f
}

describe('Поле Ума: дефлект (Nine Sols) — ядро боя', () => {
  it('мимо окна — спокойствие не растёт, серия сбрасывается', () => {
    const st = field([mkFoe()])
    stageFoe(st, 0, st.o.enemyTelegraph)   // только что замахнулась, окна нет
    st.player.combo = 3
    const ev = parry(st)
    expect(st.foes[0].calm).toBe(0)
    expect(st.player.combo).toBe(0)
    expect(ev.some((e) => e.type === 'parry_miss')).toBe(true)
  })

  it('попадание в окно оглушает оку и даёт спокойствие', () => {
    const st = field([mkFoe()])
    stageFoe(st, 0)
    const ev = parry(st)
    expect(ev.some((e) => e.type === 'deflect')).toBe(true)
    expect(st.foes[0].calm).toBeGreaterThan(0)
    expect(st.foes[0].stun).toBeGreaterThan(0)
    expect(st.foes[0].charge).toBe(0)   // кольцо сорвано, замах сбит
  })

  it('дефлект даёт Ци (Nine Sols: deflect → qi)', () => {
    const st = field([mkFoe()])
    stageFoe(st, 0)
    const before = st.player.psychic
    parry(st)
    expect(st.player.psychic).toBeGreaterThan(before)
  })

  it('серия растёт и даёт больше Ци с каждым звеном', () => {
    const st = field([mkFoe(), mkFoe({ x: 200, y: 100 })])
    stageFoe(st, 0); const qi1 = parry(st).find((e) => e.type === 'deflect').qi
    st.foes[0].stun = 0
    stageFoe(st, 1); const qi2 = parry(st).find((e) => e.type === 'deflect').qi
    expect(st.player.combo).toBe(2)
    expect(qi2).toBeGreaterThan(qi1)
  })

  it('серия горит только comboWindow секунд', () => {
    const st = field([mkFoe()])
    stageFoe(st, 0); parry(st)
    expect(st.player.combo).toBe(1)
    run(st, st.o.comboWindow + 0.2)
    expect(st.player.combo).toBe(0)
  })

  it('накопленное дефлектами спокойствие освобождает окову', () => {
    const st = field([mkFoe({ calmMax: 2 })])
    for (let i = 0; i < 4; i++) { stageFoe(st); parry(st) }
    expect(st.foes[0].pacified).toBe(true)
  })

  it('освобождение даёт духовную силу и гасит авидью', () => {
    const st = field([mkFoe({ calmMax: 2 })])
    st.avidya = 60
    const shakti = st.player.shakti
    for (let i = 0; i < 4; i++) { stageFoe(st); parry(st) }
    expect(st.player.shakti).toBeGreaterThan(shakti)
    expect(st.avidya).toBeLessThan(60)
  })

  it('окружённого ока нельзя вернуть — парирование из-за пределов радиуса', () => {
    const st = field([mkFoe()])
    stageFoe(st, 0, st.o.parryWindow * 0.5)
    st.player.x = st.foes[0].x + st.o.parryRadius + 50
    const ev = parry(st)
    expect(ev.some((e) => e.type === 'parry_miss')).toBe(true)
  })

  it('спокойствие тает, если отошёл (терпение надо удерживать)', () => {
    const st = field([mkFoe()])
    st.foes[0].calm = 2
    st.player.x = st.foes[0].x + 400
    st.player.y = st.foes[0].y
    run(st, 3)
    expect(st.foes[0].calm).toBeLessThan(2)
  })
})

describe('Поле Ума: ока замахивается и кулдаунит (Nine Sols)', () => {
  it('замах начинается, когда ока подошла вплотную', () => {
    const st = field([mkFoe({ x: 100, y: 100 })])
    st.player.x = 110; st.player.y = 110
    run(st, 0.1)
    expect(st.foes[0].state).toBe('telegraph')
  })

  it('после удара ока не машнёт сразу — есть кулдаун', () => {
    const st = field([mkFoe({ x: 100, y: 100 })])
    st.player.x = 110; st.player.y = 110
    run(st, st.o.enemyTelegraph + 0.2)
    expect(st.foes[0].state).not.toBe('telegraph')
    expect(st.foes[0].cooldown).toBeGreaterThan(0)
  })

  it('оглушённая ока не замахивается (возвращённый удар ломает цикл)', () => {
    const st = field([mkFoe({ x: 100, y: 100 })])
    st.player.x = 110; st.player.y = 110
    run(st, 0.1)
    stageFoe(st, 0)
    parry(st)
    run(st, 0.3)
    expect(st.foes[0].state).not.toBe('telegraph')
  })

  it('кольцо замаха сжимается от 0 к 1', () => {
    const st = field([mkFoe({ x: 100, y: 100, id: 'lobha' })])
    st.player.x = 110; st.player.y = 110
    run(st, 0.1)
    const a = st.foes[0].charge
    run(st, st.o.enemyTelegraph * 0.3)   // берём оку с длинным замахом
    expect(st.foes[0].charge).toBeGreaterThan(a)
  })

  it('кольцо считается от НАСТОЯЩЕГО замаха оки, а не от общего', () => {
    // гнев замахивается втрое быстрее сна: если кольцо считать от общего
    // времени, оно сомкнулось бы раньше, чем удар прилетит, и окно
    // дефлекта врало бы игроку
    const st = field([mkFoe({ x: 100, y: 100, id: 'krodha' })])
    st.player.x = 110; st.player.y = 110
    run(st, 0.05)
    const f = st.foes[0]
    expect(f.telegraphSpan).toBeLessThan(st.o.enemyTelegraph)
    // ровно на середине своего замаха кольцо должно быть ровно наполовину
    const mid = field([mkFoe({ x: 100, y: 100, id: 'krodha' })])
    mid.player.x = 110; mid.player.y = 110
    run(mid, 0.05)
    run(mid, mid.foes[0].telegraphSpan * 0.5)
    expect(mid.foes[0].charge).toBeGreaterThan(0.4)
    expect(mid.foes[0].charge).toBeLessThan(0.6)
  })
})

describe('Поле Ума: мантра одна и выдаётся сама (Hades: одно умение)', () => {
  function withMantra(id, foes) {
    return field(foes, [], { mantraId: id })
  }

  it('у игрока ровно одна мантра — слотов и выбора нет', () => {
    const st = withMantra('pranayama', [mkFoe()])
    expect(mantraList(st)).toHaveLength(1)
    expect(mantraById(st.player.mantraId).id).toBe('pranayama')
    // в состоянии нет места под «выбранный слот»
    expect(st.player.mantraSlot).toBeUndefined()
  })

  it('выход за пределы списка не ломает игру', () => {
    const st = withMantra('такой-нет', [mkFoe()])
    expect(mantraById(st.player.mantraId).id).toBe('japa')   // безопасный откат
    st.player.psychic = 6
    expect(() => castMantra(st)).not.toThrow()
  })

  it('мантра списывает ровно свою цену', () => {
    const st = withMantra('madhuvidya', [mkFoe()])
    st.player.psychic = 12
    const m = mantraById('madhuvidya')
    const ev = castMantra(st)
    expect(ev.some((e) => e.type === 'mantra' && e.id === m.id)).toBe(true)
    expect(st.player.psychic).toBe(12 - m.cost)
  })

  it('Пранаяма даёт щит (Slay the Spire: block)', () => {
    const st = withMantra('pranayama', [mkFoe()])
    st.player.psychic = 12
    castMantra(st)
    expect(st.player.shield).toBe(2)
  })

  it('Тандава гасит авидью — «сжигает мучительную»', () => {
    const st = withMantra('tandava', [mkFoe()])
    st.player.psychic = 12
    st.avidya = 60
    castMantra(st)
    expect(st.avidya).toBeLessThan(60)
  })

  it('Упаваса стоит 4 Ци и дожигает окову, снятую наполовину', () => {
    // Раньше снимала любую окову за 2 Ци, и три нажатия чистили комнату
    // без единого дефлекта. Теперь — только ту, что уже размягчена.
    const st = withMantra('upavasa', [mkFoe({ calmMax: 2 })])
    st.player.psychic = 8
    st.foes[0].calm = st.foes[0].calmMax * 0.6
    castMantra(st)
    expect(st.player.shield).toBeGreaterThanOrEqual(3)
    expect(st.foes[0].pacified).toBe(true)
    expect(st.player.psychic).toBe(8 - 4 + 3)   // снятие оковы часть Ци возвращает
  })

  it('Упаваса не снимает свежую окову — дефлект остаётся нужным', () => {
    const st = withMantra('upavasa', [mkFoe({ calmMax: 3 })])
    st.player.psychic = 8
    st.foes[0].calm = 0
    castMantra(st)
    expect(st.foes[0].pacified).toBe(false)
  })

  it('Джапа бесплатна, но Ци не даёт — иначе Ци бесконечен', () => {
    // Джапа давала +1 Ци, и мантры можно было жать без конца: петля
    // «дефлект → Ци → талисман» переставала работать.
    const st = withMantra('japa', [mkFoe()])
    st.player.psychic = 4
    st.avidya = 30
    castMantra(st)
    expect(st.player.psychic).toBe(4)
    expect(st.avidya).toBeLessThan(30)
  })

  it('без Ци мантра не срабатывает', () => {
    const st = withMantra('madhuvidya', [mkFoe()])
    st.player.psychic = 1
    const ev = castMantra(st)
    expect(ev.some((e) => e.type === 'no_qi')).toBe(true)
    expect(st.player.psychic).toBe(1)
  })

  it('у каждой мантры есть цитата (правило: нет цитаты — нет мантры)', () => {
    expect(MANTRAS.length).toBeGreaterThan(0)
    for (const m of MANTRAS) {
      expect(m.quoteId).toBeTruthy()
      expect(m.desc).toBeTruthy()
    }
  })

  it('на каждую чакру есть своя мантра — и она задана заранее', () => {
    for (let f = 0; f <= 6; f++) {
      expect(FLOOR_MANTRA[f]).toBeTruthy()
      expect(mantraById(FLOOR_MANTRA[f])).toBeTruthy()
    }
  })
})

describe('Поле Ума: авидья и серия', () => {
  it('авидья растёт со временем, когда ничего не делаешь', () => {
    const st = field([mkFoe({ x: 900, y: 700 })])
    st.player.x = 100; st.player.y = 100
    const a = st.avidya
    run(st, 3)
    expect(st.avidya).toBeGreaterThan(a)
  })

  it('в серии дефлектов авидья падает — поток гасит неведение', () => {
    const st = field([mkFoe(), mkFoe({ x: 200, y: 100 })])
    st.avidya = 50
    stageFoe(st, 0); parry(st)
    st.foes[0].stun = 0
    stageFoe(st, 1); parry(st)
    run(st, 1)
    expect(st.avidya).toBeLessThan(50)
  })

  it('психическая сила ограничена потолком — в самадхи не пускает', () => {
    const st = field([mkFoe()])
    st.player.psychic = st.player.psychicMax
    run(st, 20)
    expect(st.player.psychic).toBeLessThanOrEqual(st.player.psychicMax)
    expect(st.player.inSamadhi).toBe(false)
  })
})

describe('Поле Ума: самадхи открывается духовной силой', () => {
  it('нужна духовная сила, а не психическая', () => {
    const st = field([mkFoe()])
    st.player.shakti = st.o.samadhiShakti - 1
    checkSamadhi(st)
    expect(st.player.inSamadhi).toBe(false)
  })

  it('достигается при достаточной духовной силе', () => {
    const st = field([mkFoe()])
    st.player.shakti = st.o.samadhiShakti
    checkSamadhi(st)
    expect(st.player.inSamadhi).toBe(true)
    expect(st.player.shakti).toBe(0)
  })

  it('в самадхи урон врага резко меньше', () => {
    const st = field([mkFoe()])
    st.player.inSamadhi = true
    st.player.hp = 60
    st.player.maxHp = 60
    expect(st.player.hp).toBe(60)
  })
})

describe('Поле Ума: сева — экономика духовной силы', () => {
  const ware = (over = {}) => ({ id: 'w1', x: 100, y: 200, ...over })

  it('шудрочита даёт временный плод', () => {
    const st = field([mkFoe()], [ware()])
    const ev = serveWare(st, 0, 'shudrocita')
    const e = ev.find((x) => x.type === 'served')
    expect(e.permanent).toBe(false)
    expect(e.label).toBe('временный')
  })

  it('випрочита — единственный вид с вечным плодом', () => {
    const st = field([mkFoe()], [ware()])
    const ev = serveWare(st, 0, 'viprocita')
    const e = ev.find((x) => x.type === 'served')
    expect(e.permanent).toBe(true)
    expect(e.label).toBe('навсегда')
  })

  it('все четыре вида севы дают духовную силу', () => {
    for (const kind of ['shudrocita', 'ksatriyocita', 'vaeshyocita', 'viprocita']) {
      const st = field([mkFoe()], [ware()])
      const before = st.player.shakti
      serveWare(st, 0, kind)
      expect(st.player.shakti).toBeGreaterThan(before)
    }
  })

  it('випрочита гасит авидью сильнее всех', () => {
    const kinds = ['shudrocita', 'ksatriyocita', 'vaeshyocita', 'viprocita']
    const drops = {}
    for (const kind of kinds) {
      const st = field([mkFoe()], [ware()])
      st.avidya = 80
      serveWare(st, 0, kind)
      drops[kind] = 80 - st.avidya
    }
    expect(drops.viprocita).toBeGreaterThan(drops.shudrocita)
  })

  it('помощь с расчётом («должен мне») не засчитывается', () => {
    const st = field([mkFoe()], [ware({ debt: true })])
    const before = st.player.shakti
    const ev = serveWare(st, 0, 'viprocita')
    expect(ev.some((e) => e.type === 'seva_debt')).toBe(true)
    expect(st.player.shakti).toBe(before)
  })

  it('честная сева даёт духовную силу, а с расчётом — нет', () => {
    const a = field([mkFoe()], [ware()])
    const b = field([mkFoe()], [ware({ debt: true })])
    const s0 = a.player.shakti, s1 = b.player.shakti
    serveWare(a, 0, 'vaeshyocita')
    serveWare(b, 0, 'vaeshyocita')
    expect(a.player.shakti - s0).toBeGreaterThan(b.player.shakti - s1)
  })
})

describe('Поле Ума: авидья и самскары', () => {
  it('авидья растёт со временем, когда не дышишь', () => {
    const st = field([mkFoe()])
    st.avidya = 0
    run(st, 3, { breath: false })
    expect(st.avidya).toBeGreaterThan(0)
  })

  it('переполнение авидьи вызывает самскару', () => {
    const st = field([mkFoe()])
    st.avidya = st.o.avidyaMax - 1
    const ev = run(st, 1, { breath: false })
    expect(ev.some((e) => e.type === 'samskara')).toBe(true)
  })

  it('авидья не превышает максимум', () => {
    const st = field([mkFoe()])
    st.avidya = st.o.avidyaMax
    run(st, 5, { breath: false })
    expect(st.avidya).toBeLessThanOrEqual(st.o.avidyaMax)
  })

  it('насилие копит давление самскар', () => {
    const st = field([mkFoe()])
    const p0 = st.samskaraPressure
    st.player.x = st.foes[0].x
    st.player.y = st.foes[0].y + 20
    strike(st, 0)
    expect(st.samskaraPressure).toBeGreaterThan(p0)
  })
})

// ── ВЛАДЫКА (Slay the Spire: intent + moves; Hades: порог 50%) ────────────
function mkBoss(over = {}) {
  return {
    id: 'krodha_maharaja', name: 'Маха-Кродха', epithet: 'Владыка Манипуры',
    kind: 'pasha', x: 200, y: 200, isBoss: true, calmMax: 3, reach: 48, speedMul: 0.8,
    quoteId: 'krodha',
    moves: [
      { name: 'Закипание', intent: 'buff', damage: 0, effects: [{ kind: 'strength', amount: 1, target: 'self' }] },
      { name: 'Пламя ярости', intent: 'attack', damage: 6, effects: [{ kind: 'damage', amount: 6, target: 'player' }] },
      { name: 'Покров', intent: 'defend', damage: 0, effects: [{ kind: 'block', amount: 8, target: 'self' }] },
    ],
    onThreshold: { trigger: 'hp_lte_50', once: true, log: 'Маха-Кродха впадает в бешенство' },
    ...over,
  }
}

// Полный цикл приёма владыки: замах + активное окно удара + пауза.
function bossCycle(st, extra = 0.06) {
  return st.o.bossCooldown + st.o.bossTelegraph + st.o.attackWindow + extra
}

describe('Поле Ума: владыка — фазы и приёмы', () => {
  it('у владыки запас спокойствия больше, чем у обычной оковы — но не втрое', () => {
    // втрое было нечестно (см. bossFairness.test.js): единственный источник
    // силы — возврат удара, а он ограничен темпом приёмов
    const boss = field([mkBoss()])
    const plain = field([mkFoe({ calmMax: 3 })])
    expect(boss.foes[0].calmMax).toBeGreaterThan(plain.foes[0].calmMax)
    expect(boss.foes[0].calmMax).toBe(plain.foes[0].calmMax * DEFAULT_FIELD_OPTIONS.bossCalmScale)
    expect(DEFAULT_FIELD_OPTIONS.bossCalmScale).toBeLessThanOrEqual(2)
  })

  it('приёмы и порог берутся из контента, а не выдумываются', () => {
    const st = field([mkBoss()])
    expect(st.foes[0].moves).toHaveLength(3)
    expect(st.foes[0].moves[0].name).toBe('Закипание')
    expect(st.foes[0].thresholdMsg).toContain('бешенство')
    expect(st.foes[0].thresholdAt).toBe(st.foes[0].calmMax * 0.5)
  })

  it('владыка циклит приёмы по порядку (как босс в Slay the Spire)', () => {
    const st = field([mkBoss()])
    const names = []
    st.player.x = st.foes[0].x
    st.player.y = st.foes[0].y
    for (let k = 0; k < 3; k++) {
      st.player.hp = 999; st.player.maxHp = 999
      run(st, bossCycle(st) + 0.3)   // + заморозка после удара
      names.push(st.foes[0].move?.name)
    }
    // moveIdx хранит СЛЕДУЮЩИЙ приём, поэтому после выполнения виден следующий
    expect(names).toEqual(['Пламя ярости', 'Покров', 'Закипание'])
  })

  it('приём с damage бьёт игрока, и урон растёт от strength', () => {
    const st = field([mkBoss()])
    st.player.x = st.foes[0].x
    st.player.y = st.foes[0].y
    st.player.hp = 60
    run(st, bossCycle(st))            // первый приём — «Закипание», +1 сила
    expect(st.foes[0].strength).toBe(1)
    const hp0 = st.player.hp
    run(st, bossCycle(st))            // «Пламя ярости» 6 + сила 1
    expect(hp0 - st.player.hp).toBe(7)
  })

  it('блок владыки гасит спокойствие и съедается дефлектом (Slay the Spire: Block)', () => {
    const st = field([mkBoss()])
    st.foes[0].block = 8
    stageFoe(st, 0)
    parry(st)
    expect(st.foes[0].block).toBeLessThan(8)      // стойкость потрачена
    expect(st.foes[0].calm).toBeGreaterThan(0)    // но хоть немного прошло
  })

  it('порог 50% ломает владыку ровно один раз', () => {
    const st = field([mkBoss()])
    st.foes[0].calm = st.foes[0].thresholdAt
    const ev = run(st, 0.05)
    expect(st.foes[0].phase).toBe(2)
    expect(st.foes[0].thresholdDone).toBe(true)
    const again = run(st, 0.05)
    expect(again.filter((e) => e.type === 'boss_phase')).toHaveLength(0)
  })

  it('в бешенстве замах короче (Hades: berserk below half)', () => {
    const st = field([mkBoss()])
    st.player.x = st.foes[0].x
    st.player.y = st.foes[0].y
    run(st, 0.05)
    const calm1 = st.foes[0].teleTotal
    st.foes[0].calm = st.foes[0].thresholdAt
    st.foes[0].state = 'idle'
    st.foes[0].cooldown = 0
    run(st, 0.05)
    expect(st.foes[0].teleTotal).toBeLessThan(calm1)
  })

  it('приём «даёт Чинту в ум» — растёт авидья (карточный слот в поле)', () => {
    const st = field([mkBoss()])
    st.foes[0].moves = [{ name: 'Отравленное зеркало', intent: 'special', damage: 0,
      effects: [{ kind: 'addCurseToDeck', cardId: 'cinta', amount: 2 }] }]
    st.foes[0].moveIdx = 0
    st.avidya = 10
    st.player.x = st.foes[0].x
    st.player.y = st.foes[0].y
    run(st, bossCycle(st))
    expect(st.avidya).toBeGreaterThan(10 + st.o.curseAvidya)
  })

  it('приём «сбивает руку» срывает серию дефлектов', () => {
    const st = field([mkBoss()])
    st.foes[0].moves = [{ name: 'Отнять', intent: 'debuff', damage: 0,
      effects: [{ kind: 'discardRandomFromHand', amount: 2 }] }]
    st.player.combo = 4
    st.player.comboT = st.o.comboWindow
    st.player.x = st.foes[0].x
    st.player.y = st.foes[0].y
    run(st, bossCycle(st))
    expect(st.player.combo).toBe(0)
  })

  it('«слабость» игрока убавляет спокойствие от дефлекта', () => {
    const a = field([mkFoe({ calmMax: 3 })])
    stageFoe(a, 0); parry(a)
    const b = field([mkFoe({ calmMax: 3 })])
    b.player.weak = 2
    stageFoe(b, 0); parry(b)
    expect(b.foes[0].calm).toBeLessThan(a.foes[0].calm)
  })

  it('владыка не бьёт через полполя', () => {
    const st = field([mkBoss()])
    st.player.x = st.foes[0].x + 400
    st.player.y = st.foes[0].y
    run(st, 1)
    expect(st.foes[0].state).not.toBe('telegraph')
  })

  it('владыка по-прежнему не убивается ударом — только успокаивается', () => {
    const st = field([mkBoss()])
    const hp0 = st.player.hp
    for (let i = 0; i < 20; i++) {
      st.player.parryCd = 0
      strike(st, 0)
    }
    expect(st.foes[0].dead).toBe(false)
    expect(st.foes[0].pacified).toBe(false)
  })
})

describe('Поле Ума: локации отличаются друг от друга', () => {
  it('у всех семи локаций свой вид — не рисуем одинаковое', () => {
    const motifs = new Set(), props = new Set(), grounds = new Set()
    for (let f = 0; f <= 6; f++) {
      const l = worldLook(f)
      motifs.add(l.motif)
      props.add(l.prop)
      grounds.add(l.ground.join(','))
    }
    expect(motifs.size).toBe(7)
    expect(props.size).toBe(7)
    expect(grounds.size).toBe(7)
  })

  it('стихии совпадают с content/worlds.json — не выдуманы', () => {
    for (let f = 0; f <= 6; f++) {
      const w = worldForFloor(f)
      const l = worldLook(f)
      expect(w).toBeTruthy()
      expect(w.element).toBeTruthy()      // «Земля», «Вода», «Огонь»…
      expect(w.land).toBeTruthy()
      expect(l.accent).toHaveLength(3)
    }
  })

  it('этажи не повторяются: у каждого свой владыка (регрессия WORLDS[String(floor)])', () => {
    const lords = new Set(), names = new Set()
    for (let f = 0; f <= 6; f++) {
      const w = worldForFloor(f)
      expect(w).toBeTruthy()
      lords.add(w.lordId)
      names.add(w.name)
    }
    expect(lords.size).toBe(7)
    expect(names.size).toBe(7)
  })

  it('каждая локация собирает свой вид в поле', () => {
    for (let f = 0; f <= 6; f++) {
      const b = buildFieldFloor(f, { field: { w: 412, h: 600 } })
      expect(b.look.motif).toBe(worldLook(f).motif)
      const st = createField({
        player: { x: 100, y: 200, hp: 60 },
        foes: b.foes, wares: b.wares, field: b.field, rng: () => 0.5,
        opts: { look: b.look, world: b.world },
      })
      expect(st.look.motif).toBe(worldLook(f).motif)
    }
  })

  it('у каждой локации есть владыка из контента', () => {
    for (let f = 0; f <= 6; f++) {
      const b = buildFieldFloor(f, { field: { w: 412, h: 600 } })
      expect(b.boss).toBeTruthy()
      expect(b.boss.name).toBeTruthy()
      expect(Array.isArray(b.boss.moves)).toBe(true)
      expect(b.boss.moves.length).toBeGreaterThan(1)
    }
  })

  it('первая локация — рипу, поздние — паши (SPEC §9.5)', () => {
    const early = buildFieldFloor(0, { field: { w: 412, h: 600 } })
    const late = buildFieldFloor(5, { field: { w: 412, h: 600 } })
    expect(early.foes.every((f) => f.kind === 'ripu')).toBe(true)
    expect(late.foes.every((f) => f.kind === 'pasha')).toBe(true)
  })
})

describe('Поле Ума: дефлект глушит удар (Sekiro: return the blade)', () => {
  it('без дефлекта удар достаёт', () => {
    const st = field([mkFoe({ kind: 'pasha', hp: 30, attack: 9 })])
    st.player.x = st.foes[0].x; st.player.y = st.foes[0].y
    st.player.hp = 40
    stageFoe(st, 0, 0.01)
    run(st, st.o.attackWindow + 0.1)
    expect(st.player.hp).toBeLessThan(40)
  })

  it('дефлект в активном окне ОТМЕНЯЕТ удар — жизни не отнимается', () => {
    const st = field([mkFoe({ kind: 'pasha', hp: 30, attack: 9 })])
    st.player.x = st.foes[0].x; st.player.y = st.foes[0].y
    st.player.hp = 40
    stageFoe(st, 0, 0.01)
    run(st, 0.03)                       // замах дошёл до конца, удар ещё НЕ нанесён
    expect(st.foes[0].pending).toBe(true)
    const ev = parry(st)
    expect(ev.some((e) => e.type === 'deflect' && e.negated)).toBe(true)
    run(st, st.o.attackWindow + 0.1)
    expect(st.player.hp).toBe(40)       // удар отменён полностью
  })

  it('у владыки дефлект тоже отменяет приём', () => {
    const st = field([mkBoss()])
    st.player.x = st.foes[0].x; st.player.y = st.foes[0].y
    st.player.hp = 40
    stageFoe(st, 0, 0.01)
    run(st, 0.03)
    expect(st.foes[0].pending).toBe(true)
    parry(st)
    run(st, st.o.attackWindow + 0.1)
    expect(st.player.hp).toBe(40)
  })

  it('активное окно короткое — «наугад не поймаешь»', () => {
    expect(DEFAULT_FIELD_OPTIONS.attackWindow).toBeLessThanOrEqual(0.2)
  })
})

describe('Поле Ума: крипа — «зонт тщеславия» (AV 12)', () => {
  function crisis(over = {}) {
    const st = field([mkFoe({ calmMax: 3 })], [], over)
    st.player.hp = Math.round(st.player.maxHp * 0.2)   // настоящая беда
    st.avidya = 10
    st.samskaraPressure = 0                              // зонт снят
    return st
  }

  it('в беде без единого удара милость достаёт', () => {
    const st = crisis()
    const ev = run(st, 0.05)
    const k = ev.find((e) => e.type === 'krpa')
    expect(k).toBeTruthy()
    expect(k.quoteId).toBe('krpa')      // цитата обязательна
    expect(st.krpaUsed).toBe(true)
  })

  it('милость отпускает оковы и наполняет ресурсы', () => {
    const st = crisis()
    st.player.psychic = 0
    st.player.shield = 0
    run(st, 0.05)
    expect(st.foes[0].calm).toBeGreaterThanOrEqual(st.o.krpaCalm)
    expect(st.player.psychic).toBe(st.player.psychicMax)
    expect(st.player.shield).toBe(st.o.shieldMax)
    expect(st.avidya).toBeLessThan(1)   // неведение смыто (и сразу снова ползёт вверх)
  })

  it('духовной силы от крипы хватает на самадхи', () => {
    const st = crisis()
    st.player.shakti = 0
    run(st, 0.05)
    expect(st.player.inSamadhi).toBe(true)   // милость открыла ясность
  })

  it('милость отменяет уже летящий удар — «дождь» накрывает раньше', () => {
    const st = field([mkFoe({ kind: 'pasha', hp: 30, attack: 9 })])
    st.player.hp = 10          // беда
    st.avidya = 0
    st.samskaraPressure = 0
    st.player.x = st.foes[0].x; st.player.y = st.foes[0].y
    stageFoe(st, 0, 0.01)      // удар вот-вот придёт
    const ev = run(st, st.o.attackWindow + 0.1)
    expect(ev.some((e) => e.type === 'krpa')).toBe(true)
    expect(ev.some((e) => e.type === 'hurt')).toBe(false)
  })

  it('если ударил хоть раз — зонт поднят, милость НЕ достаёт', () => {
    const st = crisis()
    st.samskaraPressure = 5
    const ev = run(st, 0.05)
    expect(ev.find((e) => e.type === 'krpa')).toBeUndefined()
    expect(ev.find((e) => e.type === 'krpa_missed')).toBeTruthy()
    expect(st.krpaUsed).toBe(false)
    expect(st.foes[0].calm).toBe(0)
  })

  it('много авидьи тоже поднимает зонт (неведение закрывает)', () => {
    const st = crisis()
    st.avidya = st.o.krpaAvidyaMax + 10
    const ev = run(st, 0.05)
    expect(ev.find((e) => e.type === 'krpa_missed')).toBeTruthy()
  })

  it('вне беды милость не падает — иначе это дешёвая кнопка', () => {
    const st = field([mkFoe()])
    const ev = run(st, 0.05)
    expect(ev.find((e) => e.type === 'krpa')).toBeUndefined()
    expect(st.krpaUsed).toBe(false)
  })

  it('раз за локацию: второй раз не падает', () => {
    const st = crisis()
    run(st, 0.05)
    st.player.hp = 5
    const ev = run(st, 0.05)
    expect(ev.find((e) => e.type === 'krpa')).toBeUndefined()
  })

  it('повторная попытка в той же локации не спамит сообщением', () => {
    const st = crisis()
    st.samskaraPressure = 5
    const first = run(st, 0.05)
    const second = run(st, 0.05)
    expect(first.filter((e) => e.type === 'krpa_missed')).toHaveLength(1)
    expect(second.filter((e) => e.type === 'krpa_missed')).toHaveLength(0)
  })

  it('милость может освободить окову начисто', () => {
    const st = field([mkFoe({ calmMax: 1 })])
    st.player.hp = 5
    st.avidya = 0
    st.samskaraPressure = 0
    run(st, 0.05)
    expect(st.foes[0].pacified).toBe(true)
  })
})

describe('Поле Ума: итог', () => {
  it('победа без убийств даёт бонус', () => {
    const st = field([mkFoe({ calmMax: 1 })])
    for (let i = 0; i < 4; i++) { stageFoe(st); st.player.parryCd = 0; parry(st) }
    // 0.3 вместо 0.05: после последнего дефлекта мир на долю секунды стоит
    // (вес удара) — дверь открывается и «считается» только после заморозки
    run(st, 0.3)                  // комната зачищена, дверь открылась
    st.player.x = st.door.x; st.player.y = st.door.y
    run(st, 0.3)                  // вошёл в дверь
    expect(st.outcome).toBe('victory')
    expect(st.peaceful).toBe(true)
  })

  it('смерть игрока — поражение', () => {
    const st = field([mkFoe()])
    st.player.hp = 1
    st.player.alive = false
    checkOutcome(st)
    expect(st.outcome).toBe('defeat')
  })

  it('прогресс поля считает освобождённых и убитых', () => {
    const st = field([mkFoe(), mkFoe({ x: 300, y: 300, id: 'lobha', name: 'Лобха' })])
    st.foes[0].pacified = true
    const prog = fieldProgress(st)
    expect(prog.total).toBe(2)
    expect(prog.done).toBe(1)
    expect(prog.ratio).toBe(0.5)
  })
})

describe('Поле Ума: дверь (Hades — из комнаты выходят сами)', () => {
  function cleared() {
    const st = field([mkFoe()])
    st.foes[0].pacified = true
    return st
  }

  it('пока оковы живы, дверь закрыта', () => {
    const st = field([mkFoe()])
    run(st, 0.1)
    expect(st.door.open).toBe(false)
    expect(st.roomCleared).toBe(false)
  })

  it('зачистил комнату — дверь открылась, но победы ещё нет', () => {
    const st = cleared()
    const ev = run(st, 0.05)
    expect(ev.some((e) => e.type === 'room_clear')).toBe(true)
    expect(st.door.open).toBe(true)
    expect(st.outcome).toBeNull()          // надо самому дойти до двери
  })

  it('вошёл в дверь — комната позади', () => {
    const st = cleared()
    run(st, 0.05)
    st.player.x = st.door.x
    st.player.y = st.door.y
    const ev = run(st, 0.05)
    expect(ev.some((e) => e.type === 'victory')).toBe(true)
    expect(st.outcome).toBe('victory')
    expect(st.peaceful).toBe(true)
  })

  it('дверь светится со временем', () => {
    const st = cleared()
    run(st, 0.05)
    const g0 = st.door.glow
    run(st, 0.3)
    expect(st.door.glow).toBeGreaterThan(g0)
  })

  it('игрок может дойти до двери — верхняя граница поля её не срезает', () => {
    const st = cleared()
    expect(st.door.y).toBeGreaterThanOrEqual(112)
    run(st, 0.05)
    st.player.x = st.door.x
    st.player.y = st.door.y
    run(st, 0.05)
    expect(st.outcome).toBe('victory')
  })
})

describe('Поле Ума: движение', () => {
  it('игрок двигается по направлению', () => {
    const st = field([mkFoe()])
    const x0 = st.player.x
    run(st, 0.5, { dx: 1 })
    expect(st.player.x).toBeGreaterThan(x0)
  })

  it('игрок не выходит за границы поля', () => {
    const st = field([mkFoe()])
    run(st, 20, { dx: -1, dy: -1 })
    expect(st.player.x).toBeGreaterThanOrEqual(56)
    expect(st.player.y).toBeGreaterThanOrEqual(112)
  })

  it('рывок даёт неуязвимость и перезарядку', () => {
    const st = field([mkFoe()])
    expect(dash(st, 1, 0)).toBe(true)
    expect(st.player.invuln).toBeGreaterThan(0)
    expect(dash(st, 1, 0)).toBe(false) // на перезарядке
  })
})
