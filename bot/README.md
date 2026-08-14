# Tantra Yoga — Telegram-бот-обёртка

Бот-«дверь»: `/start` → приветствие + большая WebApp-кнопка мини-аппа;
нижняя кнопка меню — тот же мини-апп. Паттерн — `design/bot-door-pattern-reference.py`.

## Запуск в Telegram (GitHub Pages + бот)

Нужны две вещи: **токен бота** (от @BotFather) и **HTTPS-ссылка на игру**
(GitHub Pages отдаёт по https).

### Шаг 1. Развернуть игру на GitHub Pages (один раз)

1. Сделай репозиторий **публичным** (Settings → General → Danger Zone → Change
   visibility). На бесплатном плане Pages работает только для публичных репо.
2. Включи Pages: Settings → Pages → Source: **GitHub Actions**.
3. Пушь ветку `main` (workflow `.github/workflows/pages.yml` сам соберёт `dist`
   и задеплоит). Или: Actions → Deploy Tantra Yoga → Run workflow.
4. URL игры: `https://<твой-логин>.github.io/Tantra-Yoga/`

### Шаг 2. Создать бота (разово)

1. В Telegram открой **@BotFather** → `/newbot` → имя + username.
2. Скопируй **токен** (вида `123456789:AA...`).

### Шаг 3. Запустить бота

```bash
cd bot
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export TANTRA_BOT_TOKEN="<токен от @BotFather>"
export TANTRA_WEBAPP_URL="https://<твой-логин>.github.io/Tantra-Yoga/index.html"
python main.py
```

В Telegram открой своего бота → «Начать» → кнопка «🕉 Открыть Tantra Yoga».

## Локальная игра (без Telegram)

```bash
npm run build        # обычная сборка (без base под Pages)
npm run dev          # dev-сервер → http://localhost:5173
```

## Что умеет

- `/start` — приветствие + одна кнопка мини-аппа.
- `/help` — краткие правила.
- Нижняя кнопка меню — тот же мини-апп (MenuButtonWebApp).
- Авторизация не нужна: игра живёт в localStorage внутри webview Telegram.

## Границы (по спеке §16.1)

- Без кошелька, рефералов, оплат и managed-ботов (это не наша игра).
- Мета-прогресс — в localStorage клиента (фаза 1); CloudStorage/бэкенд — фаза 2.
