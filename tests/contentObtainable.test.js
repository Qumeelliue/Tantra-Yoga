// ВСЁ СОДЕРЖАНИЕ ДОСТИЖИМО.
//
// Правило проекта: игра выглядит больше, чем она есть, если в контенте
// лежит то, что ничем не выдаётся. Это уже находилось трижды:
//
//   · 48 цитат из 100 не открывались ничем (auditQuotes);
//   · 5 вртти были написаны, но ни одно событие их не давало;
//   · лавка в поле была написана, но ни одна ветка кода её не звала.
//
// Теперь это проверяется по всей игре сразу и падает само.

import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('достижимость содержимого', () => {
  it('каждую вещь можно получить', () => {
    let out = ''
    try {
      out = execFileSync('node', [
        '--experimental-loader', './scripts/aliases.mjs',
        'scripts/auditObtainable.mjs',
      ], { cwd: root, encoding: 'utf8' })
    } catch (e) {
      throw new Error('часть содержимого недостижима:\n' + (e.stdout || '') + (e.stderr || ''))
    }
    expect(out).toContain('всё содержимое достижимо')
  })

  it('проверка не пустая: считает реальные количества', () => {
    const out = execFileSync('node', [
      '--experimental-loader', './scripts/aliases.mjs',
      'scripts/auditObtainable.mjs',
    ], { cwd: root, encoding: 'utf8' })
    const nums = [...out.matchAll(/(\S+): (\d+)\/(\d+)/g)]
    expect(nums.length, 'проверено категорий').toBeGreaterThan(8)
    for (const [, name, have, total] of nums) {
      expect(Number(total), `${name}: всего должно быть больше нуля`).toBeGreaterThan(0)
      expect(Number(have), `${name}: достижимо столько же, сколько всего`).toBe(Number(total))
    }
  })
})
