// Тесты мастерской севы.
//
// Смысл: покупка должна ЧЕСТНО менять бой и открывать цитату.
// «Правило проекта: нет цитаты — нет усиления» проверяется здесь же.

import { describe, it, expect } from 'vitest'
import {
  WORKSHOP, workshopCost, canBuy, sevaPointsFor, applyUpgrades,
  ownedRank, maxRank, rankKey, parseRankKey, ownedCount, needsOwned,
} from '@webapp/js/core/workshop.js'
import { createField, DEFAULT_FIELD_OPTIONS, parry } from '@webapp/js/core/field.js'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const main = read('webapp/js/main.js')

describe('Мастерская севы: усиления меняют бой', () => {
  it('у каждого усиления есть цитата и цена (нет цитаты — нет усиления)', () => {
    expect(WORKSHOP.length).toBeGreaterThan(0)
    for (const u of WORKSHOP) {
      expect(u.quoteId).toBeTruthy()
      expect(u.desc).toBeTruthy()
      expect(u.cost).toBeGreaterThan(0)
      expect(typeof u.apply).toBe('function')
    }
  })

  it('у всех усилений разные id — иначе покупка ломается', () => {
    const ids = WORKSHOP.map((u) => u.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ни одно усиление не выдумывает новый слот — только меняет существующий', () => {
    const before = { ...DEFAULT_FIELD_OPTIONS }
    for (const u of WORKSHOP) {
      const after = applyUpgrades({ ...before }, [u.id])
      // появиться могут только новые ключи — их быть не должно
      const added = Object.keys(after).filter((k) => !(k in before))
      expect(added).toEqual([])
      // и что-то обязано поменяться
      const changed = Object.keys(after).filter((k) => after[k] !== before[k])
      expect(changed.length).toBeGreaterThan(0)
    }
  })

  it('владелец всех усилений получает заметно большее окно дефлекта', () => {
    const none = applyUpgrades({ ...DEFAULT_FIELD_OPTIONS }, [])
    const all = applyUpgrades({ ...DEFAULT_FIELD_OPTIONS }, WORKSHOP.map((u) => u.id))
    expect(all.parryWindow).toBeGreaterThan(none.parryWindow)
    expect(all.comboWindow).toBeGreaterThan(none.comboWindow)
    expect(all.avidyaGainIdle).toBeLessThan(none.avidyaGainIdle)
    expect(all.psychicMax).toBeGreaterThan(none.psychicMax)
  })

  it('входные опции не мутируются', () => {
    const src = { ...DEFAULT_FIELD_OPTIONS }
    applyUpgrades(src, WORKSHOP.map((u) => u.id))
    expect(src.parryWindow).toBe(DEFAULT_FIELD_OPTIONS.parryWindow)
  })

  it('купленное усиление реально меняет бой: окно дефлекта шире', () => {
    const o1 = applyUpgrades({ ...DEFAULT_FIELD_OPTIONS }, [])
    const o2 = applyUpgrades({ ...DEFAULT_FIELD_OPTIONS }, ['krpa_umbrella'])
    expect(o2.parryWindow).toBeGreaterThan(o1.parryWindow)
  })
})

describe('Мастерская севы: очки и покупка', () => {
  it('можно купить, только если хватает очков', () => {
    expect(canBuy('yama_ahimsa', 3, [])).toBe(true)
    expect(canBuy('yama_ahimsa', 2, [])).toBe(false)
  })

  it('после первого ранга открывается второй — он и есть следующая покупка', () => {
    // Раньше здесь было `canBuy(..., 99, ['yama_ahimsa']) === false`: усиление
    // было одноразовым, и второй покупки не существовало. Теперь существует
    // — и это ровно то, что даёт повод вернуться (МЕХАНИКА 46).
    //
    // Купленных должно быть ДВА: второй ранг открывается после двух
    // усилений (пятое правило рангов). С одним купленным второй ранг закрыт —
    // это проверяется отдельно, потому что «после первого открывается второй»
    // без предпосылки было бы неправдой.
    const two = ['yama_ahimsa', 'krpa_umbrella']
    expect(canBuy('yama_ahimsa', 99, two)).toBe(true)
    expect(canBuy('yama_ahimsa', 99, two, 2)).toBe(true)
    // а рангов больше трёх не бывает
    expect(canBuy('yama_ahimsa', 999, [...two, 'yama_ahimsa#2'], 3)).toBe(false)
  })

  it('второй ранг открывается не раньше двух купленных усилений', () => {
    // Предпосылка по числу купленных. Без неё мастерская — список покупок без
    // порядка, и решать нечего.
    expect(canBuy('yama_ahimsa', 999, ['yama_ahimsa'], 2), 'ранг 2 открылся при одном усилении').toBe(false)
    expect(canBuy('yama_ahimsa', 999, ['yama_ahimsa', 'krpa_umbrella'], 2)).toBe(true)
  })

  it('третий ранг требует ОБЕИХ предпосылок: своего второго и четырёх рангов', () => {
    // Проверяются по отдельности, иначе «третий ранг открыт» ничего не
    // значит: он может быть открыт только потому, что предпосылок на самом деле
    // нет никаких.
    const three = ['yama_ahimsa', 'krpa_umbrella', 'brahmacarya']   // 3 ранга
    expect(canBuy('yama_ahimsa', 999, three, 3), 'ранг 3 при трёх купленных рангах').toBe(false)
    // Четыре купленных ранга, но ни у одного нет второго: предыдущий ранг
    // СВОЕГО усиления всё равно обязателен.
    const fourNoSecond = [...three, 'niyama_shaoca']
    expect(canBuy('yama_ahimsa', 999, fourNoSecond, 3),
      'ранг 3 открылся без второго ранга своего усиления').toBe(false)
    // Свой второй ранг куплен, рангов четыре — открыто.
    const ready = [...three, 'yama_ahimsa#2', 'niyama_shaoca']        // 5 рангов
    expect(canBuy('yama_ahimsa', 999, ready, 3)).toBe(true)
    expect(needsOwned('yama_ahimsa', 1)).toBe(0)
    expect(needsOwned('yama_ahimsa', 2)).toBe(2)
    expect(needsOwned('yama_ahimsa', 3)).toBe(4)
  })

  it('предпосылка считает купленные РАНГИ, а не усиления', () => {
    // Два первых ранга одного усиления — это два купленных РАНГА. Иначе
    // предпосылка обходится одной покупкой и ничего не ограничивает.
    expect(ownedCount(['yama_ahimsa']), 'один ранг').toBe(1)
    expect(ownedCount(['yama_ahimsa', 'yama_ahimsa#2']), 'два ранга одного усиления').toBe(2)
    // Ранг 2 другого усиления требует 2 ранга — и оба они могут быть одного
    // усиления, потому что считаются ранги, а не «разные принципы».
    const two = ['yama_ahimsa', 'yama_ahimsa#2', 'niyama_tapah']
    expect(ownedCount(two)).toBe(3)
    expect(canBuy('niyama_tapah', 999, two, 2), 'ранг 2 при двух купленных рангах').toBe(true)
    // А вот при одном купленном ранге — рано, даже если это первый ранг
    // ИМЕННО ЭТОГО усиления: предпосылка про число рангов, а не про то, чей
    // это ранг.
    expect(canBuy('niyama_tapah', 999, ['niyama_tapah'], 2),
      'ранг 2 открылся при одном купленном ранге').toBe(false)
    // И второго ранга чужого усиления тоже мало.
    expect(canBuy('niyama_tapah', 999, ['yama_ahimsa'], 2)).toBe(false)
  })

  it('чужие и несуществующие ключи не считаются купленными', () => {
    // Иначе один мусор в профиле открывает все ранги.
    expect(ownedCount(['нет-такого', 'yama_ahimsa#99'])).toBe(0)
    expect(canBuy('yama_ahimsa', 999, ['нет-такого'], 2)).toBe(false)
  })

  it('предпосылка написана игроку, а не молчит', () => {
    // Правило, о котором не сказано, — ловушка, а не система.
    expect(main).toContain('нужно сначала ${needNext} усилений, у тебя ${haveCount}')
    expect(main).toContain('needsOwned(u.id, next)')
  })

  it('цена берётся из таблицы, а не из ввода игрока', () => {
    for (const u of WORKSHOP) {
      expect(workshopCost(u.id), `${u.id}: цена первого ранга`).toBe(u.cost)
      // ранг, которого нет, стоит 0 — и купить его нельзя
      expect(workshopCost(u.id, maxRank(u.id) + 1)).toBe(0)
      // каждый следующий ранг дороже предыдущего (Hades)
      for (let r = 2; r <= maxRank(u.id); r++) {
        expect(workshopCost(u.id, r), `${u.id}: ранг ${r} не дороже`).toBeGreaterThan(workshopCost(u.id, r - 1))
      }
    }
    expect(workshopCost('нет-такого')).toBe(0)
  })

  it('второй ранг нельзя купить, пропустив первый', () => {
    // Иначе игрок платит за третий ранг, не получив второго, и деньги
    // пропадают молча.
    expect(canBuy('yama_ahimsa', 99, [], 2)).toBe(false)
    expect(canBuy('yama_ahimsa', 99, [], 3)).toBe(false)
    expect(canBuy('yama_ahimsa', 99, ['yama_ahimsa'], 3)).toBe(false)
  })

  it('за честный забег очков больше, за грязный — меньше', () => {
    const clean = sevaPointsFor({
      pacified: 3, served: new Set([0, 1]), krpaUsed: true,
      foes: [{ pacified: true }, { pacified: true }, { pacified: true }],
      player: { alive: true },
    })
    const bloody = sevaPointsFor({
      pacified: 0, served: new Set(), krpaUsed: false,
      foes: [{ pacified: false, dead: true }], player: { alive: false },
    })
    expect(clean).toBeGreaterThan(bloody)
    expect(bloody).toBeGreaterThanOrEqual(0)   // не уходим в минус
  })

  it('локация без единого удара даёт больше очков, чем с ударами', () => {
    const a = sevaPointsFor({ pacified: 2, served: new Set(), foes: [{ pacified: true }, { pacified: true }], player: { alive: true } })
    const b = sevaPointsFor({ pacified: 2, served: new Set(), foes: [{ pacified: true }, { dead: true }], player: { alive: true } })
    expect(a).toBeGreaterThan(b)
  })
})

describe('Опции боя принимают усиления', () => {
  it('createField берёт psychicMax из опций', () => {
    const st = createField({
      player: { x: 0, y: 0, hp: 60 }, foes: [], rng: () => 0.5,
      opts: applyUpgrades({ playerHp: 60 }, ['brahmacarya']),
    })
    expect(st.player.psychicMax).toBe(16)
  })
})

describe('Ранги мастерской (копия из Hades, зеркало ночи)', () => {
  const allKeys = () => WORKSHOP.flatMap((u) =>
    Array.from({ length: maxRank(u.id) }, (_, i) => rankKey(u.id, i + 1)))

  it('у каждого усиления от одного до трёх рангов', () => {
    // В Hades больше трёх не бывает (редкое → героическое → легендарное).
    for (const u of WORKSHOP) {
      expect(maxRank(u.id), `${u.id}: рангов`).toBeGreaterThanOrEqual(1)
      expect(maxRank(u.id), `${u.id}: рангов`).toBeLessThanOrEqual(3)
      expect(u.ranks.length).toBe(maxRank(u.id))
    }
  })

  it('ранг 1 лежит в профиле голым id — старые сохранения не ломаются', () => {
    // У игроков в `meta.upgrades` уже лежат голые id. Если бы ранг 1 стал
    // 'id#1', все покупки у всех игроков молча исчезли бы из боя.
    expect(rankKey('yama_ahimsa', 1)).toBe('yama_ahimsa')
    expect(parseRankKey('yama_ahimsa')).toEqual({ id: 'yama_ahimsa', rank: 1 })
    expect(parseRankKey('yama_ahimsa#2')).toEqual({ id: 'yama_ahimsa', rank: 2 })
  })

  it('купленный ранг считается как ранг, а не как «есть/нет»', () => {
    expect(ownedRank('yama_ahimsa', [])).toBe(0)
    expect(ownedRank('yama_ahimsa', ['yama_ahimsa'])).toBe(1)
    expect(ownedRank('yama_ahimsa', ['yama_ahimsa', 'yama_ahimsa#2'])).toBe(2)
    expect(ownedRank('yama_ahimsa', ['yama_ahimsa#2', 'yama_ahimsa'])).toBe(2)
    // чужое усиление не считается
    expect(ownedRank('yama_ahimsa', ['krpa_umbrella#2'])).toBe(0)
  })

  it('второй ранг сильнее первого, а не заменяет его', () => {
    // Ключевая проверка: ранги применяются по порядку, 1 → 2. Если бы второй
    // просто перезаписывал первый, «ранг 2 из 2» ничего бы не давал.
    const one = applyUpgrades({ ...DEFAULT_FIELD_OPTIONS }, ['yama_ahimsa'])
    const two = applyUpgrades({ ...DEFAULT_FIELD_OPTIONS }, ['yama_ahimsa', 'yama_ahimsa#2'])
    expect(two.avidyaGainStrike).toBeLessThan(one.avidyaGainStrike)
    // и второй ранг не откатывает первый: ахимса 1 убирала удар до 2,
    // ахимса 2 — до нуля, то есть строго глубже
    expect(one.avidyaGainStrike).toBe(2)
    expect(two.avidyaGainStrike).toBe(0)
  })

  it('владелец всех рангов сильнее владельца первых', () => {
    // Общее свойство: прогресс в мастерской обязан что-то давать, иначе
    // второй ранг не стоит денег.
    const one = applyUpgrades({ ...DEFAULT_FIELD_OPTIONS }, WORKSHOP.map((u) => u.id))
    const all = applyUpgrades({ ...DEFAULT_FIELD_OPTIONS }, allKeys())
    expect(all.parryWindow).toBeGreaterThan(one.parryWindow)
    expect(all.avidyaGainIdle).toBeLessThan(one.avidyaGainIdle)
    expect(all.psychicMax).toBeGreaterThan(one.psychicMax)
    expect(all.dashCooldown).toBeLessThan(one.dashCooldown)
  })

  it('даже все ранги не выдумывают новых слотов боя', () => {
    // Тот же закон, что и для первых рангов: меняем существующее, не вводим
    // новое (AGENTS.md §2).
    const before = { ...DEFAULT_FIELD_OPTIONS }
    const after = applyUpgrades({ ...before }, allKeys())
    expect(Object.keys(after).filter((k) => !(k in before))).toEqual([])
  })

  it('числа рангов не превращаются в NaN', () => {
    const o = applyUpgrades({ ...DEFAULT_FIELD_OPTIONS }, allKeys())
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'number') expect(Number.isFinite(v), `${k} = ${v}`).toBe(true)
    }
  })

  it('забитый профиль не проходит в минус и не ломает бой', () => {
    const o = applyUpgrades({ ...DEFAULT_FIELD_OPTIONS }, [...allKeys(), 'нет-такого', 'yama_ahimsa#99'])
    expect(o.parryWindow).toBeGreaterThan(0)
    expect(Number.isFinite(o.psychicMax)).toBe(true)
  })
})
