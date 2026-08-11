# Tantra Yoga — Telegram-бот-обёртка

Бот-«дверь»: `/start` → приветствие + большая WebApp-кнопка мини-аппа;
нижняя кнопка меню — тот же мини-апп. Паттерн — `design/bot-door-pattern-reference.py`.

## Запуск

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# соберите мини-апп и разверните на HTTPS-хостинге:
npm run build        # dist/ → статический хостинг (Vercel/Netlify/NGINX)

export TANTRA_BOT_TOKEN="<токен от @BotFather>"
export TANTRA_WEBAPP_URL="https://ваш-домен/index.html"   # HTTPS обязателен для Telegram
python main.py
```

Telegram Mini Apps требуют **HTTPS** для `WebAppInfo.url`. Для локальной пробы
подходит `npx serve dist` + туннель (ngrok/cloudflared).

## Что умеет

- `/start` — приветствие + одна кнопка мини-аппа.
- `/help` — краткие правила.
- Нижняя кнопка меню — тот же мини-апп (MenuButtonWebApp).
- Авторизация не нужна: игра живёт в localStorage внутри webview Telegram.

## Границы (по спеке §16.1)

- Без кошелька, рефералов, оплат и managed-ботов (это не наша игра).
- Мета-прогресс — в localStorage клиента (фаза 1); CloudStorage/бэкенд — фаза 2.
