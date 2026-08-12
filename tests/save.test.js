import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EMPTY_META, saveToCloud, loadFromCloud, cloudSync, saveMeta, loadMeta, varnaIndex, varnaProgress, addVarnaPoints } from '@webapp/js/core/save.js'
import { VARNA_ORDER } from '@webapp/js/core/data.js'

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

describe('Варны (§12.1, социальный цикл)', () => {
  it('с 0 очков игрок — Шудра', () => {
    const meta = EMPTY_META()
    expect(varnaIndex(meta)).toBe(0)
    expect(VARNA_ORDER[varnaIndex(meta)]).toBe('shudra')
  })

  it('addVarnaPoints открывает следующую варну по порогу', () => {
    const meta = EMPTY_META()
    // 4 освобождения → кшатрия (порог 4)
    const lv = addVarnaPoints(meta, 4)
    expect(lv.leveled).toBe(true)
    expect(lv.to).toBe(1)
    expect(VARNA_ORDER[varnaIndex(meta)]).toBe('kshatriya')
  })

  it('varnaProgress показывает прогресс до следующей варны', () => {
    const meta = EMPTY_META()
    addVarnaPoints(meta, 2) // половина пути до кшатрии (4)
    const vp = varnaProgress(meta)
    expect(vp.index).toBe(0)
    expect(vp.nextId).toBe('kshatriya')
    expect(vp.progress).toBeCloseTo(0.5)
    expect(vp.points).toBe(2)
  })

  it('после набора всех очков цикл пройден', () => {
    const meta = EMPTY_META()
    addVarnaPoints(meta, 18) // порог вайшьи
    const vp = varnaProgress(meta)
    expect(VARNA_ORDER[vp.index]).toBe('vaeshya')
    expect(vp.nextId).toBeNull()
    expect(vp.progress).toBe(1)
  })

  it('порядок варн соответствует социальному циклу Саркара', () => {
    expect(VARNA_ORDER).toEqual(['shudra', 'kshatriya', 'vipra', 'vaeshya'])
  })
})
