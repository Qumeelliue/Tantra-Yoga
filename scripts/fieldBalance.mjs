// Баланс-прогон ПОЛЯ УМА: бот играет полные забеги от первой чакры до финала.
//
// Зачем это нужно. `npm run balance` считает только карточный путь, а
// Поле Ума — это отдельная петля, и в ней были баги, которые ни один тест
// не ловил (забег упирался в первую комнату; шаг боя выдавал NaN и вся
// самадхи молча не считалась). Прогон проходит ВСЮ петлю — комната за
// комнатой, владыка за владыкой — и печатает, где именно ломается.
//
// Бот играет как хороший человек: подходит к оке, жмёт дефлект в окно,
// тратит мантру когда хватает Ци, отступает на низком здоровье.

import { pathToFileURL } from 'node:url'
import {
  createField, stepField, parry, castMantra, parryHint, checkOutcome, serveWare, strike, smashPot, FLOOR_MANTRA, DEFAULT_FIELD_OPTIONS,
} from '../webapp/js/core/field.js'
import { buildFieldFloor, stageHasBoss, setLordCalmMul } from '../webapp/js/core/fieldBuild.js'
import { applyVarna } from '../webapp/js/core/varnaKits.js'
import { MENTALITIES, ENEMIES, MENTALITY_LEVELS } from '../webapp/js/core/data.js'
import { floorVarnaFood } from '../webapp/js/core/mentalityFood.js'
import { applyFieldRelics, rollFieldRelics } from '../webapp/js/core/fieldRelics.js'
import { applyKeepsake, rollKeepsakes } from '../webapp/js/core/keepsakes.js'
import { applyBoons, rollBoons, BOONS as BOON_DEFS } from '../webapp/js/core/boons.js'
import { mantraById } from '../webapp/js/core/field.js'
import { nextStage, ROOMS_PER_STAGE, isLastFloor } from '../webapp/js/core/stageRoute.js'
import { applyHeat, HEAT_MAX, heatReward } from '../webapp/js/core/heat.js'
import { WORKSHOP as WS, applyUpgrades, rankKey, maxRank, sevaPointsFor } from '../webapp/js/core/workshop.js'
import { rollDoors, hasCombatDoor } from '../webapp/js/core/doors.js'
import { rollFieldEvent, previewEffects, FIELD_EVENTS } from '../webapp/js/core/fieldEvents.js'
import { rollLords, lordPool } from '../webapp/js/core/lords.js'

const RUNS = Number(process.argv[2] || 60)

// ── ЖАР в замере (2026-09-30) ───────────────────────────────────────────
// Проверяется то, ради чего жар и делался: он не должен превращаться в
// кирпич. «Проходимо» и «интересно» — разные числа, и сперва нужно первое.
//
// Флаги только через `--` (правило проекта):
//   node … fieldBalance.mjs 20 -- --heat=3
const argv = process.argv.slice(3)
const heatArg = argv.find((a) => a.startsWith('--heat'))
const HEAT = heatArg
  ? Math.max(0, Math.min(HEAT_MAX, Number(heatArg.split('=')[1] || 0)))
  : 0
// ── МАСТЕРСКАЯ (2026-09-30) ─────────────────────────────────────────────
// Проверяется то, ради чего ранги и делались: прокачанная мастерская не
// должна ломать забег. Два разных вопроса, и оба честные:
//
//   · `--ws=all`  — владелец ВСЕХ рангов. Поле обязано остаться проходимым,
//     иначе усиления не «работают», а ломают;
//   · без флага — владелец НИЧЕГО. Это базовая линия, и она не должна
//     сдвинуться от того, что мастерская расширилась.
//
// Флаги только через `--` (правило проекта):
//   node … fieldBalance.mjs 20 -- --ws=all
const wsArg = process.argv.slice(3).find((a) => a.startsWith('--ws'))
const WS_KEYS = wsArg && wsArg.split('=')[1] === 'all'
  ? WS.flatMap((u) => Array.from({ length: maxRank(u.id) }, (_, i) => rankKey(u.id, i + 1)))
  : []
// Сколько дверей выпадало: сколько было двух, сколько трёх. Печатается, потому
// что «двери всегда одинаковые» — это тоже поломка, и без счётчика её не
// видно.
// Флаги только через `--` (правило проекта):
//   node … fieldBalance.mjs 20 -- --elite
const ELITE = process.argv.slice(3).includes('--elite')
// КАК БОТ ВЫБИРАЕТ ДВЕРЬ. Проверка честности правила «дверь боя есть всегда»:
// если можно пройти весь забег, ни разу не сразившись с обычной окой, то
// «мирный финал» достигается не умением, а маршрутом.
//
//   combat (по умолчанию) — бот идёт в оковы: меряется проходимость забега;
//   avoid                 — бот всегда берёт лавку/покой/дар, если они есть:
//                           меряется, чем платит игрок за то, что не дрался.
// `--jade=N` — ранг нефрита для всех забегов. Замер нужен, чтобы ответить на
// вопрос «стоит ли вообще покупать ранг»: если 8-й ранг не меняет проходимость,
// то цены в таблице — выдуманные числа, и покупка была бы платой за воздух.
const jadeArg = process.argv.slice(3).find((a) => a.startsWith('--jade'))
const JADE_LV = jadeArg ? Math.max(1, Math.min(8, Number(jadeArg.split('=')[1]) || 1)) : 1

const doorsArg = process.argv.slice(3).find((a) => a.startsWith('--doors'))
// `--doors=event`: бот, получив небоевую дверь, берёт СЛУЖЕНИЕ, если оно есть.
//
// Зачем отдельный режим, а не флаг `--events=off`. Событие занимает тот же лимит
// «одна небоевая дверь на этап», что лавка, покой и дар. Значит вопрос не
// «есть ли событие», а «сколько стоит то, что игрок выбрал событие вместо
// лавки». Это и меряет режим: иначе сравнивались бы разные наборы дверей.
const DOORS_MODE = doorsArg && ['avoid', 'event'].includes(doorsArg.split('=')[1])
  ? doorsArg.split('=')[1] : 'combat'

// `--event-pick=ID` — бот берёт ОТРОКА ПО ID, а не верхнего.
//
// Зачем это, и почему верхнего мало. Событие называет себя выбором. Проверяется
// это единственным способом: если один отрок всегда правильный, а другой
// никогда — событие не решение, а арифметика с двусторонней подписью. Меряется
// так: тот же бот, тот же путь, меняется ТОЛЬКО отрок. Всё остальное — забег,
// двери, оки, дары — остаётся тем же, поэтому разница принадлежит отроку.
//
// Ошибка, которой этот флаг страхует: «все три отрока дают ~74 %» тоже ничего не
// значит. Если разброс внутри события меньше шума, событие неразличимо.
const eventPickArg = process.argv.slice(3).find((a) => a.startsWith('--event-pick='))
const EVENT_PICK = eventPickArg ? eventPickArg.split('=')[1] : ''

// `--event=ID` — заставить выпадать ОДНО событие все забеги.
//
// Зачем вместе с `--event-pick`. Первая версия сравнения была сломана и выглядела
// при этом убедительно: `--event-pick=give_seva` менял отрок только в событии
// «служение у порога», а в двух других отрока не было — и там молча брался
// верхний. Четыре замера подряд дали одинаковые 59 из 80, и это выглядело как
// «числа не меняются». На самом деле сравнивались четыре одинаковых прогона.
//
// Правило: **флаг сравнения, который молча не применился, хуже отсутствия
// флага** — он даёт правдоподобный вывод о несуществующем эффекте.
const eventForceArg = process.argv.slice(3).find((a) => a.startsWith('--event='))
const EVENT_FORCE = eventForceArg ? eventForceArg.split('=')[1] : ''
if (EVENT_PICK && !EVENT_FORCE) {
  console.warn(
    `ВНИМАНИЕ: --event-pick без --event. Отрок «${EVENT_PICK}» есть не в каждом `
    + `событии, и в остальных молча возьмётся верхний. Сравнение получится `
    + `ложным. Укажи оба: --event=ID --event-pick=CHOICE.`)
}
// ── ЛЕГЕНДАРНЫЕ ДАРЫ: КРАСИВО БЕЗ ПОСЛЕДСТВИЙ? (2026-09-30) ────────────
// Вопрос, который до сих пор не был задан: частота розыгрыша измерена (11 %
// при собранных предпосылках), а ВЛИЯНИЕ — нет. «Красивый, но пустой» —
// ровно та поломка, которую уже находили в жаре и дверях.
//
// Что здесь: `--legends=all` — бот с самого начала владеет всеми четырьмя
// легендарными ДАРАМИ И ИХ ПРЕДПОСЫЛКАМИ. Это не «очень удачный бот», а
// верхняя граница: игрок, который весь забег собирал нужную пару, получает
// ровно это. Если верхняя граница не двигает проходимость — легендарный дар
// не имеет последствий ни при каких обстоятельствах.
const LEGENDS_MODE = (process.argv.slice(3).find((a) => a.startsWith('--legends')) || '').split('=')[1]
const LEGENDS = BOON_DEFS.filter((b) => b.rarity === 'legendary')
const PRE_REQUIRES = LEGENDS.flatMap((b) => b.requires)
// `one:<id>` — бот владеет ОДНИМ даром. Нужно, чтобы спросить не только
// «силён ли легендарный», но и «а работает ли вообще этот слот»: дар может
// быть не легендарным, а пустым — и тогда чинить надо не редкость, а слот.
const ONE_ID = LEGENDS_MODE && LEGENDS_MODE.startsWith('one:') ? LEGENDS_MODE.slice(4) : null

/**
 * `--bonus=<id,id>` — дары, которые бот получает СВЕРХ выпавших, не занимая
 * места в розыгрыше. Это честная форма вопроса «что даст мне этот дар, если
 * я уже выбрал шесть».
 */
const BONUS_ONLY = (process.argv.slice(3).find((a) => a.startsWith('--bonus=')) || '')
  .split('=')[1]?.split(',').filter(Boolean) || []
// `--strike` — бот бьёт пашу. Без него слот `strikeBonus` невозможно измерить
// (см. комментарий в `playRoom`).
// `--strike` — бьёт. `--strike-careful` — тоже бьёт, но только когда удар
// бесплатен: никто не замахнулся и сама паша не замахивается. Отделяет
// «насилие стоит ТЕМПА» от «насилие запрещено».
//
// ВАЖНО, из-за чего флаг чуть не остался мёртвым. Первая версия читала
// `STRIKE` как `includes('--strike')`, а `--strike-careful` этому условию не
// удовлетворяет: бот не бил НИ РАЗУ, и вывод печатал «бот не бьёт». Так
// выглядит «осторожный бот не бьёт», а на деле флаг не был включён. Измерение
// молча возвращало «мирный бо» и подтверждало само себя.
const STRIKE_ARG = process.argv.slice(3)
const STRIKE_CAREFUL = STRIKE_ARG.includes('--strike-careful')
const STRIKE = STRIKE_ARG.includes('--strike') || STRIKE_CAREFUL
// Почему бот не бил: окно парирования открыто / сама паша замахнулась / был
// свободный момент. Три счётчика вместо одного, потому что ноль без причины
// нельзя ни принять, ни отклонить.
const STRIKELOG = { chances: 0, free: 0, blockedByWindow: 0, blockedByPasha: 0 }
// Ясность (самадхи) — сколько раз открывалось окно и сколько секунд суммарно.
const SAMLOG = { starts: 0, ends: 0, seconds: 0, oddTime: false }
// Реликвии забега и счётчик выдачи. `--relics=off` — бот их не берёт: без этого
// нельзя сказать, что даёт сама механика, а не то, что бот идёт до конца.
const RELIC_MODE = (process.argv.slice(3).find((a) => a.startsWith('--relics=')) || '').split('=')[1] || 'take'
const RELICLOG = { taken: 0, byRarity: {} }
// Лавка: сколько реликвий предложено и сколько куплено на монеты.
// `--shop=off` — бот не покупает: это измерение амбросии БЕЗ траты, то есть
// чистый эффект сокровищ в углу.
// `--relics=off` обязан выключать реликвии ВСЕ, а не только владычные.
//
// Найдено проверкой флага: лавка брала свой поток отдельно от `RELIC_MODE`, и
// при `--relics=off` за забег всё равно выпадало около пяти реликвий — из лавки.
// То есть все замеры «без реликвий» на самом деле были «без владычных, но с
// лавкой», и число 63 % против 77 % означало не то, о чём думали.
//
// Флаг, который выключает не то, названо неверно. Теперь `off` выключает и
// лавку: иначе «без реликвий» вообще нельзя измерить.
const SHOP_RELICS = process.argv.slice(3).find((a) => a.startsWith('--shop='))?.split('=')[1] !== 'off'
  && RELIC_MODE !== 'off'
const SHOPLOG = { offers: 0, bought: 0, spent: 0 }

// ПЛОТНОСТЬ РЕШЕНИЙ и РАЗНООБРАЗИЕ СБОРОК.
//
// Зачем. Вопрос «а не маловато ли решений на забег?» нельзя решить на глаз:
// можно насмотреть двадцать экранов и решить, что решений много, а можно
// пропустить забег и решить, что их нет. Правильный ход — посчитать.
//
// Считаются решения, которые меняют забег: выбор двери, выбор дара, выбор
// реликвии, покупка в лавке, испытание силы, пропуск боя. И отдельно —
// СКОЛЬКО РАЗНЫХ ИГР получилось: набор даров и реликвий за забег. Если все
// забеги собираются одинаково, то решений много, а игры одна.
const DEC = { doors: 0, boons: 0, relics: 0, shopBuys: 0, calmSkips: 0, events: 0, runs: 0 }
const EVENTLOG = { seen: {}, choices: {} }
const BUILDS = new Map()          // «дар+реликвия» → сколько забегов так собрались
let RUN_DEC = null                // счётчик текущего забега
const CHAKRAS_REACHED = { sum: 0, n: 0, counts: new Array(8).fill(0) }
// Ключ сборки передаётся из `playRun` обратно: там `boons` и `relics` —
// локальные, и снаружи забега их не видно.
let BUILD_KEY = ''
const BUILD_HOOK = (key) => { BUILD_KEY = key }
// `--seva` — бот сам идёт к просящему. Без него сева в Поле Ума не измерена
// ничем (замерено: 0 сев из 959 комнат), и присутствие — третья пища
// ментальностей — выглядела покрытой, хотя не измерялась.
const SEVA_BOT = process.argv.slice(3).includes('--seva')
// `--varna=N` — уровень варны для всех забегов (0–3). Вопрос: «растёт ли
// уровень варны в Поле Ума». Очки ментальности растут от забега к забегу
// (`addVarnaPoints`), и в карточном пути уровень даёт и ХП, и навык, — а в
// Поле Ума читается только одно число. Если разница 0–3 не двигает
// проходимость, то уровень варны — второй мёртвый слот мета.
const varnaArg = process.argv.slice(3).find((a) => a.startsWith('--varna='))
let VARNA_LV = varnaArg ? Math.max(0, Math.min(3, Number(varnaArg.split('=')[1]) || 0)) : 0
// `--slot=имя:значение` — подставить ОДНУ величину боя.
//
// Зачем это отдельный инструмент. Прежде чем давать уровням варны новые
// приёмы, надо знать, какие величины вообще **живые**: часть слотов боя
// меняется, но ничего не меняет в забеге (проверено: `auraVeilAt` и
// `sevaShield` не изменили ни одного забега из 60). Приём, поставленный на
// такой слот, был бы красивым текстом без последствий — ровно то, что
// нашлось в легендарных дарах.
const SLOT_PATCHES = process.argv.slice(3).filter((a) => a.startsWith('--slot='))
  .map((a) => a.slice(7).split(':'))
  .filter(([k, v]) => k && Number.isFinite(Number(v)))
  .map(([k, v]) => [k, Number(v)])
const LEGEND_SET = LEGENDS_MODE === 'all'
  ? LEGENDS.flatMap((b) => [b.id, ...b.requires])
  // `pre` — ТОЛЬКО предпосылки, без самих легендарных. Без этой строки
  // нельзя отличить «легендарный дар силён» от «сильны восемь обычных»:
  // в режиме `all` бот владеет и тем, и другим.
  : LEGENDS_MODE === 'pre'
    ? PRE_REQUIRES.slice()
    // `plus:<id>` — те же восемь обычных ПЛЮС ОДИН легендарный. Единственный
    // режим, в котором измеряется сам легендарный: база (восемь предпосылок)
    // та же самая, меняется ровно один дар.
    : LEGENDS_MODE && LEGENDS_MODE.startsWith('plus:')
      ? [...PRE_REQUIRES, LEGENDS.find((b) => b.id === LEGENDS_MODE.slice(5))?.id].filter(Boolean)
      : ONE_ID ? [ONE_ID] : []
// Очки севы за комнату — «сколько стоит прорицание». Считается той же функцией,
// что и игра (`sevaPointsFor`), иначе замер сравнивал бы разные валюты.
// ── ТРОНЫ ЧАКРЫ (МЕХАНИКА 58) ────────────────────────────────────────────
// Владыка теперь выбирается (Slay the Spire: три кандидата). Замер обязан идти
// тем же путём, что игра: троны розыгрываются из rng забега, и бот берёт
// первого из выпавших — как человек, которому всё равно, лишь бы не грубый.
//
// `--lords=ID` — заставить трон везде, где этот владыка есть в пуле (проба
// одного трона в забегах, где он вообще может встретиться).
// `--lords=all` — парное сравнение каждого из 21 владыки с базой (владыка
// по умолчанию) на одних и тех же семенах: единственный честный ответ на
// вопрос «меняет ли трон забег».
const LORDS_ARG = (process.argv.slice(3).find((a) => a.startsWith('--lords=')) || '').split('=')[1]
let LORD_FIX = LORDS_ARG && LORDS_ARG !== 'all' ? LORDS_ARG : null
/** Кого бот ставит на трон в этой чакре. */
function pickLord(floor, rng) {
  // Розыгрыш ВЫЗЫВАЕТСЯ ВСЕГДА, даже когда владыка принудительный.
  //
  // Раньше стояло наоборот: `if (LORD_FIX && ...) return LORD_FIX` — то есть при
  // принудительном троне `rollLords` НЕ вызывался. Розыгрыш владыки ест
  // случайные числа, и без него весь дальнейший забег сдвигается: комнаты,
  // двери и оки становятся другими. Сравнение `--lords=A` с `--lords=B` мерило
  // не «владыку А против владыки Б», а «забег с А против забега с Б» — два
  // разных забега. Это ровно тот же класс, что был с реликвиями, и лечится так
  // же: розыгрыш обязан идти всегда, переопределение — после него.
  const drawn = rollLords(floor, rng)
  if (LORD_FIX && lordPool(floor).includes(LORD_FIX)) return LORD_FIX
  return drawn[0] || lordPool(floor)[0]
}

// `--lord-mul=X` — во сколько раз крепче владыка. ИЗМЕРИТЕЛЬНЫЙ флаг.
//
// Вопрос, который он открывает: трон устроен как кульминация (выбор владыки, имя
// на двери, трон открывает чакру), а замерено — 2 смерти в комнате владыки из 512
// дошедших против 19 из 1579 в обычных комнатах. То есть трон втрое безопаснее
// комнаты. Пока нечем задать его крепость, вопрос решается на глаз; этим флагом
// он превращается в кривую.
const LORD_MUL_ARG = (process.argv.slice(3).find((a) => a.startsWith('--lord-mul=')) || '').split('=')[1]
const LORD_MUL = LORD_MUL_ARG ? Number(LORD_MUL_ARG) : 1
setLordCalmMul(LORD_MUL)

// `--shield=off` — игра без щита.
//
// Вопрос: щит съедает 72 % урона (замерено на 80 забегах). Если вынести его
// целиком и проходимость почти не изменится — значит щит держит игру, а главный
// глагол (дефлект) не нужен. Это проверка не на «щит полезен», а на то, держит ли
// он игру вместо дефлекта.
const EVENT_CAREFUL = process.argv.slice(3).includes('--event=careful')
// `--shield-per-room=N` — столько щита на входе в КАЖДУЮ комнату.
//
// Нужен для изоляции механизма. Замерено противоречие: отрок «Омыться» даёт
// +20 жизни и щит 20, и это чистая выгода — а проходимость падает на 14 пунктов.
// Чистая выгода не может вредить, значит вредит щит на входе. Что именно —
// выясняется этим флагом, а не догадкой.
const SHIELD_ROOM = Number((process.argv.slice(3).find((a) => a.startsWith('--shield-per-room=')) || '').split('=')[1] || '')
const SHIELD_OFF = process.argv.slice(3).includes('--shield=off')
// `--parry=off` — бот не парирует ВООБЩЕ.
//
// Вопрос, который закрывает щит. Щит съедает 72 % урона, а без него проходимость
// падает с 74 % до 29 %. Из этого нельзя заключить, что дефлект не нужен: возможно,
// дефлект и щит делят одну работу, и без щита дефлект её не удержит. Ответ даёт
// только этот флаг — он убирает дефлект, оставляя щит.
const PARRY_OFF = process.argv.slice(3).includes('--parry=off')
const SHIELD_CAP = Number((process.argv.slice(3).find((a) => a.startsWith('--shield-cap=')) || '').split('=')[1] || '')
// Потолок, по которому СЧИТАЛИСЬ в этом прогоне. Строчка вывода обязана
// называть его, а не константу другой конфигурации: при `--shield-cap=24`
// печаталось «максимум 24 из потолка 12» — числа, которого в игре нет.
const SHIELD_CAP_USED = SHIELD_OFF ? 0 : (Number.isFinite(SHIELD_CAP) && SHIELD_CAP > 0 ? SHIELD_CAP : DEFAULT_FIELD_OPTIONS.shieldMax)

const SEVA = { got: 0, runs: 0 }
// `--pots` — бот ломает сокровища (Dead Cells: containers). По умолчанию идёт
// мимо, как человек, которому лень свернуть с боя за лёгкие деньги. Без флага
// строка сокровища в замере пуста: ни цена (самшкара), ни польза (сева) не
// измерены ничем.
const POTS = process.argv.includes('--pots')
const POTLOG = { smashed: 0, chests: 0, coins: 0 }
// Монеты — для третьей ментальности (вайшья). Её приёмы уровней про деньги,
// и винрейт про них молчит.
const COINS = { got: 0, runs: 0 }
let skipNextRoom = false
/** Сколько забегов дошло до комнаты каждого владыки и сколько умерло в ней. */
const LORDLOG = {}
// Смерти по типу комнаты. Без этого «побед 74 %» не говорит, ГДЕ забег
// кончается: трон может быть бессмертным, а умирать игрок будет в обычной
// комнате — и тогда кульминация окажется не там, где её построили.
const DEATHLOG = { total: 0, boss: 0, room: 0 }
let calmTaken = 0      // небоевые двери, взятые на этом этапе
const DOORLOG = {}
const DOORLOG_SKIP = {}
const ROOMLOG = []
/** Факты каждой комнаты забега — для `varnaRate.mjs`. Пишутся из боя. */
export const ROOMFACTS = []
const PARRIES = [0]
const STATS = { mantra: 0, krpa: 0, spring: 0, hurt: 0, dmg: 0, pacified: 0, strikes: 0, feints: 0, rooms: 0, bossPacified: 0 }

// Сколько урона съел щит. Раньше замер считал ТОЛЬКО попадания по жизни, и
// строка «попаданий 25 · урона 0» читалась как «бьют, но не hurts» — то есть
// как читерство бота. На деле щит (Slay the Spire: block) стоял на потолке 12
// и съедал всё. Без этого числа нельзя сказать, МЯГКО игра или ЩИТ мягкий:
// «25 попаданий, 0 урона» одинаково выглядит при неуязвимости и при щите.
const SHIELD = { blocked: 0, absorbed: 0, samples: 0, atCap: 0, sum: 0, seen: 0, max: 0 }

// Щит ОТ СЕВЫ отдельно от щита вообще. Считаем, сколько дар сработал, а сколько
// раз он сработал вхолостую — щит уже был полон, и награда пропала. Без этого
// числа «дар работает» проверяется только по коду, а игрок видит пустоту.
const SHIELDLOG = { serves: 0, got: 0, wasted: 0 }

// ПИЩА МЕНТАЛЬНОСТЕЙ Поля Ума, копим по ходу забега и СВОДИМ раз в чакру —
// ровно как `floorVarnaFood` в игре. Единица в Поле Ума — ЧАКРА, а не бой, и
// именно из-за этого темп поля вдвое медленнее карточного пути. Число должно
// печататься из замера, иначе это переписка.
const FLOORFOOD = { pacified: 0, bloodless: 0, served: 0, learned: 0 }
const MENTAL = { kshatriya: 0, shudra: 0, vipra: 0, vaeshya: 0 }

// Ци — «психическая сила». Считаем, сколько бот тратит и сколько он
// получает: если трат больше, чем приходит из дефлектов, то мантры не
// должны идти так часто, и щит не должен стоять на потолке. Если равен —
// щит льётся сам из себя, и это главный подозреваемый в мягкости поля.
const QI = { spent: 0, gained: 0, fromDeflect: 0, casts: 0, noShield: 0, noQi: 0 }
const HPLOG = []
const TIMELOG = []
const FLOORS = 7

// Кривая забега. Раньше симулятор печатал одно среднее «здоровье перед
// владыкой» по всем этапам сразу, и по нему нельзя было понять, где забег
// стал тяжелее, а где полегче. Теперь — по этапу: сколько жизни стоило
// дойти до владыки и сколько урона забрала чакра.
const CURVE = Array.from({ length: FLOORS }, () => ({ hp: [], dmg: 0, rooms: 0, runs: 0 }))
const DRAFTS = {}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const VARNAS = ['shudra', 'kshatriya', 'vipra', 'vaeshya']
// `--varna-fix=имя` — зафиксировать варну для всех забегов. Без этого
// `--vpairs` смешивает четыре разные лестницы: варна выбирается случайно, и
// сумма «помогло на 8 / поровну / помогло на 9» не говорит, ЧЕЙ уровень
// бесполезен.
const vfixArg = process.argv.slice(3).find((a) => a.startsWith('--varna-fix='))
const VARNA_FIX = vfixArg ? vfixArg.split('=')[1] : null
const VARNA_POOL = VARNA_FIX && VARNAS.includes(VARNA_FIX) ? [VARNA_FIX] : VARNAS

/** Опции боя для забега — ровно как собирает настоящая игра. */
function optsFor(floor, rng, varna, keepsake, boons, extra = []) {
  const built = buildFieldFloor(floor, { field: { w: 412, h: 600 } })
  // Уровень варны — ЧАСТЬ боя, а не украшение экрана выбора. Раньше здесь стояло
  // ровно `playerHp: 60`: ни уровня ментальности, ни её бонуса к жизни. То
  // есть замер мерил бой, в котором игрок с прокачанной варной НИКОГДА не
  // стоит, и по нему нельзя было узнать, растёт ли уровень.
  //
  // Порядок и формула — как в `startFieldRun` (main.js), а не свои: свои числа
  // в замере и числа в игре разъезжаются, и замер перестаёт мерить игру.
  const lv = VARNA_LV
  const base = {
    playerHp: 60 + (lv * 4) + (MENTALITIES[varna]?.focusHp || 0),
    look: built.look, world: built.world,
    mantraId: FLOOR_MANTRA[floor] || 'japa',
    coins: 0, varna, varnaLevel: lv, keepsake, deaths: 0,
  }
  // Мастерская — последней в цепочке, ровно как в `startFieldRun`: усиление
  // дороже дара и перекрывает его. Без этого замер мерил бы не тот бой, в
  // котором игрок реально стоит.
  //
  // Уровень варны идёт ТРЕТЬИМ аргументом — так же, как в игре. Раньше он не
  // передавался вовсе, и замер мерил бой нулевого уровня, то есть игрока без
  // единого приёма.
  const o = applyUpgrades(
    applyBoons(applyKeepsake(applyVarna(base, varna, VARNA_LV), keepsake, JADE_LV), [...boons, ...extra]),
    WS_KEYS,
  )
  for (const [k, v] of SLOT_PATCHES) o[k] = v
  return o
}

/** Один бой: бот ходит, дефлектит, тратит мантру. Возвращает итог боя. */
// Рассеянность: доля окон дефлекта, которые бот пропускает. 0 — идеальная
// игра (верхняя граница возможного), 0.45 — живой человек, который опаздывает.
// Разница между ними и есть настоящее «окно» Поля Ума.
let SLOPPY = Number((process.argv.find((a) => a.startsWith('--sloppy=')) || '--sloppy=0').split('=')[1])

// Комната покоя: по умолчанию бот «восстанавливает всю жизнь», как человек,
// который боится. `--rest=bonus` — вторая карточка (+6 макс. жизни навсегда).
const REST_BONUS = process.argv.includes('--rest=bonus')

/** Хватает ли Ци на мантру — чтобы бот не «тратил впустую» ради счётчика. */
/**
 * Куда идти из-за сокровища. Сундук важнее горшка: он один за этап и несёт
 * севу в мастерскую, а горшки размножаются.
 *
 * Первая версия замера просто искала горшок рядом с ботом, и сундук не был
 * измерен ВООБЩЕ: он стоит в углу, а бот идёт к оке. Замер писал «сундуков 0»
 * — то есть ценность сундука выглядела покрытой, пока не была измерена.
 */
function potTarget(st, p) {
  const live = (st.pots || []).filter((q) => !q.broken)
  if (!live.length) return null
  const chest = live.find((q) => q.chest)
  if (chest) return chest
  let best = null, bd = 1e9
  for (const q of live) {
    const d = Math.hypot(q.x - p.x, q.y - p.y)
    if (d < bd) { bd = d; best = q }
  }
  return best
}

/**
 * Свести пищу ментальностей за чакру.
 *
 * Правило берётся ИЗ ИГРЫ (`core/mentalityFood.js`), а не повторяется здесь.
 * До этого в замере стояла своя копия, и тест `varnaGrowth.test.js` проверял
 * ещё одну — обе про правило, которого уже нет. Это МЕХАНИКА 43 в измерителях:
 * числа правдоподобны, а относятся к другой игре.
 */
function settleMentality() {
  for (const [kind, n] of floorVarnaFood({
    varnaPacifiedRooms: FLOORFOOD.pacified,
    varnaBloodlessRooms: FLOORFOOD.bloodless,
    varnaServedRooms: FLOORFOOD.served,
    varnaLearned: FLOORFOOD.learned,
  })) MENTAL[kind] += n
  FLOORFOOD.pacified = 0; FLOORFOOD.bloodless = 0
  FLOORFOOD.served = 0; FLOORFOOD.learned = 0
}

/**
 * Сколько оков за комнату было узнано (цитата открылась). В игре это
 * `run.varnaLearned` — по одному очку различения за оку, чей смысл УЗНАЛ, но
 * не чаще двух за чакру (третье око подряд — уже не знание, а сбор урожая).
 */
function learnedQuotes(st) {
  let n = 0
  for (const f of st.foes) if (f.pacified && !f.dead && f.quoteId) n++
  return n
}

function playRoom(st, rng, maxSec = 90) {
  let t = 0
  const dt = 1 / 60
  let ev = []
  let lastMantra = -10
  let servedThisRoom = false
  while (!st.outcome && t < maxSec) {
    const p = st.player
    const input = { dx: 0, dy: 0 }

    // 1) ока в окне удара — возвращаем удар. Это главное действие боя.
    const target = parryHint(st)
    const inWindow = target && target.timer <= st.o.parryWindow
    if (inWindow && !PARRY_OFF && rng() >= SLOPPY) {
      const q0 = p.psychic
      for (const e of parry(st)) { STATS.pacified += (e.type === 'pacified' ? 1 : 0) }
      QI.fromDeflect += Math.max(0, p.psychic - q0)
      PARRIES[0]++
    }

    // 2) идём к ближайшей окове; если жизни мало — сначала к амбросии.
    //    При `--seva` — сперва к просящему: без этого бот стоял у оковы и
    //    «служил» на расстоянии, которого сева не достаёт. Смысл флага — дать
    //    замеру увидеть севу, а не изменить игру.
    let walk = nearest(st)
    let dest2 = walk
    let serveTarget = null
    if (SEVA_BOT && !servedThisRoom) {
      serveTarget = st.wares.find((x) => !x.done && !servedThisRoom) || null
      // Просящий важнее оковы, только если он ещё не «отслужен» этой комнатой
      // и сева реально что-то даст (см. `serveWare`: без нужды — это долг).
      if (serveTarget) { walk = null; dest2 = serveTarget }
    }
    if (st.spring && !st.spring.used && p.hp < p.maxHp * 0.6) {
      walk = null
      dest2 = st.spring
    }
    // СОКРОВИЩЕ ищут ПОСЛЕ боя, а не вместо него.
    //
    // Первая версия: «идти к горшку важнее идти к окове» — замер дал побед
    // 0 % из 20, потому что бот перестал подходить к окам вовсе. Комната при
    // этом «очищалась» сама: бот прятался в углу, оковы копили спокойствие и
    // распадались сами. То есть замер мерил не игру, а труса — и это выглядело
    // как «сокровище ломает игру», хотя ломало его правило.
    //
    // Теперь условие — в комнате не осталось живых оков. Это и есть обычная
    // игра: выбить комнату, потом обыскать углы (Dead Cells, Hades: горшки и
    // тайники после зачистки, а не вместо неё).
    const foesAlive = st.foes.some((f) => !f.dead && !f.pacified)
    if (POTS && !foesAlive) {
      const pot = potTarget(st, p)
      if (pot) { walk = null; dest2 = pot }
    }
    const dest = dest2 || st.door
    const ddx = dest.x - p.x, ddy = dest.y - p.y
    const dd = Math.hypot(ddx, ddy) || 1
    const tooFar = walk ? dd > st.o.enemyReach * 0.55 : dd > 12
    if (tooFar) { input.dx = ddx / dd; input.dy = ddy / dd }

    // 3) УДАР — только по `--strike`. Бот по умолчанию не бьёт НИКОГДА, хотя
    //    у игрока есть кнопка удара (`ui/screens/field.js` → `strike`).
    //    Последствие было неочевидным и важным: слот `strikeBonus`, который
    //    двигают дары «Тапах» и «Тапах легендарный», оказывался НЕИЗМЕРИМЫМ —
    //    замер физически не мог про него ничего сказать. Игрок видел дар,
    //    который в игре меняет урон удара, а бот об этом узнать не мог.
    //
    //    Бьёт бот только ПАШУ (у рипу нет ХП, удар по нему кормит неведение и
    //    вреден — см. `strike()` в field.js), и только когда она стоит рядом.
    if (STRIKE && p.strikeCd <= 0) {
      // `--strike-careful`: бьёт только когда удар бесплатен — никто не
      // замахнулся и сама паша не замахивается.
      //
      // Зачем. Первый замер с насилием (`--strike`, 5223 удара) дал побед 21 %
      // против 67 % мирных, и это число легко прочитать как «игра наказывает
      // насилие». На деле бот разменивал парирование на удар: снятых оков
      // падало с 1758 до 998, крипа — со 103 до 14. Измерялось «насилие стоит
      // ТЕМПА», а не «насилие запрещено».
      //
      // Первая версия правила запрещала удар в окне парирования и дала ровно
      // 0 ударов — но причиной был сломанный флаг, а не устройство боя. Правка
      // флага и ослабление правила (сама паша не замахнулась — тоже «не
      // бесплатно») сделали режим рабочим.
      const pasha = st.foes.find((f) => !f.dead && !f.pacified && f.kind === 'pasha'
        && Math.hypot(f.x - p.x, f.y - p.y) < st.o.enemyReach * 0.55)
      const safeToSwing = !STRIKE_CAREFUL
        || (!(target && inWindow) && !(pasha && pasha.state === 'telegraph'))
      if (pasha) {
        // Почему не удалось ударить. Без этих счётчиков ноль выглядит как
        // «осторожный бот не бьёт», а на деле это измерение: в Поле Ума
        // безопасного момента для удара нет.
        STRIKELOG.chances++
        if (target && inWindow) STRIKELOG.blockedByWindow++
        else if (pasha.state === 'telegraph') STRIKELOG.blockedByPasha++
        else STRIKELOG.free++
      }
      if (pasha && safeToSwing) {
        const i = st.foes.indexOf(pasha)
        strike(st, i, [])
        STATS.strikes++
      }
    }

    // 3b) СОКРОВИЩА. Бот ломает горшок, если стоит рядом и ещё не бил им.
    //    Без этого строка сокровища в замере была бы пустой: горшки лежали
    //    бы в комнатах нетронутыми, и ни цена (самшкара), ни польза (сева)
    //    не были бы измерены ничем. Флаг `--pots` — бот НЕ ломает: он идёт
    //    мимо, как человек, которому лень свернуть с боя.
    if (POTS && p.strikeCd <= 0) {
      const pot = potTarget(st, p)
      if (pot && Math.hypot(pot.x - p.x, pot.y - p.y) < st.o.enemyReach * 0.7) {
        smashPot(st, st.pots.indexOf(pot), [])
        POTLOG.smashed++
        if (pot.broken) {
          if (pot.chest) POTLOG.chests++
          else POTLOG.coins += pot.coins
        }
      }
    }

    // 4) сева, если жизни мало. Не чаще раза в комнату: человек не может
    //    стоять на месте и жать севу шестьдесят раз в секунду, а бот мог.
    //
    //    `--seva` — бот идёт к просящему САМ. Без этого флага бот не служит
    //    НИ РАЗУ: из 959 комнат forty забегов сева была 0 (замерено). Он
    //    идёт к ближайшей окове и никогда не подходит к колодцу у стены, а
    //    условие «просящий в 40 пикселях» само по себе не выполняется
    //    никогда. Значит ни сева, ни присутствие (третья пища ментальностей)
    //    не были измерены ничем, а выглядели при этом покрытыми.
    const wantServe = serveTarget
      || (p.hp < p.maxHp * 0.45
        ? st.wares.find((x) => !x.done && Math.hypot(x.x - p.x, x.y - p.y) < 40)
        : null)
    if (wantServe && !servedThisRoom
      && Math.hypot(wantServe.x - p.x, wantServe.y - p.y) < st.o.enemyReach * 0.6) {
      const ev = serveWare(st, st.wares.indexOf(wantServe), 'shudrocita', [])
      servedThisRoom = true
      // Сколько раз дар «щит от севы» сработал ВХОЛОСТУЮ. Молчащая потеря
      // награды — класс «экран обещает, код делает иначе»: игрок помог, а
      // ничего не получил, и решил, что дар сломан. Число показывает, есть ли
      // тут что чинить, или это редкий случай.
      const sv = ev.find((e) => e.type === 'served')
      if (sv && sv.shield !== undefined) {
        SHIELDLOG.serves++
        if (sv.shield > 0) SHIELDLOG.got += sv.shield
        if (sv.shieldFull) SHIELDLOG.wasted++
      }
    }

    // 5) мантра — не чаще раза в 0.8 с. Бот раньше жал её каждый кадр и
    //    выигрывал бой, не получая ни одного удара: это был не бот, а
    //    читер, и цифры по нему не значили ничего.
    const m = mantraById(p.mantraId)
    if (!inWindow && t - lastMantra > 0.8) {
      const qi = Math.max(0, m.cost - (st.o.mantraCostCut || 0))
      if (p.psychic >= qi) {
        const q0 = p.psychic, s0 = p.shield
        castMantra(st)
        QI.spent += Math.max(0, q0 - p.psychic)
        QI.gained += Math.max(0, p.psychic - q0)
        QI.casts++
        // Мантра без щита — это Джапа: она гасит неведение, а не защищает.
        // Отдельно от «не хватило Ци»: это разные вещи, и раньше они были
        // слиты в одно число, из-за чего нельзя было понять, чем именно
        // поле держит игрока.
        if (p.shield <= s0) QI.noShield++
        STATS.mantra++; lastMantra = t
      } else QI.noQi++
    }

    // Щит ДО шага боя. Раньше он мерялся после, а `damagePlayer` уже вычел
    // из него съеденный урон, и замер показывал 4 при ударе на 8: то есть
    // показывал остаток вместо того, что было.
    const shieldBefore = p.shield

    // Шаг боя ВСЕГДА идёт. Раньше бот в ветке «подошёл вплотную» забывал
    // двигать мир, и бой просто стоял: подсказка была, а удара не было.
    ev = stepField(st, dt, input)
    for (const e of ev) {
      if (e.type === 'krpa') STATS.krpa++
      else if (e.type === 'spring') STATS.spring++
      else if (e.type === 'pacified') STATS.pacified++
      else if (e.type === 'hurt') {
        STATS.hurt++
        STATS.dmg += e.amount || 0
        // Щит мог съесть урон (не обошёл) или стоять вхолостую (щит был, но
        // удар прошёл мимо него — такое бывает при 0.55 с неуязвимости).
        SHIELD.samples++
        SHIELD.absorbed += e.absorbed || 0
        if ((e.absorbed || 0) > 0) SHIELD.blocked++
        // Щит в момент удара: стоял ли он на потолке? Если да — поле даёт
        // игроку бесконечный запас прочности, и никакие числа не исправят
        // этого, пока мантра льёт щит быстрее, чем ока его тратит.
        if (shieldBefore >= st.o.shieldMax - 0.001) SHIELD.atCap++
        SHIELD.sum += shieldBefore; SHIELD.seen++
        if (shieldBefore > SHIELD.max) SHIELD.max = shieldBefore
      }
      else if (e.type === 'feint') STATS.feints++
      else if (e.type === 'pacified') STATS.pacified++
      // ЯСНОСТЬ (самадхи). Окно в девять секунд меняет бой втрое, и до сессии
      // 27 оно начиналось и кончалось молча. Прежде чем чинить сообщение,
      // надо убедиться, что состояние вообще наступает: «починить» то, что не
      // стреляет, — значит написать правдоподобный текст о пустоте.
      else if (e.type === 'samadhi_start') {
        SAMLOG.starts++
        SAMLOG.seconds += e.time || 0
        if (e.time !== st.o.samadhiTime) SAMLOG.oddTime = true
      }
      else if (e.type === 'samadhi_end') SAMLOG.ends++
    }
    t += dt
  }
  STATS.rooms++
  checkOutcome(st, [])
  // Сева за комнату — той же функцией, что и игра (`settleFieldRoom`).
  SEVA.got += sevaPointsFor(st)
  // Монеты за комнату — те же, что собирает игра. В поле монета — это `coin`,
  // и множитель вайшьи применяется к ней (`field.js:1300`), а не к сумме.
  // Первая версия считала `st.coins`, которого у боя нет вовсе, и печатала NaN.
  COINS.got += st.coinsTaken || 0
  COINS.runs += 1
  const alive = st.foes.filter((f) => !f.pacified && !f.dead)
  return { t, stuck: !st.outcome && !st.door.open, alive }
}

function nearest(st) {
  let best = null, bd = 1e9
  for (const f of st.foes) {
    if (f.pacified || f.dead) continue
    const d = Math.hypot(f.x - st.player.x, f.y - st.player.y)
    if (d < bd) { bd = d; best = f }
  }
  return best
}

/** Полный забег. Возвращает, где он закончился. */
function playRun(rng, extraBoons = null, relicRng = null) {
  const varna = VARNA_POOL[Math.floor(rng() * VARNA_POOL.length)]
  const keepsake = rollKeepsakes(rng, 3)[0].id
  // `boons` — то, что бот ВЫБРАЛ за забег (занимает место в розыгрыше).
  // `extra` — дары, подложенные СВЕРХ: они применяются к бою, но не вычеркиваются
  // из розыгрыша. Первая версия замера клала их именно в `boons`, и тогда
  // «с даром» означало «забег без лучшего из шести выпавших» — сравнивался не
  // дар, а подмена розыгрыша. Разница показывала правду о замене, а не о даре.
  const boons = (extraBoons || LEGEND_SET).slice()
  const EXTRA = BONUS_ONLY.slice()
  // Реликвии забега — то, что бот берёт после владык. Игра копит их в
  // `app.fieldRun.relics`; замер держит рядом с boons, потому что оба списка
  // живут весь побег и оба сбрасываются вместе.
  const relics = []
  // Кошелёк забега: лавка тратит из него, и без этого монеты копились бы и
  // ничего не стоили — а механика «амбросия покупает силу» проверялась бы
  // только чтением кода.
  const purse = { coins: 0 }
  // Служение забега: сева, щит и проклятие хаоса, набранные на небоевых дверях.
  // Все три — величины, которые уже читает бой, поэтому событие не вводит новых
  // сущностей, а только собирает существующие в одном месте.
  const eventSeen = []
  let eventShield = 0
  let runChaos = false
  let runSeva = 0
  const fullHpNow = () => (optsNow.playerHp || 60) + maxHpBonus
  let optsNow = { playerHp: 60 }
  // Поток розыгрыша реликвий — свой (см. simulate): иначе он сдвигает раскладку
  // всего забега и сравнение «с реликвией против без» измеряет разные игры.
  const rRng = relicRng || rng
  let time = 0
  let runHp = null          // здоровье живёт весь побег, а не одну комнату
  let maxHpBonus = 0       // «Тапа» в комнате покоя: +6 навсегда
  for (let floor = 0; floor < FLOORS; floor++) {
    let stage = 'room', room = 0, guard = 0
    let died = false
    let calmTaken = 0
    let lord = null
    while (guard++ < 30) {
      // Режим `avoid`: дверь лавки/покоя/дара не требует боя. Комната
      // пропускается целиком, и это ровно то, что делает игрок, выбравший
      // такую дверь. Пропуск ставится в конце итерации (где принимается
      // решение), а выполняется здесь — иначе пришлось бы переписывать весь
      // кусок боя.
      if (skipNextRoom && stage === 'room') {
        skipNextRoom = false
        ROOMLOG.push(`${floor + 1}${room}: пропущена (дверь без боя)`)
        // Из пропущенной комнаты надо ВЫЙТИ, а не остаться в ней: иначе
        // следующая итерация собрала бы ту же комнату и забег зациклился.
        const nx = nextStage('room', room, stageHasBoss(floor))
        if (nx.kind === 'done') break
        stage = nx.kind
        room = nx.room
        continue
      }
      // Трон выбирается ОДИН раз на чакру, а не на комнату: так же, как в
      // игре (`app.runLordFloor` помнит, для какой чакры выбор сделан).
      if (stage === 'room' && room === 0) lord = pickLord(floor, rng)
      const built = buildFieldFloor(floor, {
        field: { w: 412, h: 600 }, room,
        // Владыка: кто сидит на троне. Без этой строки замер считал бы бой с
        // владыкой по умолчанию — то есть измерял бы игру, которой уже нет.
        lordId: lord,
        // `--elite`: каждая обычная комната собрана как испытание силы. Так
        // меряется не «проходим ли забег», а «проходимо ли ИСПЫТАНИЕ» — а это
        // разные числа, и спутать их нельзя.
        elite: ELITE,
        // `calmMul` НЕ передаётся — и это важно. Раньше здесь стояло
        // `opts: { calmMul: DEFAULT_FIELD_OPTIONS.foeCalmMul }`, то есть
        // замер подставлял свою константу 1.5 и ПЕРЕКРЫВАЛ ею рост спокойствия
        // по чакрам, который делает игра (`calmMulFor(floor)`, 1.5 → 2.25).
        // Итог: седьмая чакра в замере была легче, чем в игре, и вся
        // лестница рассеянности мерила не ту игру.
        //
        // Значение `foeCalmMul` в DEFAULT_FIELD_OPTIONS при этом было МЁРТВЫМ:
        // поле его не читало, читал только замер. Теперь не читает никто —
        // единственный источник правды один, игра.
        opts: {},
        // Случай идёт через rng забега: иначе симулятор нельзя повторить,
        // а состав комнаты теперь розыгрыш (Hades).
        rng,
      })
      const foes = stage === 'boss' ? (built.boss ? [built.boss] : []) : built.foes.slice()
      const opts = applyFieldRelics(optsFor(floor, rng, varna, keepsake, boons, EXTRA), relics)
      // Щит, обещанный служением, живёт до конца забега и встаёт в каждой
      // следующей комнате — ровно как `mod_combat_start_block` у реликвии.
      if (Number.isFinite(SHIELD_ROOM) && SHIELD_ROOM > 0) opts.roomStartShield = (opts.roomStartShield || 0) + SHIELD_ROOM
      if (SHIELD_OFF) opts.shieldMax = 0
      else if (Number.isFinite(SHIELD_CAP) && SHIELD_CAP > 0) opts.shieldMax = SHIELD_CAP
      if (eventShield) opts.roomStartShield = (opts.roomStartShield || 0) + eventShield
      optsNow = opts
      // Жар — ПОСЛЕ опций, ровно как в `startFieldRun`. Иначе замер мерил бы
      // не то, что игра: усиление из мастерской перекрыло бы условие жара,
      // и на экране ставка выглядела бы, а в бою её не было бы.
      if (HEAT > 0) applyHeat(opts, HEAT)
      // амбросия стоит в последней комнате этапа — ровно как в игре
      if (stage === 'room' && room === ROOMS_PER_STAGE - 1) opts.spring = true
      const fullHp = (opts.playerHp || 60) + maxHpBonus
      const entryHp = runHp == null ? fullHp : Math.max(1, Math.min(fullHp, runHp))
      const st = createField({
        player: { x: built.field.w * 0.5, y: built.field.h * 0.72, hp: entryHp, maxHp: fullHp },
        foes, wares: built.wares,
        // Сокровища обязаны быть в замере: иначе замер считает бои без горшков
        // и сундука, то есть игру, которой в бою уже нет (МЕХАНИКА 43).
        pots: built.pots,
        field: built.field, rng, opts,
      })
      // Проклятие служения — тот же флаг, что у хаос-пути: урон вдвое до конца
      // забега. Ставится на игрока, потому что там же считает урон.
      if (runChaos) st.player.chaosCurse = true
      const dmgBefore = STATS.dmg
      const r = playRoom(st, rng)
      // Факты комнаты для скрипта `varnaRate.mjs`. Записываются из НАСТОЯЩЕГО
      // боя, а не выдумываются: скрипту нужно знать, была ли в комнате кровь
      // и была ли сева. Первая версия скрипта рисовала эти факты генератором
      // случайных чисел — то есть мерила не игру, а вымысел, и называла это
      // замером скорости роста.
      {
        const foes = st.foes || []
        const served = st.served ? st.served.size > 0 : false
        ROOMFACTS.push({
          floor,
          boss: stage === 'boss',
          any: foes.some((f) => f.pacified),
          blood: foes.some((f) => f.dead),
          served,
          alive: !!st.player?.alive,
        })
        if (r.stuck) ROOMFACTS[ROOMFACTS.length - 1].stuck = true
      }
      time += r.t
      runHp = st.player.alive ? st.player.hp : 0
      purse.coins += st.coinsTaken || 0
      const dmgHere = STATS.dmg - dmgBefore
      CURVE[floor].dmg += dmgHere
      CURVE[floor].rooms++
      const who = r.alive.map((f) => `${f.name}(${f.calm.toFixed(1)}/${f.calmMax})`).join(',')
      const hpPct = Math.round((st.player.hp / st.player.maxHp) * 100)
      if (stage !== 'boss') HPLOG.push(hpPct)
      if (stage === 'boss') CURVE[floor].hp.push(hpPct)
      TIMELOG.push(r.t)
      ROOMLOG.push(`${floor + 1}${stage === 'boss' ? 'B' : ''}${room}: ${r.t.toFixed(0)}с hp=${hpPct}% урон=${Math.round(dmgHere)} ${r.stuck ? 'ЗАСТРЯЛ ' + who : ''}`)
      // ПИЩА ДЛЯ МЕНТАЛЬНОСТЕЙ — те же четыре счётчика, что игра ведёт в
      // `run.varna*` (main.js → `onFoePacified` и `stepField`-колбэк севы).
      // Здесь они копятся из фактов боя, чтобы можно было сказать темп поля
      // и не гадать: раньше число «12.8 очка за забег» было в переписке, а не
      // в замере, и сравнить его с карточным путём было нечем.
      if (st.pacified > 0) {
        FLOORFOOD.pacified++
        if (!st.foes.some((f) => f.dead)) FLOORFOOD.bloodless++
      }
      if (st.served && st.served.size > 0) FLOORFOOD.served++
      FLOORFOOD.learned += learnedQuotes(st)
      if (stage === 'boss' && lord && st.foes.some((f) => f.isBoss)) {
        // Сколько забегов РЕАЛЬНО упирается в этого владыку: дошло до его
        // комнаты и сколько из них кончилось смертью именно здесь.
        //
        // Без этого «0 и 0» в парном сравнении нечитаемо: трон может быть
        // пустым (эффекта нет) или просто редким (забег кончается раньше).
        const rec = LORDLOG[lord] || (LORDLOG[lord] = { reached: 0, died: 0, clears: 0 })
        rec.reached++
        if (!st.player.alive) rec.died++
        else if (!st.foes.some((f) => f.isBoss && !f.pacified && !f.dead)) rec.clears++
      }
      if (!st.player.alive) {
        died = true
        DEATHLOG.total++
        if (stage === 'boss') DEATHLOG.boss++; else DEATHLOG.room++
        break
      }
      if (st.foes.some((f) => f.isBoss && !f.pacified && !f.dead)) {
        if (BUILD_HOOK) BUILD_HOOK([...boons, ...relics].sort().join('+'))
        return { win: false, stuck: true, why: `владыка чакры ${floor + 1} не успокоен`, floor, time }
      }
      const step = nextStage(stage, room, stageHasBoss(floor))
      // ДВЕРИ. Замер обязан идти тем же путём, что игра (правило проекта):
      // если пропустить выбор двери, симулятор мерил бы лестницу, которой в
      // игре больше нет, и все числа после этого были бы выдуманными.
      //
      // Бот выбирает дверь боя — так же, как поступил бы человек, который
      // хочет измерить ПРОХОДИМОСТЬ. Двери «лавка/покой» бот не берёт
      // сознательно: ими можно заменить бой, и тогда замер перестал бы
      // мерить проходимость, а мерил бы «сколько оков можно не встретить».
      if (step.kind === 'room') {
        const doors = rollDoors({ room: step.room, hasBoss: stageHasBoss(floor), rng, calmTaken })
        DOORLOG[doors.length] = (DOORLOG[doors.length] || 0) + 1
        // Каждый экран дверей — одно решение игрока, даже если бот берёт первую
        // дверь без разбора. Считается решение, а не удачный выбор.
        if (RUN_DEC) RUN_DEC.doors++
        if (!hasCombatDoor(doors)) {
          return { win: false, stuck: true, why: 'в двери не оказалось боя — правило нарушено', floor, time }
        }
        if (DOORS_MODE === 'avoid' || DOORS_MODE === 'event') {
          const want = DOORS_MODE === 'event'
            ? ['event']
            : ['shop', 'rest', 'boon']
          const calm = doors.find((d) => want.includes(d.kind))
          if (calm) {
            DOORLOG_SKIP[calm.kind] = (DOORLOG_SKIP[calm.kind] || 0) + 1
            if (RUN_DEC) RUN_DEC.calmSkips++
            // СЛУЖЕНИЕ. Эффекты применяются теми же величинами, что и в игре:
            // сева идёт в счёт забега, монеты — в кошелёк, щит — в опции
            // следующих комнат, дар — в список даров, хаос — в проклятие.
            // Если бы замер просто пропустил дверь, событие было бы написано и
            // не измерено (МЕХАНИКА 43).
            if (calm.kind === 'event') {
              // Розыгрыш ВСЕГДА, даже при принудительном событии.
              //
              // Третий случай одного и того же класса за сессию (первый — розыгрыш
              // владыки, второй — «Вершина Света» на троне вместо финала). Когда
              // событие принудительное и `rollFieldEvent` не вызывается, поток
              // случайных чисел сдвигается, и сравнение «с этим событием против
              // без» меряет два РАЗНЫХ забега. Замерено: принудительные прогоны
              // давали «+20 жизни и щит = минус 8 пунктов», что невозможно для
              // чистой выгоды.
              const drawnEvent = rollFieldEvent({ rng, seen: eventSeen })
              const ev = EVENT_FORCE
                ? (FIELD_EVENTS.find((e) => e.id === EVENT_FORCE) || drawnEvent)
                : drawnEvent
              eventSeen.push(ev.id)
              const forcedChoice = EVENT_PICK ? ev.choices.find((c) => c.id === EVENT_PICK) : null
              if (EVENT_PICK && !forcedChoice) {
                throw new Error(
                  `--event-pick=${EVENT_PICK} не сработал в событии «${ev.id}». `
                  + `Доступные отроки: ${ev.choices.map((c) => c.id).join(', ')}. `
                  + `Лучше прерваться, чем сравнивать разные прогоны.`)
              }
              // ОСТОРОЖНЫЙ ИГРОК (`--event=careful`): берёт отрок только если
              // плата не съедает больше половины жизни. Нужен для честного ответа
              // на вопрос «стоит ли служение», потому что бот по умолчанию берёт
              // первый отрок ВСЕГДА — даже с 20 % жизни. Это не игрок, это
              // максимально жадная политика, и единственный способ узнать вторую
              // границу — задать её явно.
              const risky = ev.choices.find((c) => previewEffects(c.effects).heal < 0)
              let choice = forcedChoice || ev.choices[0]
              if (!forcedChoice && EVENT_CAREFUL && risky) {
                const full = (optsNow.playerHp || 60) + maxHpBonus
                const have = runHp == null ? full : runHp
                const cost = -previewEffects(risky.effects).heal
                if (have - cost < full * 0.5) {
                  choice = ev.choices.find((c) => !c.effects.some((x) => x.kind === 'chaos')
                    && previewEffects(c.effects).heal >= 0) || ev.choices[ev.choices.length - 1]
                }
              }
              const p = previewEffects(choice.effects)
              EVENTLOG.seen[ev.id] = (EVENTLOG.seen[ev.id] || 0) + 1
              EVENTLOG.choices[ev.id + '/' + choice.id] = (EVENTLOG.choices[ev.id + '/' + choice.id] || 0) + 1
              runSeva += p.seva
              purse.coins = Math.max(0, purse.coins + p.coins)
              if (p.shield) eventShield += p.shield
              if (p.chaos) runChaos = true
              if (runHp != null) runHp = Math.max(1, Math.min(fullHpNow(), runHp + p.heal))
              if (p.boon) {
                const forced = p.boonId ? BOON_DEFS.find((b) => b.id === p.boonId) : null
                const g = forced ? [forced] : rollBoons(boons, rng, 1)
                if (g[0]) { boons.push(g[0].id); DRAFTS[g[0].id] = (DRAFTS[g[0].id] || 0) + 1 }
              }
              if (RUN_DEC) RUN_DEC.events++
            }
            calmTaken += 1
            skipNextRoom = true
            stage = step.kind
            room = step.room
            continue
          }
        }
      }
      if (step.kind === 'done') {
        if (stage === 'boss') {
          afterBoss(floor, boons, rng, fullHp, (hp) => { runHp = hp }, (n) => { maxHpBonus += n }, relics, rRng, purse, (v) => { SHOPLOG.viaShop = (SHOPLOG.viaShop || 0) + 1 })
          break
        }
        break
      }
      stage = step.kind; room = step.room
    }
    // ЧАКРА ЗАКРЫТА: очки ментальностей начисляются ОДИН раз за чакру, а не
    // за комнату — правило игры (`settleFloor` → `floorVarnaFood`). Здесь оно
    // повторено специально: без него «темп Поля Ума» измерялся бы не по
    // правилам игры, и сравнивать его с карточным путём было бы нечем.
    settleMentality()
    // Смерть — это конец забега, а не переход на следующую чакру.
    //
    // Раньше здесь стоял просто `break`, и внешний цикл крутил следующую
    // чакру, а функция в конце возвращала `win: true`. Забег, где бот умер
    // в первой комнате, отличался от полного тем, что в нём НЕ БЫЛО
    // последних шести чакр — и всё равно попадал в «победы». Симулятор поля
    // не мог сообщить о поражении в принципе: 100 % побед было свойством
    // кода, а не результатом. Это видно и на глаз: 100 % побед при 374
    // пройденных комнатах из 560 невозможно физически.
    if (died) {
      if (BUILD_HOOK) BUILD_HOOK([...boons, ...relics].sort().join('+'))
      return { win: false, why: `погиб в чакре ${floor + 1}`, floor, time }
    }
  }
  if (BUILD_HOOK) BUILD_HOOK([...boons, ...relics].sort().join('+'))
  return { win: true, floor: FLOORS, time }
}

/**
 * Что игра даёт после владыки — ровно как на экране (main.js: showRestRoom →
 * afterRest → лавка/дар через чакру).
 *
 * Раньше здесь стояло `boons.push('dharma-megha')` и `boons.push('prana')` —
 * выдуманные id, которых в игре нет. `applyBoons` их молча пропускал, и
 * симулятор за все забеги не получал НИ ОДНОГО дара: все числа «проходим»
 * были получены на забеге слабее, чем играет человек. Плюс не было комнаты
 * покоя. Теперь бот проходит ту же петлю.
 *
 * Чётность чакры не важна: и в лавке, и в черновике дара игрок получает
 * ровно ОДИН дар за этап (в лавке он бесплатный), поэтому бот берёт один.
 *
 * Покой бот берёт «восстановить всю жизнь» — так поступает человек, который
 * боится. Вторую карточку (+6 макс. жизни навсегда) смотрим флагом
 * `--rest=bonus`.
 */
function afterBoss(floor, boons, rng, fullHp, setHp, addMaxHp, relics, rRng, purse, onBuyRelic) {
  CURVE[floor].runs++
  if (isLastFloor(floor)) return
  if (REST_BONUS) addMaxHp(6)
  else setHp(fullHp)
  // ЛАВКА (Slay the Spire: лавка продаёт реликвии). Замер её пропускал целиком:
  // путь забега был «владыка → дар → дальше», и монеты копились, но не
  // тратились. Значит, новая механика — «амбросия покупает силу» — была бы
  // написана и не измерена (МЕХАНИКА 43).
  //
  // Бот покупает, если хватает на самую дешёвую из предложенных: так мерится
  // «сколько сил обменивается на лампу», а не «сколько ловкости у бота».
  if (SHOP_RELICS) {
    const offered = rollFieldRelics({ rng: rRng || rng, owned: relics, n: 2 })
    const PRICE = { common: 20, uncommon: 35, rare: 60 }
    for (const v of offered) {
      const price = PRICE[v.rarity] ?? 60
      if (purse.coins >= price && !relics.includes(v.id)) {
        purse.coins -= price
        relics.push(v.id)
        onBuyRelic?.(v)
        if (RUN_DEC) RUN_DEC.shopBuys++
        SHOPLOG.bought++
        SHOPLOG.spent += price
        break
      }
    }
    SHOPLOG.offers += offered.length
  }
  const choices = rollBoons(boons, rng, 3)
  // `--legends=plan`: бот ИГРАЕТ ПО ПЛАНУ — сначала берёт предпосылки
  // легендарных, а когда они собраны, сам легендарный. Это единственный режим,
  // отвечающий на вопрос «сколько даёт тому, кто вырастил легендарный»:
  // в `all` бот владеет 12 дарами из 14 (пул почти вычерпан), а в обычном
  // режиме бот берёт первый предложенный и о легендарном не думает.
  let pick = choices[0]
  if (LEGENDS_MODE === 'plan' && choices.length) {
    const wants = LEGENDS.filter((b) => !boons.includes(b.id) && b.requires.every((r) => boons.includes(r)))
    const nextPrereq = LEGENDS.flatMap((b) => b.requires).find((r) => !boons.includes(r))
    pick = choices.find((c) => wants.some((b) => b.id === c.id))
      || choices.find((c) => c.id === nextPrereq)
      || choices[0]
  }
  if (pick) { boons.push(pick.id); DRAFTS[pick.id] = (DRAFTS[pick.id] || 0) + 1; if (RUN_DEC) RUN_DEC.boons++ }
  // РЕЛИКВИЯ (Slay the Spire: одна из трёх после каждого владыки, до конца
  // забега). Замер обязан брать их по тем же правилам, что и игра: без этого
  // все числа ниже считались бы по бою без реликвий, то есть по игре,
  // которой игрок не играет.
  const relicChoice = rollFieldRelics({ rng: rRng || rng, owned: relics })
  // Как выбирает человек: берёт первое предложенное. Режим `rare` брал редкую
  // всегда, и это смещение ломало замер: 79 % выдачи редких — не игрок, а
  // фильтр. `only:ID` — изоляция одной реликвии, единственный способ узнать,
  // какая именно мешает.
  const forced = RELIC_MODE.startsWith('only:') ? RELIC_MODE.slice(5) : null
  // `|| null` здесь был ловушкой: стоило `|| null`, и после ПЕРВОЙ копии
  // `find` переставал находить X — а вместе с ним переставал выдаваться ЛЮБОЙ
  // реликвии. То есть `--relics=only:X` измерял не «одна копия X», а «одна
  // копия X и ноль остальных»: 59–65 % против 77 % у обычного забега. На этих
  // цифрах можно было объявить, что шесть реликвий из четырнадцати вредит игроку,
  // и начать «чинить» контент, который тут ни при чём.
  //
  // Правильный смысл флага: X берётся, когда предложен; когда уже взят —
  // берётся обычный. Иначе сравнивать реликвии между собой нечем.
  const relicPick = RELIC_MODE === 'off'
    ? null
    : (forced ? (relicChoice.find((r) => r.id === forced) || relicChoice[0])
      : RELIC_MODE === 'rare' ? (relicChoice.find((r) => r.rarity === 'rare') || relicChoice[0])
        : relicChoice[0])
  if (relicPick) {
    relics.push(relicPick.id)
    if (RUN_DEC) RUN_DEC.relics++
    RELICLOG.taken++
    RELICLOG.byRarity[relicPick.rarity] = (RELICLOG.byRarity[relicPick.rarity] || 0) + 1
  }
}

/**
 * Плотность решений и разнообразие сборок.
 *
 * Вопрос «а не мало ли решений на забег?» решается здесь, а не на глаз: можно
 * насмотреть двадцать экранов и решить, что решений много, а можно пропустить
 * забег и решить, что их нет. Число — единственный честный ответ.
 *
 * И вторая половина того же вопроса: сколько РАЗНЫХ игр получилось. Если все
 * забеги собираются одинаково, то решений много, а игра одна.
 */
function printDecisions() {
  if (!RUNS) return
  const per = (k) => (DEC[k] / DEC.runs).toFixed(1)
  const total = (DEC.doors + DEC.boons + DEC.relics + DEC.shopBuys + DEC.calmSkips) / DEC.runs
  console.log('── сколько решений на забег ──')
  console.log(`экранов дверей ${per('doors')} · даров ${per('boons')} · реликвий ${per('relics')} · покупок в лавке ${per('shopBuys')} · боя пропущено ${per('calmSkips')}`)
  const eventsSeen = Object.values(EVENTLOG.seen).reduce((a, b) => a + b, 0)
  if (eventsSeen) {
    const byEvent = Object.entries(EVENTLOG.seen)
      .map(([id, n]) => `${id} ${((n / eventsSeen) * 100).toFixed(0)}%`).join(' · ')
    const byChoice = Object.entries(EVENTLOG.choices)
      .map(([k, n]) => `${k.split('/')[1]} ${((n / eventsSeen) * 100).toFixed(0)}%`).join(' · ')
    console.log(`служений за забег: ${(eventsSeen / DEC.runs).toFixed(2)} · события: ${EVENT_FORCE ? `принудительно «${EVENT_FORCE}»` : byEvent}`)
    console.log(`  выбор игрока: ${EVENT_PICK ? `принудительно «${EVENT_PICK}»` : 'верхний отрок'} — ${byChoice}`)
    console.log(`  событий написано ${FIELD_EVENTS.length} — покрытие: ${Object.keys(EVENTLOG.seen).length}/${FIELD_EVENTS.length} выпали`)
  }
  console.log(`всего решений: ${total.toFixed(1)} за забег · для сравнения: комнат с боем за полный забег ${ROOMS_PER_STAGE * FLOORS} + ${FLOORS} владык`)
  if (CHAKRAS_REACHED.n) {
    const avg = (CHAKRAS_REACHED.sum / CHAKRAS_REACHED.n).toFixed(2)
    // Подпись — СРАЗУ «сколько чакр пройдено», без сдвига. Первая версия
    // печатала `i + 1` для индекса `i`, и победа (7 чакр) выглядела как
    // «8:60» — то есть забег прошёл восемь чакр из семи существующих.
    const spread = CHAKRAS_REACHED.counts.map((c, i) => (c ? `${i}:${c}` : null)).filter(Boolean).join(' ')
    console.log(`чакр пройдено: ${avg} из ${FLOORS} в среднем · распределение (чакр:забегов) ${spread}`)
  }
  const builds = [...BUILDS.values()]
  if (builds.length) {
    const distinct = BUILDS.size
    const most = Math.max(...builds)
    const avgLen = [...BUILDS.keys()].reduce((a, k) => a + (k ? k.split('+').length : 0), 0) / distinct
    console.log(`разных сборок: ${distinct} на ${DEC.runs} забегов · в среднем ${avgLen.toFixed(1)} вещей в сборке · самая частая повторилась ${most} раз`)
    console.log('  (сравнение идёт по набору даров и реликвий; сборки разной длины считаются разными)')
  }
}

/** Обнулить счётчики — чтобы повторить замер с другой рассеянностью. */
function resetStats() {
  for (const k of Object.keys(STATS)) STATS[k] = 0
  SEVA.got = 0; SEVA.runs = 0
  COINS.got = 0; COINS.runs = 0
  for (const k of Object.keys(SHIELD)) SHIELD[k] = 0
  SHIELDLOG.serves = 0; SHIELDLOG.got = 0; SHIELDLOG.wasted = 0
  STRIKELOG.chances = 0; STRIKELOG.free = 0
  STRIKELOG.blockedByWindow = 0; STRIKELOG.blockedByPasha = 0
  SAMLOG.starts = 0; SAMLOG.ends = 0; SAMLOG.seconds = 0; SAMLOG.oddTime = false
  SHOPLOG.offers = 0; SHOPLOG.bought = 0; SHOPLOG.spent = 0
  DEC.doors = 0; DEC.boons = 0; DEC.relics = 0; DEC.shopBuys = 0
  DEC.calmSkips = 0; DEC.runs = 0; DEC.events = 0
  DEATHLOG.total = 0; DEATHLOG.boss = 0; DEATHLOG.room = 0
  for (const k of Object.keys(EVENTLOG.seen)) delete EVENTLOG.seen[k]
  for (const k of Object.keys(EVENTLOG.choices)) delete EVENTLOG.choices[k]
  BUILDS.clear(); BUILD_KEY = ''
  CHAKRAS_REACHED.sum = 0; CHAKRAS_REACHED.n = 0
  CHAKRAS_REACHED.counts.fill(0)
  for (const k of Object.keys(QI)) QI[k] = 0
  HPLOG.length = 0; TIMELOG.length = 0; ROOMLOG.length = 0; PARRIES[0] = 0
  for (let i = 0; i < CURVE.length; i++) CURVE[i] = { hp: [], dmg: 0, rooms: 0, runs: 0 }
  for (const k of Object.keys(DRAFTS)) delete DRAFTS[k]
}

/**
 * Один замер: прогнать RUNS забегов и напечатать всё, что видно.
 * `quiet` — не печатать (для лестницы: там печатает сводную таблицу).
 */
function simulate(quiet = false) {
  resetStats()
  let stuckCount = 0
  const wins = []
  const losses = []
  for (let k = 0; k < RUNS; k++) {
    const rng = mulberry32(1000 + k)
    // Генератор реликвий — ОТДЕЛЬНЫЙ, и это не украшение, а условие честного
    // сравнения.
    //
    // Что было: `rollFieldRelics` брал `rng` забега. Один розыгрыш реликвии
    // сдвигает поток, и дальше меняются ВСЕ комнаты, двери и оки. Сравнение
    // `--relics=off` с `--relics=only:ID` измеряло не «без реликвии против с
    // реликвией», а две разные игры. Замерено: с «Махамантра-мала» комнат
    // 961 против 1022, урона 3363 против 3869 — то есть урон МЕНЬШЕ, а побед
    // меньше, и это не реликвия, а другой розыгрыш комнат.
    //
    // Отдельный поток делает сравнение честным: та же раскладка, разные вещи.
    const relicRng = mulberry32(90001 + k)
    RUN_DEC = { doors: 0, boons: 0, relics: 0, shopBuys: 0, calmSkips: 0, events: 0 }
    const r = playRun(rng, null, relicRng)
    DEC.runs++
    for (const key of Object.keys(RUN_DEC)) DEC[key] += RUN_DEC[key]
    // Сколько чакр пройдено: забег, оборвавшийся на второй чакре, и забег до
    // седьмой — это не один и тот же результат, а «победа 75 %» их смешивает.
    {
      const reached = r.win ? FLOORS : (r.floor != null ? r.floor : 0)
      CHAKRAS_REACHED.sum += reached
      CHAKRAS_REACHED.n++
      CHAKRAS_REACHED.counts[reached]++
    }
    // Сборка забега — как ключ: столько-то даров и реликвий. Два забега с
    // одинаковым набором — это одна и та же игра, сколько бы раз она ни шла.
    BUILDS.set(BUILD_KEY, (BUILDS.get(BUILD_KEY) || 0) + 1)
    RUN_DEC = null
    SEVA.runs++
    if (r.win) wins.push(r.time)
    else { losses.push(r); if (r.stuck) stuckCount++ }
  }
  const out = {
    sloppy: SLOPPY, runs: RUNS, wins: wins.length, stuck: stuckCount,
    hits: STATS.hurt, dmg: Math.round(STATS.dmg), rooms: STATS.rooms,
  }
  if (quiet) return out

  console.log('── Поле Ума: прогон забегов ──')
  console.log(`бот: подходит, жмёт дефлект в окно, служит при ранении. Рассеянность ${SLOPPY}. Покой: ${REST_BONUS ? '+6 макс. жизни' : 'лечится полностью'}.`)
  console.log('Победа 100% означает, что забег ПРОХОДИМ.')
  console.log('ВНИМАНИЕ: бот парирует безупречно, а на это стоит всё. Для игры на')
  console.log('тайминге он не мера сложности — только доказательство, что забег')
  console.log('проходим. Сложность судится руками: сколько врагов бьёт разом,')
  console.log('с какой частотой и сколько снимает за удар.')
  if (ELITE) console.log('режим: каждая обычная комната собрана как ИСПЫТАНИЕ СИЛЫ')
  if (JADE_LV > 1) console.log(`режим: ранг нефрита ${JADE_LV} из 8`)
  if (VARNA_LV > 0) console.log(`режим: уровень варны ${VARNA_LV} из 3 (+${VARNA_LV * 4} макс. жизни)`)
  if (LEGEND_SET.length) {
    const n = LEGENDS.length
    console.log(LEGENDS_MODE === 'all'
      ? `режим: бот владеет ${n} легендарными дарами И их предпосылками (${LEGEND_SET.length} даров) — верхняя граница`
      : LEGENDS_MODE === 'pre'
        ? `режим: бот владеет ТОЛЬКО предпосылками легендарных (${LEGEND_SET.length} даров, ни одного легендарного) — база`
        : LEGENDS_MODE.startsWith('plus:')
          ? `режим: база (${PRE_REQUIRES.length} предпосылки) ПЛЮС один легендарный — ${LEGENDS_MODE.slice(5)}`
          : ONE_ID ? `режим: бот владеет ОДНИМ даром — ${ONE_ID}`
          : `режим: бот играет ПО ПЛАНУ — берёт предпосылки легендарных, потом легендарный (как человек, который их выращивает)`)
  }
  if (DOORS_MODE === 'avoid') {
    console.log(`двери без боя взято: ${Object.entries(DOORLOG_SKIP).map(([k, c]) => `${k} × ${c}`).join(' · ') || '—'}`)
  }
  console.log(`двери: ${Object.entries(DOORLOG).sort().map(([n, c]) => `${n} шт. × ${c}`).join(' · ') || 'ни разу'}`)
  console.log(`забегов: ${RUNS} | побед: ${wins.length} (${Math.round((wins.length / RUNS) * 100)}%)` +
    (HEAT > 0 ? ` | ЖАР ${HEAT} из ${HEAT_MAX} · сева за забег ×${heatReward(HEAT, 1)}` : '') +
    (WS_KEYS.length ? ` | МАСТЕРСКАЯ: все ранги (${WS_KEYS.length} покупок)` : ''))
  if (wins.length) {
    const avg = wins.reduce((a, b) => a + b, 0) / wins.length
    console.log(`среднее время побега: ${avg.toFixed(1)} с · комнат на этап: ${ROOMS_PER_STAGE}`)
  }
  if (HPLOG.length) {
    const avg = HPLOG.reduce((a, b) => a + b, 0) / HPLOG.length
    let full = 0, hurt = 0, low = 0
    for (const h of HPLOG) { if (h >= 99) full++; else if (h >= 50) hurt++; else low++ }
    // Строка называлась «здоровье перед владыкой», а HPLOG писался после
    // КАЖДОЙ обычной комнаты, а не перед владыкой. Это вводило в заблуждение:
    // цифра говорила о комнатах, а читалась как о владыке. Перед владыкой —
    // CURVE ниже, честно и по отдельной строке на чакру.
    console.log(`после обычной комнаты: среднее ${Math.round(avg)}% · без царапин ${full} · побитое ${hurt} · на грани ${low} (из ${HPLOG.length})`)
  }
  if (CURVE.some((c) => c.runs)) {
    console.log(`кривая забега по чакрам (покой между этапами: ${REST_BONUS ? '+6 макс. жизни' : 'лечимся полностью'}):`)
    for (let i = 0; i < CURVE.length; i++) {
      const c = CURVE[i]
      if (!c.runs) continue
      const avg = c.hp.length ? c.hp.reduce((a, b) => a + b, 0) / c.hp.length : null
      console.log(`  чакра ${i + 1}: комнат ${c.rooms} · жизнь перед владыкой ${avg == null ? '—' : Math.round(avg) + '%'} · урона за чакру ${Math.round(c.dmg / c.runs)} · дошло забегов ${c.runs}`)
    }
  }
  const draftTotal = Object.values(DRAFTS).reduce((a, b) => a + b, 0)
  if (draftTotal) {
    const top = Object.entries(DRAFTS).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(', ')
    console.log(`дары (как в игре: один за этап): ${draftTotal} — ${top}`)
  }
  if (RUNS && RELIC_MODE !== 'off') {
    const per = (RELICLOG.taken / RUNS).toFixed(1)
    const byR = Object.entries(RELICLOG.byRarity).map(([k, v]) => `${k} ${v}`).join(' · ')
    console.log(`реликвии (Slay the Spire: одна после владыки): ${RELICLOG.taken} за ${RUNS} забегов — ${per} за забег · ${byR}`)
    if (SHOP_RELICS && RUNS) {
      const b = (SHOPLOG.bought / RUNS).toFixed(1)
      const s = (SHOPLOG.spent / RUNS).toFixed(0)
      console.log(`лавка (реликвии за монеты): предложено ${SHOPLOG.offers} · куплено ${SHOPLOG.bought} — ${b} за забег · потрачено ${s} монет за забег`)
    } else if (RUNS) {
      console.log('лавка: бот не покупает (--shop=off) — это измерение амбросии без траты')
    }
    printDecisions()
  } else if (RUNS) {
    console.log('реликвии: бот их не берёт (--relics=off) — это измерение боя без них')
  }
  console.log(`статистика бота: комнат ${STATS.rooms} · снято оков ${STATS.pacified} · мантр ${STATS.mantra} · крипа ${STATS.krpa} · амбросия ${STATS.spring} · попаданий ${STATS.hurt} на ${Math.round(STATS.dmg)} урона · блефов ${STATS.feints}`)
  // ГДЕ ЗАБЕГ ЗАКАНЧИВАЕТСЯ. Перебор тронов (`--lords=all`) показал: у каждого
  // из 14 владык «0 смертей из 60–80 дошедших». То есть трон не место, где
  // забег решается, — а игра строит из него кульминацию (выбор владыки, имя на
  // двери, трон открывает чакру). Это расхождение надо назвать, а не оставить
  // в выводе замера невидимым.
  {
    const sum = Object.values(LORDLOG).reduce((a, r) => ({
      reached: a.reached + r.reached, died: a.died + r.died, clears: a.clears + r.clears,
    }), { reached: 0, died: 0, clears: 0 })
    const deaths = DEATHLOG.total || 0
    console.log(`где забег кончается: смертей в комнате владыки ${sum.died} из ${sum.reached} дошедших · в обычных комнатах ${deaths - sum.died} из ${STATS.rooms - sum.reached} дошедших`)
    if (sum.reached >= 30 && sum.died === 0) {
      console.log('  ВНИМАНИЕ: владыка за 30+ доходов ни разу не убил. Если так же и у человека — трон не кульминация, а остановка. Это вопрос к числам владык, а не к замеру.')
    }
  }
  // ЯСНОСТЬ. Окно в девять секунд, меняющее бой втрое. Печатается всегда: ноль
  // означал бы «состояние есть в коде, но не наступает» — и тогда чинить надо
  // не сообщение, а порог.
  if (RUNS) {
    const perRun = (SAMLOG.starts / RUNS).toFixed(1)
    const life = SAMLOG.starts ? (SAMLOG.seconds / SAMLOG.starts).toFixed(1) : '—'
    console.log(`ясность: открылась ${SAMLOG.starts} раз (${perRun} за забег) · кончилась ${SAMLOG.ends} · средняя жизнь окна ${life} с`)
  }
  // УДАРЫ. Считались, но не печатались — и из-за этого режим `--strike-careful`
  // выглядел как «мирный забег»: одинаковые числа читались как «осторожный
  // бот не бил», а на деле их было ноль или они били так же. Число ударов —
  // обязательная часть ответа «что этот режим измеряет».
  console.log(`удары: ${STATS.strikes} ${STRIKE ? (STRIKE_CAREFUL ? '(осторожно — только когда удар бесплатен)' : '(всегда, когда паша рядом)') : '(бот не бьёт)'}`)
  if (STRIKE_CAREFUL && STRIKELOG.chances) {
    console.log(`  момент для удара: свободен ${STRIKELOG.free} из ${STRIKELOG.chances} · помешало окно парирования ${STRIKELOG.blockedByWindow} · помешала паша на замахе ${STRIKELOG.blockedByPasha}`)
  }
  // ТЕМП МЕНТАЛЬНОСТЕЙ: Поле Ума против карточного пути. Единица в Поле Ума —
  // ЧАКРА (начисление раз за чакру, `settleFloor`), в колоде — ВЫИГРАННЫЙ БОЙ.
  // Лестница одна и та же (`MENTALITY_LEVELS`), поэтому числа сопоставимы, а
  // темп — нет. Раньше это расхождение жило в переписке («23.6 против 12.8») и
  // сравнить его было нечем: половина не печаталась вовсе.
  if (RUNS) {
    const per = (k) => (MENTAL[k] / RUNS).toFixed(1)
    const top = MENTALITY_LEVELS[MENTALITY_LEVELS.length - 1]
    const toTop = (k) => (MENTAL[k] ? (top / (MENTAL[k] / RUNS)).toFixed(1) : '—')
    console.log(`ментальности Поля Ума за забег: смелость ${per('kshatriya')} · присутствие ${per('shudra')} · различение ${per('vipra')} · мудрость 0 (считается в лавке за покупку, не в бою)`)
    console.log(`  до потолка лестницы (${top} очков): смелость ${toTop('kshatriya')} забегов · присутствие ${toTop('shudra')} · различение ${toTop('vipra')}`)
    console.log(`  карточный путь за тот же забег: смелость ~23.4 (за выигранный бой) · присутствие и различение — по факту узла`)
  }
  if (SHIELD.samples) {
    const total = SHIELD.absorbed + Math.round(STATS.dmg)
    const pct = Math.round((SHIELD.absorbed / (total || 1)) * 100)
    const avgShield = SHIELD.seen ? (SHIELD.sum / SHIELD.seen).toFixed(1) : '—'
    console.log(`щит: сработал в ${SHIELD.blocked} из ${SHIELD.samples} попаданий · съел ${SHIELD.absorbed} урона из ${total} (${pct}%) · на потолке в ${SHIELD.atCap} · средний щит в момент удара ${avgShield} · максимум ${SHIELD.max} из потолка ${SHIELD_CAP_USED}`)
  }
  // Дар «щит от севы»: работал или срабатывал вхолостую. Печатается всегда,
  // даже когда севы не было: ноль — это ответ «бот не служил», а не «дар пуст».
  if (SEVA_BOT) {
    const w = SHIELDLOG.serves ? Math.round((SHIELDLOG.wasted / SHIELDLOG.serves) * 100) : 0
    console.log(`щит от севы: сев ${SHIELDLOG.serves} · прибавлено щита ${SHIELDLOG.got} · потеряно впустую (щит полон) ${SHIELDLOG.wasted} — ${w}%`)
  }
  if (QI.casts) {
    console.log(`ци: мантр ${QI.casts} · потрачено ${QI.spent} · вернулось мантрой ${QI.gained} · пришло из дефлектов ${QI.fromDeflect} · без щита (Джапа) ${QI.noShield} · не хватило Ци ${QI.noQi}`)
  }
  if (STATS.hurt && !STATS.dmg) {
    console.log('  ВНИМАНИЕ: попадания есть, урона нет — весь урон съеден щитом.')
    console.log('  Значит замер ничего не говорит о сложности: идеальный бот неуязвим.')
  }
  if (TIMELOG.length) {
    const sorted = TIMELOG.slice().sort((a, b) => a - b)
    const q = (f) => sorted[Math.floor(sorted.length * f)].toFixed(0)
    console.log(`время боя: медиана ${q(0.5)}с · 25% ${q(0.25)}с · 75% ${q(0.75)}с · 95% ${q(0.95)}с`)
  }
  // Сева — цена прорицаний и мастерской. Считается в очках за ЗАБЕГ: за
  //комнату число ничего не значит, потому что забег может кончиться на
  // первой чакре.
  if (SEVA.runs) {
    const per = Math.round(SEVA.got / SEVA.runs)
    console.log(`сева: ${SEVA.got} очков за ${SEVA.runs} забегов — ${per} за забег (среднее). Первое усиление мастерской стоит ${WS[0].ranks[0].cost}, легендарный дар даёт севу не больше обычного.`)
  }
  // МОНЕТЫ ЗА ЗАБЕГ. Третья из четырёх ментальностей — вайшья — растёт по
  // деньгам, и её приёмы уровней тоже про деньги (`coinMul`, `shopDiscount`).
  // Проба слотов дала по ним «0 и 0» в проходимости, и это правда: винрейт про
  // деньги молчит. Без этой строки приёмы вайшьи выглядели бы пустыми.
  // ВАЖНО: счётчик не переобъявляется здесь. Первая версия писала
  // `const COINS = { got: 0 }` рядом с выводом и затеняла общий счётчик —
  // печаталось вечное «монеты: 0», и выглядело это как «приёмы вайшьи пустые».
  if (COINS.runs) {
    console.log(`монеты: ${COINS.got} за ${COINS.runs} комнат — ${(COINS.got / COINS.runs).toFixed(1)} за комнату (вайшья умножает монеты и снижает цены в лавке)`)
  }
  // Сокровища: сколько бот сломал и что это дало. Печатается ВСЕГДА, даже если
  // ноль: «сокровищ: 0» — это и есть ответ, что бот мимо, а не что механики нет.
  console.log(`сокровища: сломано ${POTLOG.smashed} · сундуков ${POTLOG.chests} · амбросии ${POTLOG.coins} ${POTS ? '' : '(бот мимо — нет флага --pots)'}`)
  if (process.argv.includes('--rooms')) console.log('   комнаты: ' + ROOMLOG.join('\n            '))
  if (losses.length) {
    const byWhy = {}
    for (const l of losses) byWhy[l.why] = (byWhy[l.why] || 0) + 1
    console.log('где ломается:', JSON.stringify(byWhy))
    console.log(`зависло без исхода: ${stuckCount}`)
  }
  return out
}

/**
 * ПАРНОЕ СРАВНЕНИЕ: тот же забег без дара и с даром, на одних и тех же
 * семенах.
 *
 * Зачем это, а не два прогона рядом. Два прогона по 200 забегов дают 60 % и
 * 62 % — и невозможно сказать, разница это или шум: при 200 забегах разброс
 * сам по себе около 3 пунктов. А вопрос «работает ли дар» стоит именно в
 * этом.
 *
 * Здесь сравнение ПАРНОЕ: тот же самый забег (тот же seed, та же варна, тот же
 * нефрит, та же карта комнат) прогоняется дважды — без дара и с даром. Дальше
 * считаются только те забеги, где РЕЗУЛЬТАТ РАЗНЫЙ:
 *
 *   · «выиграл с даром, проиграл без» — дар вытащил;
 *   · «выиграл без дара, проиграл с» — дар помешал или сломал.
 *
 * Если обе цифры нули — забеги не изменились ВООБЩЕ, ни разу. Это единственный
 * честный вывод «дар ничего не делает»: не «процент похож», а «ни один
 * забег не пошёл иначе».
 */
function pairCompare(boons, runs) {
  let onlyBoon = 0, onlyBase = 0, same = 0
  const flipped = []
  for (let k = 0; k < runs; k++) {
    const seed = 1000 + k
    const { a, b } = playRunPair(seed, boons)
    if (a.win === b.win) { same++; continue }
    if (b.win) { onlyBoon++; flipped.push(`seed ${seed}: без дара — ${a.why}, с даром — победил`) }
    else { onlyBase++; flipped.push(`seed ${seed}: без дара — победил, с даром — ${b.why}`) }
  }
  return { onlyBoon, onlyBase, same, flipped }
}

/**
 * Два забега на одном семени: чистый и с подложенным даром.
 *
 * Почему нельзя было проще. Первый вариант звал `playRun` с массивом даров и
 * получал 15 «выиграл с» против 8 «выиграл без» — и это выглядело как «дар
 * работает». Но подложенный дар попадал в список ВЫБРАННЫХ, а значит
 * вычеркивался из последующих розыгрышей: во втором забеге бот не мог взять
 * этот дар после владыки. То есть «с даром» означало «забег, где вместо
 * одного из шести сильных даров стоит слабый» — и мерялась подмена, а не дар.
 */
function playRunPair(seed, bonusBoons) {
  const saved = BONUS_ONLY.slice()
  const savedRuns = SEVA.runs
  const savedGot = SEVA.got
  BONUS_ONLY.length = 0
  BONUS_ONLY.push(...bonusBoons)
  const b = playRun(mulberry32(seed), [])
  BONUS_ONLY.length = 0
  BONUS_ONLY.push(...saved)
  SEVA.runs = savedRuns
  SEVA.got = savedGot
  return { a: playRun(mulberry32(seed), []), b }
}

/** Чистый забег без подложенных даров — база парного сравнения. */
export function playRunClean(seed) {
  const saved = BONUS_ONLY.slice()
  BONUS_ONLY.length = 0
  const r = playRun(mulberry32(seed), [])
  BONUS_ONLY.length = 0
  BONUS_ONLY.push(...saved)
  return r
}

/**
 * ПРОБА СЛОТА: этот слот вообще влияет на забег?
 *
 * Тот же парный метод, что и для даров: один и тот же забег без правки и с
 * правкой. Вопрос не «больше ли стало», а «меняется ли вообще что-нибудь».
 * Ноль и ноль — слот мёртвый, и ставить на него приём нельзя.
 */
function slotProbe(patches, runs) {
  const saved = SLOT_PATCHES.slice()
  let onlyPatch = 0, onlyBase = 0, same = 0
  for (let k = 0; k < runs; k++) {
    const seed = 1000 + k
    // Правку надо снимать ПЕРЕД каждым чистым прогоном, а не один раз до
    // цикла. Первая версия чистила список один раз, и со второй итерации
    // «чистый» забег шёл уже с правкой: оба прогона оказывались
    // одинаковыми, и проба читалась «мёртвый слот» для всего живого.
    //
    // Это ровно та поломка, о которой проект предупреждает: измеритель,
    // который ничего не меняет, выглядит как работающий. Здесь он выглядел
    // работающим настолько хорошо, что объявил мёртвыми 48 слотов из 49 —
    // среди них `parryWindow`, который в одиночку меняет забег на треть.
    SLOT_PATCHES.length = 0
    const a = playRun(mulberry32(seed), [])
    SLOT_PATCHES.length = 0
    SLOT_PATCHES.push(...patches)
    const b = playRun(mulberry32(seed), [])
    if (a.win === b.win) { same++; continue }
    if (b.win) onlyPatch++; else onlyBase++
  }
  SLOT_PATCHES.length = 0
  SLOT_PATCHES.push(...saved)
  return { onlyPatch, onlyBase, same }
}

/**
 * ПАРНОЕ СРАВНЕНИЕ УРОВНЕЙ ВАРНЫ.
 *
 * Почему не два прогона рядом. Варна в забеге выбирается случайно, поэтому
 * прогон «уровень 0» и прогон «уровень 3» — это не один и тот же набор
 * забегов, а разные: в первом могло быть больше шудры (стойкость), во втором
 * больше вайшьи (монеты). Первый замер дал 53 % → 65 % → 52 % → 60 % —
 * это шум, а не лестница, и он выглядел бы как «уровень 2 хуже уровня 1».
 *
 * Здесь сравнение парное: тот же seed, та же варна, те же комнаты — меняется
 * только уровень.
 */
function printVarnaPairs() {
  const runs = RUNS
  console.log('── Поле Ума: приёмы уровней варны (парное сравнение) ──')
  console.log(`Забегов на строку: ${runs}. Меняется ТОЛЬКО уровень варны.`)
  console.log('  уровень · выиграл только с ним · только без · совпало · вердикт')
  for (const lv of [1, 2, 3]) {
    const saved = VARNA_LV
    VARNA_LV = 0
    let onlyBoon = 0, onlyBase = 0, same = 0
    for (let k = 0; k < runs; k++) {
      const seed = 1000 + k
      const a = playRun(mulberry32(seed), [])
      VARNA_LV = lv
      const b = playRun(mulberry32(seed), [])
      VARNA_LV = 0
      if (a.win === b.win) { same++; continue }
      if (b.win) onlyBoon++; else onlyBase++
    }
    VARNA_LV = saved
    const diff = onlyBoon - onlyBase
    const verdict = diff === 0 ? 'поровну' : diff > 0 ? `помог на ${diff} забегов` : `ПОМЕШАЛ на ${-diff} забегов`
    console.log(`  ${String(lv).padStart(7)} · ${String(onlyBoon).padStart(4)} · ${String(onlyBase).padStart(4)} · ${same} · ${verdict}`)
  }
}

function printSlots() {
  const runs = RUNS
  console.log('── Поле Ума: какие слоты боя живые ──')
  console.log(`Забегов на пробу: ${runs}. Проба = пара «без правки / с правкой» на одном семени.`)
  console.log('«0 и 0» — слот не изменил НИ ОДИН забег: ставить на него приём нельзя.')
  console.log('  слот · изменилось только с правкой · только без · вердикт')
  // Каждый слот проверяется ОДИН раз, на заметной величине. Величина взята
  // такой, чтобы разницу было видно: если и на неё забег не реагирует,
  // слот мёртвый и никакая меньшая величина его не оживит.
  const PROBES = [
    ['parryWindow', 0.30], ['deflectCalm', 1.8], ['deflectQi', 6], ['deflectComboQi', 3],
    ['comboWindow', 6], ['stunTime', 3], ['parryRadius', 90], ['attackWindow', 0.30],
    ['calmRadius', 100], ['calmPerSec', 1.2], ['calmDecayEnemy', 0.02], ['calmDecayIdle', 0.02],
    ['enemySpeed', 30], ['enemyTelegraph', 1.3], ['enemyReach', 60], ['enemyCooldown', 1.6],
    ['bossCalmScale', 4], ['bossTelegraph', 1.0], ['bossCooldown', 1.3], ['bossBlockCalm', 0.1],
    ['walkSpeed', 200], ['dashCooldown', 0.35], ['dashSpeed', 700],
    ['shieldMax', 24], ['shieldStart', 10], ['shieldTurn', 10], ['sevaShield', 6],
    ['strikeBonus', 12], ['mantraCostCut', 3], ['psychicStart', 14], ['psychicMax', 30],
    ['deflectAvidya', 6], ['auraVeilAt', 0.2], ['weakMax', 8], ['weakTurn', 12],
    ['qiOnPacify', 6], ['coinMul', 3], ['avidyaGainIdle', 0.5], ['avidyaGainStrike', 0],
    ['avidyaCalmPacify', 30], ['avidyaCalmSeva', 16], ['avidyaCalmBreath', 30],
    ['shaktiMax', 40], ['pramaWindow', 10], ['krpaCalm', 3], ['krpaStun', 5],
    ['springHeal', 0.8], ['clockStart', 200], ['clockRamp', 0], ['clockMax', 1],
    // ВТОРАЯ ПОЛОВИНА: слоты, которые ПОМОГАЮТ УМЕНЬШЕНИЕМ. Первая проба
    // мерила почти всё в сторону «сложнее» — то есть спрашивала не «помогает
    // ли», а «вредит ли». А половина боя устроена наоборот: запас спокойствия
    // владыки, радиус добивания, скорость оков, давление неведения — там
    // выигрыш получается уменьшением числа. Без этой половины список живых
    // слотов был бы неполным, а приёмы уровней варны ставились бы мимо.
    ['bossCalmScale', 1.2], ['calmPerSec', 0.9], ['avidyaMax', 50], ['enemyReach', 22],
    ['weakTurn', 2], ['weakMax', 1], ['comboWindow', 5], ['pramaWindow', 8],
    ['avidyaCalmPacify', 22], ['calmRadius', 80], ['shieldTurn', 7], ['deflectCalm', 1.2],
    ['parryWindow', 0.25], ['krpaCalm', 2.0], ['enemySpeed', 34], ['bossTelegraph', 0.85],
    ['calmDecayEnemy', 0.05], ['shieldMax', 16], ['psychicMax', 20], ['deflectAvidya', 4],
    ['avidyaCalmBreath', 28], ['stunTime', 2.4], ['krpaStun', 4], ['dashCooldown', 0.4],
    ['walkSpeed', 200], ['parryRadius', 100], ['enemyCooldown', 1.4], ['bossCooldown', 1.0],
    ['enemyTelegraph', 0.4], ['bossCalmScale', 3], ['calmDecayIdle', 0.1], ['avidyaGainIdle', 1],
  ]
  const rows = []
  for (const [slot, value] of PROBES) {
    const r = slotProbe([[slot, value]], runs)
    const diff = r.onlyPatch - r.onlyBase
    const verdict = r.onlyPatch === 0 && r.onlyBase === 0 ? 'МЁРТВЫЙ'
      : diff >= 6 ? 'живой, тяжёлый' : diff >= 3 ? 'живой' : diff >= 1 ? 'слабый' : diff <= -3 ? 'МЕШАЕТ' : 'едва шевелится'
    rows.push({ slot, value, ...r, diff, verdict })
  }
  rows.sort((a, b) => b.diff - a.diff)
  for (const r of rows) {
    console.log(`  ${r.slot} = ${String(r.value).padEnd(6)} · ${String(r.onlyPatch).padStart(3)} · ${String(r.onlyBase).padStart(3)} · ${r.verdict}`)
  }
  console.log('Живые слоты — единственные, на которых можно строить приёмы уровней варны.')
}

function printPairs() {
  const runs = RUNS
  console.log('── Поле Ума: парное сравнение (одни и те же забеги) ──')
  console.log(`Забегов на строку: ${runs}. Считаются только забеги, где исход РАЗНЫЙ.`)
  console.log('Дар подкладывается СВЕРХ выпавших и не занимает места в розыгрыше.')
  console.log('  набор даров · выиграл только с ним · только без него · совпало · вердикт')
  const rows = []
  const add = (label, boons) => {
    const r = pairCompare(boons, runs)
    const diff = r.onlyBoon - r.onlyBase
    const verdict = r.onlyBoon === 0 && r.onlyBase === 0 ? 'НЕ изменил ни одного забега'
      : diff === 0 ? 'поровну: столько же выиграл, сколько потерял'
        : diff > 0 ? `помог на ${diff} забегов` : `ПОМЕШАЛ на ${-diff} забегов`
    rows.push(`  ${label.padEnd(28)} · ${String(r.onlyBoon).padStart(4)} · ${String(r.onlyBase).padStart(4)} · ${r.same} · ${verdict}`)
  }
  const one = (id) => BOON_DEFS.find((b) => b.id === id)
  for (const id of LEGENDS.map((b) => b.id)) {
    const plain = one(one(id).quoteId)
    // Сравниваем «предпосылки» против «предпосылки + легендарный»: база та
    // же, меняется ровно один дар. Иначе сравнивались бы 8 обычных с 9.
    add(`${plain.id} → +${id}`, [...one(id).requires, id])
    add(`${plain.id} → без легендарного`, one(id).requires)
  }
  for (const b of BOON_DEFS.filter((x) => x.rarity !== 'legendary')) {
    add(`дар ${b.id}`, [b.id])
  }
  console.log(rows.join('\n'))
  console.log('Как читать: «выиграл только с ним 12, только без него 3» — дар выиграл 12 забегов')
  console.log('и проиграл 3. «0 и 0» — забеги не изменились НИ РАЗУ, дар пуст.')
}

/**
 * ПАРНОЕ СРАВНЕНИЕ ТРОНОВ: каждый владыка против базы.
 *
 * Тот же приём, что `--pairs` и `--vpairs`: два прогона рядом дают шум около
 * 3 пунктов, а вопрос «меняет ли трон забег» стоит именно в этом. Поэтому
 * сравнение парное — тот же seed, та же варна, те же комнаты; меняется
 * ТОЛЬКО владыка.
 *
 * База — владыка по умолчанию (`lordPool[0]`, он же `world.lordId`), то есть
 * ровно то поведение, которое было до тронов.
 */
function printLords() {
  const runs = RUNS
  console.log('── Поле Ума: троны чакры (парное сравнение) ──')
  console.log(`Забегов на строку: ${runs}. База — владыка по умолчанию. Меняется ТОЛЬКО владыка.`)
  console.log('  владыка · чакра · выиграл только с ним · только без · совпало · вердикт · доля решений')
  const rows = []
  for (let f = 0; f < FLOORS; f++) {
    const base = lordPool(f)[0]
    for (const id of lordPool(f)) {
      if (id === base) continue
      let onlyLord = 0, onlyBase = 0, same = 0
      for (let k = 0; k < runs; k++) {
        const seed = 1000 + k
        LORD_FIX = base
        const a = playRun(mulberry32(seed), [])
        LORD_FIX = id
        const b = playRun(mulberry32(seed), [])
        if (a.win === b.win) { same++; continue }
        if (b.win) onlyLord++; else onlyBase++
      }
      const diff = onlyLord - onlyBase
      const verdict = diff === 0 ? 'поровну' : diff > 0 ? `помог на ${diff}` : `ПОМЕШАЛ на ${-diff}`
      // «Доля решений» — сколько забегов дошло до комнаты ЭТОГО владыки и
      // сколько умерло именно в ней. Без неё «поровну» нечитаемо: трон может
      // быть пустым (игра его не видит), а может быть редким — забег кончается
      // раньше, и тогда трон просто не успел проявиться.
      //
      // Считается на прогоне С ЭТИМ владыкой, а не на базовом: база и трон —
      // разные бои, и смертей у них может быть разное число.
      LORD_FIX = id
      for (const k of Object.keys(LORDLOG)) delete LORDLOG[k]
      for (let k = 0; k < runs; k++) playRun(mulberry32(1000 + k), [])
      const reach = LORDLOG[id]
      const share = reach && reach.reached
        ? `${reach.died} смертей из ${reach.reached} дошедших`
        : 'забеги не доходят до трона'
      rows.push(`  ${(ENEMIES[id]?.name || id).padEnd(14)} · ${String(f + 1).padStart(6)} · ${String(onlyLord).padStart(4)} · ${String(onlyBase).padStart(4)} · ${same} · ${verdict} · ${share}`)
    }
  }
  console.log(rows.join('\n'))
  console.log('Как читать: «помог на 7» — забегов, которые трон выиграл, а база проиграла.')
  console.log('«поровну» + «забеги не доходят» — трон пустой: игра его не видит.')
  console.log('«поровну» + смерти есть — трон реален, но бот выигрывает и с ним, и без него.')
}

// ── Модуль можно импортировать (тесты гоняют playRun напрямую) ────────────
// Раньше файл на верхнем уровне просто запускал прогон, и проверить его было
// нечем. Теперь запуск — только когда файл вызвали как скрипт.
const IS_MAIN = !!(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)

export { playRun, simulate, mulberry32, STATS, DRAFTS }
export const setSloppy = (v) => { SLOPPY = v }

// ── Лестница рассеянности ──────────────────────────────────────────────────
// Один процент побед от идеального бота не говорит ничего: он стоит на
// безупречном парировании. Полезнее другой вопрос — НАСКОЛЬКО неточным
// можно быть и всё ещё дойти. Это и есть настоящая мера мягкости.
const LADDER = (process.argv.find((a) => a.startsWith('--ladder=')) || '').split('=')[1]
if (!IS_MAIN) {
  // импорт из теста: ничего не печатаем и не выходим
} else if (LADDER) {
  const values = LADDER.split(',').map(Number).filter((n) => Number.isFinite(n))
  console.log('── Поле Ума: лестница рассеянности ──')
  console.log(`Рассеянность = доля окон дефлекта, которые бот ПРОПУСКАЕТ. Забегов на ступень: ${RUNS}.`)
  console.log('Вопрос не «сколько процентов побед», а «насколько неточным ещё можно быть».')
  console.log('  рассеянность · побед · попаданий · урона · комнат · зависло · щит съел')
  for (const v of values) {
    SLOPPY = v
    const r = simulate(true)
    const total = SHIELD.absorbed + r.dmg
    const pct = total ? Math.round((SHIELD.absorbed / total) * 100) : 0
    console.log(`  ${String(Math.round(v * 100)).padStart(11)} % · ${String(Math.round((r.wins / r.runs) * 100)).padStart(4)} % · ${String(r.hits).padStart(8)} · ${String(r.dmg).padStart(5)} · ${String(r.rooms).padStart(6)} · ${r.stuck} · ${String(pct).padStart(3)}% (на потолке ${SHIELD.atCap})`)
  }
} else if (process.argv.includes('--pairs')) {
  printPairs()
} else if (process.argv.includes('--slots')) {
  printSlots()
} else if (process.argv.includes('--vpairs')) {
  printVarnaPairs()
} else if (LORDS_ARG === 'all') {
  printLords()
} else {
  simulate()
}
process.exitCode = 0
