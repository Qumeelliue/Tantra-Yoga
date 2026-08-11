"use strict";

// Пакеты пополнения зеркалят galaxy_core/topup_bot/packages.py (1 ⭐ = 1 монета, 08-07).
const API_BASE = "/api/v1/public";

function initData() {
  if (window.Telegram && Telegram.WebApp) {
    return Telegram.WebApp.initData || "";
  }
  return "";
}

async function getJSON(path, params) {
  const url = new URL(API_BASE + path, window.location.origin);
  for (const [k, v] of Object.entries(params || {})) {
    if (v) url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  return resp.json();
}

async function postJSON(path, body, params) {
  const url = new URL(API_BASE + path, window.location.origin);
  for (const [k, v] of Object.entries(params || {})) {
    if (v) url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  return resp.json();
}

// ── Оценки агентов (G6a, 08-09) ────────────────────────────────────────────
// Пять звёзд; кликабельны только для живых агентов внутри Telegram (нужен initData).
// Своя оценка подсвечена; повторная оценка заменяет (ядро: 1 голос на агента).

function starsRow(agent, mine) {
  const el = document.createElement("div");
  el.className = "agent-stars";
  const label = document.createElement("span");
  label.className = "agent-rating";
  label.textContent = agent.reviews_count > 0
    ? "⭐ " + Number(agent.rating).toFixed(1).replace(/\.0$/, "") + " · " + agent.reviews_count
    : "";
  el.appendChild(label);
  const row = document.createElement("span");
  row.className = "agent-stars-row";
  const canRate = agent.status === "live" && window.Telegram && Telegram.WebApp;
  for (let s = 1; s <= 5; s++) {
    const star = document.createElement("span");
    star.className = "star" + (mine >= s ? " on" : "") + (canRate ? " clickable" : "");
    star.textContent = "★";
    if (canRate) {
      star.addEventListener("click", async () => {
        try {
          const res = await postJSON("/rate", { agent_code: agent.agent_code, rating: s }, { init_data: initData() });
          row.querySelectorAll(".star").forEach((st, i) => st.classList.toggle("on", i < s));
          label.textContent = "⭐ " + Number(res.average_rating).toFixed(1).replace(/\.0$/, "") + " · " + res.reviews_count;
        } catch (err) {
          alert("😔 Не удалось сохранить оценку. Попробуй позже.");
        }
      });
    }
    row.appendChild(star);
  }
  el.appendChild(row);
  return el;
}

function card(agent, mine) {
  const el = document.createElement("div");
  el.className = "card agent";
  const name = document.createElement("div");
  name.className = "agent-name";
  name.textContent = (agent.emoji ? agent.emoji + " " : "") + (agent.display_name || agent.agent_code);
  const desc = document.createElement("div");
  desc.className = "agent-desc";
  desc.textContent = agent.short_description || "";
  el.appendChild(name);
  el.appendChild(desc);
  el.appendChild(starsRow(agent, mine || 0));
  if (agent.status === "live" && agent.bot_username) {
    const btn = document.createElement("a");
    btn.className = "btn";
    btn.textContent = "Открыть";
    btn.href = "https://t.me/" + agent.bot_username;
    btn.target = "_blank";
    el.appendChild(btn);
  } else {
    const soon = document.createElement("div");
    soon.className = "soon";
    soon.textContent = "🕒 Скоро";
    el.appendChild(soon);
  }
  return el;
}

// ── Тексты отзывов на витрине (G6b, 08-09) ────────────────────────────────
// Блок «Что говорят»: последние отзывы live-агента из ядра. Рендер ТОЛЬКО
// textContent (XSS-защита, линза 4 п.5 спеки G6b); без отзывов — блок скрыт.

async function reviewsBlock(agent) {
  let data;
  try {
    data = await getJSON("/reviews", { agent_code: agent.agent_code, limit: 2 });
  } catch (err) {
    return null;
  }
  const reviews = data.reviews || [];
  if (reviews.length === 0) {
    return null;
  }
  const wrap = document.createElement("div");
  wrap.className = "agent-reviews";
  const head = document.createElement("div");
  head.className = "agent-reviews-head";
  head.textContent = "Что говорят";
  wrap.appendChild(head);
  for (const review of reviews) {
    const el = document.createElement("div");
    el.className = "agent-review";
    el.textContent = review.text;
    wrap.appendChild(el);
  }
  return wrap;
}

function historyRow(entry) {
  const el = document.createElement("div");
  el.className = "hrow";
  const sign = entry.amount_coins > 0 ? "+" : "−";
  const label = {
    topup: "пополнение",
    refund: "возврат",
    bonus: "бонус",
    referral: "реферальные",
    payout: "выплата",
    spend: entry.agent_code || "агент",
  }[entry.entry_type] || entry.entry_type;
  const amount = document.createElement("span");
  amount.className = entry.amount_coins > 0 ? "plus" : "minus";
  amount.textContent = sign + Math.abs(entry.amount_coins) + " 💰";
  const text = document.createElement("span");
  text.textContent = label;
  el.appendChild(amount);
  el.appendChild(text);
  return el;
}

async function loadCatalog() {
  const section = document.getElementById("catalog");
  section.textContent = "";
  // Свои оценки (для подсветки звёзд) — только владельцу initData; вне Telegram — пусто.
  let mine = {};
  if (initData()) {
    try {
      mine = (await getJSON("/ratings/mine", { init_data: initData() })).ratings || {};
    } catch (err) {
      mine = {};
    }
  }
  try {
    const data = await getJSON("/catalog");
    if (!data.agents || data.agents.length === 0) {
      section.textContent = "Каталог пуст — загляни позже.";
      return;
    }
    for (const agent of data.agents) {
      section.appendChild(await card(agent, mine[agent.agent_code] || 0));
      const block = await reviewsBlock(agent);
      if (block) {
        section.appendChild(block);
      }
    }
  } catch (err) {
    section.textContent = "😔 Не удалось загрузить каталог. Попробуй позже.";
  }
}

async function loadWallet() {
  const data = getJSON("/wallet", { init_data: initData() });
  const section = document.getElementById("wallet");
  const topup = document.getElementById("topup");
  try {
    const wallet = await data;
    document.getElementById("balance").textContent = wallet.balance_coins + " 💰";
    section.classList.remove("hidden");
    // Пополнение — только из Telegram (openInvoice).
    if (window.Telegram && Telegram.WebApp) {
      topup.classList.remove("hidden");
    }
  } catch (err) {
    // Вне Telegram (простой браузер) кошелёк скрыт — витрина остаётся.
    section.classList.add("hidden");
    topup.classList.add("hidden");
  }
  try {
    const wallet = await data;
    const hist = document.getElementById("history");
    hist.textContent = "";
    if (!wallet.entries || wallet.entries.length === 0) {
      hist.textContent = "Пока пусто.";
      return;
    }
    for (const entry of wallet.entries) {
      hist.appendChild(historyRow(entry));
    }
  } catch (err) {
    document.getElementById("history").textContent = "";
  }
}

async function topup(packageId) {
  if (!window.Telegram || !Telegram.WebApp) {
    alert("Пополнение доступно в Telegram.");
    return;
  }
  let link;
  try {
    const data = await getJSON("/topup", { init_data: initData(), package: packageId });
    link = data.invoice_link;
  } catch (err) {
    alert("😔 Не удалось создать счёт. Попробуй позже.");
    return;
  }
  Telegram.WebApp.openInvoice(link, (status) => {
    if (status === "paid") {
      loadWallet();
    }
  });
}

// ── Мировой рейтинг (G3-ratings, 08-07) ─────────────────────────────────────
// Топ периода по метрике + позиция владельца initData. Чужие пользователи —
// анонимно («Ученик #N»): рейтинг про прогресс, а не про аккаунты.

const LB_UNITS = {
  words: "слов",
  growth: "слов за 7 дней",
  streak: "дней серии",
};

const LB_MEDALS = ["🥇", "🥈", "🥉"];

function lbRow(entry) {
  const el = document.createElement("div");
  el.className = "lb-row" + (entry.me ? " me" : "");
  const place = document.createElement("span");
  place.className = "lb-place";
  const medal = LB_MEDALS[entry.rank - 1];
  place.textContent = medal ? medal : ("#" + entry.rank);
  const who = document.createElement("span");
  who.className = "lb-who";
  who.textContent = entry.me ? "Вы" : "Ученик #" + entry.rank;
  const val = document.createElement("span");
  val.className = "lb-value";
  val.textContent = entry.value + " " + LB_UNITS[entry.metric];
  el.appendChild(place);
  el.appendChild(who);
  el.appendChild(val);
  return el;
}

async function loadLeaderboard(metric) {
  const list = document.getElementById("lb-list");
  const meBox = document.getElementById("lb-me");
  list.textContent = "";
  meBox.classList.add("hidden");
  try {
    const data = await getJSON("/leaderboard", {
      metric: metric,
      limit: 10,
      init_data: initData(),
    });
    if (!data.entries || data.entries.length === 0) {
      list.textContent = "Пока пусто — снимок рейтинга обновляется раз в сутки 🌙";
      return;
    }
    for (const entry of data.entries) {
      list.appendChild(lbRow(entry));
    }
    if (data.requester) {
      meBox.textContent = "Ваша позиция: " + data.requester.rank + " · " +
        data.requester.value + " " + LB_UNITS[data.metric];
      meBox.classList.remove("hidden");
    }
  } catch (err) {
    list.textContent = "😔 Не удалось загрузить рейтинг. Попробуй позже.";
  }
}

async function loadReferral() {
  const linkEl = document.getElementById("referral-link");
  const statsEl = document.getElementById("referral-stats");
  const partnerEl = document.getElementById("referral-partner");
  const progressEl = document.getElementById("referral-progress");
  const progressTextEl = document.getElementById("referral-progress-text");
  const progressBarEl = document.getElementById("referral-progress-bar");
  try {
    const data = await getJSON("/referral", { init_data: initData() });
    if (data.link) {
      linkEl.href = data.link;
      linkEl.textContent = "🎁 Поделиться ссылкой";
    } else {
      linkEl.href = "#";
      linkEl.textContent = "Ссылка появится скоро";
    }
    statsEl.textContent = "Приведено друзей: " + data.progress +
      " · Заработано: " + data.earned_total + " 💰";
    // G10 (10-08): ⭐ Партнёр Galaxica (с первой вехи) + прогресс «до следующей вехи».
    partnerEl.classList.toggle("hidden", !data.partner);
    if (data.next_threshold > 0) {
      progressEl.classList.remove("hidden");
      const left = Math.max(0, data.next_threshold - data.progress);
      progressTextEl.textContent = "До следующей вехи осталось друзей: " + left;
      const pct = Math.min(100, Math.round((data.progress / data.next_threshold) * 100));
      progressBarEl.style.width = pct + "%";
    } else {
      progressEl.classList.add("hidden");
    }
  } catch (err) {
    statsEl.textContent = "";
  }
}

// ── «Позвать друга» (G10, 10-08) ────────────────────────────────────────────
// Карточку-приглашение создаёт ЯДРО (sendMessage от хаб-бота в ЛС юзера) по
// явному запросу; тут — Telegram.WebApp.shareMessage(message_id) (нативный шаринг
// в любой чат). Telegram не поддерживает → фолбэк на копирование ссылки.

async function shareReferral() {
  const shareBtn = document.getElementById("referral-share");
  if (!window.Telegram || !Telegram.WebApp || !initData()) {
    copyReferralLink();
    return;
  }
  shareBtn.disabled = true;
  try {
    const data = await postJSON("/referral/share", {}, { init_data: initData() });
    if (Telegram.WebApp.shareMessage && data.message_id > 0) {
      Telegram.WebApp.shareMessage(data.message_id);
    } else {
      copyReferralLink();
    }
  } catch (err) {
    copyReferralLink();
  } finally {
    shareBtn.disabled = false;
  }
}

function copyReferralLink() {
  const linkEl = document.getElementById("referral-link");
  const text = linkEl.href && linkEl.href !== "#" ? linkEl.href : window.location.origin + "/";
  const done = (navigator.clipboard && navigator.clipboard.writeText) ? function () {
    navigator.clipboard.writeText(text).then(function () {
      linkEl.textContent = "Ссылка скопирована ✓";
      window.setTimeout(function () {
        linkEl.textContent = "🎁 Поделиться ссылкой";
      }, 2000);
    });
  } : null;
  if (done) {
    done();
  } else {
    linkEl.textContent = text;
  }
}

// ── Кабинет разработчика (G8, 08-08) ────────────────────────────────────────
// Секция видна ТОЛЬКО владельцам агентов: ядро отдаёт пустой список — кабинет
// скрыт (п.8 §2). Карточка агента (статус/оборот/доля/рейтинг) + гистограмма
// поступлений за 14 дней + отзывы. Рендер ТОЛЬКО textContent (XSS-зуб).

const DEV_STATUS_LABEL = {
  live: "на витрине",
  moderation: "на проверке",
  paused: "приостановлен",
  sandbox: "песочница",
};

const DEV_TYPE_EMOJI = { suggestion: "💡", bug: "🐛", complaint: "🙏", other: "✏️" };

function statCell(label, value) {
  const el = document.createElement("div");
  el.className = "dev-stat";
  const l = document.createElement("div");
  l.className = "dev-stat-label";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "dev-stat-value";
  v.textContent = value;
  el.appendChild(l);
  el.appendChild(v);
  return el;
}

function devChart(points) {
  const wrap = document.createElement("div");
  wrap.className = "dev-chart";
  const max = Math.max.apply(null, points.map((p) => p.turnover_coins).concat([1]));
  for (const p of points) {
    const col = document.createElement("div");
    col.className = "dev-chart-col";
    const bar = document.createElement("div");
    bar.className = "dev-bar";
    const h = Math.round((p.turnover_coins / max) * 100);
    bar.style.height = Math.max(h, 1) + "%";
    bar.title = p.date + ": оборот " + p.turnover_coins + " 💰 · доля " + p.share_coins + " 💰";
    col.appendChild(bar);
    wrap.appendChild(col);
  }
  return wrap;
}

function devAgentCard(agent, earnings) {
  const el = document.createElement("div");
  el.className = "card dev-card";
  const head = document.createElement("div");
  head.className = "dev-head";
  const name = document.createElement("div");
  name.className = "agent-name";
  name.textContent = agent.display_name || agent.agent_code;
  const status = document.createElement("span");
  status.className = "dev-status";
  status.textContent = DEV_STATUS_LABEL[agent.status] || agent.status;
  head.appendChild(name);
  head.appendChild(status);
  el.appendChild(head);
  const stats = document.createElement("div");
  stats.className = "dev-stats";
  stats.appendChild(statCell("Оборот", agent.turnover_total + " 💰"));
  stats.appendChild(statCell("Твоя доля", agent.share_total + " 💰"));
  stats.appendChild(statCell("За 30 дней", agent.earned_30d + " 💰"));
  stats.appendChild(statCell(
    "Рейтинг",
    agent.reviews_count > 0
      ? "⭐ " + Number(agent.rating).toFixed(1).replace(/\.0$/, "") + " · " + agent.reviews_count
      : "нет оценок"
  ));
  el.appendChild(stats);
  if (earnings && earnings.points && earnings.points.length > 0) {
    el.appendChild(devChart(earnings.points));
  }
  return el;
}

async function devReviews(agentCode, container) {
  let data;
  try {
    data = await getJSON("/dev/reviews", { agent_code: agentCode, init_data: initData() });
  } catch (err) {
    return;
  }
  const reviews = data.reviews || [];
  if (reviews.length === 0) {
    return;
  }
  const head = document.createElement("div");
  head.className = "agent-reviews-head";
  head.textContent = "Отзывы и оценки";
  container.appendChild(head);
  for (const r of reviews) {
    const el = document.createElement("div");
    el.className = "agent-review";
    const parts = [];
    if (r.text) parts.push(r.text);
    if (r.rating != null) parts.push("⭐ " + r.rating);
    if (r.operation_code) parts.push("операция: " + r.operation_code);
    if (r.created_at) parts.push(String(r.created_at).slice(0, 10));
    el.textContent = (DEV_TYPE_EMOJI[r.fb_type] || "") + " " + parts.join(" · ");
    container.appendChild(el);
  }
}

async function loadDevCabinet() {
  const title = document.getElementById("dev-title");
  const section = document.getElementById("dev-cabinet");
  const box = document.getElementById("dev-agents");
  title.hidden = true;
  section.classList.add("hidden");
  if (!initData()) {
    return;
  }
  let agents;
  try {
    agents = (await getJSON("/dev/agents", { init_data: initData() })).agents || [];
  } catch (err) {
    return;
  }
  if (agents.length === 0) {
    return;
  }
  box.textContent = "";
  for (const agent of agents) {
    let earnings = null;
    try {
      earnings = await getJSON("/dev/earnings", {
        agent_code: agent.agent_code,
        init_data: initData(),
        days: 14,
      });
    } catch (err) {
      earnings = null;
    }
    box.appendChild(devAgentCard(agent, earnings));
    await devReviews(agent.agent_code, box);
  }
  title.hidden = false;
  section.classList.remove("hidden");
  loadPayouts(agents);
}

// ── Вывод заработка (G9) ─────────────────────────────────────────────────
// Черновик: минимум 1000 💰 — зеркало GALAXICA_PAYOUT_MIN_COINS ядра (сервер
// валидирует всегда; константа — для подсказки в форме до отправки).
const PAYOUT_MIN_COINS = 1000;

function payoutStatusLabel(status) {
  return { pending: "в обработке", paid: "выплачено", rejected: "отклонено" }[status] || status;
}

function payoutRow(p) {
  const el = document.createElement("div");
  el.className = "payout-row";
  const parts = ["#" + p.id + " · " + (p.agent_code || "—"), p.amount_coins + " 💰", payoutStatusLabel(p.status)];
  if (p.status === "pending" && p.hold_until) {
    parts.push("можно оплатить с " + String(p.hold_until).slice(0, 10));
  }
  if (p.reason) {
    parts.push(p.reason);
  }
  el.textContent = parts.join(" · ");
  return el;
}

function payoutMsg(text) {
  document.getElementById("payout-msg").textContent = text;
}

function payoutErrorText(detail) {
  const map = {
    payout_below_minimum: "Минимум " + PAYOUT_MIN_COINS + " 💰.",
    insufficient_balance: "Недостаточно монеток на балансе.",
    agent_not_live: "Агент не на витрине — заявки заморожены.",
    payout_already_pending: "У тебя уже есть открытая заявка — дождись её решения.",
    unknown_agent: "Такого агента нет.",
    not_agent_owner: "Это не твой агент.",
  };
  return map[detail] || "Не удалось отправить заявку — попробуй позже.";
}

async function submitPayout() {
  const agent = document.getElementById("payout-agent").value;
  const amount = parseInt(document.getElementById("payout-amount").value, 10);
  const wallet = document.getElementById("payout-wallet").value.trim();
  const contact = document.getElementById("payout-contact").value.trim();
  if (!agent) {
    payoutMsg("Выбери агента.");
    return;
  }
  if (!(amount >= PAYOUT_MIN_COINS)) {
    payoutMsg("Минимум " + PAYOUT_MIN_COINS + " 💰.");
    return;
  }
  if (!wallet) {
    payoutMsg("Укажи Gram-кошелёк (UQ…).");
    return;
  }
  const body = { agent_code: agent, amount_coins: amount, wallet_gram: wallet };
  if (contact) {
    body.contact = contact;
  }
  let resp;
  try {
    resp = await fetch("/v1/public/dev/payout?init_data=" + encodeURIComponent(initData()), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    payoutMsg("Не удалось отправить заявку — попробуй позже.");
    return;
  }
  const data = await resp.json().catch(() => ({}));
  if (resp.ok) {
    payoutMsg("Заявка #" + data.payout_id + " принята — выплата обрабатывается вручную.");
    document.getElementById("payout-form").classList.add("hidden");
    loadPayouts();
    return;
  }
  if (data.detail === "contact_required") {
    document.getElementById("payout-contact-row").classList.remove("hidden");
    document.getElementById("payout-contact").classList.remove("hidden");
    payoutMsg("Твои накопления достигли порога — укажи контакт для KYC.");
    return;
  }
  payoutMsg(payoutErrorText(data.detail));
}

async function loadPayouts(agents) {
  const box = document.getElementById("dev-payout");
  const form = document.getElementById("payout-form");
  const history = document.getElementById("payout-history");
  if (box) {
    box.classList.remove("hidden");
  }
  history.textContent = "";
  if (agents && agents.length > 0) {
    const select = document.getElementById("payout-agent");
    select.textContent = "";
    for (const a of agents) {
      const opt = document.createElement("option");
      opt.value = a.agent_code;
      opt.textContent = (a.display_name || a.agent_code) + " — " + a.agent_code;
      select.appendChild(opt);
    }
  }
  if (!initData()) {
    return;
  }
  let rows;
  try {
    rows = (await getJSON("/dev/payouts", { init_data: initData() })).payouts || [];
  } catch (err) {
    return;
  }
  const open = rows.find((r) => r.status === "pending");
  if (open) {
    form.classList.add("hidden");
    payoutMsg("Заявка #" + open.id + " в обработке — новая станет доступна после её решения.");
  } else {
    form.classList.remove("hidden");
    payoutMsg("");
  }
  const head = document.createElement("div");
  head.className = "payout-history-head";
  head.textContent = "Мои заявки";
  history.appendChild(head);
  for (const r of rows.slice(0, 10)) {
    history.appendChild(payoutRow(r));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("#topup .btn[data-package]").forEach((btn) => {
    btn.addEventListener("click", () => topup(btn.dataset.package));
  });
  document.querySelectorAll(".lb-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".lb-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      loadLeaderboard(tab.dataset.metric);
    });
  });
  loadCatalog();
  loadWallet();
  loadReferral();
  document.getElementById("referral-share").addEventListener("click", shareReferral);
  loadLeaderboard("words");
  loadDevCabinet();
  document.getElementById("payout-submit").addEventListener("click", submitPayout);
  if (window.Telegram && Telegram.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
  }
});
