// Загрузка контента (content/*.json) в удобные карты.
import cardsData from '@content/cards.json'
import enemiesData from '@content/enemies.json'
import relicsData from '@content/relics.json'
import eventsData from '@content/events.json'
import quotesData from '@content/quotes.json'
import challengesData from '@content/challenges.json'
import trialsData from '@content/trials.json'
import worldsData from '@content/worlds.json'

export const CARDS = cardsData
export const ENEMIES = enemiesData
export const RELICS = relicsData
export const EVENTS = eventsData
export const QUOTES = quotesData
export const CHALLENGES = Object.fromEntries(
  Object.entries(challengesData).filter(([k]) => !k.startsWith('_'))
)

// Лор семи миров-чакр (§16.2a): философия Ананда Марги, «герой идёт по миру».
export const WORLDS = Object.fromEntries(
  Object.entries(worldsData).filter(([k]) => !k.startsWith('_'))
)
// Рамка космологии: санчара → пратисанчара (вступление пути).
export const WORLD_PATH = worldsData._path || null

// Дерево челленджей Ямы/Ниямы (§16.2, идея №16): испытание открывает карту-практику
// навсегда (мета-прогресс). Каждое испытание — поведенческое правило боя; пройдено →
// rewardCard попадает в пул наград. Закрытая карта в наградах не появляется.
export const TRIALS = Object.fromEntries(
  Object.entries(trialsData).filter(([k]) => !k.startsWith('_'))
)

// Все карты, что открываются испытаниями (награда дерева).
export const TRIAL_REWARD_CARDS = Object.values(TRIALS).map((t) => t.rewardCard)

// Доступные испытания: первые неоткрытые из каждой ветви (Яма/Нияма) — остальные
// закрыты «деревом» до прохождения предыдущих. Порядок внутри ветви — order.
// floor — текущий этаж забега: испытание появляется не раньше своего minFloor
// (прогрессивная сложность, как Ascension в StS / Pact of Punishment в Hades).
export function availableTrials(unlocked = [], floor = 0) {
  const byBranch = { yama: [], niyama: [] }
  for (const t of Object.values(TRIALS)) {
    ;(byBranch[t.branch] || (byBranch[t.branch] = [])).push(t)
  }
  const out = []
  for (const branch of Object.keys(byBranch)) {
    const list = byBranch[branch].sort((a, b) => a.order - b.order)
    const next = list.find((t) => !unlocked.includes(t.rewardCard) && (t.minFloor ?? 0) <= floor)
    if (next) out.push(next)
  }
  return out
}

// Четыре ментальности ума (§12.1, Human Society Part 2) — это НЕ классы и не
// «класс души»: психологические типы ума, которые в каждом человеке присутствуют
// одновременно (одна доминирует). Чтобы стать садвипрой, надо развить ВСЕ четыре.
// В игре это мета-прогресс: ментальности растут ПАРАЛЛЕЛЬНО от разных поступков;
// слабая ментальность = недостающий навык = заметные трудности.
export const MENTALITIES = {
  shudra: {
    id: 'shudra',
    name: 'Шудра',
    sanskrit: 'शूद्र',
    order: 0,
    color: '#8a8f98',
    desc: 'Присутствие и труд: ум в настоящем, выносливость, стабильность. Навык — стойкость: больше ХП и терпение к натиску авидьи.',
    focusDesc: '+10 ХП на забег · стойкость к авидье',
    focusHp: 10,
    // Навык по уровням (§12.1): слабая ментальность = недостающий навык.
    skills: [
      'Выносливость ещё не развита: обычное ХП, авидья давит в полную силу.',
      '+4 макс ХП · присутствие настоящего.',
      '+8 макс ХП · натиск авидьи растёт медленнее.',
      '+12 макс ХП · авидья почти не давит со временем.',
    ],
    // Ветви мастерства (ур. 3): зрелая ментальность выбирает направление (§12.1,
    // Human Society Part 2 — зрелость ума = осознанный выбор, а не «стал больше»).
    branches: [
      { id: 'endurance', name: 'Выносливость', desc: '+8 макс ХП сверх обычной зрелости шудры — тело и ум держат дольше.' },
      { id: 'patience', name: 'Терпение', desc: 'Натиск авидьи падает ещё на 1 — присутствие растворяет неведение без спешки.' },
    ],
  },
  kshatriya: {
    id: 'kshatriya',
    name: 'Кшатрия',
    sanskrit: 'क्षत्रिय',
    order: 1,
    color: '#c0392b',
    desc: 'Смелость и борьба за дхарму: прошлое и настоящее, «might is right». Навык — смелость: противостоять давлению, не срываться в перекос.',
    focusDesc: 'Старт с Тапахом и Первым усилием · смелость против перекоса',
    focusCards: ['tapah', 'first_effort'],
    skills: [
      'Смелость ещё не развита: перекос гун давит в полную силу.',
      'Смелость: тамас-перекос не отнимает карту, раджас не удорожает практики.',
      'Смелость: волна авидьи отхлынула — ум устоял без симптома.',
      'Смелость зрелая: перекосы и волны авидьи не шатают ум.',
    ],
    // Ветви мастерства (ур. 3)
    branches: [
      { id: 'shield', name: 'Щит смелости', desc: '+3 блока в начале каждого боя — мужество встаёт перед ударом.' },
      { id: 'valour', name: 'Отвага', desc: 'Первый удар врага в бою смягчён на 2 — смелость не отступает перед первым натиском.' },
    ],
  },
  vipra: {
    id: 'vipra',
    name: 'Випра',
    sanskrit: 'विप्र',
    order: 2,
    color: '#e8e4d8',
    desc: 'Знание и видение структуры: прошлое, настоящее и будущее. Навык — видение: читать интенты и видеть верх колоды.',
    focusDesc: 'Старт со Свадхьяей и Шаочой · видение интентов',
    focusCards: ['svadhyaya', 'shaoca'],
    skills: [
      'Шаги врага скрыты — неведение прячет намерение (развивайте знание).',
      'Видение: намерения врага читаются.',
      'Видение: в начале боя видна верхняя карта колоды.',
      'Видение зрелое: ясность ума читает намерения и колоду.',
    ],
    // Ветви мастерства (ур. 3)
    branches: [
      { id: 'seer', name: 'Провидец', desc: 'В начале боя видны 2 верхние карты колоды — знание заглядывает глубже.' },
      { id: 'clarity', name: 'Ясность', desc: 'В начале каждого хода видна верхняя карта — разум удерживает ясность постоянно.' },
    ],
  },
  vaeshya: {
    id: 'vaeshya',
    name: 'Вайшья',
    sanskrit: 'वैश्य',
    order: 3,
    color: '#c9a227',
    desc: 'Мудрость ресурсов: мутативность, деньги как мера. Навык — мудрое использование: Прана тратится эффективнее, скидки в лавке.',
    focusDesc: '+10 Праны на забег · скидки в лавке',
    focusPrana: 10,
    skills: [
      'Прана тратится без мудрости: лавка в полную цену.',
      'Мудрость: −1 ⚡ ко всем ценам лавки.',
      'Мудрость: −2 ⚡ ко всем ценам лавки.',
      'Мудрость: −3 ⚡ ко всем ценам лавки.',
    ],
    // Ветви мастерства (ур. 3)
    branches: [
      { id: 'merchant', name: 'Купец', desc: 'Скидка лавки ещё −1 ⚡ (итого −4) — мудрость торгуется с миром.' },
      { id: 'giver', name: 'Щедрость', desc: '+5 Праны на старте забега — мудрость, что отдаёт, возвращается.' },
    ],
  },
}

// Порядок ментальностей (социальный цикл Саркара: шудра → кшатрия → випра → вайшья).
export const MENTALITY_ORDER = ['shudra', 'kshatriya', 'vipra', 'vaeshya']

// Уровни развития ментальности: сколько очков нужно для каждого уровня.
// Уровень 0 — стартовый, уровень 3 — зрелость ментальности.
export const MENTALITY_LEVELS = [0, 4, 10, 18]

// Порог «зрелости» ментальности: уровень, при котором она считается развитой.
// Садвипра = все четыре ментальности на этом уровне и выше (Human Society Part 2, гл. 4).
export const SADVIPRA_MIN_LEVEL = 2

export function mentalityLevel(points) {
  let lv = 0
  for (let i = 0; i < MENTALITY_LEVELS.length; i++) {
    if (points >= MENTALITY_LEVELS[i]) lv = i
  }
  return lv
}

export function starterDeck() {
  const deck = []
  for (const card of Object.values(CARDS)) {
    if (card && card.id && card.starter && card.starter > 0) {
      for (let i = 0; i < card.starter; i++) deck.push(card.id)
    }
  }
  return deck
}

export function starterDeckForFocus(focusId) {
  const deck = starterDeck()
  const f = focusId && MENTALITIES[focusId] ? MENTALITIES[focusId] : null
  if (f) {
    for (const id of f.focusCards || []) deck.push(id)
  }
  return deck
}

// «Раскрываемость» цитат (живые цитаты, §исследование): полный перевод и «жизнь»
// открываются, когда термин ПРОЖИТ — сыграна карта, успокоен враг, получена реликвия
// или знание вручено. Подсказка говорит, как раскрыть. Если у цитаты нет носителя
// (понятие практики: гуна, прама, мантра…) — она раскрыта сразу.
export function quoteLiveHint(quoteId) {
  for (const c of Object.values(CARDS)) if (c.quoteId === quoteId) return 'Сыграйте эту карту в бою — знание оживёт.'
  for (const e of Object.values(ENEMIES)) if (e.quoteId === quoteId) return e.isBoss
    ? 'Освободите владыку чакры по пути Ахимсы.'
    : 'Успокойте этого врага, не убивая его.'
  for (const r of Object.values(RELICS)) if (r.quoteId === quoteId) return 'Возьмите эту реликвию — она раскроется в пути.'
  return null
}

// Цитата раскрыта, если термин прожит; без носителя — всегда раскрыта.
export function isQuoteLived(meta, quoteId) {
  if (!quoteLiveHint(quoteId)) return true
  return !!(meta && meta.lived && meta.lived[quoteId])
}

// Пул наград: все карты кроме мусора/овковок и стартовых. Карты, открываемые
// испытаниями (Яма/Нияма), доступны только после прохождения испытания (мета-прогресс).
// Стартовые карты в награды не выпадают, кроме открытых испытанием (напр. Ахимса).
// Аудиотека практики (§16.2, идея №33): «собрать биджа-звуки, забрать в жизнь».
// Звук, прожитый в игре (сыграна карта-носитель или пройдена медитация), записывается
// в личную аудиотеку — и его можно слушать как практику (WebAudio, без файлов).
// Источники сверены с концепт-слоем OKF (omkara, acoustic-roots, mantra).
export const AUDIO_LIBRARY = {
  omkara: {
    id: 'omkara',
    name: 'Пранава',
    sanskrit: 'ॐ',
    emoji: 'ॐ',
    desc: 'Космический звук-семя (Шабда-Брахма): a-u-ma — творение, сохранение, растворение. Его слышат внутри, а не произносят.',
    source: 'Ānanda Vacanāmrtam, ч. 34, «Praṇava»; OKF oṃkāra',
    cardIds: ['om'],
  },
  kiirtana: {
    id: 'kiirtana',
    name: 'Кииртана',
    sanskrit: 'कीर्तन',
    emoji: '◉',
    desc: 'Пение Имени — сиддха-мантра. Пять минут искреннего кииртана меняют состояние ума.',
    source: '«Saḿgiita: Song, Dance and Instrumental Music», дискурс о кииртане',
    cardIds: ['nama_kevalam', 'bhajan', 'sangacchadhvam', 'smarana', 'bavanam_kevalam'],
  },
  bija: {
    id: 'bija',
    name: 'Биджа-мантра',
    sanskrit: 'बीज',
    emoji: '✦',
    desc: 'Акустический корень — звук-семя, которое поддерживает каждое действие и управляет пропенситивностью ума.',
    source: 'Ānanda Vacanāmrtam, ч. 14, «Acoustic Roots»; OKF acoustic-roots',
    cardIds: ['bija'],
  },
  japa: {
    id: 'japa',
    name: 'Джапа',
    sanskrit: 'जप',
    emoji: '✴',
    desc: 'Медитативное повторение мантры: «манана» — думать, «трана» — освобождать.',
    source: '«Subhāṣita Saṃgraha», ч. 24, «Incantation and Human Progress»; OKF mantra',
    cardIds: ['japa'],
  },
  mantra: {
    id: 'mantra',
    name: 'Мантра',
    sanskrit: 'मन्त्र',
    emoji: '🕉',
    desc: '«Mananāt tārayet yastu sah mantrah» — то, что повторением ума ведёт к освобождению. Проснувшаяся мантра несёт микровиты.',
    source: '«Subhāṣita Saṃgraha», ч. 10, «Mantra Caetanya»; OKF mantra',
    cardIds: ['guru_mantra', 'madhuvidya', 'samyama', 'vidyadhara', 'siddha'],
  },
  pranayama: {
    id: 'pranayama',
    name: 'Пранаяма',
    sanskrit: 'प्राणायाम',
    emoji: '〰',
    desc: 'Дыхание — мост между телом и умом. Контроль дыхания с идеацией Высшего помогает концентрации.',
    source: '«Yoga Psychology», дискурс «Пранаяма»',
    meditate: true,
  },
}

// Какой звук аудиотеки записывает карта (или null).
export function soundForCard(cardId) {
  for (const s of Object.values(AUDIO_LIBRARY)) {
    if (s.cardIds && s.cardIds.includes(cardId)) return s.id
  }
  return null
}

// «Свет в Городе» (§14.1, Undertale: враг → друг): семь владык чакр после
// успокоения остаются в Городе как учителя. Каждый — окову, что осознала себя:
// истории/советы из шастр (рипу/паши как «орудия авидьи», ставшие проводниками
// видьи). Поле `bossId` связывает учителя с владыкой (ENEMIES); свет в площади
// зажигается, когда владыка успокоен.
export const CITY_TEACHERS = {
  moha: {
    id: 'moha',
    bossId: 'moha',
    chakra: 0,
    name: 'Моха-Ачарья',
    epithet: 'Учитель Муладхары',
    glyph: 'mask',
    story: 'Была пеленой неведения, что скрывает корень ума. Успокоенная, она стала тем, кто видит: «заблуждение — не враг, а затемнение, что рассеивается светом знания».',
    advice: 'В бою не гонитесь за всеми наградами сразу. Сначала разглядите, что именно затемняет ум, — и выберите против него противоядие.',
    rewardHint: 'Учитель открывает цитату о Мохе и дарит +1 саттву на следующий забег.',
    quoteId: 'moha',
  },
  kama_raja: {
    id: 'kama_raja',
    bossId: 'kama_raja',
    chakra: 1,
    name: 'Кама-Гуру',
    epithet: 'Учитель Свадхистханы',
    glyph: 'heart',
    story: 'Было влечением к внешнему, что привязывает ум к объектам. Успокоенный, он стал тем, кто учит: влечение можно направить вверх — к тому, что не кончается.',
    advice: 'Когда тянет сыграть «жадную» карту ради выгоды — спросите: это стремление к Центру или прочь от него?',
    rewardHint: 'Учитель открывает цитату о Каме и дарит +1 саттву на следующий забег.',
    quoteId: 'kama',
  },
  krodha_maharaja: {
    id: 'krodha_maharaja',
    bossId: 'krodha_maharaja',
    chakra: 2,
    name: 'Кродха-Свами',
    epithet: 'Учитель Манипуры',
    glyph: 'fire',
    story: 'Был гневом, что сжигает ум изнутри. Успокоенный, он стал огнём, который греет: энергия гнева, направленная против собственных оков, — сила для подъёма.',
    advice: 'Сильный ход хорош, когда он бьёт по оковам, а не по существам. Сила против неведения — не насилие.',
    rewardHint: 'Учитель открывает цитату о Кродхе и дарит +1 саттву на следующий забег.',
    quoteId: 'krodha',
  },
  mada_natha: {
    id: 'mada_natha',
    bossId: 'mada_natha',
    chakra: 3,
    name: 'Мада-Натха',
    epithet: 'Учитель Анахаты',
    glyph: 'crown',
    story: 'Был гордостью, что ставит «я» над всем. Успокоенный, он стал смиренным слугой: настоящая сила не нуждается в том, чтобы доказывать себя.',
    advice: 'Практики служения (сева) сильнее, когда вы не ждёте похвалы. Сыграйте их тихо — и получите больше, чем просили.',
    rewardHint: 'Учитель открывает цитату о Маде и дарит +1 саттву на следующий забег.',
    quoteId: 'mada',
  },
  matsarya_kala: {
    id: 'matsarya_kala',
    bossId: 'matsarya_kala',
    chakra: 4,
    name: 'Матсарья-Диджи',
    epithet: 'Учительница Вишуддхи',
    glyph: 'eye',
    story: 'Была завистью, что смотрит на чужое и не видит своего. Успокоенная, она стала зрением: видеть в другом — то же стремление, что в тебе, значит не желать чужого, а радоваться общему.',
    advice: 'Зависть — это смотреть на чужую колоду. Смотрите на свою: у каждого ума свой путь, и у него есть свой плод.',
    rewardHint: 'Учительница открывает цитату о Матсарье и дарит +1 саттву на следующий забег.',
    quoteId: 'matsarya',
  },
  lobha_pati: {
    id: 'lobha_pati',
    bossId: 'lobha_pati',
    chakra: 5,
    name: 'Лобха-Пати',
    epithet: 'Учитель Аджны',
    glyph: 'greed',
    story: 'Был жадностью, что копит и не отдаёт. Успокоенный, он стал щедростью: брать ровно столько, сколько нужно, и отдавать остальное — путь к свободе от накопления.',
    advice: 'Апариграха — не отказ, а мера. Возьмите нужное, откажитесь от лишнего — и колода станет легче, а ум — чище.',
    rewardHint: 'Учитель открывает цитату о Лобхе и дарит +1 саттву на следующий забег.',
    quoteId: 'lobha',
  },
  ahankara: {
    id: 'ahankara',
    bossId: 'ahankara',
    chakra: 6,
    name: 'Ахамкара-Риши',
    epithet: 'Учитель Сахасрары',
    glyph: 'mask',
    story: 'Было «я», что цепляется за дела и плоды. Успокоенное, оно стало тем, кто видит: деятель в уме — лишь роль, а свидетель — за пределами роли.',
    advice: 'Когда кажется, что всё держится на вас, — вспомните свидетеля. Ум успокоится, и самадхи станет ближе.',
    rewardHint: 'Учитель открывает цитату об Ахамкаре и дарит +1 саттву на следующий забег.',
    quoteId: 'ahankara',
  },
}

export function cardRewardPool(unlocked = []) {
  const open = new Set(unlocked)
  return Object.values(CARDS).filter((c) => {
    if (!c || !c.id || c.type === 'curse' || c.type === 'vritti') return false
    if (TRIAL_REWARD_CARDS.includes(c.id)) return open.has(c.id)
    if (c.starter) return false
    return true
  })
}
