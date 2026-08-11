// Разрешает алиасы @content/ и @webapp/ + JSON-импорты для чистого Node (баланс-скрипт).
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@content/')) {
    const target = path.join(root, 'content', specifier.slice('@content/'.length))
    return nextResolve(pathToFileURL(target).href)
  }
  if (specifier.startsWith('@webapp/')) {
    const target = path.join(root, 'webapp', specifier.slice('@webapp/'.length))
    return nextResolve(pathToFileURL(target).href)
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.json')) {
    const source = await readFile(new URL(url), 'utf8')
    return { format: 'json', shortCircuit: true, source }
  }
  return nextLoad(url, context)
}
