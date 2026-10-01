// ШИРИНА ДОРОГИ: сколько сборок колоды вообще способны дойти до мира.
//
// Вопрос автора (2026-09-30): цель §18 требовала «25–40 % мирных финалов».
// Замер её давал 0 % у силового бота и 95 % у пасифиста. Это два КРАЯ шкалы
// бота, а не игрок между ними, и число по ним нельзя понять. Значит нужна
// другая ось, и это свойство ИГРЫ, а не бота:
//
//   сколько РАЗНЫХ способов дойти до мира существует и по какой цене.
//
// Почему это правильный вопрос, а не «процент»:
//
//   · «% мирных финалов» отвечает на вопрос «какой шанс у этого бота» —
//     а ботов ровно два, и оба написаны нами;
//   · «ширина дороги» отвечает на вопрос «сколько дверей есть в стене» —
//     и это можно проверить по контенту и замером.
//
// Три оси, которые здесь считаются:
//
//   1. СКЛЬЗКО ДОРОГА. `pacify` в пуле наград ровно одна карта (Ахимса), и
//      она же стартовая. Значит мирный путь нельзя построить на выборе:
//      Ахимса либо уже есть, либо ты не можешь успокоить никого. Проверяем.
//   2. СКОЛЬКО СПОСОБОВ. Успокоить можно тремя разными способами: Ахимса
//      (2 копии в старте), микровиты (Видьядхара, Сиддха) и прама для
//      владык (Ишвара-пранидхана). Три пути — или один?
//   3. ЦЕНА. Что отнимает мирный путь: здоровье, время, колоду. Меряется
//      тем же замером, что и всё остальное.
//
// Флаги — только через `--`, как требует правило проекта:
//   node ... scripts/roadWidth.mjs 200
//   node ... scripts/roadWidth.mjs 200 -- --paths

import { CARDS, TRIAL_REWARD_CARDS } from '@webapp/js/core/data.js'
import { readFileSync } from 'node:fs'

const here = new URL('../', import.meta.url)
const read = (p) => readFileSync(new URL(p, here), 'utf8')

const PEACE_CARD_EFFECT = 'pacify'
const MICROVITA = 'microvita'
const PRAMA = 'balance'

function isRewardPool(card) {
  if (!card || !card.id) return false
  if (card.type === 'curse' || card.type === 'vritti') return false
  if (TRIAL_REWARD_CARDS.includes(card.id)) return true
  if (card.starter) return false
  return true
}

const hasEffect = (card, kind) => (card.effects || []).some((e) => e.kind === kind)

/**
 * ОСЬ 1 и 2: сколько дверей в стене.
 *
 * Ключевое различие, которое не видно по списку карт: карта в пуле наград и
 * карта в стартовой колоде — это РАЗНЫЕ вещи. Пул наград — то, что игрок
 * выбирает. Стартовая колода — то, что у него есть сразу. Мирный путь
 * доступен только через стартовую колоду, а это уже не «выбор», а данность,
 * и тогда сам вопрос «сколько путей» получает неочевидный ответ.
 */
function analyseContent() {
  const all = Object.values(CARDS)
  const pool = all.filter(isRewardPool)
  const starters = []
  for (const c of all) {
    if (c && c.id && c.starter > 0) for (let i = 0; i < c.starter; i++) starters.push(c)
  }

  const pacifyInPool = pool.filter((c) => hasEffect(c, PEACE_CARD_EFFECT))
  const pacifyStarter = starters.filter((c) => hasEffect(c, PEACE_CARD_EFFECT))
  const microInPool = pool.filter((c) => hasEffect(c, MICROVITA))
  const microStarter = starters.filter((c) => hasEffect(c, MICROVITA))
  const pramaInPool = pool.filter((c) => hasEffect(c, PRAMA))
  const pramaStarter = starters.filter((c) => hasEffect(c, PRAMA))

  return {
    poolSize: pool.length,
    starterSize: starters.length,
    pacify: { pool: pacifyInPool.map((c) => c.id), starter: pacifyStarter.length },
    microvita: { pool: microInPool.map((c) => c.id), starter: microStarter.length },
    prama: { pool: pramaInPool.map((c) => c.id), starter: pramaStarter.length },
  }
}

function printContent(a) {
  console.log('── ШИРИНА ДОРОГИ: сколько дверей в стене ──')
  console.log(`пул наград: ${a.poolSize} карт · стартовая колода: ${a.starterSize} карт`)
  console.log()
  console.log('Три способа успокоить оку:')
  console.log(`  1. Ахимса (pacify)     — в пуле наград: ${a.pacify.pool.length ? a.pacify.pool.join(', ') : '—'} · в старте: ${a.pacify.starter} шт.`)
  console.log(`  2. Микровиты           — в пуле наград: ${a.microvita.pool.length ? a.microvita.pool.join(', ') : '—'} · в старте: ${a.microvita.starter} шт.`)
  console.log(`  3. Прама (для владык) — в пуле наград: ${a.prama.pool.length ? a.prama.pool.join(', ') : '—'} · в старте: ${a.prama.starter} шт.`)
  console.log()

  // Главный вывод по контенту, и он неочевиден.
  if (a.pacify.pool.length === 0) {
    console.log('  ⚠ В ПУЛЕ НАГРАД НЕТ НИ ОДНОЙ КАРТЫ, КОТОРАЯ УСПОКАОИТ.')
    console.log('    Значит мирный путь НЕЛЬЗЯ построить на выборе карт: он держится')
    console.log('    исключительно на Ахимсе из стартовой колоды. Это не «узкая')
    console.log('    дорога», это её отсутствие: игрок, потерявший Ахимсу, мирного')
    console.log('    пути не имеет ВООБЩЕ, ни через какую комбинацию.')
  }
  if (a.microvita.pool.length > 0 && a.microvita.starter === 0) {
    console.log('  · Микровиты — второй путь, и он открывается только выбором: в старте')
    console.log('    их нет. То есть Ахимса = надёжно, микровиты = игрок сначала догадался.')
  }
  if (a.prama.pool.length > 0 && a.prama.starter === 0) {
    console.log('  · Прама — третий путь, и он тоже только из выбора. Без неё владыку')
    console.log('    успокоить нельзя ВООБЩЕ (engine.js `pacifyReady`), значит Ахимса')
    console.log('    даёт владыку, а прама открывает второй маршрут к нему.')
  }
  return a
}

if (process.argv[1] && process.argv[1].endsWith('roadWidth.mjs')) {
  const a = printContent(analyseContent())
  const totalPaths =
    (a.pacify.starter > 0 || a.pacify.pool.length > 0 ? 1 : 0) +
    (a.microvita.pool.length > 0 ? 1 : 0) +
    (a.prama.pool.length > 0 ? 1 : 0)
  console.log()
  console.log(`ИТОГ: способов успокоить оку — ${totalPaths} из 3. Ширина дороги задаётся контентом, а не ботом.`)

  // ── ОСЬ 3: ЦЕНА. Сколько стоит каждый путь ────────────────────────────
  //
  // Здесь нужен реальный бой, поэтому зовём уже проверенный `runOnce` из
  // `balance.mjs`. Он же — эталон честности (сессия 23, МЕХАНИКА 34:
  // «замер обязан считать пороги из кода игры»). Свой бой здесь писать
  // нельзя: через месяц он разойдётся с игрой и начнёт врать, как все
  // предыдущие.
  const { runOnce } = await import('./balance.mjs')
  const N = Number(process.argv[2] || 100)

  // Каждый путь — это не «новый бот», а ДОПОЛНЕНИЕ к колоде. Поэтому
  // измеряется добавка, а не замена: «мирный путь на Ахимсе» против
  // «мирный путь на Ахимсе + микровиты» против «…+ прама».
  const SUITES = [
    { id: 'ahimsa-only', name: 'только Ахимса', extra: [] },
    { id: 'ahimsa+micro', name: 'Ахимса + микровиты', extra: ['vidyadhara', 'siddha'] },
    { id: 'ahimsa+prama', name: 'Ахимса + прама', extra: ['ishvara_pranidhana'] },
    { id: 'all-three', name: 'Ахимса + микровиты + прама', extra: ['vidyadhara', 'siddha', 'ishvara_pranidhana'] },
  ]

  console.log()
  console.log(`── ЦЕНА КАЖДОГО ПУТИ (${N} забегов на набор, бот играет за мир) ──`)
  console.log('Добавка в стартовую колоду. Смотрим: удалось ли дойти и чем за это')
  console.log('заплачено (победа, кровь, минимум жизни за забег).')
  console.log()

  const rows = []
  for (const suite of SUITES) {
    const runs = []
    for (let s = 1; s <= N; s++) {
      const seed = s * 100 + 7
      const r = runOnce(seed, true, suite.extra)
      runs.push(r)
    }
    const wins = runs.filter((r) => r.status === 'victory').length
    const peace = runs.filter((r) => r.peaceful).length
    const dead = runs.filter((r) => r.status === 'dead').length
    const mins = runs.map((r) => r.minHp).filter(Number.isFinite)
    const avgMin = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : 0
    const low = mins.filter((n) => n < 30).length
    const kills = runs.reduce((a, r) => a + (r.fightKills || 0), 0)
    rows.push({ suite, wins, peace, dead, avgMin, low, kills, n: N })
    console.log(
      `  ${suite.name.padEnd(30)} побед ${String(wins).padStart(3)}/${N}` +
      ` · мирных ${String(peace).padStart(3)}` +
      ` · смертей ${String(dead).padStart(2)}` +
      ` · мин. жизнь ${String(avgMin).padStart(3)}%` +
      ` · ниже 30%: ${String(low).padStart(2)}` +
      ` · крови: ${kills}`
    )
  }

  console.log()
  const best = rows.reduce((m, r) => (r.peace > m.peace ? r : m), rows[0])
  const worst = rows.reduce((m, r) => (r.peace < m.peace ? r : m), rows[0])
  console.log(`  Лучший набор: ${best.suite.name} (${best.peace}/${N} мирных).`)
  console.log(`  Худший набор: ${worst.suite.name} (${worst.peace}/${N} мирных).`)
  console.log()
  if (worst.peace === 0) {
    console.log('  ⚠ Есть набор, который не доходит до мира НИ РАЗУ. Это не «сложный мирный')
    console.log('    путь», это ОТСУТСТВИЕ пути: игрок, собравший такую колоду, встал в тупик.')
    console.log('    Ширина дороги измеряется не «сложно ли дойти», а «есть ли чем» — и вот')
    console.log('    тут дороги нет.')
  } else if (best.peace - worst.peace > N * 0.3) {
    console.log('  · Разброс между наборами большой: выбор карт РЕШАЕТ, будет ли мир, а не')
    console.log('    только насколько тяжело до него идти. Это и есть настоящая «ширина».')
  } else {
    console.log('  · Все наборы доходят до мира с сопоставимой ценой. Значит дорога широкая,')
    console.log('    а её цена задаётся не выбором карт, а умением играть.')
  }
}
