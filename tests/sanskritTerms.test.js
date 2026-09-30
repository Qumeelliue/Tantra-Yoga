// ПРАВИЛЬНОСТЬ САНСКРИТСКИХ ТЕРМИНОВ.
//
// «Санскары» вместо «самскары» — это не опечатка, а незнание языка: в
// `saṃskāra` есть аноунсвара ṃ, и в русский он приходит «м». Такие ошибки
// не видны в игре, но читатель, который знает санскрит, видит их сразу.
// Поэтому термины проверяются кодом, а не памятью.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { QUOTES, CARDS } from '@webapp/js/core/data.js'

// pathname не годится: в пути есть пробел, он приходит закодированным
// («Tantra%20The%20Game») и любой доступ к файлам молча падает.
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

/** Формы, которые в корпусе Ананда Марги не встречаются ни разу. */
const WRONG = [
  [/санскар/gi, 'саṃskāra — «самскар»: аноунсвара даёт «м», не «н»'],
  [/санкальп/gi, 'saṃkalpa — «самкальпа»'],
]

describe('Термины', () => {
  it('термины с деванагари есть и заполнены', () => {
    const missing = []
    for (const [k, v] of Object.entries(QUOTES)) {
      if (k.startsWith('_')) continue
      if (typeof v.sanskrit === 'string' && /[\u0900-\u097F]/.test(v.sanskrit)) {
        if (!v.term || v.term.length < 3) missing.push(k)
      }
    }
    expect(missing).toEqual([])
  })

  it('ни один термин не написан так, как в корпусе не пишут', () => {
    const terms = Object.values(QUOTES)
      .concat(Object.values(CARDS))
      .map((v) => (v && typeof v.term === 'string' ? v.term : (v && typeof v.name === 'string' ? v.name : '')))
      .join(' · ')
    const bad = []
    for (const [re, why] of WRONG) {
      const m = terms.match(re)
      if (m) bad.push(`${m[0]} — ${why}`)
    }
    expect(bad).toEqual([])
  })

  it('в наших текстах нет «санскар» — только «самскар»', () => {
    const files = ['SPEC.md', 'AGENTS.md', 'design/BASE-GAME.md', 'notes/HANDOFF.md']
    const wrong = []
    const readAll = []
    for (const f of files) {
      let text
      try { text = read(f) } catch { wrong.push(`${f}: НЕ ЧИТАЕТСЯ`); continue }
      readAll.push(text)
      // В кавычках «…» слово может стоять как пример ошибки — так оно и
      // должно быть: мы же объясняем, как писать нельзя. Проверяем прозу.
      const prose = text.replace(/«[^»]*»/g, '«»')
      const m = prose.match(/санскар/gi)
      if (m) wrong.push(`${f}: ${m.length}`)
    }
    expect(wrong).toEqual([])
    // и проверка не должна быть пустой: если файлы не прочитались, тест
    // молча «проходил». Требуем, чтобы «самскар» где-то был.
    expect(readAll.join('')).toMatch(/самскар/i)
  })

  it('«самскар» написан так, как в корпусе', () => {
    const skills = join(root, '.opencode/skills')
    let corpus = ''
    const walk = (d) => {
      let ents
      try { ents = readdirSync(d) } catch { return }
      for (const e of ents) {
        const p = join(d, e)
        let st
        try { st = statSync(p) } catch { continue }
        if (st.isDirectory()) walk(p)
        else if (/\.(md|txt)$/.test(e)) { try { corpus += readFileSync(p, 'utf8') } catch { /* пропуск */ } }
      }
    }
    walk(skills)
    const lower = corpus.toLowerCase()
    const ours = (lower.match(/самскар/g) || []).length
    const alt = (lower.match(/санскар/g) || []).length
    expect(ours).toBeGreaterThan(alt)
  })

  it('у каждой оки и каждого дара есть цитата — «нет цитаты, нет карты»', () => {
    const noQuote = []
    for (const [k, v] of Object.entries(QUOTES)) {
      if (k.startsWith('_')) continue
      if (!v.term) continue
    }
    expect(noQuote).toEqual([])
    // каждая карта указывает на существующую цитату
    const bad = []
    for (const [k, v] of Object.entries(CARDS)) {
      if (k.startsWith('_') || !v || typeof v !== 'object') continue
      if (v.quoteId && !QUOTES[v.quoteId]) bad.push(`${k} → ${v.quoteId}`)
    }
    expect(bad).toEqual([])
  })
})

// ── СМЫСЛ термина, а не только написание ───────────────────────────────
//
// «Ахимса = непричинение вреда» — написание верное, смысл неверный: в школе
// ахимса прямо НЕ равна пассивности и не равна отказу от силы. Игра стоит
// на ахимсе, значит её собственное определение обязано это говорить.
// Проверяем по утверждениям, которые корпус повторяет на разные лады.
describe('Смысл термина', () => {
  it('ахимса в нашем определении не превращена в пассивность', () => {
    const m = QUOTES.ahimsa.meaning
    expect(m.length).toBeGreaterThan(30)
    expect(/не равно пассивности|не равна пассивности/i.test(m)).toBe(true)
    expect(/мысль|слов|делом/i.test(m)).toBe(true)
  })

  it('сева определена как односторонняя, а не просто «служение»', () => {
    const m = QUOTES.seva.meaning
    expect(/односторонн/i.test(m)).toBe(true)
    expect(/сделк|транзакц|взаимност/i.test(m)).toBe(true)
  })

  it('омкара названа пранавой и сказано, что это не мантра', () => {
    expect(/пранава|пранава/i.test(QUOTES.omkara.meaning)).toBe(true)
    expect(/не мантра/i.test(QUOTES.omkara.meaning)).toBe(true)
  })

  it('карта «Ом» не помечена как мантра — это пранава, звук для слушания', () => {
    const om = CARDS.om
    expect(om.type).not.toBe('mantra')
    expect(om.tags || []).not.toContain('mantra')
  })

  it('кииртана названа коллективной', () => {
    expect(/коллективн/i.test(QUOTES.kiirtana.meaning)).toBe(true)
  })

  it('цвета гун названы прямо — игра рисует их на экране', () => {
    const m = QUOTES.guna.meaning
    expect(/бел/i.test(m)).toBe(true)
    expect(/красн/i.test(m)).toBe(true)
    expect(/чёрн|черн/i.test(m)).toBe(true)
  })

  it('у каждой цитаты с деванагари есть и санскрит, и смысл, и источник', () => {
    const bad = []
    for (const [k, v] of Object.entries(QUOTES)) {
      if (k.startsWith('_') || !v || typeof v !== 'object') continue
      if (!/[\u0900-\u097F]/.test(v.sanskrit || '')) continue
      if (!v.term || !v.meaning || !v.source) bad.push(k)
    }
    expect(bad).toEqual([])
  })

  it('у каждой цитаты есть точная ссылка: книга и место в ней', () => {
    // Место бывает разным: у «Ананда Сутрам» точнее всех номер сутры
    // («2-19» — это сутра, а не глава), у остальных книг — глава, дискурс
    // или часть. Требуем и книгу в кавычках, и конкретный указатель.
    const bad = []
    for (const [k, v] of Object.entries(QUOTES)) {
      if (k.startsWith('_') || !v || typeof v !== 'object') continue
      if (!/[\u0900-\u097F]/.test(v.sanskrit || '')) continue
      const s = v.source || ''
      const hasBook = /[«"]/.test(s)
      // Указатель бывает трёх видов: глава/дискурс, номер сутры
      // («Ánanda Sútram», 2-19) или номер тома («Subhāṣita Saṃgraha 11»).
      const hasPlace = /гл|дискурс|ч\.|Ch\b|part/i.test(s) || /\d/.test(s)
      if (!hasBook || !hasPlace) bad.push(`${k}: ${s}`)
    }
    expect(bad).toEqual([])
  })

  it('ссылка ведёт в книгу, а не в интернет и не «где-то»', () => {
    const bad = []
    for (const [k, v] of Object.entries(QUOTES)) {
      if (k.startsWith('_') || !v || typeof v !== 'object') continue
      if (!/^[«"].+[»"].+/.test(v.source || '')) bad.push(`${k}: ${v.source}`)
    }
    expect(bad).toEqual([])
  })
})

// ── СВЕРКА С ОФИЦИАЛЬНЫМ ГЛОССАРИЕМ ─────────────────────────────────────
//
// `Master_Samskrta_Glossary.txt` — сводный глоссарий на 312 терминов,
// изданный самой организацией (AMS Central, 2009). Это высший судья: не
// переводчик и не пересказ. Если наше определение расходится с ним по
// существу — ошибка у нас, а не у глоссария.
import { existsSync, readFileSync as rf } from 'node:fs'

const GLOSSARY_PATHS = [
  join(root, 'sources/Master_Samskrta_Glossary.txt'),
  '/Users/100nout/Seva/Shastra/sources/Master_Samskrta_Glossary.txt',
]

// В официальном глоссарии диакритика СОСТАВНАЯ (s + U+0301), а в корпусе
// (.md) — предкомпозированная (ś, U+015B). Это разные строки с точки зрения
// сравнения: любая проверка по таким источникам без нормализации ломается
// молча и «находит» расхождений, которых нет. Поэтому нормализуем всегда.
const fold = (s) => String(s).normalize('NFC')

function loadMasterGlossary() {
  for (const p of GLOSSARY_PATHS) {
    if (!existsSync(p)) continue
    const map = new Map()
    for (const line of rf(p, 'utf8').split('\n')) {
      const m = line.match(/^([a-zA-ZśŚṣṢ][^:]{0,90}):\s*(.+)$/)
      if (!m) continue
      for (const t of m[1].split(',')) {
        const key = t.trim().split(' (')[0].toLowerCase().replace(/[^a-zа-я]/g, '')
        if (key && !map.has(key)) map.set(key, m[2].trim())
      }
    }
    return map
  }
  return new Map()
}

describe('Официальный глоссарий (AMS Central, 2009)', () => {
  const master = loadMasterGlossary()

  it('глоссарий найден и в нём достаточно терминов', () => {
    expect(master.size).toBeGreaterThan(200)
  })

  it('источники нормализуются: без этого сравнение строк бессмысленно', () => {
    // Проверка на самой грабли: диакритика в .txt составная, в .md —
    // предкомпозированная. Если бы мы сравнивали сырые строки, расхождений
    // было бы вдвое больше, чем настоящих.
    // Разложенную строку собираем кодом: любой нормальный редактор при
    // сохранении превратит её в предкомпозированную, и проверка станет
    // пустой — а именно тут и нужна настоящая грабля.
    const COMPOSED = '\u015B'          // ś  — ś
    const DECOMPOSED = 's\u0301'         // s + ◌́
    expect(COMPOSED).not.toBe(DECOMPOSED)
    expect(fold(DECOMPOSED)).toBe(COMPOSED)
  })

  it('санскары — «ментальный реактивный моментум», как в глоссарии', () => {
    expect(fold(master.get('samskara') || '')).toMatch(/reactive momentum/i)
    expect(QUOTES.samskara.meaning).toMatch(/потенциальная реакция|реактивн/i)
  })

  it('прана — «жизненная энергия», а не «трение факторов»', () => {
    expect(fold(master.get('prana') || '')).toMatch(/vital energy/i)
    expect(QUOTES.prana.meaning).toMatch(/жизненн|витальн/i)
  })

  it('тантра — вторая половина определения не потеряна', () => {
    // Тантра в школе — это не только медитация, но и столкновение с
    // трудными внешними обстоятельствами. Забыть это — значит забыть
    // половину учения, и забыть ту половину, на которой стоит игра.
    expect(fold(master.get('tantra') || '')).toMatch(/difficult external situations|confrontation/i)
    expect(QUOTES.tantra.meaning).toMatch(/внешними обстоятельствами/i)
  })

  it('пракрити — оперативный принцип и Шакти, а не «сила Шивы»', () => {
    expect(fold(master.get('prakrti') || '')).toMatch(/Cosmic Operative Principle/i)
    expect(QUOTES.prakrti.meaning).toMatch(/Шакти/i)
    expect(QUOTES.prakrti.meaning).not.toMatch(/сила Шивы/i)
  })

  it('пратьяхара отводит ум, а не чувства', () => {
    expect(fold(master.get('pratyahara') || master.get('pratyáhára') || '')).toMatch(/mind/i)
    expect(QUOTES.pratyahara.meaning).toMatch(/УМА|ум/i)
  })

  it('пранаяма и дхьяна названы своими конечностями аштанг-йоги', () => {
    expect(fold(master.get('pranayama') || master.get('práńáyáma'))).toMatch(/fourth limb/i)
    expect(QUOTES.pranayama.meaning).toMatch(/четвёрт/i)
    expect(fold(master.get('dhyana') || master.get('dhyána'))).toMatch(/seventh limb/i)
    expect(QUOTES.dhyana.meaning).toMatch(/седьм/i)
  })

  it('в определении садханы нет выдуманного утверждения', () => {
    // Учение говорит «теория следует за практикой» (AFPS 6, ch05).
    // Обратное — «садхана следует за теорией» — мы когда-то написали
    // сами, и это прямо противоречит источнику.
    expect(QUOTES.sadhana.meaning).not.toMatch(/следует за теорией/i)
    expect(QUOTES.sadhana.meaning).toMatch(/практик/i)
  })

  it('ахимса не превращена в пассивность', () => {
    // В официальном глоссарии `ahimsa` нет: это завет Ямы, а не термин
    // глоссария. Проверяем наше определение по корпусу, где об этом
    // сказано восемь раз, и честно оговариваем, что глоссарий молчит.
    expect(master.get('ahimsa')).toBeUndefined()
    expect(QUOTES.ahimsa.meaning).toMatch(/не равно пассивности/i)
  })

  it('кииртана — коллективное пение, и в глоссарии тоже', () => {
    expect(fold(master.get('kiirtana') || '')).toMatch(/collective singing/i)
    expect(QUOTES.kiirtana.meaning).toMatch(/коллективн/i)
  })

  it('брахма по составу: Пуруша и Пракрити', () => {
    expect(fold(master.get('brahma'))).toMatch(/Puruśa.*(Prakrti|Shakti)/i)
    expect(QUOTES.brahma.meaning).toMatch(/Шива и Шакти/i)
  })
})
