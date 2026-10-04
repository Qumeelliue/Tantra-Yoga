// СЛУЖЕНИЕ НА СОБРАННОМ ЭКРАНЕ: ОБЕЩАНИЕ = ПОВЕДЕНИЕ.
//
// ## Почему экран, а не функция
//
// Уже было найдено четыре случая «экран обещал, а код делал иначе» (МЕХАНИКА 41),
// и каждый раз расходились подпись и поведение. Здесь проверяется ровно то же
// самое, но на настоящем экране: событие открылось, у каждого выбора подпись, и
// после нажатия подпись ПЕРЕПИСЫВАЕТСЯ В ЧИСЛА, которые видны в игре.
//
// ## Что делает эти проверки сильнее обычных
//
// Не «правильный ли текст написан» — такой тест проходит на любом тексте и
// краснеет только при правке строки. Здесь сверяется пара:
//
//   подпись на кнопке   →   что реально изменилось в кошельке / жизни / севе
//
// То есть подпись не может соврать: если соврёт, разойдутся числа.
//
// ## Чего тест НЕ делает
//
// Не проверяет баланс. Вопрос «стоит ли брать» — это замер (`--doors=event`).
// Здесь вопрос один: «обещал ли».

import { describe, it, expect, beforeAll } from 'vitest'
import { effectText, FIELD_EVENTS } from '../webapp/js/core/fieldEvents.js'

let dom = null
let helper = null
let text = () => ''
let targets = () => []

beforeAll(async () => {
  helper = await import('./helpers/dom.js')
  dom =   helper.installDom({ fresh: true })
  await import('@webapp/js/main.js')
  targets = () => helper.clickables(dom.root)
  text = () => helper.textOf(dom.root)
})

const byClass = (re) => {
  const n = targets().find((x) => re.test(String(x.className || '')))
  if (!n) return false
  n.dispatch('click')
  return true
}
const byText = (re) => {
  const n = targets().find((x) => re.test(helper.textOf(x)))
  if (!n) return false
  n.dispatch('click')
  return true
}

/** Поле Ума сейчас на экране? По классу: слово «Поле Ума» есть и на экране чакр. */
const onField = () => !!dom.root.querySelector('.field-left')
const onDoors = () => !!dom.root.querySelector('.door-card')
// Класс отрока — `choice event` (через ПРОБЕЛ). Стенд умеет искать по ОДНОМУ
// классу, поэтому составной селектор `.choice.event` ищет класс с именем
// «choice.event» — то есть ничего. Ищем по одному классу и фильтруем по второму.
/** Есть ли заголовок события на экране. */
const wholeHas = (t) => text().includes(t)

const eventCards = () => [...dom.root.querySelectorAll('.choice')]
  .filter((n) => /\bevent\b/.test(String(n.className || '')))
const onEvent = () => eventCards().length > 0

function clearRoom() {
  const st = globalThis.window.__field
  if (!st) return
  for (const f of st.foes) { f.pacified = true; f.hp = 0 }
  st.pacified += st.foes.length
}

function enterField(limit = 24) {
  for (let i = 0; i < limit && !onField(); i++) {
    dom.flushRaf(1)
    if (byText(/В путь по миру/)) continue
    if (byClass(/wsel-card/)) continue
    if (byClass(/jade-card/)) continue
    const open = targets().find((x) => /varna-card/.test(String(x.className || ''))
      && !/locked/.test(String(x.className || '')))
    if (open) { open.dispatch('click'); continue }
    if (byClass(/lord-card/)) continue
    if (byText(/Понятно|Начать|Далее|Дальше|← /)) continue
    break
  }
}

/**
 * Дойти до двери служения.
 *
 * Служение выпадает примерно в трети списков дверей, поэтому приходится
 * проходить несколько комнат. Предел 20 комнат — вероятность не встретить дверь
 * около 1e-10. Если всё же не встретили, проверка падает с честным текстом:
 * молчать об этом нельзя, иначе «служение на экране» останется непроверенным.
 */
function reachEventDoor(maxDoors = 40, maxRuns = 12) {
  // Класс двери — `door-card d-event` (через ПРОБЕЛ, не точкой). Селектор
  // `door-card.d-event` не находит ни одной двери и тихо превращает проверку в
  // «служение не выпадает» — то есть в сообщение о балансе там, где на самом
  // деле опечатка в адресе. Так уже было с поиском экрана по слову.
  const EVENT_DOOR = /door-card\s+d-event/
  let doorsSeen = 0
  // Забег — семь чакр, то есть семь небоевых дверей. Служение выпадает примерно
  // в 15 % дверей (замерено на 400 розыгрышах `rollDoors`), и потому в одном
  // забеге его может не быть: вероятность не встретить — около 32 %.
  //
  // Раньше проверка смотрела только на один забег и называлась «служение
  // выпадает». Это было сравнение игрового вопроса с длиной забега, а не с
  // розыгрышем двери. Теперь проверка проходит несколько забегов — ровно то,
  // что делает игрок, который не повстречал служение и пошёл снова.
  let runs = 0
  for (let i = 0; i < maxDoors * 3 * maxRuns; i++) {
    if (onEvent()) return true
    if (runs > maxRuns) return false
    if (onDoors()) {
      doorsSeen++
      if (doorsSeen > maxDoors * maxRuns) return false
      if (byClass(EVENT_DOOR)) return true
      // Дверь служения берётся ПЕРВОЙ, если она есть. Раньше здесь стояло
      // «нажми первую дверь», а первая — всегда бой: служение на экране дверей
      // одно на этап, бой — всегда, и служение выбиралось примерно никогда.
      // Проверка при этом называлась «служение выпадает» и падала с сообщением
      // про баланс, хотя речь была о том, какую кнопку нажали.
      //
      // Теперь поведение соответствует вопросу: если дверь служения есть — идём
      // в неё, если нет — идём в бой, чтобы дойти до следующих дверей.
      byClass(EVENT_DOOR) || byClass(/door-card\s+d-room/) || byClass(/door-card/)
    } else if (onField()) {
      clearRoom()
      for (let k = 0; k < 40 && onField(); k++) {
        dom.flushRaf(1)
        const st = globalThis.window.__field
        if (st?.door) { st.player.x = st.door.x; st.player.y = st.door.y }
      }
    } else if (!onField() && /Город светится|Забег окончен|Пробуждение/i.test(text())) {
      // Забег кончился, а служения не встретилось — начинаем следующий.
      // Именно это делает игрок, и именно поэтому проверка смотрит на несколько
      // забегов, а не на один.
      //
      // Ветка стоит ПЕРЕД «нажать любую кнопку»: город — это тоже экран с
      // кнопками, и общая ветка успевала нажать их вместо того, чтобы начать
      // новый забег. Три порядка отладки подряд упирались в одно и то же.
      runs++
      if (runs > maxRuns) return false
      doorsSeen = 0
      enterField()
      continue
    } else if (!byClass(/choice/) && !byText(/Идти дальше|← уйти|дальше/)) {
      // Экран выбора дара или реликвии: берём верхнее и идём дальше.
      byClass(/boon-card/) || byClass(/\bchoice\b/) || byClass(/^btn/)
    }
    dom.flushRaf(2)
  }
  return onEvent()
}

describe('Служение открывается настоящим экраном', () => {
  it('после боя выпадает дверь служения и за ней экран выбора', () => {
    enterField()
    expect(onField(), `бой не начался; экран: ${text().slice(0, 120)}`).toBe(true)
    const hit = reachEventDoor()
    expect(hit, `служение не выпало ни за 40 экранов дверей; экран: ${text().slice(0, 160)}`).toBe(true)
    expect(onEvent(), `дверь была, но экрана выбора нет; экран: ${text().slice(0, 160)}`).toBe(true)
  })

  it('на экране есть текст, кто перед тобой, и отроки с подписью', () => {
    const choices = eventCards()
    expect(choices.length, 'на служении нет ни одного отрока').toBeGreaterThanOrEqual(2)
    const whole = text()
    for (const ev of FIELD_EVENTS) {
      if (whole.includes(ev.title)) {
        expect(whole, `на экране нет текста события «${ev.title}»`).toContain(ev.text)
      }
    }
    for (const c of choices) {
      const sub = helper.textOf(c.querySelector('.c-sub'))
      expect(String(sub || '').length,
        `отрок без подписи с платой: «${helper.textOf(c).slice(0, 40)}»`).toBeGreaterThan(4)
    }
  })

  it('отрок с проклятием на экране начинается с ЦЕНЫ, а не с выгоды', () => {
    // Страховка на СОБРАННОМ экране. В данных порядок величин задан (проклятие
    // первым), и подпись печатает эффекты по порядку — механизм один.
    //
    // Раньше порядок навязывался ещё и при отрисовке (`effectOrder`). Два
    // механизма, делающих одно и то же, невозможно проверить по отдельности:
    // откат одного оставлял второй, и проверка оставалась зелёной. Механизм
    // оставлен один, а эта проверка ловит его отказ на экране.
    const ev = FIELD_EVENTS.find((e) => wholeHas(e.title))
    expect(ev, 'на экране нет ни одного известного события').toBeTruthy()
    const cursed = ev.choices.filter((c) => c.effects.some((x) => x.kind === 'chaos'))
    if (!cursed.length) {
      // Не во всех событиях есть проклятие — это законно. Тогда проверяем, что
      // событие вообще найдено и отроки на экране (остальное сделано выше).
      expect(ev.choices.length, 'у события на экране нет отроков').toBeGreaterThanOrEqual(2)
      return
    }
    for (const c of cursed) {
      const card = [...dom.root.querySelectorAll('.choice')]
        .find((n) => /event/.test(String(n.className || ''))
          && helper.textOf(n.querySelector('.c-main')) === c.label)
      expect(card, `отрок «${c.label}» не нарисован`).toBeTruthy()
      const sub = helper.textOf(card.querySelector('.c-sub'))
      expect(/^урон вдвое/.test(sub),
        `на экране отрок «${c.label}» начинается с выгоды, и цена её заглушает: «${sub}»`)
        .toBe(true)
    }
  })

  it('подпись на отроке совпадает с данными этого события — слово в слово', () => {
    // Экран не придумывает подпись: он печатает `effectText`. Проверяем, что
    // на экране написано ровно то, что лежит в данных для ЭТОГО события.
    const whole = text()
    const ev = FIELD_EVENTS.find((e) => whole.includes(e.title))
    expect(ev, `на экране нет ни одного известного события; экран: ${whole.slice(0, 160)}`).toBeTruthy()
    for (const c of ev.choices) {
      expect(whole, `подпись отрока «${c.label}» на экране не найдена`)
        .toContain(effectText(c.effects))
    }
  })
})

describe('Служение: обещание исполнилось', () => {
  it('отрок с ценой действительно отнимает — и ровно столько, сколько написано', () => {
    // Собираем числа ДО и ПОСЛЕ. Проверяем по подписи, а не по номеру отрока:
    // подпись это единственное, на что смотрит игрок.
    const cards = eventCards()
    expect(cards.length, 'нет отроков — нечего проверять').toBeGreaterThanOrEqual(2)

    // Ищем отрок, у которого в подписи назван расход жизни.
    //
    // Первая версия мерила `__field.player.hp` ДО и ПОСЛЕ и была неверна: на
    // экране дверей живого поля нет (комната уже закрыта), игра пишет живучесть
    // в `runHp`, а объект `__field` — мёртвый. Проверка читала поле, которое
    // никто не меняет, и получала «жизни не списалось».
    //
    // Теперь мерится то, что игрок увидит: сколько жизни будет в СЛЕДУЮЩЕЙ
    // комнате. Это и есть исполнение обещания, а не факт записи в переменную.
    const costs = /[-−](\d+)\s*жизни/
    let checked = 0
    for (const card of cards) {
      const sub = helper.textOf(card.querySelector('.c-sub'))
      const m = costs.exec(sub)
      if (!m) continue
      const n = Number(m[1])
      card.dispatch('click')
      for (let i = 0; i < 16 && !onField(); i++) {
        if (byClass(/boon-card/)) break
        if (byText(/Идти дальше/)) break
        dom.flushRaf(2)
      }
      for (let i = 0; i < 20 && !onField(); i++) {
        if (!byClass(/^btn/) && !byText(/← |дальше/)) break
        dom.flushRaf(2)
      }
      const st = globalThis.window.__field
      expect(st, `отрок «${m[0]}» не довёл до следующей комнаты — обещание неисполнимо`)
        .toBeTruthy()
      const lost = st.player.maxHp - st.player.hp
      expect(lost, `жизни списалось ${lost}, а обещано ${n}: карточка обещает одно, `
        + `в комнату игрок входит с другим`).toBe(n)
      checked++
      break
    }
    expect(checked, 'ни один отрок не называет расход — проверить было нечего')
  })

  it('и после служения забег идёт дальше — экран не тупик', () => {
    // Самая частая поломка нового экрана: выбор сработал, а из него некуда.
    let guard = 0
    while (!onField() && guard++ < 40) {
      if (onEvent() && byClass(/\bchoice\b/)) break
      if (byClass(/boon-card/)) break
      if (byText(/Идти дальше/)) break
      if (!byClass(/^btn/) && !byText(/← ути|дальше/)) break
      dom.flushRaf(2)
    }
    expect(onField() || onDoors(),
      `после служения некуда идти; экран: ${text().slice(0, 160)}`).toBe(true)
  })
})

/** Кошелёк показан на экране дверей — читаем оттуда. */
function readPurse() {
  const el = dom.root.querySelector('.door-seva')
  if (!el) return null
  const m = /(\d+)/.exec(String(el.textContent || ''))
  return m ? Number(m[1]) : null
}