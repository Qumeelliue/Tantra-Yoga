// ПРОКЛЯТИЕ ХАОС-ПУТИ ДЕЙСТВИТЕЛЬНО УДВАИВАЕТ УРОН.
//
// Обещание «урон по тебе удвое» стоит на двери. В первой версии двери проклятие
// писалось в величину, которую никто не читал: дверь обещала и не давала. Здесь
// обещание проверяется ЧИСЛОМ, а не строкой кода: одинаковый удар без проклятия и
// с ним обязаны дать разный урон.
//
// Замер идёт через НАСТОЯЩУЮ комнату (`buildFieldFloor`) и настоящий шаг боя
// (`stepField`), а не через подставного врага: выдуманный враг бьёт по своим
// правилам и проверил бы не игру.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createField, stepField, DEFAULT_FIELD_OPTIONS } from '@webapp/js/core/field.js'
import { buildFieldFloor } from '@webapp/js/core/fieldBuild.js'
import { mulberry32 } from '@webapp/js/core/engine.js'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

/** Первый же удар настоящей оки: сколько жизни снято. */
const firstHitDamage = (cursed) => {
  // Паша, а не рипу: рипу в Поле Ума НЕ РАНИТ ВООБЩЕ — он сбивает Ци и гонит
  // (`field.js`: «Рипу не ранит»). Первая версия замера взяла первую чакру, где
  // оковы-рипу, и честно получила «урон 0» — то есть замер обещаний удвоения
  // молчал бы, ничего не проверяя.
  const built = buildFieldFloor(4, { rng: mulberry32(7), room: 0 })
  // Игрок ставится ВПРИТЫК к оке, а не в вход локации: ока подходит на
  // расстояние около 56 пикселей и дальше не идёт (у неё есть «своя дистанция»),
  // а бьёт только с `reach` = 40. Из входа бой не начинался вообще.
  const foe = built.foes.find((f) => f.kind === 'pasha') || built.foes[0]
  const st = createField({
    player: { x: foe.x + 12, y: foe.y + 12, hp: 9999, maxHp: 9999 },
    foes: built.foes.slice(),
    field: built.field,
    rng: mulberry32(11),
    opts: { ...DEFAULT_FIELD_OPTIONS },
  })
  // Проклятие ставится ДО боя — ровно так, как это делает хаос-путь
  // (`st.player.chaosCurse`).
  st.player.chaosCurse = cursed
  st.player.invuln = 0
  const hp0 = st.player.hp
  const ev = []
  for (let i = 0; i < 900 && st.player.hp === hp0; i++) stepField(st, 1 / 60, ev)
  return hp0 - st.player.hp
}

describe('Хаос-путь удваивает урон — обещание на двери', () => {
  it('с проклятием урон вдвое больше, чем без него', () => {
    const plain = firstHitDamage(false)
    const cursed = firstHitDamage(true)
    expect(plain, 'обычный удар не снял ничего — замер ничего не меряет').toBeGreaterThan(0)
    expect(cursed).toBe(plain * DEFAULT_FIELD_OPTIONS.chaosDamage)
  })

  it('поле показывает проклятие игроку, а не молчит о нём', () => {
    // Проклятие, о котором не сказано, — то же враньё, что дверь без значка.
    expect(read('webapp/js/ui/screens/field.js')).toContain('хаос ×2')
  })

  it('удвоение считается ДО щита, и это зафиксировано', () => {
    // Если бы удвоение шло после щита, щит держал бы вдвое лучше, и «урон
    // удвоен» означало бы разное при разном щите. Проверяется порядок строк.
    const core = read('webapp/js/core/field.js')
    const chaos = core.indexOf('if (p.chaosCurse) dmg *= st.o.chaosDamage')
    const shield = core.indexOf('const absorbed = Math.min(p.shield, Math.max(0, dmg))')
    expect(chaos, 'удвоение не найдено').toBeGreaterThan(-1)
    expect(shield, 'щит не найден').toBeGreaterThan(-1)
    expect(chaos, 'удвоение должно идти ДО щита').toBeLessThan(shield)
  })

  it('проклятие ставится из хаос-пути и из двери — оба пути', () => {
    const core = read('webapp/js/core/field.js')
    const main = read('webapp/js/main.js')
    // Хаос-дверь в бою (старая механика) и хаос-путь среди дверей (новая).
    expect(core).toContain('st.player.chaosCurse = true')
    expect(main).toContain('app.runChaos = true')
    expect(main).toContain('if (app.runChaos) st.player.chaosCurse = true')
  })
})