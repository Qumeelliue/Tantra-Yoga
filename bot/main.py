# ─────────────────────────────────────────────────────────────────────────────
# Tantra: The Game — Telegram-бот-обёртка («дверь» в мини-апп)
# Источник паттерна: design/bot-door-pattern-reference.py (Galaxica, адаптировано).
# Для игры: /start → приветствие + одна WebApp-кнопка; нижняя кнопка меню — мини-апп.
# НЕ переносим из референса: кошелёк, рефералы, managed-боты, оплаты.
# ─────────────────────────────────────────────────────────────────────────────

import asyncio
import logging
import os

from aiogram import Bot, Dispatcher, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command
from aiogram.types import (
    BotCommand,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

logger = logging.getLogger(__name__)
router = Router(name="tantra")

TOKEN = os.environ["TANTRA_BOT_TOKEN"]
WEBAPP_URL = os.environ.get("TANTRA_WEBAPP_URL", "https://your-host/tantra-yoga/index.html")

WELCOME = (
    "🕉 *Tantra: The Game* — рогалик-колодостроитель, где колода — это ум.\n\n"
    "Вместо маны — три гуны (саттва/раджас/тамас). "
    "Каждого врага-Акову можно убить… или успокоить ахимсой — мирный путь даёт истинный финал. "
    "Знание из 218 книг Шастры переживает смерть.\n\n"
    "Нажмите кнопку ниже, чтобы начать восхождение по семи чакрам."
)


def door_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🕉 Открыть Tantra: The Game",
                    web_app=WebAppInfo(url=WEBAPP_URL),
                )
            ]
        ]
    )


@router.message(Command("start"))
async def cmd_start(message: Message) -> None:
    await message.answer(WELCOME, reply_markup=door_kb())


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    await message.answer(
        "Правила: колода = ум. Гуны = ресурсы. Ахимса при ХП врага ≤ 50% "
        "и полном успокоении освобождает его. Успокойте всех 7 владык чакр — "
        "откроется «Пробуждение».\n\nГрантха и Дневник практики сохраняются между забегами."
    )


async def main() -> None:
    bot = Bot(token=TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.MARKDOWN))
    dp = Dispatcher()
    dp.include_router(router)
    try:
        await bot.set_my_commands(
            [
                BotCommand(command="start", description="Открыть Tantra: The Game"),
                BotCommand(command="help", description="Как играть"),
            ]
        )
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="🕉 Tantra: The Game", web_app=WebAppInfo(url=WEBAPP_URL)
            )
        )
        await dp.start_polling(bot)
    finally:
        await bot.session.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
