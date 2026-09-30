// Сверка НАШИХ определений с глоссариями корпуса.
//
// Термин написан правильно — ещё не значит, что переведён правильно. В
// этом проекте слова пришли тремя путями: деванагари → IAST → русский, и
// на каждом шаге можно было потерять смысл. Скрипт собирает определения
// из глоссариев корпуса (это переводы самого Саркара) и показывает наши
// — на глаз и на сверку.
//
// Запуск: node scripts/auditGlossary.mjs [слово]

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS = join(root, '.opencode/skills')

// ── собрать глоссарии корпуса ─────────────────────────────────────────
const glossaries = []
function walk(d) {
  let ents
  try { ents = readdirSync(d) } catch { return }
  for (const e of ents) {
    const p = join(d, e)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) walk(p)
    else if (e === 'glossary.md') {
      const book = p.split('/').slice(-2)[0]
      const text = readFileSync(p, 'utf8')
      for (const line of text.split('\n')) {
        // «**Термин (translit)** — определение (Ch N)»
        const m = line.match(/^\*\*([^*]+?)\*\*\s*—\s*(.+?)\s*$/)
        if (m) glossaries.push({ term: m[1].trim(), def: m[2].trim(), book })
      }
    }
  }
}
walk(SKILLS)

const norm = (s) => s.toLowerCase()
  .replace(/[а-яё]/g, (c) => c === 'ё' ? 'е' : c)
  .replace(/[^a-zа-я]/g, '')

const key = (s) => norm(s.split('(')[0])

// ── наши определения ──────────────────────────────────────────────────
const quotes = JSON.parse(readFileSync(join(root, 'content/quotes.json'), 'utf8'))
const ours = []
for (const [k, v] of Object.entries(quotes)) {
  if (k.startsWith('_') || !v || typeof v !== 'object') continue
  if (typeof v.term === 'string') ours.push({ k, term: v.term, meaning: v.meaning || '', sanskrit: v.sanskrit || '' })
}

const index = new Map()
for (const g of glossaries) {
  const kk = key(g.term)
  if (!index.has(kk)) index.set(kk, [])
  index.get(kk).push(g)
}

const filter = process.argv[2]
let matched = 0
const pairs = []
for (const o of ours) {
  if (filter && !norm(o.term).includes(norm(filter)) && !norm(o.k).includes(norm(filter))) continue
  const g = index.get(key(o.term))
  if (!g || !g.length) continue
  matched++
  pairs.push({ ours: o, corpus: g })
}

console.log(`глоссариев в корпусе: ${new Set(glossaries.map((g) => g.book)).size} · определений: ${glossaries.length}`)
console.log(`наших терминов: ${ours.length} · нашлось в глоссариях: ${matched}\n`)
for (const p of pairs) {
  console.log(`── ${p.ours.term}  (${p.ours.sanskrit})`)
  console.log(`   НАШЕ:    ${p.ours.meaning}`)
  for (const g of p.corpus) console.log(`   КОРПУС:  ${g.def}   [${g.book}]`)
  console.log()
}
process.exitCode = 0
