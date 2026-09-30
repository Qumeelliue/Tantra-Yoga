// Сверка с MASTER SAMSKRTA GLOSSARY (Ananda Marga Pracaraka Samgha, 2009).
//
// Это сводный официальный глоссарий на 312 терминов с определениями на
// английском. Он — высший судья: не переводчик, не пересказ, а издание
// организации. Наши определения сверяются с ним по существу.
//
// Скрипт сам честно отмечает, когда совпадения НЕТ: молча пропущенное
// совпадение хуже, чем лишняя строка.
//
// Запуск: node scripts/auditMasterGlossary.mjs [слово]

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const CANDIDATES = [
  join(root, 'sources/Master_Samskrta_Glossary.txt'),
  '/Users/100nout/Seva/Shastra/sources/Master_Samskrta_Glossary.txt',
  '/Users/100nout/Seva/Prodiun/sources/Master_Samskrta_Glossary.txt',
]
// В .txt диакритика СОСТАВНАЯ (s + U+0301), в .md — предкомпозированная.
// Без нормализации любое сравнение строк с этими источниками ломается молча.
const fold = (s) => String(s).normalize('NFC')
const src = CANDIDATES.find((p) => existsSync(p))
if (!src) {
  console.log('Master_Samskrta_Glossary.txt не найден. Искал:\n  ' + CANDIDATES.join('\n  '))
  process.exitCode = 2
} else {
  const text = readFileSync(src, 'utf8')
  // строки вида «term: definition»; термин может быть списком через запятую
  const entries = []
  for (const line of text.split('\n')) {
    const m = line.match(/^([a-zA-ZśŚṣṢṅṆṇḍṭ][^:]{0,90}):\s*(.+)$/)
    if (!m) continue
    for (const t of m[1].split(',')) {
      const key = t.trim().split(' (')[0]
      if (key) entries.push({ term: key, def: m[2].trim() })
    }
  }
  const index = new Map()
  for (const e of entries) {
    const k = e.term.toLowerCase().replace(/[^a-zа-я]/g, '')
    if (!index.has(k)) index.set(k, [])
    index.get(k).push(e)
  }

  const quotes = JSON.parse(readFileSync(join(root, 'content/quotes.json'), 'utf8'))
  const ours = []
  for (const [k, v] of Object.entries(quotes)) {
    if (k.startsWith('_') || !v || typeof v !== 'object') continue
    if (typeof v.term === 'string') ours.push({ k, ...v })
  }

  const filter = process.argv[2]
  const norm = (s) => s.toLowerCase().replace(/[^a-zа-я]/g, '')
  const rows = ours.filter((o) => !filter || norm(o.k).includes(norm(filter)))

  let found = 0
  for (const o of rows) {
    const hit = index.get(norm(o.k)) || index.get(norm(o.term))
    if (!hit || !hit.length) continue
    found++
    console.log(`── ${o.term}  (${o.sanskrit})`)
    console.log(`   НАШЕ:    ${o.meaning || ''}`)
    for (const h of hit) console.log(`   ГЛОСС.:  ${h.term}: ${fold(h.def).slice(0, 300)}`)
    console.log()
  }
  console.log(`глоссарий: ${entries.length} терминов из ${src}`)
  console.log(`наших терминов: ${ours.length} · найдено в глоссарии: ${found} · не найдено: ${ours.length - found}`)
}
