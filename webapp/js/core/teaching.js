// ПРЕПОДАВАНИЕ: цитата приходит от места, а не от карты.
//
// Проблема, которую это решает. Цитат в корпусе 100, а открывалось 52.
// Остальные 48 были написаны, сверены с источниками, лежали в content/
// и были не видны игроку никогда. Это не «запас на будущее» — это мусор:
// он занимает место, время автора и создаёт иллюзию, что игра больше, чем
// она есть.
//
// Что сделано: каждая оставшаяся цитата привязана к тому, что в игре уже
// есть — к семи чакрам, к семи учителям Города, к местам и к финалу.
// Учитель даёт не одну фразу, а учение: несколько цитат по одной за раз.
// Так и устроена садхана — пришёл, получил следующий слой, ушёл думать.

import teaching from '@content/teaching.json'
import { QUOTES, CITY_TEACHERS, WORLDS } from '@webapp/js/core/data.js'
import { KEEPSAKES } from '@webapp/js/core/keepsakes.js'
import { BOONS as FIELD_BOONS } from '@webapp/js/core/boons.js'

/** Мир → цитата, которая открывается при первом входе в локацию. */
export const WORLD_QUOTES = teaching.worlds || {}

/** Учитель → цепочка цитат. Даётся по одной за визит. */
export const TEACHER_QUOTES = teaching.teachers || {}

/**
 * Владыка → цепочка цитат (МЕХАНИКА 58, троны чакры).
 *
 * Отдельно от учителей: владык 21, а площадей в Городе семь, и учитель —
 * это чакра, а не имя. Цитаты владыки вручает тот учитель той чакры, чей
 * владыка игрок успокоил. Поэтому цепочка привязана к id владыки, а не к
 * чакре: иначе все трое трона Анахаты давали бы одну и ту же первую цитату.
 */
export const LORD_QUOTES = teaching.lords || {}

/** Места: амбросия, покой, лавка, хаос-путь, смерть, финал, первая комната. */
export const PLACE_QUOTES = teaching.places || {}

/**
 * Какую цитату учитель даст В ЭТОТ раз. Отсчёт идёт по тому, сколько его
 * цитат уже прожито: пришёл, взял первую, пришёл — вторую.
 * Возвращает null, когда всё уже дано: учитель не придумывает нового.
 */
export function nextTeacherQuote(teacherId, lived = {}) {
  const chain = TEACHER_QUOTES[teacherId]
  if (!chain || !chain.length) return null
  for (const id of chain) if (!lived[id]) return id
  return null
}

/** Все цитаты учителя — нужно экрану «учитель дал всё, что мог». */
export function teacherChain(teacherId) {
  return TEACHER_QUOTES[teacherId] || []
}

/**
 * Цепочка цитат ВЛАДЫКИ. Учитель в городе отдаёт сначала цепочку того
 * владыки, которого игрок успокоил на этой чакре, — своими словами он стал
 * этим человеком. Если владыка не записан (старое сохранение), берётся
 * цепочка учителя: пустой экран хуже, чем прежнее поведение.
 */
export function lordChain(lordId, teacherId) {
  // Владыка по умолчанию И ЕСТЬ учитель своей чакры — у него уже есть своя
  // цепочка в `TEACHER_QUOTES`. Остальные владыки получили цепочки в
  // `LORD_QUOTES`, потому что у них не было учителя. Третий случай — старая
  // запись без указания, кто встречен: берётся цепочка учителя чакры.
  return LORD_QUOTES[lordId] || TEACHER_QUOTES[lordId] || TEACHER_QUOTES[teacherId] || []
}

/** Цитата владыки в ЭТОТ раз — то же, что `nextTeacherQuote`, но по владыке. */
export function nextLordQuote(lordId, teacherId, lived = {}) {
  const chain = lordChain(lordId, teacherId)
  for (const id of chain) if (!lived[id]) return id
  return null
}

/** Цитата места. Список (как у финала) — отдаётся целиком. */
export function placeQuotes(place) {
  const v = PLACE_QUOTES[place]
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

/** Цитата чакры по её id (muladhara, anahata…). */
export function chakraQuote(chakraId) {
  return WORLD_QUOTES[chakraId] || null
}

/**
 * Все цитаты, которые можно прожить. Считается из одного места, чтобы
 * проверка достижимости не расходилась с игрой: нефриты и дары поля тоже
 * вручают цитату, и забыть их здесь — значит снова объявить их
 * недостижимыми.
 */
export function reachableQuoteIds() {
  const out = new Set()
  const add = (v) => { if (v) out.add(v) }
  for (const id of Object.values(WORLD_QUOTES)) add(id)
  for (const chain of Object.values(TEACHER_QUOTES)) for (const id of [].concat(chain)) add(id)
  for (const chain of Object.values(LORD_QUOTES)) for (const id of [].concat(chain)) add(id)
  for (const chain of Object.values(PLACE_QUOTES)) for (const id of [].concat(chain)) add(id)
  for (const k of KEEPSAKES) add(k.quoteId)
  for (const b of FIELD_BOONS) add(b.quoteId)
  return out
}

/** Цитаты, которых нет в корпусе, — ошибка данных, а не игры. */
export function brokenTeaching() {
  const bad = []
  for (const id of reachableQuoteIds()) if (!QUOTES[id]) bad.push(id)
  return bad
}
