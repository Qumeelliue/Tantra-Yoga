// ДОСТИЖИМОСТЬ ЦИТАТ.
//
// Проверяет, что каждая цитата корпуса хоть как-то проживаема. Раньше из 100
// цитат открывалось 52: остальные 48 были написаны, сверены с источниками и
// лежали в content/, но игрок не мог увидеть их никогда. Это не запас на
// будущее, а мусор.
//
// Запуск: node --experimental-loader ./scripts/aliases.mjs scripts/auditQuotes.mjs

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { QUOTES, ENEMIES, CARDS, RELICS, cardRewardPool } from '../webapp/js/core/data.js'
import { reachableQuoteIds, brokenTeaching } from '../webapp/js/core/teaching.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const reach = new Set(reachableQuoteIds())

for (const e of Object.values(ENEMIES)) if (e && e.quoteId) reach.add(e.quoteId)
for (const c of cardRewardPool(Object.keys(CARDS))) if (c.quoteId) reach.add(c.quoteId)
for (const c of Object.values(CARDS)) if (c && c.starter && c.quoteId) reach.add(c.quoteId)
for (const r of Object.values(RELICS)) if (r && r.quoteId) reach.add(r.quoteId)

const jsDir = join(root, 'webapp/js')
for (const f of readdirSync(jsDir, { recursive: true })) {
  if (!String(f).endsWith('.js')) continue
  const s = readFileSync(join(jsDir, String(f)), 'utf8')
  for (const m of s.matchAll(/quoteId: '([a-z_]+)'/g)) reach.add(m[1])
  for (const m of s.matchAll(/markLived\([^,]+, '([a-z_]+)'\)/g)) reach.add(m[1])
}

const all = Object.keys(QUOTES).filter((k) => !k.startsWith('_'))
const missing = all.filter((k) => !reach.has(k))
const broken = brokenTeaching()

console.log(`цитат в корпусе: ${all.length}`)
console.log(`достижимы: ${reach.size}`)
console.log(`недостижимы: ${missing.length}${missing.length ? ' — ' + missing.join(', ') : ''}`)
console.log(`привязаны к несуществующим цитатам: ${broken.length}${broken.length ? ' — ' + broken.join(', ') : ''}`)
process.exitCode = missing.length || broken.length ? 1 : 0
