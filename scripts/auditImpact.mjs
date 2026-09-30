// АУДИТ «НАГРАДА ВЛИЯЕТ»: каждая ли дар/нефрит/усиление/варна меняет
// величину, которую бой действительно читает.
//
// Зачем. `auditObtainable` проверяет, что контент ВЫДАЁТСЯ. Но можно выдать
// игроку дар, который ничего не меняет: величина записана в опции боя, а
// боевой код её не читает. Игрок берёт «Дар Кииртана» — и ничего не
// чувствует. Это худший вид помойки: награда выглядит как награда.
//
// Проверка простая и честная: записать, какие поля опций трогает каждая
// награда, и посмотреть, читает ли кто-нибудь эти поля в `webapp/js`.
// Мёртвое поле = награда-пустышка.
//
// node --experimental-loader ./scripts/aliases.mjs scripts/auditImpact.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BOONS } from '../webapp/js/core/boons.js'
import { KEEPSAKES } from '../webapp/js/core/keepsakes.js'
import { WORKSHOP } from '../webapp/js/core/workshop.js'
import { VARNA_KITS } from '../webapp/js/core/varnaKits.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const rd = (p) => readFileSync(join(root, p), 'utf8')

// Весь код игры одним текстом: величина может читаться где угодно.
function allJs(dir) {
  const out = []
  const queue = [join(root, dir)]
  while (queue.length) {
    const cur = queue.pop()
    for (const name of readdirSync(cur)) {
      const p = join(cur, name)
      if (statSync(p).isDirectory()) queue.push(p)
      else if (name.endsWith('.js')) out.push(readFileSync(p, 'utf8'))
    }
  }
  return out.join('\n')
}
const CODE = allJs('webapp/js')

/** Какие поля опций пишет награда. */
function touched(apply) {
  const keys = new Set()
  const proxy = new Proxy({}, {
    get: (t, k) => (typeof k === 'string' && k in t ? t[k] : 0),
    set(t, k, v) { keys.add(k); t[k] = v; return true },
  })
  try { apply(proxy) } catch { /* apply читает поле — наш get отдаёт 0 */ }
  return [...keys]
}

/** Читает ли кто-нибудь в коде поле опций (`st.o.x`, `o.x`, `opts.x`). */
function isRead(key) {
  return new RegExp(`(?:st\\.o|st\\.opts|opts|\\bo|\\bo2)\\.${key}\\b`).test(CODE)
}

const groups = [
  ['дар чакры', BOONS],
  ['нефрит', KEEPSAKES],
  ['мастерская', WORKSHOP],
  ['ментальность', Object.values(VARNA_KITS)],
]

const rows = []
for (const [group, list] of groups) {
  for (const item of list) {
    const keys = touched(item.apply)
    rows.push({ group, id: item.id, name: item.name || item.label || item.id, keys, dead: keys.filter((k) => !isRead(k)) })
  }
}

const dead = rows.filter((r) => r.dead.length)
const empty = rows.filter((r) => !r.keys.length)

console.log('аудит «награда влияет»: бой читает', new Set(CODE.match(/\bo\.[A-Za-z]+/g) || []).size, 'различных величин')
console.log('наград разобрано:', rows.length)
for (const g of groups) console.log(`  ${g[0]}: ${g[1].length}`)
if (empty.length) {
  console.log('\nПУСТЫЕ награды (ничего не меняют):')
  for (const r of empty) console.log('  ', r.group, r.id)
}
if (dead.length) {
  console.log('\nМЁРТВЫЕ величины (награда выдаётся, но бой их не читает):')
  for (const r of dead) console.log(`   ${r.group} «${r.name}» (${r.id}) → ${r.dead.join(', ')}`)
  console.log('\nИтог: награда-пустышка. Игрок берёт — и ничего не чувствует.')
  process.exit(1)
}
console.log('\nмёртвых величин: 0 — каждая награда меняет то, что бой читает.')
