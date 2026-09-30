// ОБЛАЧНОЕ СОХРАНЕНИЕ: гонка записей и битое облако.
//
// Зачем. Мета пишется в облако на КАЖДОМ `saveMeta` — а это покупка в лавке,
// конец комнаты, выбор дара, смерть, заход в чатру. Каждая запись режется на
// куски по 3600 символов и пишется в Telegram CloudStorage отдельными
// вызовами, один за другим. Две записи, случившиеся подряд, ничем не
// упорядочены: Telegram отвечает асинхронно, и на телефоне с мобильным
// интернетом они встают в очередь.
//
// Пока эти записи шли параллельно, куски двух разных сохранений могли
// перемешаться: в облаке лежал «гибрид» — половина от старой меты,
// половина от новой. Такое облако не читается вообще (JSON не собирается),
// и игрок теряет весь прогресс между устройствами — молча, без ошибки.
//
// Здесь — два настоящих Telegram CloudStorage (с задержкой ответа, как в
// сети) и проверка того, что в облаке всегда лежит ровно одно целое
// сохранение, а прерванная запись не портит предыдущую.

import { describe, it, expect, beforeEach } from 'vitest'
import { installDom } from './helpers/dom.js'
import { EMPTY_META, saveToCloud, loadFromCloud, cloudSync, saveMeta } from '../webapp/js/core/save.js'

const dom = installDom()

/** Облако Telegram с задержкой — как в сети. Пишет по ключу, читает по ключу. */
function fakeCloud({ delay = 1, failKey = null } = {}) {
  const data = new Map()
  const calls = { set: 0, get: 0, remove: 0 }
  return {
    data,
    calls,
    setItem(key, value, cb) {
      calls.set += 1
      setTimeout(() => {
        if (failKey && key.includes(failKey)) { cb(new Error('storage is full'), false); return }
        data.set(key, value)
        cb(null, true)
      }, delay)
    },
    getItem(key, cb) {
      calls.get += 1
      setTimeout(() => {
        if (!data.has(key)) { cb(null, undefined); return }
        cb(null, data.get(key))
      }, delay)
    },
    removeItem(key, cb) {
      calls.remove += 1
      setTimeout(() => { data.delete(key); cb(null, true) }, delay)
    },
  }
}

function useCloud(cloud) {
  dom.window.Telegram = { WebApp: { CloudStorage: cloud } }
  return cloud
}

/** Мета нужного размера: чтобы сохранение резалось на несколько кусков. */
function fatMeta(tag, savedAt) {
  const m = EMPTY_META()
  m.savedAt = savedAt
  m.letter = { text: `${tag}:`.repeat(900), at: savedAt, shownAt: 0 }
  m.runLog = Array.from({ length: 12 }, (_, i) => ({ result: 'death', floor: i, pacified: 0, kills: 0, awakened: 0, at: savedAt }))
  return m
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

describe('облако: сохранение целое', () => {
  beforeEach(() => { dom.window.Telegram = undefined })

  it('две записи подряд не смешиваются в облаке', async () => {
    const cloud = useCloud(fakeCloud({ delay: 2 }))
    const a = fatMeta('ПЕРВОЕ', 1000)
    const b = fatMeta('ВТОРОЕ', 2000)
    // Именно как в игре: saveMeta не ждёт облако, вызовы уходят подряд.
    const p1 = saveToCloud(a)
    const p2 = saveToCloud(b)
    await Promise.all([p1, p2])
    await wait(30)

    const got = await loadFromCloud()
    expect(got, 'облако должно читаться').not.toBeNull()
    expect(got.letter.text.startsWith('ВТОРОЕ') || got.letter.text.startsWith('ПЕРВОЕ'),
      'в облаке должно лежать ОДНО целое сохранение, а не смесь').toBe(true)
    // А последняя запись обязана победить: игрок сохранился позже.
    expect(got.savedAt).toBe(2000)
  })

  it('десять записей подряд — облако остаётся читаемым', async () => {
    const cloud = useCloud(fakeCloud({ delay: 1 }))
    for (let i = 0; i < 10; i++) saveToCloud(fatMeta(`ЗАПИСЬ${i}`, 1000 + i))
    await wait(120)
    const got = await loadFromCloud()
    expect(got, 'после десяти записей облако читается').not.toBeNull()
    expect(got.savedAt).toBe(1009)
    expect(got.letter.text.startsWith('ЗАПИСЬ9')).toBe(true)
  })

  it('прерванная запись не портит предыдущую', async () => {
    const cloud = useCloud(fakeCloud({ delay: 1 }))
    const good = fatMeta('ХОРОШЕЕ', 1000)
    expect(await saveToCloud(good)).toBe(true)
    // Теперь облако отказывает на середине: кусок не записался.
    cloud.setItem = ((prev) => (key, value, cb) => {
      if (key.endsWith('_1')) { setTimeout(() => cb(new Error('storage is full'), false), 1); return }
      prev(key, value, cb)
    })(cloud.setItem.bind(cloud))
    expect(await saveToCloud(fatMeta('БИТОЕ', 2000)), 'запись с ошибкой честно говорит false').toBe(false)
    await wait(30)

    const got = await loadFromCloud()
    expect(got, 'прошлое сохранение должно уцелеть').not.toBeNull()
    expect(got.savedAt, 'и это должно быть старое, целое').toBe(1000)
  })

  it('в облаке нет мусорных кусков от длинных прошлых сохранений', async () => {
    const cloud = useCloud(fakeCloud({ delay: 1 }))
    await saveToCloud(fatMeta('ОЧЕНЬ-ДЛИННОЕ-СОХРАНЕНИЕ', 1000))
    const chunkKeys = () => [...cloud.data.keys()].filter((k) => /^ty_\d+_\d+$/.test(k))
    expect(chunkKeys().length, 'длинная мета легла в несколько кусков').toBeGreaterThan(1)
    const head = JSON.parse(cloud.data.get('ty_head'))
    expect(chunkKeys().every((k) => k.startsWith(`ty_${head.v}_`)),
      'в облаке лежат куски только текущей версии').toBe(true)
    await saveToCloud(EMPTY_META())            // короткая: кусков меньше
    await wait(30)
    expect(chunkKeys().length, 'старые куски должны исчезнуть').toBe(head.n)
    expect(JSON.stringify(EMPTY_META()).length, 'короткая мета правда короче').toBeLessThan(3600)
  })

  it('синк побеждает свежим сохранением, локальным — тоже', async () => {
    const cloud = useCloud(fakeCloud({ delay: 1 }))
    const old = fatMeta('СТАРОЕ', 1000)
    await saveToCloud(old)

    const local = EMPTY_META()
    local.savedAt = 5000                       // локально новее
    const res1 = await cloudSync(local)
    expect(res1, 'локальное новее — облако подстраивается под него').toBeNull()
    await wait(30)
    const back = await cloudSync(local)
    expect(back, 'после проталкивания облако равно локальному').toBeNull()
    const raw = await loadFromCloud()
    expect(raw.savedAt).toBe(5000)
  })
})
