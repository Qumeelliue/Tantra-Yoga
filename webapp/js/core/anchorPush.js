// ПУШ-НАПОМИНАНИЕ ЯКОРЯ (SPEC §11.2, интервальное повторение).
//
// Что это. Когда в бою рождается якорь — «уныние → кииртан» — игра
// предлагает вернуть эту связь через 1, 3 и 7 дней. Не чаще: интервальное
// повторение (Duolingo, §15) держит мысль именно тогда, когда она нужна.
//
// Почему модуль отдельный, а не функция в main.js. Здесь вся логика
// РАСПИСАНИЯ: чтоdue, что уже отправлено, что игрок разрешил. Остальной код
// только зовёт `dueAnchorReminders` и `markReminded`.
//
// ЧЕСТНОСТЬ ГЛАВНОЕ. Уведомление в Telegram Mini App отправляет только бот
// на сервере (нужен initData для проверки подписи — её не подделать на
// клиенте). Сервера у нас нет. Поэтому:
//
//   · без сервера игра НЕ притворяется, что отправила: возвращает честный
//     статус и пишет игроку, почему напоминания не придут;
//   · проверка `sent` означает реально отправленное, а не «мы решили, что
//     отправили» — иначе якорь молча пропадал бы из дневника.
//
// Отправка идёт через Telegram CloudStorage (тот же путь, что у `cloudSync`
// в save.js): бот на сервере забирает очередь и шлёт push. Без бот-токена
// очередь копится и ждёт — ничего не теряется.

const DAY = 86400000

// Три напоминания, как в Duolingo: 1 / 3 / 7 дней. Смысл — вернуть мысль
// три раза, а не спамить. Четыре и больше уже превращаются в шум, и игрок
// просто выключает уведомления.
export const REMIND_AT = [1, 3, 7]

/** Текст напоминания. Термин и практика приходят из дневника — без выдумок. */
export function reminderText(anchor) {
  return `${anchor.situation} → ${anchor.practice}`
}

/**
 * Что пора отправить прямо сейчас.
 *
 * `now` передаётся явно, чтобы это была чистая функция: её можно гонять
 * в тестах с любым временем и не ждать реальных суток.
 */
export function dueAnchorReminders(diary, now = Date.now()) {
  const out = []
  for (const a of diary || []) {
    if (!a || !a.at) continue
    const sent = a.reminded || []
    for (let i = sent.length; i < REMIND_AT.length; i++) {
      const dueAt = a.at + REMIND_AT[i] * DAY
      // Напоминание «созрело», но не просрочено больше чем на сутки: игрок
      // мог не открывать игру неделю. Пропущенное не досылаем пачкой.
      if (now >= dueAt && now - dueAt < DAY) {
        out.push({ anchor: a, step: i, text: reminderText(a), dueAt })
        break        // один шаг за раз, чтобы порядок не перепрыгивал
      }
      if (now < dueAt) break
    }
  }
  return out
}

/**
 * Отметить шаг как отправленный.
 *
 * Помечается ТОЛЬКО то, что правда отправлено. Если сервера нет — шаг не
 * помечается, и при следующем запуске напоминание попробует уйти снова,
 * а не потеряется молча.
 */
export function markReminded(anchor, step, now = Date.now()) {
  if (!anchor.reminded) anchor.reminded = []
  if (anchor.reminded.length !== step) anchor.reminded = [...anchor.reminded, ...Array(step - anchor.reminded.length).fill(-1)]
  anchor.reminded[step] = now
  return anchor
}

/**
 * Кладёт напоминания в очередь CloudStorage и говорит честно, что вышло.
 *
 * `send` — функция, которая действительно отправляет (её даёт серверная
 * часть или тест). Здесь только решение и честный отчёт.
 */
export async function processAnchorReminders(meta, { send, now = Date.now() } = {}) {
  const due = dueAnchorReminders(meta.practiceDiary, now)
  const res = { due: due.length, sent: 0, queued: 0, failed: 0, reason: '' }
  if (!due.length) { res.reason = 'нечего напоминать'; return res }
  if (typeof send !== 'function') {
    res.failed = due.length
    // Не «ошибка» и не «успех». Сервера нет — это надо сказать прямо.
    res.reason = 'нет сервера: напоминания не отправлены, якоря ждут'
    return res
  }
  for (const item of due) {
    try {
      await send(item.text, item.anchor)
      markReminded(item.anchor, item.step, now)
      res.sent++
    } catch {
      res.failed++
      res.reason = 'сервер не принял — попробуем позже'
    }
  }
  return res
}

/** Слово для игрока: что на самом деле произошло. */
export function reminderStatusLine(res) {
  if (!res || !res.due) return null
  if (res.sent) return `напоминаний отправлено: ${res.sent}`
  if (res.queued) return `напоминаний в очереди: ${res.queued}`
  if (res.reason) return `напоминаний не отправлено — ${res.reason}`
  return null
}