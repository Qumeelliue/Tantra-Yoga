// СКОРОСТЬ РОСТА МЕНТАЛЬНОСТЕЙ (2026-09-30, сессия 25 ч.7).
//
// Зачем отдельный скрипт. Правила начисления очков ментальности в Поле Ума
// живут в `main.js` (`floorVarnaFood`), и посчитать их руками — значит
// завести ещё одну копию правил, которая однажды разойдётся с игрой. Здесь
// берётся **настоящий забег** — `playRun` из `fieldBalance.mjs` — и по нему
// считается, сколько очков набрала каждая ментальность.
//
// Проверяется ровно одно: сколько забегов нужно, чтобы дойти до последней
// ступени. Если лестница вырождается в одну ступень (за один забег) или
// растёт месяцами — поломка, и поломка тихая: числа на экране выглядят
// правдоподобно. Именно это и случилось в первой версии правил: счёт «по
// комнате» давал 56 очков смелости за забег при пороге третьей ступени 18 —
// вся лестница из четырёх ступеней падала на первый забег.
//
// ФАКТЫ БЕРУТСЯ ИЗ БОЯ, а не выдумываются. Первая версия этого скрипта
// рисовала «есть ли кровь» и «была ли сева» генератором случайных чисел. Это
// был замер вымысла, названный замером игры.
//
// Запуск: node --experimental-loader ./scripts/aliases.mjs scripts/varnaRate.mjs [забегов]
// Флаги только через `--`:
//   --sloppy=0.85   доля пропущенных окон дефлекта (как в fieldBalance)
//   --strike        бот бьёт пашу (силовой забег)

import { playRun, mulberry32, ROOMFACTS, setSloppy } from './fieldBalance.mjs'
import { MENTALITY_LEVELS } from '../webapp/js/core/data.js'

const FLOORS = 7
// Порог последней ступени — из данных, а не написан здесь строкой.
const TOP = MENTALITY_LEVELS[MENTALITY_LEVELS.length - 1]

const SLOPPY_ARG = (process.argv.find((a) => a.startsWith('--sloppy=')) || '').split('=')[1]
if (Number.isFinite(Number(SLOPPY_ARG))) setSloppy(Number(SLOPPY_ARG))
const STRIKE = process.argv.includes('--strike')
// `--seva` — бот служит. Без него присутствие получает ноль очков и его темп
// не измерен вовсе: бот не подходит к просящим (0 сев из 959 комнат).
const SEVA = process.argv.includes('--seva')
const RUNS = Number(process.argv[2] || 40)

/**
 * Очки забега — по правилам `floorVarnaFood` (main.js).
 *
 * Единица — чакра. В комнате Поле Ума от двух до пяти оков, и счёт «+1 за
 * окову» либо разгоняет лестницу до бесполезной, либо топит её.
 */
function pointsOf(rooms) {
  const pts = { kshatriya: 0, vipra: 0, shudra: 0 }
  for (let fl = 0; fl < FLOORS; fl++) {
    const mine = rooms.filter((r) => r.floor === fl)
    if (!mine.length) continue
    const cleared = mine.filter((r) => r.any)
    if (cleared.length) {
      const clean = cleared.every((r) => !r.blood)
      pts.kshatriya += clean ? 2 : 1
    }
    // Различение и присутствие — одинаковый потолок (2 за чакру), иначе
    // присутствие отстаёт вдвое (замерено: 13 забегов против 7).
    pts.vipra += Math.min(cleared.length, 2)
    pts.shudra += Math.min(mine.filter((r) => r.served).length, 2)
  }
  return pts
}

const perRun = { kshatriya: [], vipra: [], shudra: [] }
const runsToTop = { kshatriya: [], vipra: [], shudra: [] }
let deaths = 0, wins = 0

for (let k = 0; k < RUNS; k++) {
  ROOMFACTS.length = 0
  const r = playRun(mulberry32(2000 + k))
  if (r.win) wins++; else deaths++
  const p = pointsOf(ROOMFACTS.slice())
  for (const kind of Object.keys(p)) {
    perRun[kind].push(p[kind])
    // Сколько таких забегов нужно до потолка при СРЕДНЕМ темпе.
    const avg = perRun[kind].reduce((a, b) => a + b, 0) / perRun[kind].length
    runsToTop[kind].push(avg > 0 ? Math.ceil(TOP / avg) : Infinity)
  }
}

const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length

console.log('── Сколько забегов Поля Ума до последней ступени ментальности ──')
console.log(`Забегов в прогоне: ${RUNS} · побед ${wins} · смертей ${deaths} · рассеянность ${SLOPPY_ARG || 0}${STRIKE ? ' · бот бьёт' : ''}${SEVA ? ' · бот служит' : ''}`)
console.log(`Лестница: ${MENTALITY_LEVELS.join(' → ')} очков, потолок ${TOP}.`)
console.log('  ментальность · очков за забег · забегов до потолка')
const NAMES = { kshatriya: 'Смелость', vipra: 'Различение', shudra: 'Присутствие' }
const shown = {}
for (const kind of ['kshatriya', 'vipra', 'shudra']) {
  const t = med(runsToTop[kind])
  shown[kind] = t
  console.log(`  ${NAMES[kind].padEnd(12)} · ${avg(perRun[kind]).toFixed(1).padStart(6)} · ${String(t).padStart(4)}`)
}
console.log('')
console.log('Как читать:')
console.log('  1–2 забега — лестница вырождена в одну ступень, ментальность бесполезна;')
console.log('  3–10 забегов — лестница рабочая (столько же в карточном пути);')
console.log('  дальше 10 — растёт так долго, что игрок забудет, зачем начал.')
const vals = Object.values(shown).filter(Number.isFinite)
const spread = Math.max(...vals) - Math.min(...vals)
console.log(`  сейчас: от ${Math.min(...vals)} до ${Math.max(...vals)} забегов, разброс ${spread}.`)
if (spread > 6) console.log('  ВНИМАНИЕ: рост не параллельный (§12) — одна ментальность обгоняет остальные.')
process.exitCode = 0