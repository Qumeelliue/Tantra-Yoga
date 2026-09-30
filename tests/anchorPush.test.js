// ПУШ-НАПОМИНАНИЕ: ГЛАВНОЕ — ЧЕСТНОСТЬ, А НЕ САМ ПУШ.
//
// Соблазн этой фичи в том, что она выглядит работающей с первого дня: кнопка
// есть, статус «отправлено» горит. Но push в Telegram Mini App отправляет
// ТОЛЬКО бот на сервере, а сервера у проекта нет. Если в такой ситуации
// написать `sent: true`, то якорь навсегда исчезнет из расписания молча —
// игрок решит, что напоминаний больше не бывает, и правды не узнает.
//
// Здесь проверяется обратное: без отправки игра НЕ должна считать шаг
// выполненным, должна сказать об этом словами и должна сохранить якорь.

import { describe, it, expect } from 'vitest'
import {
  REMIND_AT, reminderText, dueAnchorReminders,
  markReminded, processAnchorReminders, reminderStatusLine,
} from '../webapp/js/core/anchorPush.js'

const DAY = 86400000
const at = (daysAgo) => Date.now() - daysAgo * DAY

describe('Расписание напоминаний', () => {
  it('три напоминания: 1, 3 и 7 дней (Duolingo, §15)', () => {
    // Больше трёх — шум: игрок выключит уведомления и потеряем всё.
    expect(REMIND_AT).toEqual([1, 3, 7])
  })

  it('текст берёт термин и практику из якоря, ничего не выдумывает', () => {
    expect(reminderText({ situation: 'УНЫНИЕ', practice: 'КИИРТАН' })).toBe('УНЫНИЕ → КИИРТАН')
  })

  it('свежий якорь не напоминает', () => {
    const diary = [{ situation: 'УНЫНИЕ', practice: 'КИИРТАН', at: at(0) }]
    expect(dueAnchorReminders(diary)).toHaveLength(0)
  })

  it('на второй день — первое напоминание', () => {
    const diary = [{ situation: 'УНЫНИЕ', practice: 'КИИРТАН', at: at(1.5) }]
    const due = dueAnchorReminders(diary)
    expect(due).toHaveLength(1)
    expect(due[0].step).toBe(0)
  })

  it('пропущенные дни не досылают пачкой — один шаг за раз', () => {
    // Игрок не открывал игру 10 дней. Присылать три уведомления разом —
    // значит орать в пустоту. Берём только ближайшее.
    const diary = [{ situation: 'УНЫНИЕ', practice: 'КИИРТАН', at: at(7) }]
    const due = dueAnchorReminders(diary)
    expect(due.length).toBeLessThanOrEqual(1)
  })

  it('очень старый якорь молчит, а не сыпет долг', () => {
    const diary = [{ situation: 'УНЫНИЕ', practice: 'КИИРТАН', at: at(400) }]
    expect(dueAnchorReminders(diary)).toHaveLength(0)
  })
})

describe('Честность: нет сервера — нет «отправлено»', () => {
  it('без функции отправки шаг НЕ помечается выполненным', async () => {
    // Главная проверка. Прежняя версия кода писала `sent` до отправки,
    // и якорь молча пропадал из дневника навсегда.
    const diary = [{ situation: 'УНЫНИЕ', practice: 'КИИРТАН', at: at(1.5) }]
    const res = await processAnchorReminders({ practiceDiary: diary }, {})
    expect(res.sent).toBe(0)
    expect(res.failed).toBeGreaterThan(0)
    expect(diary[0].reminded, 'шаг не должен считаться сделанным').toBeFalsy()
  })

  it('игроку сказано словами, что не отправлено', async () => {
    const diary = [{ situation: 'УНЫНИЕ', practice: 'КИИРТАН', at: at(1.5) }]
    const res = await processAnchorReminders({ practiceDiary: diary }, {})
    const line = reminderStatusLine(res)
    expect(line).toBeTruthy()
    expect(line).toMatch(/не отправлено/)
    // И не «ошибка» — это не баг, а отсутствие сервера.
    expect(line).not.toMatch(/ошибка|error/i)
  })

  it('нечего напоминать — пустая правда, а не предупреждение', async () => {
    const res = await processAnchorReminders({ practiceDiary: [] }, {})
    expect(res.due).toBe(0)
    expect(res.sent).toBe(0)
    expect(reminderStatusLine(res)).toBeFalsy()
  })

  it('упавший сервер не помечает шаг — попробуем позже', async () => {
    // Сеть отвалилась. Если пометить как отправленное — напоминание
    // пропадёт навсегда, хотя игрок его не получил.
    const diary = [{ situation: 'ГНЕВ', practice: 'АХИМСА', at: at(1.5) }]
    const send = async () => { throw new Error('сеть') }
    const res = await processAnchorReminders({ practiceDiary: diary }, { send })
    expect(res.sent).toBe(0)
    expect(res.failed).toBe(1)
    expect(diary[0].reminded).toBeFalsy()
    expect(res.reason).toMatch(/позже/)
  })

  it('успешная отправка помечает шаг — и он не повторяется', async () => {
    const diary = [{ situation: 'ГНЕВ', practice: 'АХИМСА', at: at(1.5) }]
    const sent = []
    const send = async (text) => { sent.push(text) }
    const r1 = await processAnchorReminders({ practiceDiary: diary }, { send })
    expect(r1.sent).toBe(1)
    expect(sent[0]).toBe('ГНЕВ → АХИМСА')
    // Второй прогеменя — тишина: то же уведомление два раза не отправляем.
    const r2 = await processAnchorReminders({ practiceDiary: diary }, { send })
    expect(r2.sent).toBe(0)
  })

  it('после трёх шагов напоминания заканчиваются', async () => {
    const diary = [{ situation: 'СТРАДАНИЕ', practice: 'СЛУЖЕНИЕ', at: at(20) }]
    const send = async () => {}
    // Прокручиваем все шаги по одному, как в жизни.
    for (let i = 0; i < REMIND_AT.length; i++) {
      diary[0].reminded = i ? [0, 1, 2].slice(0, i) : undefined
      if (i) diary[0].reminded = [...Array(i).fill(Date.now())]
      const now = at(20) + REMIND_AT[i] * DAY + 1000
      const res = await processAnchorReminders({ practiceDiary: diary }, { send, now })
      if (i < REMIND_AT.length) expect(res.due + res.sent).toBeGreaterThan(0)
    }
    const done = await processAnchorReminders({ practiceDiary: diary }, { send, now: at(0) })
    expect(done.due).toBe(0)
  })
})

describe('Как это подключено к игре', () => {
  it('в main.js напоминание НЕ помечается без сервера', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../webapp/js/main.js', import.meta.url), 'utf8')
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    // Проверки идут на реальный результат processAnchorReminders, а не на
    // «вроде вызвали» — иначе код снова станет вручиком.
    expect(code).toContain('processAnchorReminders')
    expect(code).toContain('pushSender')
    expect(code).toContain('reminderStatusLine')
  })

  it('эндпоинт сервера задаётся снаружи — иначе фича не подключима', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../webapp/js/main.js', import.meta.url), 'utf8')
    expect(src).toContain('TANTRA_PUSH_URL')
  })

  it('напоминание проверяется и на возврате в приложение', async () => {
    // Телефон мог пролежать неделю. В мини-аппе нет таймера, когда
    // приложение закрыто, — значит проверка живёт на входе.
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../webapp/js/main.js', import.meta.url), 'utf8')
    expect(src).toMatch(/visibilitychange[\s\S]{0,400}checkAnchorReminders/)
  })
})