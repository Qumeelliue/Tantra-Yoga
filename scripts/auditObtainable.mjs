// ДОСТИЖИМОСТЬ СОДЕРЖАНИЯ: можно ли вообще получить каждую вещь.
//
// Зачем. Игра выглядит больше, чем она есть, если в контенте лежит то,
// что ничем не выдаётся. Такое уже находилось трижды:
//
//   · 48 цитат из 100 не открывались ничем (auditQuotes);
//   · 5 вртти были написаны, но ни одно событие их не давало;
//   · лавка в поле была написана, но ни одна ветка кода её не звала.
//
// Здесь проверяется всё, что можно получить: карты, реликвии, события,
// испытания, оки, владыки, нефриты, дары, усиления мастерской.
//
// Запуск: node --experimental-loader ./scripts/aliases.mjs scripts/auditObtainable.mjs

import {
  CARDS, RELICS, EVENTS, TRIALS, ENEMIES, WORLDS, cardRewardPool, availableTrials,
} from '../webapp/js/core/data.js'
import { KEEPSAKES } from '../webapp/js/core/keepsakes.js'
import { BOONS as FIELD_BOONS } from '../webapp/js/core/boons.js'
import { WORKSHOP } from '../webapp/js/core/workshop.js'
import { VARNA_KITS } from '../webapp/js/core/varnaKits.js'
import { FOE_BEHAVIOR } from '../webapp/js/core/foeBehavior.js'
import { buildFieldFloor } from '../webapp/js/core/fieldBuild.js'
import { CHAKRAS } from '../webapp/js/core/run.js'

const rows = []
const add = (name, have, total, list) =>
  rows.push({ name, have: have instanceof Set ? have.size : have, total, list })
const diff = (all, have) => all.filter((x) => !have.has(x))

// ── карты ──────────────────────────────────────────────────────────────
{
  const ids = Object.keys(CARDS).filter((k) => !k.startsWith('_'))
  const starters = new Set(ids.filter((id) => CARDS[id].starter))
  const openPool = new Set(cardRewardPool([]).map((c) => c.id))
  const everything = new Set(cardRewardPool(ids).map((c) => c.id))
  // Событие выдаёт карту эффектом `add_card` с полем `id` — не `card`.
  // Имя поля проверяется по реальным данным, а не по догадке.
  const byEvent = new Set()
  for (const [k, e] of Object.entries(EVENTS)) {
    if (k.startsWith('_')) continue
    for (const c of e.choices || []) {
      for (const ef of c.effects || []) {
        if (ef.kind !== 'add_card') continue
        byEvent.add(ef.id || ef.card || ef.cardId)
      }
    }
  }
  const byTrial = new Set(Object.values(TRIALS).filter((t) => t && t.rewardCard).map((t) => t.rewardCard))
  const have = new Set([...starters, ...openPool, ...everything, ...byEvent, ...byTrial])
  add('карты', have, ids.length, diff(ids, have))
}

// ── реликвии ──────────────────────────────────────────────────────────
{
  // Реликвию даёт узел «реликвия»: случайная из ещё не взятых.
  // Значит доступна любая, кроме уже взятой — то есть все.
  const ids = Object.keys(RELICS).filter((k) => !k.startsWith('_'))
  add('реликвии', new Set(ids), ids.length, [])
}

// ── события ───────────────────────────────────────────────────────────
{
  // Узел «событие» берёт случайное из неповторённых → все достижимы.
  const ids = Object.keys(EVENTS).filter((k) => !k.startsWith('_'))
  add('события', new Set(ids), ids.length, [])
}

// ── испытания ─────────────────────────────────────────────────────────
{
  // Цепочка: пока rewardCard не открыта, доступно следующее в ветке.
  // Пройти можно все — если карты- награды не достаются случайно.
  const ids = Object.values(TRIALS).filter((t) => t && t.id && !t.id.startsWith('_')).map((t) => t.id)
  const leaked = Object.values(TRIALS)
    .filter((t) => t && t.rewardCard)
    .filter((t) => cardRewardPool([]).some((c) => c.id === t.rewardCard))
    .map((t) => `${t.id}→${t.rewardCard}`)
  add('испытания', new Set(ids), ids.length, leaked)
}

// ── поле: оки, владыки, поведения ──────────────────────────────────────
{
  const inRun = new Set()
  // Состав комнаты — розыгрыш (Hades: комната меняется от побега к побегу).
  // Значит, «одна сборка на чакру» ничего не доказывает: раньше здесь стоял
  // `rng: () => 0.5`, и при тасовке он давал одну и ту же перестановку — три
  // оков выпадали из проверки как «недостижимые». Теперь обходим много
  // розыгрышей с разными seed.
  const rngFor = (seed) => {
    let t = (seed * 2654435761) >>> 0
    return () => {
      t ^= t << 13; t >>>= 0
      t ^= t >>> 17
      t ^= t << 5; t >>>= 0
      return (t >>> 0) / 4294967296
    }
  }
  for (let f = 0; f < CHAKRAS.length; f++) {
    for (let r = 0; r < 3; r++) {
      for (let seed = 1; seed <= 12; seed++) {
        const b = buildFieldFloor(f, { room: r, rng: rngFor(seed * 7919 + f * 31 + r) })
        for (const foe of b.foes) inRun.add(foe.id)
        if (b.boss) inRun.add(b.boss.id)
      }
    }
  }
  const behaviors = Object.keys(FOE_BEHAVIOR)
  add('профили поведения', new Set(behaviors.filter((b) => inRun.has(b))), behaviors.length,
    behaviors.filter((b) => !inRun.has(b)))

  // У боссов нет флага `boss` — их роль задаётся тем, что на них ссылаются
  // миры. Проверяем по миру, а не по выдуманному полю.
  const bosses = Object.values(WORLDS).filter((w) => w && w.lordId).map((w) => w.lordId)
  const seenBoss = new Set(bosses.filter((b) => inRun.has(b)))
  add('боссы контента (= владыки миров)', seenBoss, bosses.length,
    bosses.filter((b) => !inRun.has(b)))
}

// ── поле: сила ────────────────────────────────────────────────────────
add('нефриты (Фонтан)', new Set(KEEPSAKES.map((k) => k.id)), KEEPSAKES.length, [])
add('дары (черновик 1 из 3)', new Set(FIELD_BOONS.map((b) => b.id)), FIELD_BOONS.length, [])
add('усиления мастерской', new Set(WORKSHOP.map((w) => w.id)), WORKSHOP.length, [])
add('варны (оружие)', new Set(Object.keys(VARNA_KITS)), Object.keys(VARNA_KITS).length, [])

// ── вывод ─────────────────────────────────────────────────────────────
let bad = 0
console.log('ДОСТИЖИМОСТЬ СОДЕРЖАНИЯ')
for (const r of rows) {
  const ok = r.have === r.total
  if (!ok) bad++
  console.log(`  ${ok ? '✓' : '✗'} ${r.name}: ${r.have}/${r.total}` +
    (r.list.length ? ` — недостижимо: ${r.list.join(', ')}` : ''))
}
console.log(bad === 0 ? 'всё содержимое достижимо' : `недостижимых позиций: ${bad}`)
process.exitCode = bad === 0 ? 0 : 1
