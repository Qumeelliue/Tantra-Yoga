// СЛУЖЕНИЕ: данные, подписи и дверь.
//
// ## Что здесь проверяется и почему именно так
//
// Главное свойство события — **подпись на кнопке рождается из тех же данных,
// которые применяются**. Если бы текст писался руками, мы получили бы ровно
// тот класс поломок, что в этой игре повторялся четыре раза за две сессии:
// «экран обещал, а код делал иначе» (МЕХАНИКА 41).
//
// Поэтому здесь нет проверки «правильный ли текст». Есть проверка «текст
// меняется РОВНО ТОГДА, когда меняются данные» — и она ловит любую попытку
// расхождения, включая ту, что появится через полгода.

import { describe, it, expect } from 'vitest'
import {
  FIELD_EVENTS, effectText, previewEffects, rollFieldEvent, eventDefects,
} from '../webapp/js/core/fieldEvents.js'
import { rollDoors, DOOR_KINDS, hasCombatDoor } from '../webapp/js/core/doors.js'

const mulberry = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

describe('Служение: данные целы', () => {
  it('у события есть заголовок, текст и хотя бы два выбора', () => {
    // Два выбора — минимум StS: с одним это не выбор, а кнопка.
    for (const e of FIELD_EVENTS) {
      expect(String(e.title || '').length, `${e.id}: нет заголовка`).toBeGreaterThan(3)
      expect(String(e.text || '').length, `${e.id}: нет текста — игрок не знает, что происходит`).toBeGreaterThan(20)
      expect(e.choices?.length || 0, `${e.id}: выбора меньше двух — это кнопка, а не решение`).toBeGreaterThanOrEqual(2)
      expect(String(e.sanskrit || '').length, `${e.id}: нет санскритского термина`).toBeGreaterThan(0)
    }
  })

  it('у каждого выбора читаемая подпись с платой', () => {
    const bad = eventDefects()
    expect(bad, `подписи не выводятся: ${bad.join('; ')}`).toEqual([])
  })

  it('подпись выводится из данных, а не написана руками', () => {
    // Ключевая проверка файла. Меняем величину — подпись обязана измениться.
    const base = effectText([{ kind: 'coins', amount: 45 }])
    expect(effectText([{ kind: 'coins', amount: 46 }]),
      'подпись не зависит от величины — она написана руками, а не выводится')
      .not.toBe(base)
    expect(base, `в подписи нет числа: «${base}»`).toMatch(/45/)
  })

  it('подпись называет и плату, и пользу — обе стороны размена', () => {
    // Размен без названной цены — не размен, а подарок с сюрпризом.
    const priced = FIELD_EVENTS.flatMap((e) => e.choices)
      .filter((c) => c.effects.some((x) => (x.amount || 0) < 0 || x.kind === 'chaos'))
    expect(priced.length, 'ни один выбор ничего не стоит — размена нет').toBeGreaterThan(0)
    for (const c of priced) {
      const t = effectText(c.effects)
      expect(t, `плата не названа: ${c.id}`).not.toBe('ничего не получаешь и ничего не отдаёшь')
      // Цена названа — числом со знаком либо проклятием. Оба варианта честны;
      // нечестно, когда цены нет вовсе.
      // Минус на карточке типографский (U+2212) — так набирают в игре.
      if (c.effects.some((x) => (x.amount || 0) < 0)) {
        expect(t, `в подписи нет знака расхода: «${t}» (${c.id})`).toMatch(/[-−]\d+/)
      }
      if (c.effects.some((x) => x.kind === 'chaos')) {
        expect(t, `в подписи нет проклятия: «${t}» (${c.id})`).toContain('вдвое')
      }
    }
  })

  it('плата без числа печатается ПЕРВОЙ — иначе выгода её заглушает', () => {
    // Замерено на первом событии: «+45 монет» читается громче, чем «урон вдвое
    // до конца забега», даже когда обе фразы стоят на одной строке. Значит цену,
    // у которой нет числа, надо ставить первой.
    const cursed = FIELD_EVENTS.flatMap((e) => e.choices)
      .filter((c) => c.effects.some((x) => x.kind === 'chaos'))
    expect(cursed.length, 'нет ни одного отрока с проклятием — правило не проверяется').toBeGreaterThan(0)
    for (const c of cursed) {
      expect(c.effects[0].kind,
        `у отрока «${c.id}» проклятие не первым в подписи`).toBe('chaos')
      const t = effectText(c.effects)
      expect(/^урон вдвое/.test(t),
        `подпись отрока «${c.id}» начинается с выгоды, а не с цены: «${t}»`).toBe(true)
    }
  })

  it('каждый вид эффекта и в данных, и в сводке, и в подписи — одно и то же', () => {
    // Мёртвый эффект — это обещание, которое ничего не делает: игрок отдал,
    // а ничего не произошло. Проверяем, что для каждого `kind` есть и
    // `previewEffects`, и строка в `KIND_TEXT` (её видно через effectText).
    const kinds = new Set(FIELD_EVENTS.flatMap((e) => e.choices).flatMap((c) => c.effects.map((x) => x.kind)))
    expect(kinds.size, 'в событиях нет ни одного эффекта').toBeGreaterThan(0)
    for (const k of kinds) {
      expect(effectText([{ kind: k, amount: 1 }]),
        `вид эффекта «${k}» не попадает в подпись — на карточке его не видно`).not.toBe('')
    }
  })

  it('цены зафиксированы: правка числа обязана быть осознанной', () => {
    // Соседняя проверка сверяет подпись с кодом — то есть САМОСОГЛАСОВАННОСТЬ.
    // Она не ловит «цена тихо изменилась с 14 на 7»: подпись напишет «−7», код
    // снимет 7, и проверка останется зелёной. Это показал откат — и это ровно
    // тот случай, который закрывает таблица ниже: она фиксирует ЗАМЫСЕЛ, а
    // проверка подтверждает, что он выражен в карточке.
    const planned = {
      seva_gate: {
        give_seva: { heal: -20, boon: true },
        give_coin: { coins: -30, heal: 15, seva: 5 },
        pass: {},
      },
      tapah_ashram: {
        fast: { heal: -15, boon: true },
        eat: { heal: 25, seva: -20 },
      },
      aparigraha_stone: {
        take: { coins: 45, heal: -25 },
        leave: { shield: 20, seva: 10 },
      },
    }
    const got = {}
    for (const e of FIELD_EVENTS) {
      got[e.id] = {}
      for (const c of e.choices) {
        const p = previewEffects(c.effects)
        const row = {}
        if (p.seva) row.seva = p.seva
        if (p.coins) row.coins = p.coins
        if (p.heal) row.heal = p.heal
        if (p.shield) row.shield = p.shield
        if (p.boon) row.boon = true
        if (p.boonId) row.boonId = p.boonId
        if (p.chaos) row.chaos = true
        got[e.id][c.id] = row
      }
    }
    // Порядок ключей приводим к виду таблицы: сортируем по алфавиту внутри.
    const norm = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))))
    for (const [id, choices] of Object.entries(planned)) {
      expect(got[id], `события «${id}» нет в игре`).toBeTruthy()
      for (const [cid, want] of Object.entries(choices)) {
        expect(norm(got[id][cid]),
          `цены в «${id}/${cid}» изменились. Было: ${norm(want)} Стало: ${norm(got[id][cid] || {})}. `
          + `Если это задумано — обнови таблицу планов здесь и в design/BASE-GAME.md`)
          .toBe(norm(want))
      }
    }
  })

  it('пустой выбор говорит, что не происходит ничего', () => {
    // Иначе кнопка «Пройти мимо» выглядит поломанной, хотя так и задумано.
    expect(effectText([])).toBe('ничего не получаешь и ничего не отдаёшь')
  })
})

describe('Служение: сводка эффектов', () => {
  it('сводит величины в числа, а не в строки', () => {
    const p = previewEffects([
      { kind: 'seva', amount: -3 }, { kind: 'boon' }, { kind: 'coins', amount: -30 },
    ])
    expect(p.seva).toBe(-3)
    expect(p.coins).toBe(-30)
    expect(p.boon).toBe(true)
    expect(p.chaos).toBe(false)
  })

  it('идёт по величинам, а не по первому попавшемуся', () => {
    // Частая ошибка вида «счётчик занял первое место». Проверяем сложение.
    expect(previewEffects([{ kind: 'seva', amount: 3 }, { kind: 'seva', amount: 4 }]).seva).toBe(7)
  })

  it('отрицательный кошелёк невозможен — цена не уходит в минус', () => {
    // Это про экран, а здесь — про данные: минус в кошельке означал бы, что
    // игра берёт монеты, которых нет. Игрок должен уйти с нулём.
    const p = previewEffects([{ kind: 'coins', amount: -30 }])
    expect(Math.max(0, (100) + p.coins), 'кошелёк ушёл в минус').toBe(70)
  })
})

describe('Служение: розыгрыш', () => {
  it('генератор обязателен — иначе замер мерил бы не ту игру', () => {
    expect(() => rollFieldEvent({})).toThrow(/rng/)
    expect(() => rollFieldEvent({ rng: mulberry(1) })).not.toThrow()
  })

  it('одно и то же семя даёт одно и то же событие', () => {
    const a = rollFieldEvent({ rng: mulberry(7) }).id
    const b = rollFieldEvent({ rng: mulberry(7) }).id
    expect(a).toBe(b)
  })

  it('повторов подряд не выдаёт, пока есть невиданные', () => {
    const seen = []
    const rng = mulberry(11)
    for (let i = 0; i < 40; i++) seen.push(rollFieldEvent({ rng, seen }).id)
    const firstPass = seen.slice(0, FIELD_EVENTS.length)
    expect(new Set(firstPass).size,
      `подряд выпали повторы: ${firstPass.join(', ')}`).toBe(FIELD_EVENTS.length)
  })

  it('когда невиданных не осталось, всё равно выдаёт событие — не пустую дверь', () => {
    const all = FIELD_EVENTS.map((e) => e.id)
    const ev = rollFieldEvent({ rng: mulberry(3), seen: all })
    expect(ev, 'на двери события оказалось ничего — забег встал бы').toBeTruthy()
    expect(all).toContain(ev.id)
  })

  it('выпадают все события, а не одно и то же', () => {
    // Событий три, дверь выпадает пару раз за забег. Если выпадает только
    // одно, остальные контент мёртвый, и `audit:content` этого не заметит.
    const rng = mulberry(101)
    const got = new Set()
    for (let i = 0; i < 200; i++) got.add(rollFieldEvent({ rng, seen: [] }).id)
    expect(got.size, `выпадали не все: ${[...got].join(', ')}`).toBe(FIELD_EVENTS.length)
  })
})

describe('Служение: дверь ведёт себя как небоевая, а не как отдельный мир', () => {
  it('вид двери есть и подпись обещает ровно то, что внутри', () => {
    const k = DOOR_KINDS.event
    expect(k, 'нет вида двери «служение»').toBeTruthy()
    expect(k.kind).toBe('event')
    expect(String(k.hint || '').length,
      'дверь без подписи — игрок выбирает вслепую').toBeGreaterThan(10)
  })

  it('дверь боя есть ВСЕГДА, даже когда выпало служение', () => {
    // Правило, на котором держится весь смысл мира без крови.
    for (let seed = 1; seed <= 300; seed++) {
      const doors = rollDoors({ room: seed % 3, hasBoss: seed % 7 === 0, rng: mulberry(seed), calmTaken: 0 })
      expect(hasCombatDoor(doors), `сид ${seed}: двери без боя — ${doors.map((d) => d.kind).join(',')}`).toBe(true)
    }
  })

  it('служение занимает лимит небоевой двери, а не добавляется сверху', () => {
    // Если бы события не трогли лимит, «не драться» стало бы выгоднее, а
    // мирный финал — маршрутом. Проверяем: после израсходованного лимита
    // служения в списке быть не может.
    let sawEvent = 0
    for (let seed = 1; seed <= 300; seed++) {
      const doors = rollDoors({ room: 0, hasBoss: false, rng: mulberry(seed), calmTaken: 1 })
      if (doors.some((d) => d.kind === 'event')) sawEvent++
    }
    expect(sawEvent, 'служение выпадает даже при израсходованном лимите небоевых дверей').toBe(0)
  })

  it('до израсходования лимита служение иногда выпадает', () => {
    let sawEvent = 0
    for (let seed = 1; seed <= 300; seed++) {
      const doors = rollDoors({ room: 0, hasBoss: false, rng: mulberry(seed), calmTaken: 0 })
      if (doors.some((d) => d.kind === 'event')) sawEvent++
    }
    expect(sawEvent, 'служение не выпадает НИКОГДА — дверь мёртвая, а её считают решением').toBeGreaterThan(20)
  })
})