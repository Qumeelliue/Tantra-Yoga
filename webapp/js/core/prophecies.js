// ПРОРИЦАНИЯ — копия из Hades (Prophecies).
//
// Что это. В Hades у богини есть **прорицания**: список заданий вроде
// «выиграй 5 забегов, не получив урона», и за каждое выполняется награда.
// Смысл не в самом задании, а в том, что у игрока есть **долгая цель**, а не
// только «ещё один забег».
//
// Чего у нас не было. Долгих целей не было вовсе: жар отвечает на «зачем начать
// забег сильнее», рекорд — на «зачем пройти чище», ежедневный путь — на
// «зачем сегодня». Ни одна из них не отвечала на «зачем играть на этой неделе».
//
// Что копируется 1:1:
//
//   · **список целей с прогрессом** (виден всегда, не «спрятать, чтобы
//     сюрприз был сильнее»);
//   · **награда за выполнение**, а не «ну ты молодец»;
//   · награда идёт в **ту же валюту**, что и постоянные усиления: в Hades это
//     нектар → зеркало ночи, у нас это сева → мастерская.
//
// КАК СЧИТАЕТСЯ ПРОГРЕСС — и это главное правило модуля:
//
//   **Прогресс считается из профиля, а не из событий.** Никаких «сработало на
//   событии» со счётчиком: счётчик можно забыть сбросить, можно сбросить
//   дважды, можно не сбросить после переустановки. Все условия — это ЧИТАЕМЫЕ
//   числа уже существующих счётчиков (`meta.stats`, `meta.runLog`). Отсюда
//   следствие, которое тоже проверяется тестом: **прорицание не может
//   откатиться назад**. Игрок выполнил — и выполнил навсегда, даже если
//   счётчики потом уедут вниз (например, после чистого импорта старого
//   сохранения).
//
// Награда забирается **руками** и **один раз**: автоматическая выдача была бы
// враньём в интерфейсе («получено»), которого игрок не получал.

/**
 * Список прорицаний.
 *
 * `has` — читает ПРОГРЕСС из профиля. Только чтение: никаких записей.
 * `reward` — очки севы (валюта мастерской).
 * `quoteId` — цитата из шастр: без неё цели не существует (правило проекта).
 *
 * ЗАМЕР НАГРАД (2026-09-30), из-за которого числа подняты вчетверо. Поле даёт
 * **122 севы за забег** (40 забегов, `fieldBalance.mjs`), а вся мастерская из
 * 36 рангов стоит 248. Значит:
 *
 *   · весь мастерский прогресс игры = ДВА забега;
 *   · восемь прорицаний вместе давали 37 севы = 0.3 забега;
 *   · цель «начни двадцать забегов» давала 5 севы — 4 % одного забега, то есть
 *     игрок шёл к ней 20 забегов и получал меньше, чем набрал бы за два.
 *
 * Это ровно та поломка, что и с жаром: механика существовала, а толку от неё
 * не было. Теперь награда привязана к ТРУДНОСТИ цели, а не одинакова у всех:
 * первая цель — 12 севы, самая долгая — 45. Все восемь вместе дают 222 севы,
 * то есть почти целую мастерскую за полтора месяца игры. Это награда, за
 * которую есть смысл возвращаться, но и не переплата за «просто поиграть».
 */
export const PROPHECIES = [
  {
    id: 'peaceful_1',
    name: 'Первый свет',
    text: 'Закончи забег, не сломав ни одной оки.',
    quoteId: 'ahimsa',
    target: 1,
    reward: 15,
    has: (meta) => Math.min((meta?.stats?.awakened || 0), 1),
  },
  {
    id: 'peaceful_5',
    name: 'Путь без крови',
    text: 'Закончи пять забегов без единого удара.',
    quoteId: 'ahimsa',
    target: 5,
    reward: 30,
    has: (meta) => Math.min(meta?.stats?.awakened || 0, 5),
  },
  {
    id: 'runs_20',
    name: 'Двадцать жизней',
    text: 'Начни двадцать забегов. Умереть — не значит отступить.',
    quoteId: 'death_rebirth',
    target: 20,
    reward: 30,
    has: (meta) => Math.min(meta?.stats?.runs || 0, 20),
  },
  {
    id: 'pacified_300',
    name: 'Триста оков',
    text: 'Сними терпением триста оков за всё время.',
    quoteId: 'prasad',
    target: 300,
    reward: 30,
    has: (meta) => Math.min(meta?.stats?.pacified || 0, 300),
  },
  {
    id: 'daily_1',
    name: 'Один путь на всех',
    text: 'Сыграй ежедневный путь: он у всех одинаковый.',
    quoteId: 'satsaunga',
    target: 1,
    reward: 15,
    has: (meta) => (meta?.daily?.dailyRunDone ? 1 : 0),
  },
  {
    id: 'quotes_60',
    name: 'Половина корпуса',
    text: 'Проживи 60 цитат из шастр.',
    quoteId: 'viveka',
    target: 60,
    reward: 30,
    has: (meta) => Math.min(Object.keys(meta?.quotesUnlocked || {}).length, 60),
  },
  {
    id: 'workshop_3',
    name: 'Три принципа',
    text: 'Купи три усиления в мастерской севы.',
    quoteId: 'sila',
    target: 3,
    reward: 20,
    has: (meta) => Math.min((meta?.upgrades || []).length, 3),
  },
  {
    id: 'trial_1',
    name: 'Первое испытание',
    text: 'Пройди одно испытание Ямы или Ниямы.',
    quoteId: 'santosa',
    target: 1,
    reward: 20,
    // Ветви мастерства выбираются только после пройденного испытания
    // (`setVarnaBranch`), поэтому их число и есть «сколько испытаний пройдено».
    // Отдельного счётчика испытаний в профиле нет, и выдумывать его ради одного
    // прорицания — значит завести ещё одно место, где можно забыть запись.
    has: (meta) => Math.min(Object.keys(meta?.varnaBranches || {}).length, 1),
  },
]

/**
 * Прогресс по всем прорицаниям. Только чтение профиля.
 * @returns {Array<{id:string,name:string,text:string,quoteId:string,target:number,
 *                  progress:number,reward:number,done:boolean,claimed:boolean,
 *                  pct:number}>}
 */
export function prophecyState(meta) {
  const claimed = (meta?.prophecies && meta.prophecies.claimed) || []
  return PROPHECIES.map((p) => {
    const raw = Number(p.has(meta)) || 0
    // Кламп в целевое число ДО сравнения с «получено»: иначе счётчик,
    // уехавший выше цели (например, 25 забегов при цели 20), показывал бы
    // прогресс больше цели, и полоска выходила за 100 %.
    const progress = Math.max(0, Math.min(p.target, raw))
    const wasClaimed = claimed.includes(p.id)
    // «Выполнено» = выполнено ИЛИ уже забрано. Иначе выполненное, но не
    // забранное пропадало бы из списка целей вместе с кнопкой.
    const done = wasClaimed || progress >= p.target
    return {
      id: p.id,
      name: p.name,
      text: p.text,
      quoteId: p.quoteId,
      target: p.target,
      progress,
      reward: p.reward,
      done,
      claimed: wasClaimed,
      pct: Math.round((progress / p.target) * 100),
    }
  })
}

/** Сколько севы ждёт игрок прямо сейчас. */
export function unclaimedPoints(meta) {
  return prophecyState(meta).filter((p) => p.done && !p.claimed)
    .reduce((a, p) => a + p.reward, 0)
}

/**
 * Забрать награду за ОДНО прорицание. Один раз, и только если оно выполнено.
 * @returns {{ok:boolean, points:number}}
 */
export function claimProphecy(meta, id) {
  const p = PROPHECIES.find((x) => x.id === id)
  if (!meta || !p) return { ok: false, points: 0 }
  const st = prophecyState(meta).find((x) => x.id === id)
  if (!st || !st.done || st.claimed) return { ok: false, points: 0 }
  if (!meta.prophecies || typeof meta.prophecies !== 'object') meta.prophecies = { claimed: [] }
  if (!Array.isArray(meta.prophecies.claimed)) meta.prophecies.claimed = []
  meta.prophecies.claimed.push(id)
  meta.sevaPoints = (meta.sevaPoints || 0) + p.reward
  return { ok: true, points: p.reward }
}

/** Забрать всё, что готово. Вызывается один раз за экран, не за кадр. */
export function claimAll(meta) {
  let points = 0
  for (const p of prophecyState(meta)) {
    if (!p.done || p.claimed) continue
    const r = claimProphecy(meta, p.id)
    if (r.ok) points += r.points
  }
  return { points }
}