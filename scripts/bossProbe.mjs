// Проба боя с владыкой: сколько дефлектов нужно и сколько попаданий
// получает бот, который только и делает, что подходит и возвращает удар.
// Нужна, чтобы увидеть «стену» числом, а не ощущением.
import {
  createField, stepField, parry, dash, parryHint, checkOutcome, DEFAULT_FIELD_OPTIONS,
} from '../webapp/js/core/field.js'
import { buildFieldFloor } from '../webapp/js/core/fieldBuild.js'

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const o = DEFAULT_FIELD_OPTIONS
const floor = Number(process.argv[2] || 1)
const dodge = process.argv.includes('--dodge')

console.log(`── Проба комнаты владыки: чакра ${floor + 1} ──`)
for (let k = 0; k < 5; k++) {
  const rng = mulberry32(500 + k)
  const built = buildFieldFloor(floor, { field: { w: 412, h: 600 }, room: 3 })
  const b = built.boss
  const st = createField({
    player: { x: built.field.w * 0.5, y: built.field.h * 0.72, hp: 60 },
    foes: [b], field: built.field, rng, opts: {},
  })
  const f = st.foes[0]
  let t = 0, hits = 0, parries = 0, dodges = 0, allEvents = 0, dmg = 0
  const dt = 1 / 60
  const say = []
  const hpTrace = []
  let lastLog = -1
  while (!st.outcome && t < 240) {
    const p = st.player
    const d = Math.hypot(f.x - p.x, f.y - p.y) || 1
    // окно дефлекта — то же, на которое смотрит настоящий экран
    const hint = parryHint(st)
    // рывок от приёма, который идёт прямо сейчас (в реальной игре так и
    // играют: не поймал окно — ушёл рывком)
    if (dodge && f.state === 'telegraph' && f.timer > o.parryWindow
        && f.timer < o.parryWindow + 0.18 && p.dashCd <= 0) {
      dash(st, -(f.x - p.x) / d, -(f.y - p.y) / d); dodges++
    } else if (hint && hint.timer <= o.parryWindow) { parry(st); parries++ }
    else if (d > 34) stepField(st, dt, { mx: (f.x - p.x) / d, my: (f.y - p.y) / d })
    const ev = stepField(st, dt, {})
    for (const e of ev) {
      allEvents++
      if (e.type === 'hurt') { hits++; dmg += e.amount }
      if (say.length < 6 && (e.type === 'boss_move' || e.type === 'boss_phase' || e.type === 'hurt')) {
        say.push(`${t.toFixed(1)}:${e.type}${e.amount != null ? '=' + e.amount : ''}${e.message ? ' ' + e.message : ''}`)
      }
    }
    t += dt
    if (Math.abs(t - lastLog) >= 2) { lastLog = Math.round(t); hpTrace.push(`${t.toFixed(0)}с hp=${p.hp.toFixed(0)} щит=${p.shield} блок=${f.block.toFixed(1)} сила=${f.strength}`) }
  }
  checkOutcome(st, [])
  console.log(
    `${f.name}: исход=${st.outcome || 'ничья'} hp=${st.player.hp.toFixed(0)}/${st.player.maxHp}` +
    ` время=${t.toFixed(1)}с дефлектов=${parries} рывков=${dodges} попаданий=${hits}` +
    ` спокойствие=${f.calm.toFixed(2)}/${f.calmMax} фаза=${f.phase} урона=${dmg} событий=${allEvents}`,
  )
  console.log('   события: ' + say.join(' | '))
  console.log('   жизнь: ' + hpTrace.join(' | '))
  console.log('   журнал: ' + st.log.slice(-8).map((l) => l.text).join(' / '))
}
