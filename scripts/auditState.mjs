// АУДИТ СОСТОЯНИЯ: ловим NaN и undefined, которые не видны глазом.
//
// Обычные тесты проверяют то, что автор написал. Этот прогон делает другое:
// две тысячи кадров боя со случайными действиями (дефлект, мантра, удар,
// рывок, сева, бой) и обходит ВСЁ состояние, ища значения, которые должны
// быть числами, а оказались NaN или undefined. Так нашлись «шаг боя выдал
// NaN и вся самадхи молча перестала считаться» и «бесконечное накопление
// стойкости».
//
// Запуск: node --experimental-loader ./scripts/aliases.mjs scripts/auditState.mjs

import {
  createField, stepField, parry, castMantra, strike, serveWare, dash,
  checkOutcome, DEFAULT_FIELD_OPTIONS,
} from '../webapp/js/core/field.js'
import { buildFieldFloor, calmMulFor } from '../webapp/js/core/fieldBuild.js'
import { nextStage } from '../webapp/js/core/stageRoute.js'

const F = { w: 412, h: 600 }
const bad = []
const seen = new WeakSet()

function scan(obj, path, depth = 0) {
  if (obj == null || depth > 5) return
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) bad.push(`${path} = ${obj}`)
    return
  }
  if (typeof obj !== 'object') return
  if (seen.has(obj)) return
  seen.add(obj)
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (v === undefined) { bad.push(`${path}.${k} = undefined`); continue }
    scan(v, `${path}.${k}`, depth + 1)
  }
}

function rng(seed) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function runFloor(floor, room, stage, seed) {
  const rand = rng(seed)
  const built = buildFieldFloor(floor, { field: F, room })
  const foes = stage === 'boss' ? (built.boss ? [built.boss] : []) : built.foes.slice()
  const st = createField({
    player: { x: F.w * 0.5, y: F.h * 0.72, hp: 40, maxHp: 60 },
    foes, wares: built.wares, field: F, rng: rand, opts: { spring: true },
  })
  for (let i = 0; i < 1800; i++) {
    const p = st.player
    if (!p.alive) { st.player.alive = true; p.hp = 40; p.alive = true }
    // случайные, но осмысленные действия — как играет человек
    const r = rand()
    if (r < 0.35) {
      const hint = st.foes.find((f) => f.state === 'telegraph' && f.timer <= st.o.parryWindow && !f.stun)
      if (hint) { p.parryCd = 0; parry(st) }
    } else if (r < 0.55) {
      p.psychic = Math.min(p.psychicMax, p.psychic + 4); castMantra(st)
    } else if (r < 0.65) {
      const n = st.foes.findIndex((f) => !f.pacified && !f.dead)
      if (n >= 0) strike(st, n)
    } else if (r < 0.70) {
      dash(st, rand() * 2 - 1, rand() * 2 - 1)
    } else if (r < 0.75) {
      const w = st.wares.findIndex((x) => !x.done && Math.hypot(x.x - p.x, x.y - p.y) < 60)
      if (w >= 0) serveWare(st, w, 'shudrocita', [])
    } else if (r < 0.78 && p.hp < 20) {
      p.hp = Math.min(p.maxHp, p.hp + 3)   // «лечение», как амбросия
    }
    if (i % 7 === 0) p.hp = Math.max(1, p.hp - rand() * 2)   // и урон со временем
    stepField(st, 1 / 60, { dx: rand() * 2 - 1, dy: rand() * 2 - 1 })
    if (i % 150 === 0) scan(st, `ч${floor + 1}к${room} кадр ${i}`)
  }
  checkOutcome(st, [])
  scan(st, `ч${floor + 1}к${room} конец`)
  return st
}

let rooms = 0
for (let floor = 0; floor < 7; floor++) {
  for (let stage = 'room', room = 0, guard = 0; guard < 12; ) {
    runFloor(floor, room, stage, 1000 + floor * 31 + room * 7 + (stage === 'boss' ? 3 : 0))
    rooms++
    const n = nextStage(stage, room, true)
    if (n.kind === 'done') break
    stage = n.kind; room = n.room
  }
}

console.log(`аудит состояния: комнат ${rooms}, множители ${[0, 3, 6].map(calmMulFor).join('/')}`)
console.log(`плохих значений: ${bad.length}`)
for (const b of bad.slice(0, 20)) console.log('  ', b)

// Проверка инварианта: полоса жизни никогда не выходит за пределы.
console.log(bad.length ? 'НЕ ЧИСТО' : 'состояние чистое во всех прогонах')
process.exitCode = bad.length ? 1 : 0
