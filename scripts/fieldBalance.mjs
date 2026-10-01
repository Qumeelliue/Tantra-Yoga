// Баланс-прогон ПОЛЯ УМА: бот играет полные забеги от первой чакры до финала.
//
// Зачем это нужно. `npm run balance` считает только карточный путь, а
// Поле Ума — это отдельная петля, и в ней были баги, которые ни один тест
// не ловил (забег упирался в первую комнату; шаг боя выдавал NaN и вся
// самадхи молча не считалась). Прогон проходит ВСЮ петлю — комната за
// комнатой, владыка за владыкой — и печатает, где именно ломается.
//
// Бот играет как хороший человек: подходит к оке, жмёт дефлект в окно,
// тратит мантру когда хватает Ци, отступает на низком здоровье.

import { pathToFileURL } from 'node:url'
import {
  createField, stepField, parry, castMantra, parryHint, checkOutcome, serveWare, FLOOR_MANTRA, DEFAULT_FIELD_OPTIONS,
} from '../webapp/js/core/field.js'
import { buildFieldFloor, stageHasBoss } from '../webapp/js/core/fieldBuild.js'
import { applyVarna } from '../webapp/js/core/varnaKits.js'
import { applyKeepsake, rollKeepsakes } from '../webapp/js/core/keepsakes.js'
import { applyBoons, rollBoons } from '../webapp/js/core/boons.js'
import { mantraById } from '../webapp/js/core/field.js'
import { nextStage, ROOMS_PER_STAGE, isLastFloor } from '../webapp/js/core/stageRoute.js'
import { applyHeat, HEAT_MAX, heatReward } from '../webapp/js/core/heat.js'
import { WORKSHOP as WS, applyUpgrades, rankKey, maxRank } from '../webapp/js/core/workshop.js'
import { rollDoors, hasCombatDoor } from '../webapp/js/core/doors.js'

const RUNS = Number(process.argv[2] || 60)

// ── ЖАР в замере (2026-09-30) ───────────────────────────────────────────
// Проверяется то, ради чего жар и делался: он не должен превращаться в
// кирпич. «Проходимо» и «интересно» — разные числа, и сперва нужно первое.
//
// Флаги только через `--` (правило проекта):
//   node … fieldBalance.mjs 20 -- --heat=3
const argv = process.argv.slice(3)
const heatArg = argv.find((a) => a.startsWith('--heat'))
const HEAT = heatArg
  ? Math.max(0, Math.min(HEAT_MAX, Number(heatArg.split('=')[1] || 0)))
  : 0
// ── МАСТЕРСКАЯ (2026-09-30) ─────────────────────────────────────────────
// Проверяется то, ради чего ранги и делались: прокачанная мастерская не
// должна ломать забег. Два разных вопроса, и оба честные:
//
//   · `--ws=all`  — владелец ВСЕХ рангов. Поле обязано остаться проходимым,
//     иначе усиления не «работают», а ломают;
//   · без флага — владелец НИЧЕГО. Это базовая линия, и она не должна
//     сдвинуться от того, что мастерская расширилась.
//
// Флаги только через `--` (правило проекта):
//   node … fieldBalance.mjs 20 -- --ws=all
const wsArg = process.argv.slice(3).find((a) => a.startsWith('--ws'))
const WS_KEYS = wsArg && wsArg.split('=')[1] === 'all'
  ? WS.flatMap((u) => Array.from({ length: maxRank(u.id) }, (_, i) => rankKey(u.id, i + 1)))
  : []
// Сколько дверей выпадало: сколько было двух, сколько трёх. Печатается, потому
// что «двери всегда одинаковые» — это тоже поломка, и без счётчика её не
// видно.
// Флаги только через `--` (правило проекта):
//   node … fieldBalance.mjs 20 -- --elite
const ELITE = process.argv.slice(3).includes('--elite')
const DOORLOG = {}
const ROOMLOG = []
const PARRIES = [0]
const STATS = { mantra: 0, krpa: 0, spring: 0, hurt: 0, dmg: 0, pacified: 0, strikes: 0, feints: 0, rooms: 0, bossPacified: 0 }

// Сколько урона съел щит. Раньше замер считал ТОЛЬКО попадания по жизни, и
// строка «попаданий 25 · урона 0» читалась как «бьют, но не hurts» — то есть
// как читерство бота. На деле щит (Slay the Spire: block) стоял на потолке 12
// и съедал всё. Без этого числа нельзя сказать, МЯГКО игра или ЩИТ мягкий:
// «25 попаданий, 0 урона» одинаково выглядит при неуязвимости и при щите.
const SHIELD = { blocked: 0, absorbed: 0, samples: 0, atCap: 0, sum: 0, seen: 0, max: 0 }

// Ци — «психическая сила». Считаем, сколько бот тратит и сколько он
// получает: если трат больше, чем приходит из дефлектов, то мантры не
// должны идти так часто, и щит не должен стоять на потолке. Если равен —
// щит льётся сам из себя, и это главный подозреваемый в мягкости поля.
const QI = { spent: 0, gained: 0, fromDeflect: 0, casts: 0, noShield: 0, noQi: 0 }
const HPLOG = []
const TIMELOG = []
const FLOORS = 7

// Кривая забега. Раньше симулятор печатал одно среднее «здоровье перед
// владыкой» по всем этапам сразу, и по нему нельзя было понять, где забег
// стал тяжелее, а где полегче. Теперь — по этапу: сколько жизни стоило
// дойти до владыки и сколько урона забрала чакра.
const CURVE = Array.from({ length: FLOORS }, () => ({ hp: [], dmg: 0, rooms: 0, runs: 0 }))
const DRAFTS = {}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const VARNAS = ['shudra', 'kshatriya', 'vipra', 'vaeshya']

/** Опции боя для забега — ровно как собирает настоящая игра. */
function optsFor(floor, rng, varna, keepsake, boons) {
  const built = buildFieldFloor(floor, { field: { w: 412, h: 600 } })
  const base = {
    playerHp: 60,
    look: built.look, world: built.world,
    mantraId: FLOOR_MANTRA[floor] || 'japa',
    coins: 0, varna, keepsake, deaths: 0,
  }
  // Мастерская — последней в цепочке, ровно как в `startFieldRun`: усиление
  // дороже дара и перекрывает его. Без этого замер мерил бы не тот бой, в
  // котором игрок реально стоит.
  return applyUpgrades(
    applyBoons(applyKeepsake(applyVarna(base, varna), keepsake), boons),
    WS_KEYS,
  )
}

/** Один бой: бот ходит, дефлектит, тратит мантру. Возвращает итог боя. */
// Рассеянность: доля окон дефлекта, которые бот пропускает. 0 — идеальная
// игра (верхняя граница возможного), 0.45 — живой человек, который опаздывает.
// Разница между ними и есть настоящее «окно» Поля Ума.
let SLOPPY = Number((process.argv.find((a) => a.startsWith('--sloppy=')) || '--sloppy=0').split('=')[1])

// Комната покоя: по умолчанию бот «восстанавливает всю жизнь», как человек,
// который боится. `--rest=bonus` — вторая карточка (+6 макс. жизни навсегда).
const REST_BONUS = process.argv.includes('--rest=bonus')

/** Хватает ли Ци на мантру — чтобы бот не «тратил впустую» ради счётчика. */
function playRoom(st, rng, maxSec = 90) {
  let t = 0
  const dt = 1 / 60
  let ev = []
  let lastMantra = -10
  let servedThisRoom = false
  while (!st.outcome && t < maxSec) {
    const p = st.player
    const input = { dx: 0, dy: 0 }

    // 1) ока в окне удара — возвращаем удар. Это главное действие боя.
    const target = parryHint(st)
    const inWindow = target && target.timer <= st.o.parryWindow
    if (inWindow && rng() >= SLOPPY) {
      const q0 = p.psychic
      for (const e of parry(st)) { STATS.pacified += (e.type === 'pacified' ? 1 : 0) }
      QI.fromDeflect += Math.max(0, p.psychic - q0)
      PARRIES[0]++
    }

    // 2) идём к ближайшей окове; если жизни мало — сначала к амбросии
    let walk = nearest(st)
    let dest2 = walk
    if (st.spring && !st.spring.used && p.hp < p.maxHp * 0.6) {
      walk = null
      dest2 = st.spring
    }
    const dest = dest2 || st.door
    const ddx = dest.x - p.x, ddy = dest.y - p.y
    const dd = Math.hypot(ddx, ddy) || 1
    const tooFar = walk ? dd > st.o.enemyReach * 0.55 : dd > 12
    if (tooFar) { input.dx = ddx / dd; input.dy = ddy / dd }

    // 3) сева, если жизни мало. Не чаще раза в комнату: человек не может
    //    стоять на месте и жать севу шестьдесят раз в секунду, а бот мог.
    if (p.hp < p.maxHp * 0.45 && !servedThisRoom) {
      const w = st.wares.findIndex((x) => !x.done && Math.hypot(x.x - p.x, x.y - p.y) < 40)
      if (w >= 0) { serveWare(st, w, 'shudrocita', []); servedThisRoom = true }
    }

    // 4) мантра — не чаще раза в 0.8 с. Бот раньше жал её каждый кадр и
    //    выигрывал бой, не получая ни одного удара: это был не бот, а
    //    читер, и цифры по нему не значили ничего.
    const m = mantraById(p.mantraId)
    if (!inWindow && t - lastMantra > 0.8) {
      const qi = Math.max(0, m.cost - (st.o.mantraCostCut || 0))
      if (p.psychic >= qi) {
        const q0 = p.psychic, s0 = p.shield
        castMantra(st)
        QI.spent += Math.max(0, q0 - p.psychic)
        QI.gained += Math.max(0, p.psychic - q0)
        QI.casts++
        // Мантра без щита — это Джапа: она гасит неведение, а не защищает.
        // Отдельно от «не хватило Ци»: это разные вещи, и раньше они были
        // слиты в одно число, из-за чего нельзя было понять, чем именно
        // поле держит игрока.
        if (p.shield <= s0) QI.noShield++
        STATS.mantra++; lastMantra = t
      } else QI.noQi++
    }

    // Щит ДО шага боя. Раньше он мерялся после, а `damagePlayer` уже вычел
    // из него съеденный урон, и замер показывал 4 при ударе на 8: то есть
    // показывал остаток вместо того, что было.
    const shieldBefore = p.shield

    // Шаг боя ВСЕГДА идёт. Раньше бот в ветке «подошёл вплотную» забывал
    // двигать мир, и бой просто стоял: подсказка была, а удара не было.
    ev = stepField(st, dt, input)
    for (const e of ev) {
      if (e.type === 'krpa') STATS.krpa++
      else if (e.type === 'spring') STATS.spring++
      else if (e.type === 'pacified') STATS.pacified++
      else if (e.type === 'hurt') {
        STATS.hurt++
        STATS.dmg += e.amount || 0
        // Щит мог съесть урон (не обошёл) или стоять вхолостую (щит был, но
        // удар прошёл мимо него — такое бывает при 0.55 с неуязвимости).
        SHIELD.samples++
        SHIELD.absorbed += e.absorbed || 0
        if ((e.absorbed || 0) > 0) SHIELD.blocked++
        // Щит в момент удара: стоял ли он на потолке? Если да — поле даёт
        // игроку бесконечный запас прочности, и никакие числа не исправят
        // этого, пока мантра льёт щит быстрее, чем ока его тратит.
        if (shieldBefore >= st.o.shieldMax - 0.001) SHIELD.atCap++
        SHIELD.sum += shieldBefore; SHIELD.seen++
        if (shieldBefore > SHIELD.max) SHIELD.max = shieldBefore
      }
      else if (e.type === 'feint') STATS.feints++
      else if (e.type === 'pacified') STATS.pacified++
    }
    t += dt
  }
  STATS.rooms++
  checkOutcome(st, [])
  const alive = st.foes.filter((f) => !f.pacified && !f.dead)
  return { t, stuck: !st.outcome && !st.door.open, alive }
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

/** Полный забег. Возвращает, где он закончился. */
function playRun(rng) {
  const varna = VARNAS[Math.floor(rng() * VARNAS.length)]
  const keepsake = rollKeepsakes(rng, 3)[0].id
  const boons = []
  let time = 0
  let runHp = null          // здоровье живёт весь побег, а не одну комнату
  let maxHpBonus = 0       // «Тапа» в комнате покоя: +6 навсегда
  for (let floor = 0; floor < FLOORS; floor++) {
    let stage = 'room', room = 0, guard = 0
    let died = false
    while (guard++ < 30) {
      const built = buildFieldFloor(floor, {
        field: { w: 412, h: 600 }, room,
        // `--elite`: каждая обычная комната собрана как испытание силы. Так
        // меряется не «проходим ли забег», а «проходимо ли ИСПЫТАНИЕ» — а это
        // разные числа, и спутать их нельзя.
        elite: ELITE,
        // `calmMul` НЕ передаётся — и это важно. Раньше здесь стояло
        // `opts: { calmMul: DEFAULT_FIELD_OPTIONS.foeCalmMul }`, то есть
        // замер подставлял свою константу 1.5 и ПЕРЕКРЫВАЛ ею рост спокойствия
        // по чакрам, который делает игра (`calmMulFor(floor)`, 1.5 → 2.25).
        // Итог: седьмая чакра в замере была легче, чем в игре, и вся
        // лестница рассеянности мерила не ту игру.
        //
        // Значение `foeCalmMul` в DEFAULT_FIELD_OPTIONS при этом было МЁРТВЫМ:
        // поле его не читало, читал только замер. Теперь не читает никто —
        // единственный источник правды один, игра.
        opts: {},
        // Случай идёт через rng забега: иначе симулятор нельзя повторить,
        // а состав комнаты теперь розыгрыш (Hades).
        rng,
      })
      const foes = stage === 'boss' ? (built.boss ? [built.boss] : []) : built.foes.slice()
      const opts = optsFor(floor, rng, varna, keepsake, boons)
      // Жар — ПОСЛЕ опций, ровно как в `startFieldRun`. Иначе замер мерил бы
      // не то, что игра: усиление из мастерской перекрыло бы условие жара,
      // и на экране ставка выглядела бы, а в бою её не было бы.
      if (HEAT > 0) applyHeat(opts, HEAT)
      // амбросия стоит в последней комнате этапа — ровно как в игре
      if (stage === 'room' && room === ROOMS_PER_STAGE - 1) opts.spring = true
      const fullHp = (opts.playerHp || 60) + maxHpBonus
      const entryHp = runHp == null ? fullHp : Math.max(1, Math.min(fullHp, runHp))
      const st = createField({
        player: { x: built.field.w * 0.5, y: built.field.h * 0.72, hp: entryHp, maxHp: fullHp },
        foes, wares: built.wares, field: built.field, rng, opts,
      })
      const dmgBefore = STATS.dmg
      const r = playRoom(st, rng)
      time += r.t
      runHp = st.player.alive ? st.player.hp : 0
      const dmgHere = STATS.dmg - dmgBefore
      CURVE[floor].dmg += dmgHere
      CURVE[floor].rooms++
      const who = r.alive.map((f) => `${f.name}(${f.calm.toFixed(1)}/${f.calmMax})`).join(',')
      const hpPct = Math.round((st.player.hp / st.player.maxHp) * 100)
      if (stage !== 'boss') HPLOG.push(hpPct)
      if (stage === 'boss') CURVE[floor].hp.push(hpPct)
      TIMELOG.push(r.t)
      ROOMLOG.push(`${floor + 1}${stage === 'boss' ? 'B' : ''}${room}: ${r.t.toFixed(0)}с hp=${hpPct}% урон=${Math.round(dmgHere)} ${r.stuck ? 'ЗАСТРЯЛ ' + who : ''}`)
      if (!st.player.alive) { died = true; break }
      if (st.foes.some((f) => f.isBoss && !f.pacified && !f.dead)) {
        return { win: false, stuck: true, why: `владыка чакры ${floor + 1} не успокоен`, floor, time }
      }
      const step = nextStage(stage, room, stageHasBoss(floor))
      // ДВЕРИ. Замер обязан идти тем же путём, что игра (правило проекта):
      // если пропустить выбор двери, симулятор мерил бы лестницу, которой в
      // игре больше нет, и все числа после этого были бы выдуманными.
      //
      // Бот выбирает дверь боя — так же, как поступил бы человек, который
      // хочет измерить ПРОХОДИМОСТЬ. Двери «лавка/покой» бот не берёт
      // сознательно: ими можно заменить бой, и тогда замер перестал бы
      // мерить проходимость, а мерил бы «сколько оков можно не встретить».
      if (step.kind === 'room') {
        const doors = rollDoors({ room: step.room, hasBoss: stageHasBoss(floor), rng })
        const door = doors.find((d) => d.kind === 'room') || doors.find((d) => d.kind === 'boss')
        DOORLOG[doors.length] = (DOORLOG[doors.length] || 0) + 1
        if (!door || !hasCombatDoor(doors)) {
          return { win: false, stuck: true, why: 'в двери не оказалось боя — правило нарушено', floor, time }
        }
      }
      if (step.kind === 'done') {
        if (stage === 'boss') {
          afterBoss(floor, boons, rng, fullHp, (hp) => { runHp = hp }, (n) => { maxHpBonus += n })
          break
        }
        break
      }
      stage = step.kind; room = step.room
    }
    // Смерть — это конец забега, а не переход на следующую чакру.
    //
    // Раньше здесь стоял просто `break`, и внешний цикл крутил следующую
    // чакру, а функция в конце возвращала `win: true`. Забег, где бот умер
    // в первой комнате, отличался от полного тем, что в нём НЕ БЫЛО
    // последних шести чакр — и всё равно попадал в «победы». Симулятор поля
    // не мог сообщить о поражении в принципе: 100 % побед было свойством
    // кода, а не результатом. Это видно и на глаз: 100 % побед при 374
    // пройденных комнатах из 560 невозможно физически.
    if (died) return { win: false, why: `погиб в чакре ${floor + 1}`, floor, time }
  }
  return { win: true, floor: FLOORS, time }
}

/**
 * Что игра даёт после владыки — ровно как на экране (main.js: showRestRoom →
 * afterRest → лавка/дар через чакру).
 *
 * Раньше здесь стояло `boons.push('dharma-megha')` и `boons.push('prana')` —
 * выдуманные id, которых в игре нет. `applyBoons` их молча пропускал, и
 * симулятор за все забеги не получал НИ ОДНОГО дара: все числа «проходим»
 * были получены на забеге слабее, чем играет человек. Плюс не было комнаты
 * покоя. Теперь бот проходит ту же петлю.
 *
 * Чётность чакры не важна: и в лавке, и в черновике дара игрок получает
 * ровно ОДИН дар за этап (в лавке он бесплатный), поэтому бот берёт один.
 *
 * Покой бот берёт «восстановить всю жизнь» — так поступает человек, который
 * боится. Вторую карточку (+6 макс. жизни навсегда) смотрим флагом
 * `--rest=bonus`.
 */
function afterBoss(floor, boons, rng, fullHp, setHp, addMaxHp) {
  CURVE[floor].runs++
  if (isLastFloor(floor)) return
  if (REST_BONUS) addMaxHp(6)
  else setHp(fullHp)
  const pick = rollBoons(boons, rng, 1)
  if (pick[0]) { boons.push(pick[0].id); DRAFTS[pick[0].id] = (DRAFTS[pick[0].id] || 0) + 1 }
}

/** Обнулить счётчики — чтобы повторить замер с другой рассеянностью. */
function resetStats() {
  for (const k of Object.keys(STATS)) STATS[k] = 0
  for (const k of Object.keys(SHIELD)) SHIELD[k] = 0
  for (const k of Object.keys(QI)) QI[k] = 0
  HPLOG.length = 0; TIMELOG.length = 0; ROOMLOG.length = 0; PARRIES[0] = 0
  for (let i = 0; i < CURVE.length; i++) CURVE[i] = { hp: [], dmg: 0, rooms: 0, runs: 0 }
  for (const k of Object.keys(DRAFTS)) delete DRAFTS[k]
}

/**
 * Один замер: прогнать RUNS забегов и напечатать всё, что видно.
 * `quiet` — не печатать (для лестницы: там печатает сводную таблицу).
 */
function simulate(quiet = false) {
  resetStats()
  let stuckCount = 0
  const wins = []
  const losses = []
  for (let k = 0; k < RUNS; k++) {
    const rng = mulberry32(1000 + k)
    const r = playRun(rng)
    if (r.win) wins.push(r.time)
    else { losses.push(r); if (r.stuck) stuckCount++ }
  }
  const out = {
    sloppy: SLOPPY, runs: RUNS, wins: wins.length, stuck: stuckCount,
    hits: STATS.hurt, dmg: Math.round(STATS.dmg), rooms: STATS.rooms,
  }
  if (quiet) return out

  console.log('── Поле Ума: прогон забегов ──')
  console.log(`бот: подходит, жмёт дефлект в окно, служит при ранении. Рассеянность ${SLOPPY}. Покой: ${REST_BONUS ? '+6 макс. жизни' : 'лечится полностью'}.`)
  console.log('Победа 100% означает, что забег ПРОХОДИМ.')
  console.log('ВНИМАНИЕ: бот парирует безупречно, а на это стоит всё. Для игры на')
  console.log('тайминге он не мера сложности — только доказательство, что забег')
  console.log('проходим. Сложность судится руками: сколько врагов бьёт разом,')
  console.log('с какой частотой и сколько снимает за удар.')
  if (ELITE) console.log('режим: каждая обычная комната собрана как ИСПЫТАНИЕ СИЛЫ')
  console.log(`двери: ${Object.entries(DOORLOG).sort().map(([n, c]) => `${n} шт. × ${c}`).join(' · ') || 'ни разу'}`)
  console.log(`забегов: ${RUNS} | побед: ${wins.length} (${Math.round((wins.length / RUNS) * 100)}%)` +
    (HEAT > 0 ? ` | ЖАР ${HEAT} из ${HEAT_MAX} · сева за забег ×${heatReward(HEAT, 1)}` : '') +
    (WS_KEYS.length ? ` | МАСТЕРСКАЯ: все ранги (${WS_KEYS.length} покупок)` : ''))
  if (wins.length) {
    const avg = wins.reduce((a, b) => a + b, 0) / wins.length
    console.log(`среднее время побега: ${avg.toFixed(1)} с · комнат на этап: ${ROOMS_PER_STAGE}`)
  }
  if (HPLOG.length) {
    const avg = HPLOG.reduce((a, b) => a + b, 0) / HPLOG.length
    let full = 0, hurt = 0, low = 0
    for (const h of HPLOG) { if (h >= 99) full++; else if (h >= 50) hurt++; else low++ }
    // Строка называлась «здоровье перед владыкой», а HPLOG писался после
    // КАЖДОЙ обычной комнаты, а не перед владыкой. Это вводило в заблуждение:
    // цифра говорила о комнатах, а читалась как о владыке. Перед владыкой —
    // CURVE ниже, честно и по отдельной строке на чакру.
    console.log(`после обычной комнаты: среднее ${Math.round(avg)}% · без царапин ${full} · побитое ${hurt} · на грани ${low} (из ${HPLOG.length})`)
  }
  if (CURVE.some((c) => c.runs)) {
    console.log(`кривая забега по чакрам (покой между этапами: ${REST_BONUS ? '+6 макс. жизни' : 'лечимся полностью'}):`)
    for (let i = 0; i < CURVE.length; i++) {
      const c = CURVE[i]
      if (!c.runs) continue
      const avg = c.hp.length ? c.hp.reduce((a, b) => a + b, 0) / c.hp.length : null
      console.log(`  чакра ${i + 1}: комнат ${c.rooms} · жизнь перед владыкой ${avg == null ? '—' : Math.round(avg) + '%'} · урона за чакру ${Math.round(c.dmg / c.runs)} · дошло забегов ${c.runs}`)
    }
  }
  const draftTotal = Object.values(DRAFTS).reduce((a, b) => a + b, 0)
  if (draftTotal) {
    const top = Object.entries(DRAFTS).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(', ')
    console.log(`дары (как в игре: один за этап): ${draftTotal} — ${top}`)
  }
  console.log(`статистика бота: комнат ${STATS.rooms} · снято оков ${STATS.pacified} · мантр ${STATS.mantra} · крипа ${STATS.krpa} · амбросия ${STATS.spring} · попаданий ${STATS.hurt} на ${Math.round(STATS.dmg)} урона · блефов ${STATS.feints}`)
  if (SHIELD.samples) {
    const total = SHIELD.absorbed + Math.round(STATS.dmg)
    const pct = Math.round((SHIELD.absorbed / (total || 1)) * 100)
    const avgShield = SHIELD.seen ? (SHIELD.sum / SHIELD.seen).toFixed(1) : '—'
    console.log(`щит: сработал в ${SHIELD.blocked} из ${SHIELD.samples} попаданий · съел ${SHIELD.absorbed} урона из ${total} (${pct}%) · на потолке в ${SHIELD.atCap} · средний щит в момент удара ${avgShield} · максимум ${SHIELD.max} из потолка ${DEFAULT_FIELD_OPTIONS.shieldMax}`)
  }
  if (QI.casts) {
    console.log(`ци: мантр ${QI.casts} · потрачено ${QI.spent} · вернулось мантрой ${QI.gained} · пришло из дефлектов ${QI.fromDeflect} · без щита (Джапа) ${QI.noShield} · не хватило Ци ${QI.noQi}`)
  }
  if (STATS.hurt && !STATS.dmg) {
    console.log('  ВНИМАНИЕ: попадания есть, урона нет — весь урон съеден щитом.')
    console.log('  Значит замер ничего не говорит о сложности: идеальный бот неуязвим.')
  }
  if (TIMELOG.length) {
    const sorted = TIMELOG.slice().sort((a, b) => a - b)
    const q = (f) => sorted[Math.floor(sorted.length * f)].toFixed(0)
    console.log(`время боя: медиана ${q(0.5)}с · 25% ${q(0.25)}с · 75% ${q(0.75)}с · 95% ${q(0.95)}с`)
  }
  if (process.argv.includes('--rooms')) console.log('   комнаты: ' + ROOMLOG.join('\n            '))
  if (losses.length) {
    const byWhy = {}
    for (const l of losses) byWhy[l.why] = (byWhy[l.why] || 0) + 1
    console.log('где ломается:', JSON.stringify(byWhy))
    console.log(`зависло без исхода: ${stuckCount}`)
  }
  return out
}

// ── Модуль можно импортировать (тесты гоняют playRun напрямую) ────────────
// Раньше файл на верхнем уровне просто запускал прогон, и проверить его было
// нечем. Теперь запуск — только когда файл вызвали как скрипт.
const IS_MAIN = !!(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)

export { playRun, simulate, mulberry32, STATS, DRAFTS }
export const setSloppy = (v) => { SLOPPY = v }

// ── Лестница рассеянности ──────────────────────────────────────────────────
// Один процент побед от идеального бота не говорит ничего: он стоит на
// безупречном парировании. Полезнее другой вопрос — НАСКОЛЬКО неточным
// можно быть и всё ещё дойти. Это и есть настоящая мера мягкости.
const LADDER = (process.argv.find((a) => a.startsWith('--ladder=')) || '').split('=')[1]
if (!IS_MAIN) {
  // импорт из теста: ничего не печатаем и не выходим
} else if (LADDER) {
  const values = LADDER.split(',').map(Number).filter((n) => Number.isFinite(n))
  console.log('── Поле Ума: лестница рассеянности ──')
  console.log(`Рассеянность = доля окон дефлекта, которые бот ПРОПУСКАЕТ. Забегов на ступень: ${RUNS}.`)
  console.log('Вопрос не «сколько процентов побед», а «насколько неточным ещё можно быть».')
  console.log('  рассеянность · побед · попаданий · урона · комнат · зависло · щит съел')
  for (const v of values) {
    SLOPPY = v
    const r = simulate(true)
    const total = SHIELD.absorbed + r.dmg
    const pct = total ? Math.round((SHIELD.absorbed / total) * 100) : 0
    console.log(`  ${String(Math.round(v * 100)).padStart(11)} % · ${String(Math.round((r.wins / r.runs) * 100)).padStart(4)} % · ${String(r.hits).padStart(8)} · ${String(r.dmg).padStart(5)} · ${String(r.rooms).padStart(6)} · ${r.stuck} · ${String(pct).padStart(3)}% (на потолке ${SHIELD.atCap})`)
  }
} else {
  simulate()
}
process.exitCode = 0
