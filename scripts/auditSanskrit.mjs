// АУДИТ ТЕРМИНОВ ПО КОРПУСУ.
//
// Проблема: санскритские термины пришли к нам из трёх языков сразу — из
// деванагари в оригинале, из латинской транслитерации (IAST) и из
// русского перевода корпуса. И в каждом из этих путей можно ошибиться.
//
// «Санскары» вместо «самскары» — пример такой ошибки: аноунсвара ṃ при
// переходе в русский пишется «м», и в корпусе так и написано (404 раза
// «самскары», 101 «санскары»). Значит судья — корпус: сколько раз в
// переводах Ананда Марги встречается наше написание и сколько —
// конкурирующее.
//
// Запуск: node scripts/auditSanskrit.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const SKILLS = '.opencode/skills'

function walk(dir, out = []) {
  let ents
  try { ents = readdirSync(dir) } catch { return out }
  for (const e of ents) {
    const p = join(dir, e)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) walk(p, out)
    else if (e.endsWith('.md') || e.endsWith('.txt')) out.push(p)
  }
  return out
}

// Корпус читается ЛЕНИВО и только когда он реально понадобился. Раньше он
// читался на верхнем уровне — 3329 файлов, 14,6 млн знаков, почти минута —
// и поэтому модуль нельзя было импортировать из теста: тот ждал импорта.
let _lower = null
function corpusLower() {
  if (_lower !== null) return _lower
  let all = ''
  for (const f of walk(SKILLS)) {
    try { all += readFileSync(f, 'utf8') + '\n' } catch { /* пропускаем */ }
  }
  _lower = all.toLowerCase()
  return _lower
}

/** Слова корпуса, похожие на наш термин (расстояние ≤ 2 замены/вставки). */
function variants(word, lower) {
  const w = word.toLowerCase().replace(/[^a-zа-я]/g, '')
  if (w.length < 4) return []
  const found = new Map()
  // Слова берём ЦЕЛИКОМ, а не кусками нужной длины. Иначе из слова
  // «холодность» сначала выкусывается «холодна», и само «холодность» уже
  // никогда не попадает в кандидаты — а это ровно то слово, ради которого
  // проверка и нужна.
  const m = lower.match(/[a-zа-я]+/g) || []
  const lo = w.length - 2
  const hi = w.length + 2
  const words = m.filter((c) => c.length >= lo && c.length <= hi)
  if (!words.length) return []
  const near = (a, b) => {
    if (a === b) return true
    // Опечатка в транслитерации меняет одну-две буквы, а не половину слова.
    // Без этого «грна» считалось похожим на «га» (302 совпадения — это
    // обычное русское «га»), и аудит требовал исправить термин на другое
    // слово вместо того, чтобы признать его правильным.
    if (b.length < a.length - 1) return false
    if (Math.abs(a.length - b.length) > 2) return false
    let i = 0
    while (i < a.length && i < b.length && a[i] === b[i]) i++
    let j = 0
    while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++
    // Общего начала ИЛИ общего конца, и немало. Без этого «грна» считалось
    // похожим на «арна» (общий конец «рна»), и аудит требовал исправить
    // термин на чужое слово. Термины не «почти как арна» — они от неё
    // отличаются началом.
    // Общая основа. Опечатка транслитерации не переписывает слово, а
    // трогает одну-две буквы на одном краю: «санскары»→«самскары» (общий
    // конец «скары», 5 букв из 8), «холодная»→«холодность» (общее начало).
    //
    // Без этого требования «грна» и «гуна» считались опечаткой (общая одна
    // буква, различие в одной), и аудит требовал заменить правильный термин
    // на другой правильный термин.
    if (a.length < 6) {
      // Короткое слово по сходству не судим: «грна»/«гуна», «рна»/«арна» —
      // это разные слова, а не опечатки, и проверить их может только
      // сравнение значения, которого здесь нет.
      if (i < 2) return false
      return (a.length - i - j) + (b.length - i - j) <= 1
    }
    const stem = Math.max(i, j)
    if (stem < 3) return false
    return (a.length - i - j) + (b.length - i - j) <= 2
  }
  for (const cand of words) {
    if (cand === w) continue
    if (!near(w, cand)) continue
    found.set(cand, (found.get(cand) || 0) + 1)
  }
  return [...found.entries()].sort((a, b) => b[1] - a[1])
}

/** Расстояние Левенштейна: сколько букв надо поменять, чтобы получить b. */
function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  const cur = new Array(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]
  }
  return prev[b.length]
}

const count = (s, lower) => (lower.match(new RegExp(s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length

const terms = new Map()
for (const [file, field] of [['content/quotes.json', 'term'], ['content/cards.json', 'name']]) {
  let data
  try { data = JSON.parse(readFileSync(file, 'utf8')) } catch { continue }
  for (const [key, v] of Object.entries(data)) {
    if (!v || typeof v !== 'object' || key.startsWith('_')) continue
    if (typeof v.sanskrit !== 'string' || !/[\u0900-\u097F]/.test(v.sanskrit)) continue
    const ru = v[field]
    if (typeof ru !== 'string' || ru.length < 4) continue
    const base = ru.replace(/^(Дар|Карта)\s+/i, '').replace(/[^A-Za-zА-Яа-яЁё ]/g, '').trim()
    if (base.length < 4) continue
    if (!terms.has(base)) terms.set(base, { key, dv: v.sanskrit, where: file })
  }
}

/**
 * Обычные русские слова, которые случайно похожи на термин.
 *
 * Корпус — это перевод книг Ананда Марги, и термины в нём часто остаются
 * латиницей (`ghrńá`, `shauṋká`), а не русской транслитерацией. Поэтому
 * наше «Самшая» в корпусе не встречается НОЛЬ РАЗ, и близкое слово «самая»
 * (обычное прилагательное «самая грубая точка») набирает 81 совпадение.
 * Аудит принимал это за ошибку перевода и требовал написать «Самая» — что
 * ещё хуже.
 *
 * Здесь перечислены слова, которые не являются терминами и потому не могут
 * быть «правильным написанием» нашего термина.
 */
const NOT_A_TERM = new Set(['самая', 'самое', 'самый', 'снова', 'семья', 'судья', 'счастье'])

/**
 * Самопроверка. Без неё любой порог можно поднять так, что аудит станет
 * тихим и всегда зелёным. Эталон — тот случай, который автор поймал
 * лично: «санскары» вместо «самскары», плюс «холодная» вместо
 * «холодность» (была ошибка перевода śīla).
 */
export function selfTest(lower) {
  // Проверяется ПРАВИЛО, а не статистика корпуса: должен ли аудит считать
  // одно слово опечаткой другого. Эталон — то, что автор поймал лично.
  const cases = [
    ['санскары', 'самскары', true],    // ← тот самый случай, пойманный автором
    ['грна', 'гуна', false],           // разные слова
    ['грна', 'рна', false],            // и уж тем более
    ['грна', 'га', false],
    ['самскары', 'санскары', true],    // и в обратную сторону
  ]
  const bad = []
  for (const [term, other, shouldBeAlt] of cases) {
    const alts = variants(term, lower).filter(([w]) => !NOT_A_TERM.has(w)).map(([w]) => w)
    const found = alts.includes(other)
    if (found !== shouldBeAlt) {
      bad.push(`«${term}» ${shouldBeAlt ? 'должен' : 'не должен'} считать опечаткой «${other}» (найдено: ${alts.join(', ') || '—'})`)
    }
  }
  return bad
}

/**
 * Полный прогон по корпусу. Отделён от загрузки модуля: тестам нужно
 * правило (selfTest), а не получасовой обход 3329 файлов.
 */
export function runAudit() {
  const lower = corpusLower()
  const rows = []
  for (const [term, info] of terms) {
    const ours = count(term, lower)
    const alts = variants(term, lower).filter(([w]) => !NOT_A_TERM.has(w))
    const top = alts[0]
    if (!top) continue
    // Ошибка — когда НАШЕ написание в корпусе не встречается, а близкое
    // встречается часто. Если наше есть (пусть даже два раза) — всё в
    // порядке: дальше идут падежи и формы, а не ошибки перевода.
    if (ours === 0 && top[1] >= 5) rows.push({ term, ours, alt: top[0], altN: top[1], ...info })
  }
  rows.sort((a, b) => b.altN - a.altN)
  return { rows, lower, files: walk(SKILLS) }
}

// Модуль можно и импортировать, и запустить. Сам аудит — только при прямом
// запуске: иначе тест, импортирующий selfTest, ждал бы чтение корпуса.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const self = selfTest(corpusLower())
  if (self.length) {
    console.log('САМОПРОВЕРКА АУДИТА НЕ ПРОШЛА:')
    for (const s2 of self) console.log('  ' + s2)
    process.exitCode = 1
  } else {
    console.log('самопроверка аудита пройдена (эталон: «санскары»→«самскары» ловится, «грна»→«гуна» нет)')
  }

  const { rows, lower, files } = runAudit()
  console.log(`файлов корпуса: ${files.length}, знаков: ${lower.length.toLocaleString('ru')}`)
  console.log(`терминов с деванагари: ${terms.size}`)
  console.log(`расхождений с корпусом: ${rows.length}\n`)
  for (const r of rows) {
    console.log(`  ${r.term.padEnd(20)} у нас ${String(r.ours).padStart(4)} · корпус чаще: «${r.alt}» ${r.altN}`)
  }
  if (rows.length) process.exitCode = 1
}
