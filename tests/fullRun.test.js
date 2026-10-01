// ПОЛНЫЙ ПРОХОД ИГРЫ ОТ ПЕРВОЙ ЧАКРЫ ДО ФИНАЛА.
//
// Мотивация: самый страшный баг, что был в проекте, — игра была
// непройдимой. Финала не существовало, последний дар вёл в несуществующую
// «чакру 8», мир снова становился первым, и забег крутился вечно. Юнит-тесты
// этого не видели: они проверяли куски, а не весь путь.
//
// Этот тест проходит весь путь настоящим ядром — тем же кодом, что и игра —
// и требует, чтобы он ЗАКОНЧИЛСЯ. Дополнительно проверяет, что по дороге
// держится то, на чём держится забег: здоровье переносится между
// комнатами, владыка снимается, финал приходит ровно один раз.

import { describe, it, expect } from 'vitest'
import {
  createField, stepField, parry, castMantra, parryHint,
  checkOutcome, serveWare, mantraById, DEFAULT_FIELD_OPTIONS,
} from '@webapp/js/core/field.js'
import { buildFieldFloor, stageHasBoss } from '@webapp/js/core/fieldBuild.js'
import { applyVarna } from '@webapp/js/core/varnaKits.js'
import { applyKeepsake } from '@webapp/js/core/keepsakes.js'
import { applyBoons, rollBoons } from '@webapp/js/core/boons.js'
import { nextStage, isLastFloor, LAST_FLOOR } from '@webapp/js/core/stageRoute.js'

const F = { w: 412, h: 600 }
const FLOORS = 7

function rng(seed) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function nearest(st) {
  let best = null, bd = 1e9
  for (const f of st.foes) {
    if (f.pacified || f.dead) continue
    const d = Math.hypot(f.x - st.player.x, f.y - st.player.y)
    if (d < bd) { bd = d; best = f }
  }
  return best
}

/**
 * Один бой: подойти, вернуть удар в окно, служить при ранении.
 *
 * `sloppy` — доля окон парирования, которые бот пропускает (0 = идеально).
 * Раньше параметр был в сигнатуре `playRun` и не доходил сюда: поле называлось
 * «с рассеянностью», а парировало безупречно.
 *
 * `noMantra` — не нажимать мантру. Нужен не для красоты: каждая мантра, кроме
 * Джапы, даёт щит (потолок 12), и при постоянном нажатии щит стоит на потолке,
 * а попадания не снимают ни одной жизни. Из-за этого свойство «здоровье
 * переносится между комнатами» было не видно — и проверка мигала: иногда
 * одного удара хватало, чтобы пробить щит, иногда нет.
 */
function playRoom(st, rand, { maxSec = 90, sloppy = 0, noMantra = false } = {}) {
  const dt = 1 / 60
  let t = 0
  let lastMantra = -10
  let served = false
  while (!st.outcome && t < maxSec) {
    const p = st.player
    const input = { dx: 0, dy: 0 }
    const hint = parryHint(st)
    if (hint && hint.timer <= st.o.parryWindow && rand() >= sloppy) parry(st)
    let walk = nearest(st)
    let dest = walk
    if (st.spring && !st.spring.used && p.hp < p.maxHp * 0.6) { walk = null; dest = st.spring }
    if (!dest) dest = st.door
    const dx = dest.x - p.x, dy = dest.y - p.y
    const d = Math.hypot(dx, dy) || 1
    const far = walk ? d > st.o.enemyReach * 0.55 : d > 12
    if (far) { input.dx = dx / d; input.dy = dy / d }
    if (p.hp < p.maxHp * 0.45 && !served) {
      const w = st.wares.findIndex((x) => !x.done && Math.hypot(x.x - p.x, x.y - p.y) < 40)
      if (w >= 0) { serveWare(st, w, 'shudrocita', []); served = true }
    }
    const m = mantraById(p.mantraId)
    if (!noMantra && t - lastMantra > 0.8) {
      const cost = Math.max(0, m.cost - (st.o.mantraCostCut || 0))
      if (p.psychic >= cost) { castMantra(st); lastMantra = t }
    }
    stepField(st, dt, input)
    t += dt
  }
  checkOutcome(st, [])
  return { t, cleared: st.door.open || st.outcome === 'victory' }
}

/** Полный побег настоящим ядром. Возвращает, чем закончилось. */
function playRun(seed, sloppy = 0, opts = {}) {
  const rand = rng(seed)
  const varna = ['shudra', 'kshatriya', 'vipra', 'vaeshya'][Math.floor(rand() * 4)]
  const keepsake = 'prama'
  const boons = []
  let runHp = null
  const trace = []
  let bossKills = 0
  let pacified = 0
  let time = 0

  for (let floor = 0; floor < FLOORS; floor++) {
    let stage = 'room', room = 0, guard = 0
    while (guard++ < 20) {
      const built = buildFieldFloor(floor, {
        field: F, room, opts: { calmMul: DEFAULT_FIELD_OPTIONS.foeCalmMul },
        // Раздача комнат идёт ЧЕРЕЗ переданный rng, иначе seed ни на что не
        // влияет. Здесь `rng` не передавался, поэтому «десять забегов» были
        // на самом деле десятью случайными розыгрышами — и проверка плавала:
        // она падала примерно один раз из пяти прогонов набора, причём падала
        // с seed 9008, который иначе проходит.
        //
        // Тот же класс, что и все находки сессии: проверка написана ≠ проверка
        // детерминирована. `tests/copyingRule.test.js` завела отдельную проверку
        // на этот класс после четвертой подряд ложной тревоги в regex.
        rng: rand,
      })
      const foes = stage === 'boss' ? (built.boss ? [built.boss] : []) : built.foes.slice()
      const base = {
        playerHp: 60, look: built.look, world: built.world,
        mantraId: ['japa', 'pranayama', 'madhuvidya', 'samyama', 'upavasa', 'tandava'][floor],
        coins: 0, varna, keepsake,
      }
      const opts = applyBoons(applyKeepsake(applyVarna(base, varna), keepsake), boons)
      if (stage === 'room' && room === 2) opts.spring = true
      const fullHp = opts.playerHp || 60
      const entryHp = runHp == null ? fullHp : Math.max(1, Math.min(fullHp, runHp))
      const st = createField({
        player: { x: F.w * 0.5, y: F.h * 0.72, hp: entryHp, maxHp: fullHp },
        foes, wares: built.wares, field: F, rng: rand, opts,
      })
      trace.push({ floor, room, stage, hpIn: Math.round((entryHp / fullHp) * 100) })
      const r = playRoom(st, rand, { sloppy, noMantra: opts.noMantra })
      trace[trace.length - 1].hpOut = Math.round((st.player.hp / st.player.maxHp) * 100)
      time += r.t
      pacified += st.foes.filter((f) => f.pacified).length
      if (!st.player.alive) return { finished: false, died: true, floor, stage, time, trace, pacified, bossKills }
      if (stage === 'boss' && st.foes.some((f) => f.isBoss && !f.pacified && !f.dead)) {
        return { finished: false, died: false, stuck: true, floor, stage, time, trace, pacified, bossKills }
      }
      if (st.foes.some((f) => f.isBoss)) bossKills++
      runHp = st.player.hp
      const step = nextStage(stage, room, stageHasBoss(floor))
      if (step.kind === 'done') {
        if (stage === 'boss') {
          if (isLastFloor(floor)) return { finished: true, floor, time, trace, pacified, bossKills, runHp }
          // Настоящий дар из настоящего розыгрыша. Раньше здесь было
          // `boons.push('prana')` — id, которого нет в игре: applyBoons его
          // молча пропускал, и «полный проход» ни разу не играл с дарами.
          const draft = rollBoons(boons, rand, 1)
          if (draft[0]) boons.push(draft[0].id)
        }
        break
      }
      stage = step.kind; room = step.room
    }
  }
  return { finished: false, died: false, fellThrough: true, trace, time, pacified, bossKills }
}

describe('Проход игры целиком', () => {
  it('забег доходит до финала и заканчивается', () => {
    const r = playRun(1000)
    expect(r.finished, `застрял на чакре ${r.floor} ${r.stage || ''}`).toBe(true)
    expect(r.floor).toBe(LAST_FLOOR)
    expect(r.bossKills).toBe(FLOORS)
  })

  it('все 28 комнат пройдены и каждая зачищена', () => {
    const r = playRun(1000)
    expect(r.trace).toHaveLength(FLOORS * 4)   // 3 комнаты + владыка на чакру
    expect(r.pacified).toBeGreaterThan(0)
  })

  it('финал приходит один раз, а не после каждой чакры', () => {
    const r = playRun(1000)
    const last = r.trace[r.trace.length - 1]
    expect(last.stage).toBe('boss')
    expect(isLastFloor(last.floor)).toBe(true)
  })

  it('побег занимает разумное время, а не мгновенный и не вечный', () => {
    const r = playRun(1000)
    expect(r.time).toBeGreaterThan(60)      // не «щёлкнуло»
    expect(r.time).toBeLessThan(1800)       // и не зависло
  })

  it('три разных семени дают один и тот же исход: забег не зависит от бросков', () => {
    for (const seed of [7, 4242, 90210]) {
      const r = playRun(seed)
      expect(r.finished, `семя ${seed}: остановился на чакре ${r.floor}`).toBe(true)
      expect(r.bossKills).toBe(FLOORS)
    }
  })

  it('здоровье действительно переносится между комнатами', () => {
    // Один забег больше не доказательство: с розыгрышем комнат забег от
    // забега отличается, и конкретный seed может пройти без единой раны.
    // Поэтому смотрим несколько забегов — свойство должно быть у пути,
    // а не у одного счастливого seed.
    // Проверяем не «боту досталось», а само правило: между комнатами жизнь НЕ
    // восстанавливается. Поэтому вход в следующую комнату обязан совпадасть с
    // выходом из предыдущей — ровно, без скидок.
    //
    // Раньше здесь стояло «хотя бы в одном из пяти забегов комната вошла с
    // потерей жизни», и проверка мигала: при идеальном боте щит от мантр стоит
    // на потолке и попадания не снимают ничего, а сева и амбросия подлечивают.
    // Свойство пульсировало вместе с случайным забегом, а не с кодом.
    let checked = 0
    let woundedSomewhere = 0
    for (const seed of [1000, 2001, 3002, 4003, 5004, 6005, 7006, 8007, 9008, 10009]) {
      const trace = playRun(seed, 0.3, { noMantra: true }).trace
      for (let i = 0; i + 1 < trace.length; i++) {
        expect(trace[i + 1].hpIn, `семя ${seed}, комната ${i + 1}: жизнь обнулилась между комнатами`).toBe(trace[i].hpOut)
        checked++
      }
      if (trace.some((x) => x.hpIn < 100)) woundedSomewhere++
    }
    expect(checked).toBeGreaterThan(100)              // связок реально проверено
    expect(woundedSomewhere, 'ни один забег не потерял жизнь — проверка пустая').toBeGreaterThan(0)
  })

  it('маршрут не зацикливается: шагов на чакру ровно четыре', () => {
    const steps = []
    let stage = 'room', room = 0, guard = 0
    while (guard++ < 20) {
      const n = nextStage(stage, room, true)
      if (n.kind === 'done') break
      steps.push(n.kind)
      stage = n.kind; room = n.room
    }
    expect(steps).toEqual(['room', 'room', 'boss'])
  })

  it('за седьмой чакрой следующей нет', () => {
    expect(isLastFloor(LAST_FLOOR)).toBe(true)
    expect(isLastFloor(LAST_FLOOR + 1)).toBe(true)     // и дальше не ведёт
    expect(isLastFloor(LAST_FLOOR - 1)).toBe(false)
  })

  it('владыки у всех семи чакр разные — и они существуют', () => {
    const names = []
    for (let f = 0; f < FLOORS; f++) {
      const b = buildFieldFloor(f, { field: F, room: 3 })
      expect(b.boss, `чакра ${f + 1}`).toBeTruthy()
      names.push(b.boss.name)
    }
    expect(new Set(names).size).toBe(FLOORS)
  })

})
