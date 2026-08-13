import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EMPTY_META, saveToCloud, loadFromCloud, cloudSync, saveMeta, loadMeta, migrateMeta, varnaState, addVarnaPoints, isSadvipra, markLived, isLived, gardenState, GARDEN_STAGES, recordDeath, recordSound, soundState } from '@webapp/js/core/save.js'
import { MENTALITY_ORDER, MENTALITIES, QUOTES, CARDS, ENEMIES, RELICS, quoteLiveHint, isQuoteLived, MENTALITY_LEVELS, mentalityLevel, AUDIO_LIBRARY, soundForCard } from '@webapp/js/core/data.js'

// Фейковый Telegram CloudStorage (callback-API) с проверкой чанков.
function installFakeCloud() {
  const store = new Map()
  const fake = {
    store,
    setItem(key, value, cb) {
      store.set(key, String(value))
      cb && cb(null)
    },
    getItem(key, cb) {
      cb && cb(null, store.has(key) ? store.get(key) : null)
    },
  }
  globalThis.window = { Telegram: { WebApp: { CloudStorage: fake } } }
  return fake
}

const origWindow = globalThis.window

afterEach(() => {
  if (origWindow === undefined) delete globalThis.window
  else globalThis.window = origWindow
})

describe('CloudStorage-синк (§17.1)', () => {
  let fake
  beforeEach(() => {
    fake = installFakeCloud()
  })

  it('сохраняет и читает мету круг-в-круг', async () => {
    const meta = { ...EMPTY_META(), savedAt: 123 }
    meta.quotesUnlocked = { omkara: true }
    const ok = await saveToCloud(meta)
    expect(ok).toBe(true)
    const back = await loadFromCloud()
    expect(back.savedAt).toBe(123)
    expect(back.quotesUnlocked.omkara).toBe(true)
  })

  it('большая мета разбивается на чанки и собирается обратно', async () => {
    const meta = { ...EMPTY_META(), savedAt: 456 }
    // ~50 «открытых» карточек, чтобы раздуть JSON за один чанк (3600 байт)
    for (let i = 0; i < 60; i++) meta.compendium.cards[`card_${i}`] = true
    const ok = await saveToCloud(meta)
    expect(ok).toBe(true)
    expect([...fake.store.keys()].some((k) => /ty_[0-9]+/.test(k))).toBe(true)
    const back = await loadFromCloud()
    expect(Object.keys(back.compendium.cards).length).toBe(60)
    expect(back.savedAt).toBe(456)
  })

  it('cloudSync возвращает облачную мету, если она новее', async () => {
    const cloudMeta = { ...EMPTY_META(), savedAt: 999 }
    cloudMeta.stats.runs = 42
    await saveToCloud(cloudMeta)
    const local = { ...EMPTY_META(), savedAt: 100 }
    const fresh = await cloudSync(local)
    expect(fresh).not.toBeNull()
    expect(fresh.stats.runs).toBe(42)
  })

  it('cloudSync не трогает локальную мету, если она новее', async () => {
    const cloudMeta = { ...EMPTY_META(), savedAt: 100 }
    await saveToCloud(cloudMeta)
    const local = { ...EMPTY_META(), savedAt: 500 }
    local.stats.runs = 7
    const fresh = await cloudSync(local)
    expect(fresh).toBeNull()
    expect(local.stats.runs).toBe(7)
  })

  it('без окна Telegram CloudStorage нет — без падений', async () => {
    delete globalThis.window
    const ok = await saveToCloud({ ...EMPTY_META() })
    expect(ok).toBe(false)
    expect(await loadFromCloud()).toBeNull()
    const fresh = await cloudSync({ ...EMPTY_META(), savedAt: 1 })
    expect(fresh).toBeNull()
  })

  it('saveMeta/loadMeta работают даже без localStorage', () => {
    delete globalThis.window
    const meta = { ...EMPTY_META() }
    meta.stats.runs = 3
    expect(() => saveMeta(meta)).not.toThrow()
    expect(loadMeta().savedAt).toBe(0)
  })
})

describe('Четыре ментальности ума (§12.1, Human Society Part 2)', () => {
  it('с 0 очков все четыре ментальности на уровне 0, садвипры нет', () => {
    const meta = EMPTY_META()
    const vs = varnaState(meta)
    expect(vs.levels.shudra).toBe(0)
    expect(vs.levels.kshatriya).toBe(0)
    expect(vs.levels.vipra).toBe(0)
    expect(vs.levels.vaeshya).toBe(0)
    expect(vs.sadvipra).toBe(false)
    expect(isSadvipra(meta)).toBe(false)
  })

  it('addVarnaPoints начисляет очки конкретной ментальности и поднимает её уровень', () => {
    const meta = EMPTY_META()
    const lv = addVarnaPoints(meta, 'kshatriya', 4) // порог уровня 1 (4 очка)
    expect(lv.leveled).toBe(true)
    expect(lv.to).toBe(1)
    expect(varnaState(meta).levels.kshatriya).toBe(1)
    // другие ментальности не тронуты — рост ПАРАЛЛЕЛЬНЫЙ, не лестница
    expect(varnaState(meta).levels.shudra).toBe(0)
  })

  it('развитая одна ментальность не даёт садвипру — нужны все четыре', () => {
    const meta = EMPTY_META()
    addVarnaPoints(meta, 'kshatriya', 18) // макс одной
    addVarnaPoints(meta, 'shudra', 18)
    addVarnaPoints(meta, 'vipra', 18)
    expect(isSadvipra(meta)).toBe(false) // вайшья отстаёт — слабая ментальность
  })

  it('садвипра = все четыре ментальности достигли зрелости', () => {
    const meta = EMPTY_META()
    addVarnaPoints(meta, 'shudra', 10)
    addVarnaPoints(meta, 'kshatriya', 10)
    addVarnaPoints(meta, 'vipra', 10)
    addVarnaPoints(meta, 'vaeshya', 10)
    expect(isSadvipra(meta)).toBe(true)
  })

  it('порядок ментальностей соответствует социальному циклу Саркара', () => {
    expect(MENTALITY_ORDER).toEqual(['shudra', 'kshatriya', 'vipra', 'vaeshya'])
  })

  it('ментальности — не классы души: у каждой есть психология и фокус, а не «статус»', () => {
    for (const id of MENTALITY_ORDER) {
      const m = MENTALITIES[id]
      expect(m.desc.length).toBeGreaterThan(20)
      expect(m.focusDesc.length).toBeGreaterThan(10)
    }
  })

  it('миграция: старые varnaPoints уходят в кшатрию (смелость освобождать)', () => {
    const old = { ...EMPTY_META(), varnaPoints: 7 }
    delete old.varnas
    const m = migrateMeta(old)
    expect(m.varnas.kshatriya).toBe(7)
    expect(m.varnaPoints).toBeUndefined()
    expect(m.varnas.shudra).toBe(0)
  })

  it('mentalityLevel соответствует порогам MENTALITY_LEVELS', () => {
    expect(mentalityLevel(0)).toBe(0)
    expect(mentalityLevel(3)).toBe(0)
    expect(mentalityLevel(4)).toBe(1)
    expect(mentalityLevel(18)).toBe(3)
    expect(MENTALITY_LEVELS).toEqual([0, 4, 10, 18])
  })
})

describe('Раскрываемость цитат (§исследование, живые цитаты)', () => {
  it('markLived помечает цитату «прожитой» один раз', () => {
    const meta = EMPTY_META()
    expect(isLived(meta, 'ahimsa')).toBe(false)
    expect(markLived(meta, 'ahimsa')).toBe(true)
    expect(markLived(meta, 'ahimsa')).toBe(false)
    expect(isLived(meta, 'ahimsa')).toBe(true)
  })

  it('markLived игнорирует пустой id', () => {
    const meta = EMPTY_META()
    expect(markLived(meta, null)).toBe(false)
    expect(markLived(meta, undefined)).toBe(false)
  })

  it('isLived не падает без меты и lived-слоя', () => {
    expect(isLived(null, 'ahimsa')).toBe(false)
    expect(isLived(EMPTY_META(), 'ahimsa')).toBe(false)
  })

  it('карты имеют подсказку «сыграть», враги — «успокоить», реликвии — «взять»', () => {
    const cardQuote = CARDS.ahimsa.quoteId
    // враг, чья цитата не дублируется картой (иначе приоритет подсказки — у карты)
    const enemy = Object.values(ENEMIES).find((e) => !Object.values(CARDS).some((c) => c.quoteId === e.quoteId))
    const relic = Object.values(RELICS).find((r) => !Object.values(CARDS).some((c) => c.quoteId === r.quoteId) &&
      !Object.values(ENEMIES).some((e2) => e2.quoteId === r.quoteId))
    expect(enemy).toBeTruthy()
    expect(relic).toBeTruthy()
    expect(quoteLiveHint(cardQuote)).toMatch(/Сыграйте/)
    expect(quoteLiveHint(enemy.quoteId)).toMatch(/Успокойте/)
    expect(quoteLiveHint(relic.quoteId)).toMatch(/Возьмите/)
  })

  it('владыка подсказывает освобождение по пути Ахимсы', () => {
    const boss = Object.values(ENEMIES).find((e) => e.isBoss && e.quoteId)
    expect(boss).toBeTruthy()
    expect(quoteLiveHint(boss.quoteId)).toMatch(/владыку/)
  })

  it('каждая открытая цитата с носителем имеет подсказку, как её прожить', () => {
    for (const [id, q] of Object.entries(QUOTES)) {
      if (id.startsWith('_')) continue
      const hasCarrier = Object.values(CARDS).some((c) => c.quoteId === id) ||
        Object.values(ENEMIES).some((e) => e.quoteId === id) ||
        Object.values(RELICS).some((r) => r.quoteId === id)
      if (!hasCarrier) continue
      expect(quoteLiveHint(id), `цитата ${id} должна иметь подсказку`).toBeTruthy()
    }
  })

  it('цитаты без носителя (понятия практики) раскрыты всегда', () => {
    for (const [id, q] of Object.entries(QUOTES)) {
      if (id.startsWith('_')) continue
      const hasCarrier = Object.values(CARDS).some((c) => c.quoteId === id) ||
        Object.values(ENEMIES).some((e) => e.quoteId === id) ||
        Object.values(RELICS).some((r) => r.quoteId === id)
      if (hasCarrier) continue
      expect(quoteLiveHint(id), `цитата ${id} — без носителя`).toBeNull()
      expect(isQuoteLived(EMPTY_META(), id)).toBe(true)
    }
  })

  it('isQuoteLived: термин с носителем скрыт, пока не прожит', () => {
    const meta = EMPTY_META()
    const id = CARDS.ahimsa.quoteId
    expect(isQuoteLived(meta, id)).toBe(false)
    markLived(meta, id)
    expect(isQuoteLived(meta, id)).toBe(true)
  })
})

describe('Сад Знания (соцслой, локально): прожитые термины пускают корни', () => {
  function metaWithLived(n) {
    const meta = EMPTY_META()
    meta.lived = {}
    for (let i = 0; i < n; i++) meta.lived['q' + i] = true
    return meta
  }

  it('считает прожитые знания из meta.lived', () => {
    expect(gardenState(EMPTY_META()).lived).toBe(0)
    expect(gardenState(metaWithLived(7)).lived).toBe(7)
  })

  it('стадии идут по порядку от зерна к древу', () => {
    expect(GARDEN_STAGES[0].name).toBe('Зерно')
    expect(GARDEN_STAGES[GARDEN_STAGES.length - 1].name).toBe('Древо')
    for (let i = 1; i < GARDEN_STAGES.length; i++) {
      expect(GARDEN_STAGES[i].min).toBeGreaterThan(GARDEN_STAGES[i - 1].min)
    }
  })

  it('цветение даёт +1 саттву, древо — +2', () => {
    const flower = gardenState(metaWithLived(GARDEN_STAGES[2].min))
    expect(flower.stage.bonus).toBe(1)
    const tree = gardenState(metaWithLived(GARDEN_STAGES[GARDEN_STAGES.length - 1].min))
    expect(tree.stage.bonus).toBe(2)
  })

  it('пустой сад — без бонуса', () => {
    expect(gardenState(EMPTY_META()).stage.bonus).toBe(0)
  })

  it('gardenState не падает без меты', () => {
    expect(gardenState(null).lived).toBe(0)
  })
})

describe('призраки прошлых жизней (§10.3): смерть оставляет урок на карте пути', () => {
  it('recordDeath добавляет запись с местом и убийцей', () => {
    const meta = EMPTY_META()
    const entry = recordDeath(meta, { floor: 3, killedBy: 'Маха-Кродха', killedById: 'krodha_maharaja' })
    expect(meta.deathLog.length).toBe(1)
    expect(meta.deathLog[0]).toEqual(entry)
    expect(meta.deathLog[0].floor).toBe(3)
    expect(meta.deathLog[0].killedById).toBe('krodha_maharaja')
  })

  it('хранит максимум 5 последних смертей', () => {
    const meta = EMPTY_META()
    for (let i = 0; i < 7; i++) recordDeath(meta, { floor: i, killedBy: 'Враг' + i, killedById: null })
    expect(meta.deathLog.length).toBe(5)
    expect(meta.deathLog[0].floor).toBe(2) // 0..1 вытеснены
    expect(meta.deathLog[4].floor).toBe(6)
  })

  it('по умолчанию — пустой журнал', () => {
    expect(EMPTY_META().deathLog).toEqual([])
  })
})

describe('Аудиотека практики (§16.2, идея №33): звуки, прожитые и собранные', () => {
  it('recordSound записывает новый звук и возвращает true', () => {
    const meta = EMPTY_META()
    expect(recordSound(meta, 'omkara')).toBe(true)
    expect(meta.audioLibrary.omkara).toBe(true)
  })

  it('повторная запись того же звука — false, коллекция не дублируется', () => {
    const meta = EMPTY_META()
    recordSound(meta, 'kiirtana')
    expect(recordSound(meta, 'kiirtana')).toBe(false)
    expect(Object.keys(meta.audioLibrary).length).toBe(1)
  })

  it('soundForCard находит носителя: om → omkara, кииртан-карта → kiirtana', () => {
    expect(soundForCard('om')).toBe('omkara')
    expect(soundForCard('nama_kevalam')).toBe('kiirtana')
    expect(soundForCard('bija')).toBe('bija')
    expect(soundForCard('guru_mantra')).toBe('mantra')
  })

  it('soundForCard для карты без звука (напр. ахимса) — null', () => {
    expect(soundForCard('ahimsa')).toBeNull()
  })

  it('soundState считает собранные и всего звуков', () => {
    const meta = EMPTY_META()
    recordSound(meta, 'omkara')
    recordSound(meta, 'japa')
    const st = soundState(meta, AUDIO_LIBRARY)
    expect(st.total).toBe(Object.keys(AUDIO_LIBRARY).length)
    expect(st.recorded.sort()).toEqual(['japa', 'omkara'])
  })
})

