// Маршрут забега внутри этапа (Hades: комната → комната → комната → босс).
//
// Вынесено отдельной маленькой функцией намеренно: раньше переход между
// комнатами читался из переменной, которой нет, — и падал молча, не
// показывая ошибки, а игрок просто не мог уйти из первой комнаты.
//
// Правило: возвращает, что делать дальше. Ничего не знает про экраны.

export const ROOMS_PER_STAGE = 3

// Последняя чакра. Семь чакр — семь владык; за седьмой забег заканчивается.
export const LAST_FLOOR = 6

export function isLastFloor(floor) {
  return floor >= LAST_FLOOR
}

/**
 * @param {'room'|'boss'} stage где сейчас игрок
 * @param {number} room номер комнаты этапа, 0-based
 * @param {boolean} hasBoss есть ли владыка у этого этапа
 * @returns {{kind:'room',room:number}|{kind:'boss',room:number}|{kind:'done'}}
 */
export function nextStage(stage, room, hasBoss) {
  if (stage === 'boss') return { kind: 'done' }
  const n = Number.isFinite(room) ? room : 0
  if (n + 1 < ROOMS_PER_STAGE) return { kind: 'room', room: n + 1 }
  if (hasBoss) return { kind: 'boss', room: ROOMS_PER_STAGE }
  return { kind: 'done' }
}
