// ПОИСК «ИСПОЛЬЗОВАНО ДО ОБЪЯВЛЕНИЯ» (Temporal Dead Zone).
//
// Что это ловит. В `webapp/js/ui/screens/field.js` стояло:
//
//     const hint = h('div', { class: 'field-hint on' },
//       isTouch ? 'веди пальцем…' : 'идти WASD…')     // строка 128
//     …
//     const isTouch = matchMedia('(hover: none)…').matches   // строка 246
//
// Это не ошибка стиля, а падение: `const` в той же области не поднят, и при
// первом же вызове `fieldScreen` движок бросает
// `ReferenceError: Cannot access 'isTouch' before initialization` — то есть
// ЭКРАН БОЯ НЕ РИСУЕТСЯ ВООБЩЕ. Сборка это не ловит (сборка не выполняет
// код), ядро не ловит (ядро про экран не знает), и 660 тестов были зелёные.
//
// Нашёл это только стенд DOM, который вызывает экраны по-настоящему. Но
// стенд ловит только те экраны, до которых дошёл. Этот скрипт ловит все —
// статически, по исходнику.
//
// Проверка приблизительная и в одну сторону: она НЕ ловит случай
// «const внутри if, прочитанный выше», и это осознанно — там нужен разбор
// потока управления. Зато не даёт ложных срабатываний на:
//   · объявления функций (они подняты — это законно),
//   · `var` (тоже поднят),
//   · обращения внутри вложенных функций (они выполняются позже),
//   · параметры функций и переменные из внешних областей.
//
// Запуск: node --experimental-loader ./scripts/aliases.mjs scripts/auditTdz.mjs

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAst } from 'rollup/parseAst'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const jsDir = join(root, 'webapp/js')

/** Все файлы проекта. */
function allFiles(dir) {
  const out = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name)
    if (name.isDirectory()) out.push(...allFiles(p))
    else if (name.name.endsWith('.js')) out.push(p)
  }
  return out
}

// ── обход ──────────────────────────────────────────────────────────────
/** Имена, объявленные `const`/`let` в теле функции, с их позицией. */
function collectLexical(body) {
  const decls = new Map()
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const n of node) visit(n); return }
    // объявление внутри вложенной функции — это другая область: она
    // затеняет внешнюю и никак не участвует в зоне мёртвых переменных
    if (isFunction(node)) return
    if (node.type === 'VariableDeclaration' && (node.kind === 'const' || node.kind === 'let')) {
      for (const d of node.declarations || []) {
        if (d.id && d.id.type === 'Identifier' && !decls.has(d.id.name)) {
          decls.set(d.id.name, d.start ?? d.id.start ?? 0)
        }
      }
    }
    for (const k of Object.keys(node)) {
      if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue
      visit(node[k])
    }
  }
  visit(body)
  return decls
}

/**
 * Обращения к имени, выполненные САМИМ телом функции.
 *
 * Внутрь вложенных функций НЕ заходим: они выполняются позже — их тело
 * читает переменную в момент вызова, а не в момент объявления. Объявление
 * функции тоже поднято движком, так что законно всё, что происходит внутри.
 */
function directReferences(body, name) {
  const hits = []
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const n of node) visit(n); return }
    if (isFunction(node)) return
    if (node.type === 'Identifier' && node.name === name) {
      if (node.start !== undefined) hits.push(node.start)
      return
    }
    for (const k of Object.keys(node)) {
      if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue
      // .name — свойство, а не переменная
      if (k === 'property' && node.type === 'MemberExpression') continue
      if (k === 'key' && node.type === 'Property') continue
      // параметры и прочее — не наше объявление
      if (k === 'id' && node.type === 'VariableDeclarator') continue
      visit(node[k])
    }
  }
  for (const st of body.body || []) visit(st)
  return hits
}

const isFunction = (n) => /Function(Declaration|Expression)$/.test(n.type) || n.type === 'ArrowFunctionExpression'

/** Обходим все функции модуля. */
function eachFunction(ast, fn) {
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const n of node) visit(n); return }
    if (isFunction(node) && node.body && Array.isArray(node.body.body)) fn(node)
    for (const k of Object.keys(node)) {
      if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue
      visit(node[k])
    }
  }
  visit(ast)
}

// ── проверка ───────────────────────────────────────────────────────────

/**
 * Ищет «прочитано до объявлено» в одном куске кода.
 * Возвращает список `{ name, useLine, declLine }` — для тестов и для CLI.
 */
export function findTdz(src) {
  const ast = parseAst(src, { allowReturnOutsideFunction: true })
  const lineOf = (pos) => src.slice(0, pos).split('\n').length
  const out = []
  eachFunction(ast, (funcNode) => {
    for (const [name, declPos] of collectLexical(funcNode.body)) {
      for (const usePos of directReferences(funcNode.body, name)) {
        if (usePos < declPos) {
          out.push({ name, useLine: lineOf(usePos), declLine: lineOf(declPos) })
          break
        }
      }
    }
  })
  return out
}

// Модуль можно и импортировать (тесты берут отсюда findTdz), и запустить
// как скрипт. Сам обход — только при прямом запуске, иначе импорт в тесте
// распечатал бы отчёт и выставил код возврата.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const files = allFiles(jsDir)
  const problems = []

  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    let found = []
    try { found = findTdz(src) }
    catch (e) { problems.push({ file: file.slice(root.length + 1), msg: `не разобрался: ${e.message}` }); continue }
    for (const f of found) {
      problems.push({
        file: file.slice(root.length + 1),
        msg: `«${f.name}» прочитано на строке ${f.useLine}, а объявлено на ${f.declLine} — экран упадёт`,
      })
    }
  }

  console.log(`проверено файлов: ${files.length}`)
  console.log(`использовано до объявления: ${problems.length}`)
  for (const p of problems.slice(0, 40)) console.log(`  ${p.file} — ${p.msg}`)
  process.exitCode = problems.length ? 1 : 0
}
