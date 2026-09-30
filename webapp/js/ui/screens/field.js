// Поле Ума — экран боя в локации (изометрия, Hades-структура).
//
// Главное отличие от карточного боя: окову нельзя убить, её успокаивают.
// Логика живёт в core/field.js, здесь — только отрисовка и ввод.

import { h, mount, clear } from '../dom.js'
import { sfx, fieldSfx, startDrone, stopDrone } from '../fx.js'
import { drawFoeArt, drawSadhakaArt, drawWareArt, drawFlowerArt, ART } from '../fieldArt.js'
import { haptics } from '../haptics.js'
import { QUOTES } from '../../core/data.js'
import { KEEPSAKE_BY_ID } from '../../core/keepsakes.js'
import {
  createField, stepField, strike, dash, serveWare, parry, parryHint,
  castMantra, mantraById,
  fieldProgress, GUNA_META,
} from '../../core/field.js'

const W = 420
const H = 640

// Ритм дыхания: вдох — задержка — выдох. Совпадает с сердцебиением.
const BREATH_CYCLE = 4.0

// Намерения приёмов — слот-в-слот из Slay the Spire: игрок заранее видит,
// что владыка готовит. Наш язык: не «атака/блок», а что он делает по сути.
const INTENT_ICON = {
  attack:  { mark: '⚔', color: '#ff6b5a' },   // бьёт
  defend:  { mark: '⬢', color: '#8ff4ff' },   // копит стойкость
  buff:    { mark: '▲', color: '#ffcf4a' },   // крепнет
  debuff:  { mark: '◌', color: '#c48bff' },   // давит на ум
  special: { mark: '✷', color: '#9dff5a' },   // особое
}
const BREATH_PHASE = { IN: 0.34, HOLD: 0.13, OUT: 0.40, REST: 0.13 }

function breathLabel(st) {
  const p = st.player.breathPhase / BREATH_CYCLE
  if (p < BREATH_PHASE.IN) return 'вдох'
  if (p < BREATH_PHASE.IN + BREATH_PHASE.HOLD) return 'держи'
  if (p < BREATH_PHASE.IN + BREATH_PHASE.HOLD + BREATH_PHASE.OUT) return 'выдох'
  return 'пауза'
}

export function fieldScreen(state, opts = {}) {
  const root = h('div', { class: 'field screen active' })

  const st = state
  const cv = h('canvas', { class: 'field-canvas' })
  const ctx = cv.getContext('2d')

  // ── DOM-оверлеи ──
  const gunas = h('div', { class: 'field-guna' },
    h('i', { class: 'fg s', style: `background:${GUNA_META.s.color}` }),
    h('b', { class: 'fv s', id: 'fg-s' }, '4'),
    h('i', { class: 'fg r', style: `background:${GUNA_META.r.color}` }),
    h('b', { class: 'fv r', id: 'fg-r' }, '2'),
    h('i', { class: 'fg t', style: `background:${GUNA_META.t.color}` }),
    h('b', { class: 'fv t', id: 'fg-t' }, '3'),
    h('span', { class: 'fg-pram', id: 'fg-pram' }, 'прама'),
  )
  const mkBar = (id, cls, label) => h('div', { class: `fbar ${cls}` },
    h('div', { class: 'fbar-l' }, h('span', {}, label), h('b', { id: `${id}-v` }, '0')),
    h('div', { class: 'fbar-t' }, h('i', { id: `${id}-b`, style: 'width:0%' })),
  )
  const bars = h('div', { class: 'field-bars' },
    mkBar('sh', 'shakti', 'духовная сила'),
    mkBar('ps', 'psychic', 'психическая'),
    mkBar('av', 'avidya', 'авидья'),
  )
  // Жизнь и щит — одна полоса: щит идёт золотым отрезком перед жизнью
  // (так же в Slay the Spire). Отдельная панель на щит была лишней.
  const hpLine = h('div', { class: 'field-hp' },
    h('i', { class: 'fhp-shield', id: 'fshield-b' }),
    h('i', { id: 'fhp-b' }))

  // Счётчик монет — как в Hades, слева внизу под гунами.
  const purse = h('div', { class: 'field-purse' },
    h('i', { class: 'fp-coin' }), h('b', { id: 'fp-n' }, '0'))

  // Смерти за все побеги — в Hades они стоят по центру сверху, и это часть
  // напряжения: чем больше, тем дороже ошибка. Показываем только если есть.
  const deaths = h('div', { class: 'fdeaths', id: 'fdeaths' },
    h('i', {}, '☠'), h('b', { id: 'fdeaths-n' }, '0'))

  // Состояния, которые навязали оки: ожог, вялость, слабость, хаос-проклятие.
  // Без них игрок чувствует, что «что-то не так», и не понимает что.
  const states = h('div', { class: 'field-states', id: 'fstates' })

  // Пауза. В Hades её можно открыть в любой момент, и из неё — уйти,
  // оставив забег. На телефоне без этого игрок вообще не может остановиться:
  // выключил игру посреди боя — вернулся, и за тебя доиграли.
  const pauseBtn = h('button', {
    class: 'fpause', id: 'fpause', title: 'Пауза',
    onclick: () => setPause(true),
  }, '❚❚')

  const top = h('div', { class: 'field-top' }, gunas,
    h('div', { class: 'field-topright' }, bars, hpLine, states), pauseBtn)

  // Шапка локации: ТОЛЬКО имя и стихия. Длинное описание локации живёт на
  // экране чакр — в бою читать его негде, и оно наезжало на полосы и лог.
  const wd = st.world || {}
  const head = h('div', { class: 'field-head' },
    h('b', { class: 'fh-name' }, wd.name || 'Поле Ума'),
    h('span', { class: 'fh-el' }, `· ${wd.elementIcon || ''} ${wd.element || ''}`.trim()),
  )

  const log = h('div', { class: 'field-log' })
  const prompt = h('div', { class: 'field-prompt' })

  // Телефон или нет. Объявлено ДО подсказки, которая его читает: раньше
  // `const isTouch` стоял на двести строк ниже, и экран падал с
  // «Cannot access before initialization» — целиком, до первой кнопки.
  const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches

  // ДВЕ кнопки. Как в Hades: главное действие и особое.
  //  · дефлект — вернуть удар (Nine Sols)
  //  · мантра   — особое умение чакры
  // Удар отдельной кнопки нет: он и так работает простым тапом по окове.
  // Рывок — двойное нажатие, отдельной кнопки нет.
  const pauseEl = h('div', { class: 'field-pause' })

  const dock = h('div', { class: 'field-dock fdock' },
    h('button', { class: 'fbtn big fire', id: 'fb-parry',
      title: 'Дефлект — жми, когда кольцо замкнулось', onclick: () => doParry() },
      h('i', {}, '⟲'), h('span', {}, 'дефлект')),
    h('button', { class: 'fbtn big', id: 'fb-mantra',
      title: 'Мантра чакры', onclick: () => doMantra() },
      h('i', { class: 'fm-glyph' }, 'ॐ'),
      h('b', { class: 'fm-nm2', id: 'fm-nm' }, 'Джапа'),
      h('span', { class: 'fm-cost2', id: 'fm-cost' }, '—')),
  )
  const hint = h('div', { class: 'field-hint on' },
    isTouch
      ? 'веди пальцем · тапни по окове · двойной тап — рывок'
      : 'идти WASD · дефлект ПКМ или Shift · мантра Пробел · окову — тапни')

  root.append(cv, h('div', { class: 'field-ui' }, head, top, log, prompt, dock, hint, pauseEl))

  // ── Лог событий ──
  const lines = []
  function say(text, cls = '') {
    // Две строки, не больше. Больше — это «куча информации», а не бой.
    if (lines[0] === text) return
    lines.unshift({ text, cls })
    if (lines.length > 2) lines.pop()
    clear(log)
    for (const l of lines) log.append(h('div', { class: `fl ${l.cls}` }, l.text))
  }
  say('Ока замахнулась — жми дефлект. Силой окову не снять.', 'tip')

  // Цитата чакры — когда входишь в локацию впервые. Знание приходит само,
  // от места: как в реальности, где место учит, а не карта в колоде.
  const entryQuote = opts.onEnter?.()
  if (entryQuote) {
    const q = QUOTES[entryQuote]
    if (q) say(`${q.term}: ${q.quote || q.meaning || ''}`.slice(0, 160), 'good')
  }

  // ── Ввод ──
  const keys = {}
  const pointer = { x: 0, y: 0, down: false }
  let touch = null

  function keyName(e) {
    const k = e.key.toLowerCase()
    if (k === ' ' || e.code === 'Space') return 'mantra'
    if (k === 'shift') return 'parry'
    return k
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'з' || e.key === 'P') {
      e.preventDefault()
      setPause(!paused)
      return
    }
    const n = keyName(e)
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'mantra', 'parry'].includes(n)) {
      if (!keys[n]) noteMove(n)
      keys[n] = true
      // Две кнопки, как в Hades: дефлект и мантра. Ничего больше.
      if (n === 'parry') doParry()
      if (n === 'mantra') doMantra()
      e.preventDefault()
    }
  }
  const onKeyUp = (e) => { keys[keyName(e)] = false }
  addEventListener('keydown', onKeyDown)
  addEventListener('keyup', onKeyUp)

  // Рывок — двойное нажатие в направлении (как пробел в Hades).
  const lastTap = {}
  // Двойной тап пальцем: запоминаем, куда жали, чтобы рвануть в ту же сторону
  let lastTapTime = 0
  let pLast = { x: 0, y: 0 }
  function tapDash(k) {
    const now = performance.now()
    if (now - (lastTap[k] || 0) < 260) { lastTap[k] = 0; doDash() }
    else lastTap[k] = now
  }

  function localPoint(e) {
    const r = cv.getBoundingClientRect()
    // На телефоне холст на кадр может схлопнуться в ноль: анимация шапки
    // Telegram, поворот, клавиатура. Перевод через ноль даёт Infinity, и
    // одно касание навсегда портит позицию садхаки (NaN). Нет размера —
    // нет и касания: палец просто ничего не делает.
    if (!(r.width > 0) || !(r.height > 0)) return null
    const x = (e.clientX - r.left) * (W / r.width)
    const y = (e.clientY - r.top) * (H / r.height)
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
  }

  function foeAt(x, y) {
    for (let i = 0; i < st.foes.length; i++) {
      const f = st.foes[i]
      if (f.dead || f.pacified) continue
      if (Math.hypot(f.x - x, f.y - y) < 32) return i
    }
    return -1
  }
  function wareAt(x, y) {
    for (let i = 0; i < st.wares.length; i++) {
      const w = st.wares[i]
      if (w.done) continue
      if (Math.hypot(w.x - x, w.y - y) < 40) return i
    }
    return -1
  }

  const onDown = (e) => {
    // Правая кнопка — дефлект (Nine Sols: парирование правой).
    if (e.button === 2) { doParry(); e.preventDefault(); return }
    const pt = localPoint(e)
    if (!pt) return                 // холст схлопнулся — касание игнорируем
    const wi = wareAt(pt.x, pt.y)
    if (wi >= 0) { openSeva(wi); return }
    const fi = foeAt(pt.x, pt.y)
    if (fi >= 0) { doStrike(fi); return }
    // Двойной тап — рывок в ту сторону (Hades: рывок пробелом, здесь — пальцем).
    // Без клавиатуры это единственный рывок, и подсказка его обещает.
    const now = performance.now()
    if (now - lastTapTime < 260) {
      lastTapTime = 0
      const dx = pt.x - pLast.x, dy = pt.y - pLast.y
      if (Math.hypot(dx, dy) > 8) doDash(dx, dy)
      else doDash(0, 0)
    } else {
      lastTapTime = now
      pLast = pt
    }
    // иначе — шагнуть туда
    touch = pt
  }
  // ── ПАЛЬЦЫ (телефон) ──────────────────────────────────────────────
  // Правило простое: ходит ТОЛЬКО тот палец, который первым коснулся
  // поля. Второй палец на кнопке дефлекта не должен «вести» садхаку.
  // Второй палец на самом поле — тоже: он не должен уводить игрока.
  const onMove = (e) => { if (pointer.down && pointer.id === e.pointerId) touch = localPoint(e) }
  const onUp = (e) => {
    if (pointer.id !== undefined && e && pointer.id !== e.pointerId) return
    pointer.down = false
    pointer.id = undefined
    touch = null
  }

  cv.addEventListener('pointerdown', (e) => {
    // Захватываем палец: без этого iOS отменяет жест, если палец сдвинется
    // за край холста, и садхака «залипает» на месте.
    try { cv.setPointerCapture(e.pointerId) } catch { /* старый Safari */ }
    if (pointer.down) return                       // уже ведёт другой палец
    pointer.down = true
    pointer.id = e.pointerId
    onDown(e)
    e.preventDefault()
  })
  cv.addEventListener('pointermove', onMove)
  addEventListener('pointerup', onUp)
  addEventListener('pointercancel', onUp)
  cv.addEventListener('lostpointercapture', onUp)

  function doDash(pdx, pdy) {
    let dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0)
    let dy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0)
    if (!dx && !dy && pdx !== undefined) { dx = pdx; dy = pdy }   // рывок пальцем
    if (!dx && !dy) { dx = st.player.facing; dy = 0 }
    if (dash(st, dx, dy)) { haptics.tap?.() }
  }
  // движение + рывок двойным тапом
  const moveKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']
  function noteMove(n) { if (moveKeys.includes(n)) tapDash(n) }
  function doStrike(i) {
    const ev = strike(st, i)
    for (const e of ev) onEvent(e)
  }
  function doParry() {
    const ev = parry(st)
    for (const e of ev) onEvent(e)
    const hit = ev.find((e) => e.type === 'deflect')
    haptics.tap?.(hit ? 'heavy' : 'light')
  }
  function doMantra() {
    const ev = castMantra(st)
    for (const e of ev) onEvent(e)
  }

  // ── Сева: вид НЕ выбирается ──
  // Раньше при подходе к просящему вылезало окно из четырёх видов севы.
  // Это был выбор посреди боя — ровно то, чего в Hades нет. Теперь вид
  // определяет сама нужда просящего (из worlds.json): нужна вода — значит
  // накормить. Игрок просто помогает.
  const SEVA_BY_NEED = {
    вода: 'shudrocita', опора: 'ksatriyocita',
    пища: 'shudrocita', знание: 'viprocita', одежда: 'shudrocita',
  }
  function autoSevaKind(w) {
    return SEVA_BY_NEED[w?.need] || 'shudrocita'
  }

  // Помощь — одним тапом, без окна выбора. Вид севы подсказывает нужда.
  function openSeva(index) {
    const w = st.wares[index]
    if (!w || w.done) return
    const kind = autoSevaKind(w)
    const ev = serveWare(st, index, kind)
    for (const e of ev) onEvent(e)
    if (w.debt) say('он ждал отдачи — помощь с расчётом не сева', 'bad')
    else showMantraDesc(SEVA_LABELS[kind] || { desc: 'служение' })
  }

  // Подпись севы для короткой всплывающей строки (без окна выбора).
  const SEVA_LABELS = {
    shudrocita: { desc: 'накормлен и обогрет — шудрочита, плод временный' },
    ksatriyocita: { desc: 'встал между слабым и опасным — кшатрийочита' },
    vaeshyocita: { desc: 'снята нужда — вайшйочита' },
    viprocita: { desc: 'показана истина — випрочита, плод навечно' },
  }

  // ── События ──
  function onEvent(e) {
    switch (e.type) {
      case 'pacified':
        say(`${e.name} — распался в свет. +${e.shakti} духовной силы`, 'good')
        fieldSfx.pacify()
        haptics.tap?.()
        // Владыка чакры даёт знание (цитата) — награда за путь без насилия.
        if (e.boss) {
          const qid = e.quoteId
          if (qid && QUOTES[qid]) {
            opts.onKnowledge?.(qid, e.name)
            say(`Знание открыто: ${QUOTES[qid].term}`, 'good')
          }
        }
        break
      case 'strike_ripu':
        say('рипу не ранится — его сдерживают', 'bad')
        break
      case 'strike_false':
        say('аура оказалась ложной — удар в пустоту', 'bad')
        haptics.tap?.()
        break
      case 'hit':
        say('попадание', '')
        break
      case 'shaken':
        say('окова задела тебя — дыхание сбито', 'bad')
        break
      case 'samskara':
        say(e.message, 'bad')
        haptics.buzz?.()
        break
      case 'served':
        say(`сева: ${e.label}`, 'good')
        fieldSfx.seva()
        break
      case 'seva_debt':
        say('помощь с расчётом — это не сева', 'bad')
        break
      case 'hurt':
        say(e.absorbed > 0 ? `щит −${e.absorbed}, жизнь −${e.amount}` : `−${e.amount}`, 'bad')
        haptics.buzz?.()
        break
      // ── Дефлект (Nine Sols) ──
      case 'deflect':
        say(e.combo > 1 ? `дефлект — серия ${e.combo}, Ци +${e.qi}` : `дефлект — сила возвращена, Ци +${e.qi}`, 'gold')
        fieldSfx.parry(e.combo)     // лязг выше с каждой серией
        if (e.blocked) say('стойкость владыки погасила дефлект', 'tip')
        break
      case 'parry_miss':
        say('мимо окна — серия сорвана', 'bad')
        fieldSfx.parryMiss()
        break
      case 'combo_end':
        break
      // ── Мантры ──
      case 'mantra':
        say(`${e.name}: ${e.text}`, 'gold')
        fieldSfx.mantra(e.id)
        break
      case 'no_qi':
        say('не хватает Ци — поймай дефлектом', 'bad')
        break
      case 'shield_decay':
        // Щит истёк на «ходе». Без этой строки он таял бы молча, и игрок
        // думал бы, что щит пропал из-за бага.
        say(`щит истёк${e.left > 0 ? ` — осталось ${Math.round(e.left)}` : ''}`, 'tip')
        break
      case 'whiff':
        say('мимо — никого рядом', 'bad')
        break
      case 'killed':
        say(e.message || 'сила оставила самскару', 'bad')
        break
      // ── Владыка ──
      case 'boss_telegraph': {
        const ic = INTENT_ICON[e.intent] || INTENT_ICON.attack
        say(`${ic.mark} ${e.name}`, e.phase >= 2 ? 'bad' : 'tip')
        fieldSfx.bossWind(e.phase)     // гул заранее: слышно, что замахивается
        break
      }
      case 'boss_move': {
        const ic = INTENT_ICON[e.intent] || INTENT_ICON.attack
        const tail = e.damage > 0 ? ` — ${e.damage} урона` : ''
        say(`${e.name}${tail}`, e.damage > 0 ? 'bad' : 'tip')
        if (e.damage > 0) fieldSfx.bossHit()
        break
      }
      case 'spring':
        // Фонтан амбросии даёт не только жизнь, но и слово: место учит.
        say(e.message, 'good')
        const aq = QUOTES[opts.placeQuotes?.spring]
        if (aq) say(`${aq.term}: ${aq.quote || aq.meaning || ''}`.slice(0, 150), 'good')
        fieldSfx.pacify()
        haptics.tap?.()
        break
      case 'feint':
        say('мимо — ока соврала и удара не будет', 'good')
        fieldSfx.parryMiss()
        break
      case 'rage_on':
        say('мир ускорился — оковы стали злее', 'bad')
        haptics.buzz?.()
        break
      case 'chaos':
        say('хаос-путь: урон удвоен, но дар будет', 'gold')
        const cq = QUOTES[opts.placeQuotes?.chaos]
        if (cq) say(`${cq.term}: ${cq.quote || cq.meaning || ''}`.slice(0, 150), 'good')
        fieldSfx.bossBreak()
        opts.onChaos?.(st)
        break
      case 'boss_phase':
        say(e.message, 'gold')
        fieldSfx.bossBreak()
        haptics.buzz?.()
        flashBanner('владыка сломался')
        break
      // ── Крипа (kṛpā) ──
      case 'krpa':
        say(e.message, 'gold')
        fieldSfx.samadhi()          // свет заливает
        haptics.buzz?.()
        flashBanner('КРИПА')
        krpaVeil()
        opts.onKrpa?.(true)
        if (e.quoteId && QUOTES[e.quoteId]) {
          say(`Знание открыто: ${QUOTES[e.quoteId].term}`, 'good')
          opts.onKnowledge?.(e.quoteId, 'Крипа')
        }
        break
      case 'krpa_missed':
        say(e.message, 'bad')
        opts.onKrpa?.(false)
        break
      default:
        break
    }
  }

  // Плашка-баннер на весь экран: важные моменты (ломается владыка и т.п.)
  const banner = h('div', { class: 'fbanner' })
  root.querySelector('.field-ui')?.append(banner)
  let bannerT = 0
  function flashBanner(text) {
    banner.textContent = text
    banner.classList.add('on')
    bannerT = 2.2
  }

  // Золотая вспышка на весь экран в момент крипы.
  const veil = h('div', { class: 'fkrpa' })
  root.querySelector('.field-ui')?.append(veil)
  function krpaVeil() {
    veil.classList.remove('on')
    void veil.offsetWidth        // перезапуск анимации
    veil.classList.add('on')
  }

  // ── ФОНТАН АМБРОСИИ (Hades: healing fountain) ─────────────────────
  // Стоит в последней комнате этапа. Яркая чаша в углу — её видно с порога.
  // Коснулся — вернулась часть жизни, и только раз за комнату.
  function drawSpring(t) {
    const sp = st.spring
    if (!sp) return
    const pulse = 0.6 + 0.3 * Math.sin(t * 1.8)
    ctx.save()
    ctx.translate(sp.x, sp.y)
    // тень на полу
    ctx.fillStyle = 'rgba(0,0,0,.5)'
    ctx.beginPath(); ctx.ellipse(0, 14, 20, 6, 0, 0, 7); ctx.fill()
    // чаша
    ctx.beginPath()
    ctx.moveTo(-16, -10)
    ctx.quadraticCurveTo(-13, 12, 0, 14)
    ctx.quadraticCurveTo(13, 12, 16, -10)
    ctx.closePath()
    ctx.fillStyle = '#efe6d2'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = sp.used ? '#6b5f4a' : '#c8a24a'
    ctx.stroke()
    // вода / золотой свет
    if (!sp.used) {
      ctx.save()
      ctx.globalAlpha = pulse
      ctx.fillStyle = '#ffd98a'
      ctx.beginPath(); ctx.ellipse(0, -9, 14, 5, 0, 0, 7); ctx.fill()
      ctx.shadowBlur = 18
      ctx.shadowColor = '#ffcf4a'
      ctx.fillStyle = 'rgba(255,236,180,.9)'
      ctx.beginPath(); ctx.ellipse(0, -9, 10, 3.4, 0, 0, 7); ctx.fill()
      ctx.restore()
      ctx.font = 'bold 9px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,.8)'
      ctx.strokeText('амбросия', 0, -24)
      ctx.fillStyle = '#ffe6a8'
      ctx.fillText('амбросия', 0, -24)
    } else {
      ctx.fillStyle = 'rgba(120,110,90,.8)'
      ctx.beginPath(); ctx.ellipse(0, -9, 14, 5, 0, 0, 7); ctx.fill()
    }
    ctx.restore()
  }

  // ── СТЕНЫ КОМНАТЫ (Hades) ──────────────────────────────────────────
  // В Hades комната — это ПОМЕЩЕНИЕ: задняя стена с дверью, две боковые,
  // уходящие вглубь, тень от потолка. Без них сцена читается как
  // «площадка, висящая в пустоте» — сколько бы её ни поднимали.
  // Здесь: задняя стена с кладкой, боковые стены, уходящие на перспетиве,
  // и тёмный карниз сверху. Дверь потом дорисовывается поверх стены.
  const WALL = { top: 40, base: 176, inset: 26 }

  function drawWalls(t) {
    const g = ctx.createLinearGradient(0, WALL.top, 0, WALL.base)
    g.addColorStop(0, rgb(mixc(L.ground2, [0, 0, 0], 0.78)))
    g.addColorStop(0.55, rgb(mixc(L.ground2, [0, 0, 0], 0.5)))
    g.addColorStop(1, rgb(mixc(L.ground2, [0, 0, 0], 0.72)))
    ctx.fillStyle = g
    ctx.fillRect(0, WALL.top, W, WALL.base - WALL.top)

    // кладка: ряды ниже — выше (это перспектива), швы вразброс
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, WALL.top, W, WALL.base - WALL.top)
    ctx.clip()
    const rowH = 20
    const rows = Math.ceil((WALL.base - WALL.top) / rowH)
    for (let r = 0; r < rows; r++) {
      const y = WALL.top + r * rowH
      const k = r / Math.max(1, rows - 1)              // 0 сверху, 1 снизу
      const h = rowH * (0.72 + 0.5 * k)                // перспектива
      const off = (r % 2) * 46 + r * 7
      ctx.strokeStyle = rgb(mixc(L.ground2, [0, 0, 0], 0.82), 0.9)
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, y + h); ctx.lineTo(W, y + h); ctx.stroke()
      for (let x = off; x < W + 60; x += 60 + r * 3) {
        ctx.strokeStyle = rgb(mixc(L.ground2, [0, 0, 0], 0.7), 0.7)
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke()
      }
    }
    // редкие трещины по стене — стена старая, а не напечатанная
    for (let k = 0; k < 3; k++) {
      const cx = 46 + ((k * 137) % 320)
      ctx.strokeStyle = 'rgba(0,0,0,.45)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(cx, WALL.top + 6)
      ctx.lineTo(cx + 7, WALL.top + 40 + k * 9)
      ctx.lineTo(cx - 4, WALL.top + 74 + k * 7)
      ctx.stroke()
    }
    ctx.restore()

    // карниз сверху: тень от потолка + светлая кромка
    const cg = ctx.createLinearGradient(0, WALL.top - 16, 0, WALL.top + 34)
    cg.addColorStop(0, 'rgba(0,0,0,.8)')
    cg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = cg
    ctx.fillRect(0, WALL.top - 16, W, 50)
    ctx.strokeStyle = rgb(L.accent, 0.18)
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(0, WALL.top + 0.5); ctx.lineTo(W, WALL.top + 0.5); ctx.stroke()

    // БОКОВЫЕ стены: уходят вниз-вперёд к краям экрана. Их угол даёт
    // ощущение, что комната замкнута, а не выставлена наружу.
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : W
      const x1 = side < 0 ? WALL.inset : W - WALL.inset
      ctx.save()
      const wg = ctx.createLinearGradient(x0, 0, x1, 0)
      wg.addColorStop(0, rgb(mixc(L.ground2, [0, 0, 0], 0.86)))
      wg.addColorStop(1, rgb(mixc(L.ground2, [0, 0, 0], 0.34)))
      ctx.fillStyle = wg
      ctx.beginPath()
      ctx.moveTo(x0, WALL.top)
      ctx.lineTo(x1, WALL.base - 6)
      ctx.lineTo(x1 - side * 16, H)
      ctx.lineTo(x0, H)
      ctx.closePath()
      ctx.fill()
      // швы на боковой стене
      ctx.strokeStyle = 'rgba(0,0,0,.4)'
      ctx.lineWidth = 1
      for (let k = 1; k < 9; k++) {
        const y = WALL.base + k * 44
        const e = (y - WALL.base) / (H - WALL.base)
        const xs = x1 - side * 16 * e
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(xs, y - 10 * e); ctx.stroke()
      }
      // светлая кромка у пола
      ctx.strokeStyle = rgb(L.accent, 0.14)
      ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.moveTo(x1, WALL.base - 6); ctx.lineTo(x1 - side * 16, H); ctx.stroke()
      ctx.restore()
    }

    // плинтус: где стена становится полом
    ctx.strokeStyle = rgb(mixc(L.ground, [0, 0, 0], 0.4), 0.9)
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(0, WALL.base); ctx.lineTo(W, WALL.base); ctx.stroke()
  }

  // ── ДВЕРЬ (Hades) ─────────────────────────────────────────────────
  // Пока комната не зачищена — тёмный проём. Зачищена — светится золотом.
  // Это единственный способ уйти из комнаты: войти в дверь самому.
  function drawDoor(t, locked = false) {
    const d = st.door
    if (!d) return
    const open = d.open && !locked
    ctx.save()
    ctx.translate(d.x, d.y)
    // проём: арка в стене
    ctx.beginPath()
    ctx.moveTo(-d.r, d.r)
    ctx.lineTo(-d.r, -d.r * 0.3)
    ctx.quadraticCurveTo(0, -d.r * 1.35, d.r, -d.r * 0.3)
    ctx.lineTo(d.r, d.r)
    ctx.closePath()
    ctx.fillStyle = open ? 'rgba(12,9,4,.92)' : 'rgba(8,6,10,.95)'
    ctx.fill()
    ctx.lineWidth = 2.4
    ctx.strokeStyle = open ? '#ffcf4a' : '#2b2438'
    ctx.stroke()
    // заперто — засов (Hades: дверь босса заперта, пока он жив)
    if (locked) {
      ctx.strokeStyle = '#5a4d70'
      ctx.lineWidth = 3.4
      ctx.beginPath()
      ctx.moveTo(-d.r * 0.7, -d.r * 0.55); ctx.lineTo(d.r * 0.7, d.r * 0.2)
      ctx.moveTo(d.r * 0.7, -d.r * 0.55); ctx.lineTo(-d.r * 0.7, d.r * 0.2)
      ctx.stroke()
    }
    if (open) {
      // свет из проёма + лучи
      const g = d.glow
      ctx.save()
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 3)
      ctx.fillStyle = '#ffcf4a'
      ctx.beginPath()
      ctx.moveTo(-d.r, d.r); ctx.lineTo(-d.r, -d.r * 0.3)
      ctx.quadraticCurveTo(0, -d.r * 1.35, d.r, -d.r * 0.3)
      ctx.lineTo(d.r, d.r); ctx.closePath(); ctx.fill()
      ctx.restore()
      // лучи на пол
      ctx.save()
      ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t * 2.2)
      ctx.strokeStyle = '#ffcf4a'
      ctx.lineWidth = 1.4
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath()
        ctx.moveTo(i * 7, d.r)
        ctx.lineTo(i * 15, d.r + 40)
        ctx.stroke()
      }
      ctx.restore()
      // подпись
      ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffe6a8'
      ctx.shadowBlur = 8; ctx.shadowColor = '#ffcf4a'
      ctx.fillText('дверь', 0, -d.r * 1.6)
    }
    ctx.restore()
  }

  // ── ХАОС-ДВЕРЬ (Hades: Chaos Gate) ───────────────────────────────
  // Фиолетовая, в стороне от обычной. Заходишь добровольно: урон удваивается,
  // зато дар даётся бесплатно. Всё равно стоит ли.
  function drawChaos(t) {
    const c = st.chaos
    if (!c || c.taken) return
    const pulse = 0.55 + 0.3 * Math.sin(t * 2.2)
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.beginPath()
    ctx.moveTo(-16, 16)
    ctx.lineTo(-16, -5)
    ctx.quadraticCurveTo(0, -23, 16, -5)
    ctx.lineTo(16, 16)
    ctx.closePath()
    ctx.fillStyle = 'rgba(20,6,32,.94)'
    ctx.fill()
    ctx.lineWidth = 2.6
    ctx.strokeStyle = '#b06bff'
    ctx.shadowBlur = 16
    ctx.shadowColor = '#b06bff'
    ctx.stroke()
    ctx.shadowBlur = 0
    // знак «хаоса» — сломанный круг
    ctx.strokeStyle = 'rgba(200,139,255,' + pulse + ')'
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.arc(0, -2, 8, 0.5, 4.2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-5, 5); ctx.lineTo(5, -8)
    ctx.stroke()
    ctx.font = 'bold 9px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#c48bff'
    ctx.fillText('хаос', 0, 28)
    ctx.restore()
  }

  // Тень фигуры на земле. Без неё всё «висит в воздухе» — это главная
  // причина, по которой сцена выглядела плоской.
  function groundShadow(x, y, rx, alpha = 0.5) {
    ctx.save()
    ctx.fillStyle = `rgba(0,0,0,${alpha})`
    ctx.beginPath()
    ctx.ellipse(x, y, rx, rx * 0.3, 0, 0, 7)
    ctx.fill()
    ctx.restore()
  }

  // ── Отрисовка ──
  function fit() {
    const dpr = Math.min(2, devicePixelRatio || 1)
    const r = cv.getBoundingClientRect()
    // Холст на кадр схлопнулся (шапка Telegram, поворот, клавиатура).
    // Обнулять размер и масштаб нельзя: следующий resize может не прийти,
    // и игрок вернётся в пустой экран. Лучше оставить последний рабочий
    // кадр — вернётся, когда размер придёт в норму.
    if (!(r.width > 0) || !(r.height > 0)) return
    cv.width = Math.round(r.width * dpr)
    cv.height = Math.round(r.height * dpr)
    ctx.setTransform(dpr * (r.width / W), 0, 0, dpr * (r.height / H), 0, 0)
  }

  const rgb = (a, al = 1) => `rgba(${a[0]},${a[1]},${a[2]},${al})`
  const mixc = (a, b, w) => a.map((v, i) => Math.round(v * (1 - w) + b[i] * w))

  // Стихия локации из контента (Земля/Вода/Огонь/Воздух/Эфир/Ум/Сознание).
  const L = st.look || st.o?.look || { ground: [58, 42, 32], ground2: [40, 28, 22],
    accent: [214, 140, 74], motif: 'roots', prop: 'tree', sky: [26, 17, 14] }

  function draw(t) {
    const p = st.player
    ctx.clearRect(0, 0, W, H)
    // Тряска (Hades: screen shake). Смещаем ВСЮ сцену: пол, стены, оков,
    // садхаку. Сдвигать только пол — значит оки остаются на месте и удар
    // по-прежнему не читается.
    if (st.shake > 0.2) {
      const k = st.shake
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k)
    }

    // фон: стихия локации + состояние гун
    const tint = st.tint || [40, 32, 58]
    const g0 = ctx.createLinearGradient(0, 0, 0, H)
    g0.addColorStop(0, rgb(L.sky))
    g0.addColorStop(0.5, rgb(mixc(tint, L.sky, 0.35)))
    g0.addColorStop(1, rgb(mixc(L.sky, [0, 0, 0], 0.55)))
    ctx.fillStyle = g0
    ctx.fillRect(0, 0, W, H)

    // пыль света
    ctx.save()
    for (let i = 0; i < 26; i++) {
      const sx = (i * 97) % W, sy = ((i * 53) % H)
      const tw = 0.15 + 0.15 * Math.sin(t * 0.6 + i)
      ctx.fillStyle = `rgba(255,235,190,${tw * (L.motif === 'stars' ? 0.5 : 1)})`
      ctx.beginPath()
      ctx.arc(sx, sy + Math.sin(t * 0.3 + i) * 6, 1.1, 0, 7)
      ctx.fill()
    }
    ctx.restore()

    // ── ЗЕМЛЯ: платформа с краем, а не плоский квадрат ───────────────
    // Плоский повёрнутый квадрат читался как «квадрат». В Hades и в
    // Into the Breach пол — это приподнятая площадка: видно её толщину,
    // за краем — темнота. Три слоя: тень, боковая стенка, верх.
    const FL = { y: 168, half: 300, thick: 26 }
    const iso = (fn) => {
      ctx.save()
      ctx.translate(W / 2, FL.y)
      ctx.scale(1, 0.5)
      ctx.rotate(Math.PI / 4)
      fn()
      ctx.restore()
    }

    // 1) падающая тень площадки на «нижнюю» пустоту
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.fillStyle = '#000'
    iso(() => ctx.fillRect(-FL.half, -FL.half, FL.half * 2, FL.half * 2))
    ctx.restore()

    // 2) боковая стенка: тот же квадрат, сдвинутый вниз — видно толщину
    ctx.save()
    ctx.fillStyle = rgb(mixc(L.ground2, [0, 0, 0], 0.55), 1)
    iso(() => ctx.fillRect(-FL.half, -FL.half + FL.thick * 2, FL.half * 2, FL.half * 2))
    ctx.restore()

    // 3) верх площадки
    iso(() => {
      ctx.fillStyle = rgb(L.ground, 0.62)
      ctx.fillRect(-FL.half, -FL.half, FL.half * 2, FL.half * 2)
      // швы плит — тонкие, чтобы читалась кладка, а не сетка
      ctx.strokeStyle = rgb(L.accent, 0.10)
      ctx.lineWidth = 1.2
      for (let i = -FL.half; i <= FL.half; i += 60) {
        ctx.beginPath(); ctx.moveTo(i, -FL.half); ctx.lineTo(i, FL.half); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(-FL.half, i); ctx.lineTo(FL.half, i); ctx.stroke()
      }
    })

    // 4) светлая кромка сверху — «край» платформы
    ctx.save()
    ctx.strokeStyle = rgb(L.accent, 0.32)
    ctx.lineWidth = 1.6
    iso(() => ctx.strokeRect(-FL.half, -FL.half, FL.half * 2, FL.half * 2))
    ctx.restore()

    // 5) вокруг площадки — темнота: за краем пропасть, а не фон
    ctx.save()
    const vg = ctx.createRadialGradient(W / 2, FL.y + 190, 90, W / 2, FL.y + 190, 400)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(0,0,0,.62)')
    ctx.fillStyle = vg
    ctx.fillRect(0, FL.y - 40, W, H - FL.y + 40)
    ctx.restore()

    // ── УЗОР ЗЕМЛИ: своя стихия ─────────────────────────────────────────
    ctx.save()
    const acc = rgb(L.accent, 1)
    if (L.motif === 'roots') {
      ctx.globalAlpha = 0.85
      for (const [rx, ry, rr, rot] of [[70, 250, 150, 0.1], [352, 330, 130, -0.12], [210, 585, 190, 0.03]]) {
        ctx.fillStyle = rgb(mixc(L.ground2, [0, 0, 0], 0.4), 0.7)
        ctx.save(); ctx.translate(rx, ry); ctx.rotate(rot)
        ctx.beginPath(); ctx.ellipse(0, 0, rr, 9, 0, 0, 7); ctx.fill()
        ctx.restore()
      }
    } else if (L.motif === 'water') {
      // рябь: расходящиеся кольца
      ctx.strokeStyle = rgb(L.accent, 0.22)
      ctx.lineWidth = 1.6
      for (let k = 0; k < 5; k++) {
        const ph = (t * 0.32 + k * 0.2) % 1
        ctx.globalAlpha = 0.5 * (1 - ph)
        ctx.beginPath()
        ctx.ellipse(206, 470, 24 + ph * 250, (24 + ph * 250) * 0.5, 0, 0, 7)
        ctx.stroke()
      }
    } else if (L.motif === 'embers') {
      // трещины, из которых идёт свет
      ctx.lineCap = 'round'
      for (let k = 0; k < 7; k++) {
        const bx = 40 + (k * 137) % 340, by = 250 + (k * 83) % 320
        const pulse = 0.4 + 0.35 * Math.sin(t * 1.6 + k)
        ctx.strokeStyle = `rgba(255,132,52,${0.35 + pulse * 0.35})`
        ctx.lineWidth = 2.2
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.lineTo(bx + 22, by - 8)
        ctx.lineTo(bx + 34, by + 12)
        ctx.lineTo(bx + 58, by + 2)
        ctx.stroke()
        // искра вверх
        ctx.fillStyle = `rgba(255,190,90,${pulse * 0.5})`
        ctx.beginPath()
        ctx.arc(bx + 34 + Math.sin(t * 2 + k) * 5, by + 12 - (t * 22 + k * 30) % 40, 1.6, 0, 7)
        ctx.fill()
      }
    } else if (L.motif === 'wind') {
      ctx.strokeStyle = rgb(L.accent, 0.24)
      ctx.lineWidth = 2
      for (let k = 0; k < 6; k++) {
        const y = 240 + k * 60
        const off = (t * 40 + k * 90) % (W + 200) - 100
        ctx.beginPath()
        ctx.moveTo(off - 90, y)
        ctx.bezierCurveTo(off - 30, y - 12, off + 40, y + 12, off + 100, y)
        ctx.stroke()
      }
    } else if (L.motif === 'sound') {
      // звуковые кольна от центра
      ctx.strokeStyle = rgb(L.accent, 0.3)
      for (let k = 0; k < 4; k++) {
        const ph = (t * 0.4 + k * 0.25) % 1
        ctx.globalAlpha = 0.55 * (1 - ph)
        ctx.lineWidth = 2.4
        ctx.beginPath()
        ctx.ellipse(206, 430, 20 + ph * 300, (20 + ph * 300) * 0.42, 0, 0, 7)
        ctx.stroke()
      }
    } else if (L.motif === 'stars') {
      for (let k = 0; k < 22; k++) {
        const sx = (k * 89) % W, sy = 230 + ((k * 131) % 340)
        const tw = 0.3 + 0.5 * Math.abs(Math.sin(t * 0.8 + k))
        ctx.fillStyle = rgb(L.accent, tw * 0.8)
        ctx.beginPath()
        ctx.arc(sx, sy, 1.5, 0, 7); ctx.fill()
        ctx.strokeStyle = rgb(L.accent, tw * 0.35)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(sx - 5, sy); ctx.lineTo(sx + 5, sy)
        ctx.moveTo(sx, sy - 5); ctx.lineTo(sx, sy + 5)
        ctx.stroke()
      }
    } else if (L.motif === 'petals') {
      for (let k = 0; k < 16; k++) {
        const ph = (t * 0.09 + k * 0.0625) % 1
        const px = 20 + (k * 103) % 372
        const py = 150 + ph * 430 + Math.sin(t * 0.8 + k) * 8
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(t * 0.5 + k)
        ctx.fillStyle = `rgba(255,232,170,${0.5 * (1 - ph * 0.7)})`
        ctx.beginPath()
        ctx.ellipse(0, 0, 3.4, 1.6, 0, 0, 7)
        ctx.fill()
        ctx.restore()
      }
    }
    ctx.restore()

    // ── СИЛУЭТЫ ПО СТИХИИ (ориентиры на горизонте) ──────────────────────
    const props = [[58, 210, 0.9], [366, 196, 0.72], [70, 505, 0.8], [356, 520, 0.95]]
    const dark = rgb(mixc(L.ground2, [0, 0, 0], 0.62), 0.92)
    for (const [tx, ty, sc] of props) {
      ctx.fillStyle = dark
      if (L.prop === 'tree') {
        ctx.fillRect(tx - 3 * sc, ty - 42 * sc, 6 * sc, 42 * sc)
        ctx.beginPath(); ctx.arc(tx, ty - 50 * sc, 22 * sc, 0, 7); ctx.fill()
      } else if (L.prop === 'reeds') {
        for (let r = -2; r <= 2; r++) {
          ctx.fillRect(tx + r * 5 * sc - 1.4, ty - (36 - Math.abs(r) * 7) * sc, 2.8, (36 - Math.abs(r) * 7) * sc)
        }
      } else if (L.prop === 'spire') {
        ctx.beginPath()
        ctx.moveTo(tx - 7 * sc, ty); ctx.lineTo(tx, ty - 48 * sc); ctx.lineTo(tx + 7 * sc, ty)
        ctx.closePath(); ctx.fill()
      } else if (L.prop === 'column') {
        ctx.fillRect(tx - 4 * sc, ty - 60 * sc, 8 * sc, 60 * sc)
        ctx.fillRect(tx - 8 * sc, ty - 64 * sc, 16 * sc, 5 * sc)
        ctx.fillRect(tx - 7 * sc, ty - 4 * sc, 14 * sc, 4 * sc)
      } else if (L.prop === 'arch') {
        ctx.lineWidth = 5 * sc
        ctx.beginPath()
        ctx.arc(tx, ty - 6 * sc, 20 * sc, Math.PI, 0)
        ctx.stroke()
      } else if (L.prop === 'obelisk') {
        ctx.beginPath()
        ctx.moveTo(tx - 5 * sc, ty); ctx.lineTo(tx - 3 * sc, ty - 46 * sc)
        ctx.lineTo(tx, ty - 54 * sc); ctx.lineTo(tx + 3 * sc, ty - 46 * sc)
        ctx.lineTo(tx + 5 * sc, ty)
        ctx.closePath(); ctx.fill()
      } else if (L.prop === 'crown') {
        ctx.beginPath()
        ctx.arc(tx, ty - 26 * sc, 24 * sc, Math.PI, 0)
        ctx.fill()
      }
    }

    // просящие (сева)
    for (const w of st.wares) {
      groundShadow(w.x, w.y + 2, 8, 0.36)
      if (w.done) continue
      ctx.save()
      ctx.translate(w.x, w.y)
      if (w.near) {
        ctx.strokeStyle = 'rgba(242,196,109,.8)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(0, -18, 30, 0, 7)
        ctx.stroke()
      }
      drawWareArt(ctx, w, t)
      ctx.restore()
      if (w.near) {
        ctx.font = '11px var(--font-display), Georgia, serif'
        ctx.fillStyle = '#e9dcc4'
        ctx.textAlign = 'center'
        ctx.fillText(w.name, w.x, w.y + 40)
      }
    }

    // Стены комнаты — после пола и реквизита (они стоят на нём), но до оков
    // и дверей, чтобы замкнуть комнату позади всего живого.
    drawWalls(t)
    drawSpring(t)
    drawChaos(t)

    // Комната владыки: дверь закрыта, пока он не падёт (Hades: босс-комната).
    const bossRoom = st.foes.some((f) => f.isBoss && !f.dead && !f.pacified)
    drawDoor(t, bossRoom && !st.roomCleared)

    // Монеты (драхмы) — золотые кружочки, лежат где упали.
    for (const c of st.coins) {
      if (c.taken) continue
      const bob = Math.sin(t * 3 + c.x * 0.1) * 1.6
      ctx.save()
      ctx.translate(c.x, c.y + bob)
      ctx.fillStyle = 'rgba(0,0,0,.45)'
      ctx.beginPath()
      ctx.ellipse(0, 6 - bob, 5, 2, 0, 0, 7)
      ctx.fill()
      ctx.fillStyle = '#ffcf4a'
      ctx.shadowBlur = 8
      ctx.shadowColor = 'rgba(255,207,74,.8)'
      ctx.beginPath()
      ctx.ellipse(0, 0, 4.4, 4.4, 0, 0, 7)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.strokeStyle = 'rgba(0,0,0,.6)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
    }

    // оковы
    for (const f of st.foes) {
      if (f.dead) continue
      // тень на земле — фигура стоит, а не висит
      const sr = f.isBoss ? 26 : 11
      groundShadow(f.x, f.y + sr * 0.85, sr, f.isBoss ? 0.55 : 0.42)
      if (f.pacified) {
        // На месте освобождённой оковы остаётся цветок — след, а не добыча.
        ctx.save()
        ctx.translate(f.x, f.y + 4)
        drawFlowerArt(ctx, t)
        ctx.restore()
        continue
      }
      drawFoe(f, t)
    }

    // садхака
    drawPlayer(p, t)

    // HUD
    updateHud(p)
  }

  function drawFoe(f, t) {
    ctx.save()
    ctx.translate(f.x, f.y)

    // Фигура — из общего модуля рисунка (тушь пером + неон, стиль Hades).
    // Здесь только игровые сигналы поверх неё: замах, дуги, стойкость, плашки.
    drawFoeArt(ctx, f, t)

    // счётчик спокойствия — единственный путь
    if (f.calm > 0.02) {
      ctx.strokeStyle = 'rgba(242,196,109,.95)'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      const frac = Math.min(1, f.calm / f.calmMax)
      ctx.arc(0, -2, 28, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
      ctx.stroke()
      ctx.lineCap = 'butt'
    }

    // ── КОЛЬЦО ЗАМАХА (Nine Sols) ──────────────────────────────────────
    // Кольцо вокруг оки сжимается, пока она замахивается. Сомкнулось —
    // жми дефлект. Это главный визуальный сигнал: его видно за долю секунды
    // до удара, и попасть в окно реально.
    if (f.state === 'telegraph' && f.charge > 0.02) {
      const c = f.charge
      const inWin = f.timer <= st.o.parryWindow
      const r = 54 - c * 30          // 54 → 24
      ctx.lineWidth = inWin ? 4 : 2.2
      ctx.strokeStyle = inWin
        ? 'rgba(255,232,150,1)'
        : `rgba(255,${Math.round(150 - c * 90)},90,${0.5 + c * 0.4})`
      if (inWin) { ctx.shadowBlur = 14; ctx.shadowColor = '#ffd76a' }
      ctx.beginPath()
      ctx.arc(0, -2, r, 0, 7)
      ctx.stroke()
      ctx.shadowBlur = 0
      // метка окна — чтобы игрок понимал, когда жать
      if (inWin) {
        ctx.font = 'bold 11px sans-serif'
        ctx.fillStyle = '#ffe89a'
        ctx.textAlign = 'center'
        ctx.fillText('ДЕФЛЕКТ', 0, -r - 8)
      }
    }
    if (f.stun > 0) {
      ctx.font = 'bold 9px sans-serif'
      ctx.fillStyle = 'rgba(157,255,90,.9)'
      ctx.textAlign = 'center'
      ctx.fillText('ошеломлена', 0, -56)
    }

    // ── ВЛАДЫКА (Slay the Spire: intent над головой) ───────────────────
    if (f.isBoss) {
      const R = f.reach || 48
      // стойкость: кольцо вокруг владыки, тает сама
      if (f.block > 0) {
        ctx.strokeStyle = 'rgba(79,232,255,.8)'
        ctx.lineWidth = 2.6
        ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(79,232,255,.6)'
        ctx.beginPath(); ctx.arc(0, -2, R + 14, 0, 7); ctx.stroke()
        ctx.shadowBlur = 0
        ctx.font = 'bold 9px sans-serif'
        ctx.fillStyle = '#8ff4ff'
        ctx.textAlign = 'center'
        ctx.fillText(`стойкость ${Math.ceil(f.block)}`, 0, R + 34)
      }
      // фаза
      ctx.font = 'bold 9px sans-serif'
      ctx.fillStyle = f.phase >= 2 ? '#ff9a6a' : 'rgba(207,195,176,.75)'
      ctx.textAlign = 'center'
      ctx.fillText(f.phase >= 2 ? 'в бешенстве' : `владыка · фаза ${f.phase}`, 0, -R - 22)
      // запас спокойствия — длинная дуга под владыкой
      const cf = Math.min(1, f.calm / f.calmMax)
      ctx.strokeStyle = 'rgba(242,196,109,.9)'
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(0, -2, R + 6, -Math.PI / 2, -Math.PI / 2 + cf * Math.PI * 2)
      ctx.stroke()
      ctx.lineCap = 'butt'
      // метка порога 50% — как разделитель фаз
      if (f.thresholdAt && !f.thresholdDone) {
        const ang = -Math.PI / 2 + 0.5 * Math.PI * 2
        const tx = Math.cos(ang) * (R + 6), ty = Math.sin(ang) * (R + 6) - 2
        ctx.strokeStyle = '#ff5a5a'
        ctx.lineWidth = 2.4
        ctx.beginPath()
        ctx.moveTo(tx, ty - 7); ctx.lineTo(tx, ty + 7)
        ctx.stroke()
      }
    }

    // название приёма + значок намерения (Slay the Spire)
    if (f.isBoss && f.move && f.state !== 'idle') {
      const icon = INTENT_ICON[f.intent] || INTENT_ICON.attack
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      const tw = ctx.measureText(f.move.name).width
      const y = -R - 44
      ctx.fillStyle = 'rgba(8,7,12,.88)'
      ctx.fillRect(-tw / 2 - 16, y - 11, tw + 32, 20)
      ctx.strokeStyle = 'rgba(210,59,59,.9)'
      ctx.lineWidth = 1
      ctx.strokeRect(-tw / 2 - 16, y - 11, tw + 32, 20)
      ctx.fillStyle = icon.color
      ctx.textAlign = 'left'
      ctx.fillText(icon.mark, -tw / 2 - 11, y + 3)
      ctx.fillStyle = '#f0e7d6'
      ctx.textAlign = 'left'
      ctx.fillText(f.move.name, -tw / 2 + 2, y + 3)
      ctx.textAlign = 'center'
    }

    // Имя оковы — крупно и с тенью, иначе в бою не читается.
    const nmF = f.isBoss ? 'bold 13px Georgia, serif' : 'bold 11px Georgia, serif'
    ctx.font = nmF
    ctx.textAlign = 'center'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,.85)'
    ctx.strokeText(f.name, 0, f.isBoss ? 70 : 40)
    ctx.fillStyle = f.isBoss ? '#ffe6a8' : '#cfc3b0'
    ctx.fillText(f.name, 0, f.isBoss ? 70 : 40)
    ctx.restore()
  }

  function drawPlayer(p, t) {
    ctx.save()
    ctx.translate(p.x, p.y)
    if (p.invuln > 0 && Math.floor(t * 20) % 2 === 0) ctx.globalAlpha = 0.4

    // щит — кольцо вокруг садхака (Slay the Spire: block)
    if (p.shield > 0) {
      const s = 20 + p.shield * 1.3
      ctx.strokeStyle = 'rgba(143,244,255,.75)'
      ctx.lineWidth = 2.4
      ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(79,232,255,.7)'
      ctx.beginPath()
      ctx.ellipse(0, 2, s, s * 0.52, 0, 0, 7)
      ctx.stroke()
      ctx.shadowBlur = 0
    }
    // серия дефлектов — золотое кольцо горит, пока серия жива
    if (p.combo > 0) {
      const k = Math.max(0, p.comboT / (st.o.comboWindow || 3.2))
      ctx.strokeStyle = `rgba(255,207,74,${0.35 + k * 0.5})`
      ctx.lineWidth = 1.6 + Math.min(4, p.combo * 0.35)
      ctx.beginPath()
      ctx.ellipse(0, 18, 27, 8.5, 0, 0, 7)
      ctx.stroke()
    }

    // свечение ауры садхака
    if (p.inSamadhi) {
      const gr = ctx.createRadialGradient(0, -8, 4, 0, -8, 44)
      gr.addColorStop(0, 'rgba(255,255,255,.35)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gr
      ctx.beginPath()
      ctx.arc(0, -8, 44, 0, 7)
      ctx.fill()
    }

    drawSadhakaArt(ctx, p.facing, { flip: p.facing < 0 })

    // «жжёт» (гхрна): ожог видно на садхаке. «сон» (нидра): шаг вялый —
    // садхака бледнеет. Иначе оба состояния чувствуются, но не читаются.
    if (p.burn > 0) {
      const t2 = performance.now() / 1000
      for (let k = 0; k < 5; k++) {
        const fx = (k - 2) * 5 + Math.sin(t2 * 7 + k) * 2.5
        const fy = -34 - ((t2 * 26 + k * 9) % 26)
        ctx.globalAlpha = 0.75
        ctx.fillStyle = k % 2 ? '#ffd166' : '#ff7a2d'
        ctx.beginPath()
        ctx.ellipse(fx, fy, 2.6, 4.4, 0, 0, 7)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    if (p.slow > 0) {
      ctx.globalAlpha = 0.34 * p.slow
      ctx.fillStyle = '#8f86c9'
      ctx.beginPath(); ctx.ellipse(0, -22, 22, 30, 0, 0, 7); ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }

  // ── HUD-обновление ──
  const $ = (id) => root.querySelector('#' + id)

  // Слотов мантр больше нет — одна мантра, имя и цена прямо на кнопке.
  const mdesc = h('div', { class: 'fm-desc' })
  root.querySelector('.field-ui')?.append(mdesc)
  let mdescT = 0
  function showMantraDesc(m) {
    mdesc.textContent = m.desc || ''
    mdesc.classList.add('on')
    mdescT = 3.2
  }

  // Серия — в левую колонку, под гуны. Центр экрана должен быть пустым: это бой.
  const comboEl = h('div', { class: 'fcombo' })
  // Часы смерти (Hades: Death Clock) — череп, который загорается, когда
  // мир начинает злиться.
  const clockEl = h('div', { class: 'fclock', id: 'fclock' },
    h('i', {}, '☬'), h('b', { id: 'fclock-t' }, '0:00'))
  const clockWrap = h('div', { class: 'fclock-wrap' }, deaths, clockEl)
  root.querySelector('.field-ui')?.append(clockWrap)

  // Нефрит, надетый на этот побег (Hades: keepsake). Виден всегда мелким
  // значком у мантры — один на побег, поэтому больше некуда спрятать.
  const ks = st.keepsake && KEEPSAKE_BY_ID[st.keepsake]
  if (ks) dock.append(h('div', { class: 'fjade', id: 'fjade' },
    h('i', {}, '◈'), h('b', {}, ks.name)))

  function updateHud(p) {
    $('fg-s').textContent = fmt(p.guna.s)
    $('fg-r').textContent = fmt(p.guna.r)
    $('fg-t').textContent = fmt(p.guna.t)
    $('fg-pram').style.opacity = p.prama ? '1' : '.15'
    $('sh-v').textContent = Math.floor(p.shakti)
    $('sh-b').style.width = (p.shakti / p.shaktiMax * 100) + '%'
    $('ps-v').textContent = Math.floor(p.psychic)
    $('ps-b').style.width = (p.psychic / p.psychicMax * 100) + '%'
    $('av-v').textContent = Math.floor(st.avidya)
    $('av-b').style.width = (st.avidya / st.o.avidyaMax * 100) + '%'
    $('fhp-b').style.width = (p.hp / p.maxHp * 100) + '%'
    // щит — золотой отрезок перед жизнью, накладывается слева
    $('fshield-b').style.width = (p.shield / st.o.shieldMax * 100) + '%'
    if ($('fp-n')) $('fp-n').textContent = String((st.o.coins || 0) + st.coinsTaken)

    // часы смерти: считают вверх, краснеют после порога
    if ($('fclock-t')) {
      const cs = Math.floor(st.clock)
      $('fclock-t').textContent = Math.floor(cs / 60) + ':' + String(cs % 60).padStart(2, '0')
    }
    $('fclock')?.classList.toggle('rage', !!st.rageOn)

    // состояния от оков: ожог, вялость, слабость, хаос-проклятие
    const chips = []
    if (p.burn > 0) chips.push(['ожог', 'f-burn'])
    if (p.slow > 0) chips.push(['вялость', 'f-slow'])
    if (p.weak > 0) chips.push(['слабость', 'f-weak'])
    if (p.chaosCurse) chips.push(['хаос ×2', 'f-chaos'])
    const sEl = $('fstates')
    if (sEl) {
      clear(sEl)
      for (const [txt, cls] of chips) sEl.append(h('span', { class: `fstate ${cls}` }, txt))
    }
    if ($('fdeaths-n')) $('fdeaths-n').textContent = String(st.deaths || 0)
    $('fdeaths')?.classList.toggle('on', (st.deaths || 0) > 0)

    // нефрит: подсказка, что он на тебе (нажатие показывает, что именно)

    // серия
    if (p.combo > 0) {
      comboEl.className = 'fcombo on'
      comboEl.textContent = `серия ${p.combo}`
    } else comboEl.className = 'fcombo'

    // мантра: имя и цена на кнопке, «серая» если не хватает Ци
    const m = mantraById(p.mantraId)
    const nmEl = $('fm-nm'), costEl = $('fm-cost')
    if (nmEl) nmEl.textContent = m.name
    if (costEl) costEl.textContent = m.cost ? `${m.cost} Ци` : '—'
    $('fb-mantra')?.classList.toggle('poor', p.psychic < m.cost)

    // подсказка: какая ока сейчас в окне
    const hint = parryHint(st)
    if (hint) {
      const f = hint.foe
      clear(prompt)
      prompt.append(h('span', { class: 'fp-name' }, f.name),
        h('span', { class: 'fp-sep' }, ' · '),
        h('span', { class: hint.timer <= st.o.parryWindow ? 'fp-window' : 'fp-dark' },
          hint.timer <= st.o.parryWindow ? 'ЖМИ ДЕФЛЕКТ' : 'замахивается'))
    } else {
      const near = nearestFoeIdx()
      if (near >= 0) {
        const f = st.foes[near]
        clear(prompt)
        prompt.append(h('span', { class: 'fp-name' }, f.name),
          h('span', { class: 'fp-sep' }, ' · '),
          h('span', { class: f.shownLight === 'light' ? 'fp-light' : 'fp-dark' },
            f.shownLight === 'unknown' ? 'аура не видна' : f.shownLight === 'light' ? 'видья' : 'авидья'))
      } else clear(prompt)
    }
  }
  const fmt = (v) => (Number.isInteger(v) ? v : v.toFixed(1))
  function nearestFoeIdx() {
    let best = -1, bd = 1e9
    for (let i = 0; i < st.foes.length; i++) {
      const f = st.foes[i]
      if (f.dead || f.pacified) continue
      const d = Math.hypot(st.player.x - f.x, st.player.y - f.y)
      if (d < st.o.calmRadius && d < bd) { bd = d; best = i }
    }
    return best
  }

  // ── Цикл ──
  let last = performance.now()
  let alive = true
  let stepT = 0
  let avT = 0
  let avWasHigh = false
  let hintT = 11        // подсказка управления живёт 11 секунд и гаснет
  let paused = false    // пауза (Hades: можно остановиться и уйти)
  // Фон локации: своя нота на каждую стихию (Земля/Вода/Огонь/Воздух/Эфир/Ум/Сознание)
  startDrone(opts.floor ?? 0)
  function frame(now) {
    if (!alive) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    // Пауза: рисуем сцену (она живая), но мир не идёт. Иначе оковы долбят
    // садхаку, пока игрок читает меню.
    if (paused) { draw(now / 1000); requestAnimationFrame(frame); return }

    // ввод
    const input = {}
    let dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0)
    let dy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0)
    if (dx === 0 && dy === 0 && touch) {
      const tdx = touch.x - st.player.x
      const tdy = touch.y - st.player.y
      if (Math.hypot(tdx, tdy) > 14) { dx = tdx; dy = tdy }
    }
    if (dx || dy) { input.dx = dx; input.dy = dy }

    if (!st.outcome) {
      const ev = stepField(st, dt, input)
      for (const e of ev) onEvent(e)
    }
    // Шаги — только когда реально идёшь (иначе машина стоит и не шумит).
    if (dx || dy) {
      stepT += dt
      if (stepT > 0.31) { stepT = 0; fieldSfx.step() }
    } else stepT = 0

    // Подсказка управления гаснет: прочитал — всё, она мешает бою.
    if (hintT > 0) { hintT -= dt; if (hintT <= 0) hint.classList.remove('on') }
    if (mdescT > 0) { mdescT -= dt; if (mdescT <= 0) mdesc.classList.remove('on') }

    // Авидья: высокий гул, тем громче, чем её больше. Слышно без экрана.
    const avR = st.avidya / st.o.avidyaMax
    if (avR > 0.5) {
      avT += dt
      if (avT > 2.4) { avT = 0; fieldSfx.avidya(avR) }
    } else if (avWasHigh) { fieldSfx.avidyaDown() }
    avWasHigh = avR > 0.5

      if (bannerT > 0) {
      bannerT -= dt
      if (bannerT <= 0) banner.classList.remove('on')
    }
    draw(now / 1000)

    if (st.outcome && st.outcome !== 'shown') {
      st.outcome = 'shown'
      finish()
      return
    }
    requestAnimationFrame(frame)
  }

  /** Пауза: мир стоит, остаётся только одно решение — продолжать или уйти. */
  function setPause(on) {
    if (paused === on || st.outcome) return
    paused = on
    if (on) {
      pauseBtn.classList.add('on')
      fieldSfx.pause?.()
      const quit = h('button', {
        class: 'btn ghost',
        onclick: () => { clear(pauseEl); opts.onClose?.(st) },
      }, 'оставить забег')
      const resume = h('button', {
        class: 'btn primary',
        onclick: () => setPause(false),
      }, 'продолжить')
      clear(pauseEl)
      pauseEl.append(
        h('div', { class: 'pause-title' }, 'Пауза'),
        h('p', { class: 'pause-text' },
          st.player.alive
            ? `Освобождено ${st.pacified} · жизни ${Math.round((st.player.hp / st.player.maxHp) * 100)}% · счёт ${st.score}`
            : 'Оставив забег сейчас, ты потеряешь оставшуюся жизнь, но знание и монеты останутся.'),
        h('div', { class: 'btn-row' }, resume, quit),
      )
      root.append(pauseEl)
    } else {
      pauseBtn.classList.remove('on')
      pauseEl.remove()
    }
  }

  function finish() {
    const won = st.player.alive
    const peaceful = st.foes.every((f) => !f.dead)
    const nextFloor = (opts.floor ?? 0) + 1
    alive = false
    stopDrone()
    removeEventListener('keydown', onKeyDown)
    removeEventListener('keyup', onKeyUp)
    removeEventListener('pointerup', onUp)

    // Победа в комнате НЕ показывает экран итога — как в Hades. Ты вошёл
    // в дверь и сразу выбираешь дар. Экран итога остаётся только при смерти
    // (там Hades тоже показывает экран смерти) и в самом конце пути.
    if (won && nextFloor <= 6) {
      opts.onNext?.(nextFloor, st)
      return
    }

    const earned = []
    if (st.pacified > 0) earned.push(['✦', `${st.pacified} оковы снято терпением`])
    if (st.served.size > 0) earned.push(['◈', `сева: ${st.served.size}`])
    if (peaceful && st.pacified > 0) earned.push(['☸', 'без единого удара — чистый путь'])
    if (!peaceful && st.foes.some((f) => f.dead)) earned.push(['⚔', 'сила оставила самскару — придёт в следующей жизни'])
    if (st.krpaUsed) earned.push(['☂', 'под тобой прошла крипа — ты не ударил ни разу'])
    else if (st.krpaMissed) earned.push(['☂', 'зонт тщеславия: милость не достала'])

    const over = h('div', { class: 'field-over' },
      h('h2', {}, won ? 'Путь пройден' : 'Тьма накрыла'),
      h('p', {}, won
        ? (peaceful
          ? 'Семь чакр — и ни одного удара. Путь закончен, но начинается снова.'
          : 'Путь закончен. Часть оков снята силой — самскары это помнят.')
        : 'Ум истощился. Практика — снова: серия гасит неведение, сева даёт духовную силу.'),
      earned.length > 0
        ? h('div', { class: 'field-earns' },
          earned.map(([mark, text]) => h('div', { class: 'fe' }, h('i', {}, mark), h('span', {}, text))))
        : null,
      h('div', { class: 'field-over-stats' },
        h('span', {}, 'освобождено ' + st.pacified),
        h('span', {}, 'сева ' + st.served.size),
        h('span', {}, 'счёт ' + st.score)),
      h('div', { class: 'field-over-btns' },
        // Как в Hades: смерть — это «ещё раз». Жизнь уходит, знание нет.
        !won && opts.onRetry
          ? h('button', { class: 'btn primary', onclick: () => opts.onRetry?.(st) }, 'ещё раз')
          : null,
        h('button', { class: won || !opts.onRetry ? 'btn primary' : 'btn ghost',
          onclick: () => opts.onClose?.(st) },
          won ? 'в начало' : 'к чакрам'),
      ),
    )
    root.append(over)
  }

  requestAnimationFrame(() => { fit(); frame(performance.now()) })
  addEventListener('resize', fit)
  setTimeout(fit, 30)

  return root
}
