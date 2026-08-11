#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────────────────────
# СПРАВОЧНЫЙ ПАТТЕРН (НЕ рабочий код игры)
# Источник: galaxica/galaxica_hub/bot.py (Galaxica, 2026-08-11).
# Для Tantra Yoga это: готовый образец, как Telegram-бот «открывает» мини-апп —
#   · /start → приветствие + одна большая WebApp-кнопка;
#   · нижняя кнопка меню = тот же мини-апп (MenuButtonWebApp);
#   · авторизация через initData (init_data из апдейта, не из текста);
#   · обработка оплат через successful_payment (для нашей игры не нужно).
# Использовать как референс при написании бота-обёртки Tantra Yoga. Копировать
# только нужные куски; лишнее (кошелёк, рефералы, managed-боты) — НЕ переносить.
# ─────────────────────────────────────────────────────────────────────────────

# region MODULE_CONTRACT [DOMAIN(9): Bot; CONCEPT(9): Galaxica Hub; TECH(9): aiogram]
## @file bot.py
## @brief Хаб-бот Galaxica (G3-рев.2): дверь в экосистему — приветствие + ОДНА
##   большая кнопка мини-аппа (каталог/кошелёк/пополнение — ВСЁ в мини-апке).
## @modulecontract
## @purpose Лицо экосистемы: человек открывает мини-апп, выбирает агента
##   (deep-link в чат агента) и тратит общий кошелёк (DoD G3). Каталог, баланс,
##   история и топ-ап — в мини-апке; бот принимает successful_payment (GAL-4).
## @invariants
## - /start = приветствие + одна WebApp-кнопка; нижняя кнопка меню — тот же мини-апп.
## - Зачисление — ТОЛЬКО по successful_payment → SDK.topup_webhook (GAL-4 идемпотентен).
## - tg_id всегда из апдейта (from_user), не из текста (owner-scoped).
## @changes
## LAST_CHANGE: [v0.2.0 - Sub-phase G3 rev.2: hub = door, всё в мини-апп.]
## @modulemap
## FUNC 8[Welcome + WebApp door] => cmd_start
## FUNC 8[Pre-checkout auto-OK] => pre_checkout
## FUNC 8[successful_payment → topup_webhook] => on_successful_payment
def _module_contract() -> None:
    pass


# endregion MODULE_CONTRACT
# GREP_SUMMARY: galaxica, hub, door, webapp, welcome, topup, XTR, GAL-4

import asyncio
import logging
import typing

import httpx
from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandObject
from aiogram.types import (
    BotCommand,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    KeyboardButtonRequestManagedBot,
    ManagedBotUpdated,
    MenuButtonWebApp,
    Message,
    PreCheckoutQuery,
    ReplyKeyboardMarkup,
    WebAppInfo,
)
from aiogram.utils.keyboard import ReplyKeyboardBuilder

from galaxica_hub import messages as msgs
from galaxica_hub.config import settings
from galaxica_sdk.client import GalaxicaClient
from galaxy_core.topup_bot.packages import package_for_amount

logger = logging.getLogger(__name__)

router = Router(name="hub")


def door_kb() -> InlineKeyboardMarkup:
    """▶ одна большая кнопка мини-аппа (каталог/кошелёк/пополнение — в мини-апке)."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=msgs.WEBAPP_BTN, web_app=WebAppInfo(url=settings.webapp_url)
                )
            ]
        ]
    )


def _client() -> GalaxicaClient:
    """▶ ленивый клиент ядра (fail-open на уровне вызовов, паттерн billing.client)."""
    return GalaxicaClient(base_url=settings.core_base_url, api_key=settings.core_api_key)


async def _managed_register(
    tg_bot_user_id: int,
    bot_username: str | None,
    display_name: str | None,
    owner_tg_user_id: int,
) -> dict[str, object]:
    """▶ POST /v1/managed/register (X-Keeper-Key, G7): хаб регистрирует выданного бота.

    Возвращает тело ответа (id/agent_code/api_key) или бросает исключение.
    Ключ команды пуст → 401 от ядра (выдача закрыта, спека §1)."""
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{settings.core_base_url}/v1/managed/register",
            json={
                "tg_bot_user_id": tg_bot_user_id,
                "bot_username": bot_username,
                "display_name": display_name,
                "owner_tg_user_id": owner_tg_user_id,
            },
            headers={"X-Keeper-Key": settings.keeper_api_key},
        )
    if resp.status_code != 200:
        raise RuntimeError(f"managed register: HTTP {resp.status_code}")
    return dict(resp.json())


def _dev_kb() -> ReplyKeyboardMarkup:
    """▶ reply-кнопка создания управляемого бота (только private chats, G7 §2 п.1)."""
    builder = ReplyKeyboardBuilder()
    builder.add(
        KeyboardButton(
            text=msgs.DEV_CREATE_BTN,
            request_managed_bot=KeyboardButtonRequestManagedBot(
                request_id=1,
                suggested_name=settings.managed_suggested_name or None,
                suggested_username=settings.managed_suggested_username or None,
            ),
        )
    )
    return builder.as_markup(resize_keyboard=True, one_time_keyboard=True)


@router.message(Command("dev"))
async def cmd_dev(message: Message) -> None:
    """▶ /dev → кнопка «Получить бота» (создание управляемого бота, G7)."""
    if message.from_user is not None and message.from_user.id in settings.admin_ids:
        await message.answer(msgs.DEV_HELP, reply_markup=_dev_kb())
    else:
        await message.answer(msgs.DEV_NOT_AUTHORIZED)


@router.managed_bot()
async def on_managed_bot(updated: ManagedBotUpdated) -> None:
    """▶ апдейт «создан управляемый бот» (G7 п.2 §2): регистрация → токен+ключ → доступ.

    bot = новый бот (User), user = создатель (владелец). Регистрация в ядре
    идемпотентна (409 на повторе); токен управляемого бота берёт хаб через
    get_managed_bot_token и шлёт ТОЛЬКО владельцу из апдейта (линза 4 п.1)."""
    if updated.bot_user.id is None:
        return
    owner_id = updated.user.id
    try:
        registered = await _managed_register(
            tg_bot_user_id=updated.bot_user.id,
            bot_username=updated.bot_user.username,
            display_name=updated.bot_user.first_name,
            owner_tg_user_id=owner_id,
        )
    except Exception:
        logger.warning("hub: managed register failed bot=%s", updated.bot_user.id, exc_info=True)
        await _safe_owner_message(owner_id, msgs.DEV_ERROR)
        return
    bot = Bot(token=settings.hub_bot_token)
    try:
        bot_token = await bot.get_managed_bot_token(updated.bot_user.id)
        if settings.managed_testers_ids:
            await bot.set_managed_bot_access_settings(
                updated.bot_user.id,
                is_access_restricted=True,
                added_user_ids=settings.managed_testers_ids,
            )
    except Exception:
        logger.warning("hub: managed bot token/access failed bot=%s", updated.bot_user.id, exc_info=True)
        await bot.session.close()
        await _safe_owner_message(owner_id, msgs.DEV_ERROR)
        return
    await bot.session.close()
    await _safe_owner_message(
        owner_id,
        msgs.TOKEN_DELIVERY.format(
            name=updated.bot_user.first_name or updated.bot_user.username or "Бот",
            bot_token=bot_token,
            agent_key=registered["api_key"],
        ),
    )


async def _safe_owner_message(owner_tg_id: int, text: str) -> None:
    """▶ сообщение владельцу (fail-open: сбой — только лог, BR-1)."""
    try:
        bot = Bot(token=settings.hub_bot_token)
        await bot.send_message(owner_tg_id, text)
        await bot.session.close()
    except Exception:
        logger.warning("hub: owner message failed user=%s", owner_tg_id, exc_info=True)


@router.message(Command("revoke"))
async def cmd_revoke(message: Message, command: CommandObject | None = None) -> None:
    """▶ /revoke <username> — перевыпуск токена выданного бота (только команда, G7 п.6 §2).

    Хаб находит бота в реестре ядра, вызывает replaceManagedBotToken и шлёт
    новый токен владельцу (owner из реестра, не из текста — линза 4 п.1)."""
    if message.from_user is None or message.from_user.id not in settings.admin_ids:
        return
    username = (command.args or "").strip().lstrip("@") if command else ""
    if not username:
        await message.answer(msgs.DEV_REVOKE_USAGE)
        return
    bot_row = await _find_managed_bot_by_username(username)
    if bot_row is None:
        await message.answer(msgs.DEV_REVOKE_NOT_FOUND)
        return
    tg_bot_user_id = bot_row.get("tg_bot_user_id")
    owner_tg_user_id = bot_row.get("owner_tg_user_id")
    if not isinstance(tg_bot_user_id, int) or not isinstance(owner_tg_user_id, int):
        await message.answer(msgs.DEV_REVOKE_NOT_FOUND)
        return
    bot = Bot(token=settings.hub_bot_token)
    try:
        new_token = await bot.replace_managed_bot_token(tg_bot_user_id)
        await bot.session.close()
    except Exception:
        logger.warning("hub: revoke failed bot=%s", tg_bot_user_id, exc_info=True)
        await message.answer(msgs.DEV_REVOKE_FAIL)
        return
    await message.answer(msgs.DEV_REVOKE_OK.format(username=username))
    await _safe_owner_message(
        owner_tg_user_id,
        msgs.TOKEN_DELIVERY.format(
            name=username,
            bot_token=new_token,
            agent_key="—",
        ),
    )


async def _find_managed_bot_by_username(username: str) -> dict[str, object] | None:
    """▶ поиск выданного бота по username в реестре ядра (GET /v1/keeper/bots, G7)."""
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            f"{settings.core_base_url}/v1/keeper/bots",
            headers={"X-Keeper-Key": settings.keeper_api_key},
        )
    if resp.status_code != 200:
        return None
    for row in dict(resp.json()).get("bots", []):
        if str(row.get("bot_username", "")).lower() == username.lower():
            return typing.cast(dict[str, object], row)
    return None


@router.message(Command("start"))
async def cmd_start(message: Message, command: CommandObject | None = None) -> None:
    """▶ /start [ref_<id>] → приветствие + дверь в мини-апп (все функции — там).

    G4 (08-08): аргумент «ref_<id>» — реферальная ссылка → first-touch привязка в ядре
    (fire-and-forget, сбой никогда не роняет приветствие)."""
    ref_code: str | None = None
    if command is not None and command.args:
        arg = command.args.strip().split()[0]
        if arg.startswith("ref_") and arg[len("ref_"):].isdigit():
            ref_code = arg
    if ref_code is not None and message.from_user is not None:
        _ = asyncio.create_task(
            _bind_referral(message.from_user.id, ref_code)
        )
    await message.answer(msgs.HUB_WELCOME, reply_markup=door_kb())


async def _bind_referral(user_tg_id: int, code: str) -> None:
    """▶ fire-and-forget привязка к рефереру (G4); сбой — только лог (BR-1)."""
    try:
        bound = await _client().bind_referral(user_tg_id=user_tg_id, code=code)
        logger.info("hub: referral bind user=%s code=%s bound=%s", user_tg_id, code, bound)
    except Exception:
        logger.warning("hub: referral bind failed user=%s code=%s", user_tg_id, code, exc_info=True)


@router.pre_checkout_query()
async def pre_checkout(pre_checkout_query: PreCheckoutQuery) -> None:
    """▶ pre_checkout → авто-OK ≤10 с, БЕЗ БД (паттерн G1/G2)."""
    await pre_checkout_query.answer(ok=True)


@router.message(F.successful_payment)
async def on_successful_payment(message: Message) -> None:
    """▶ successful_payment → SDK.topup_webhook (GAL-4) → ack с балансом.

    Защита (G3-аудит): payload строго `hub_topup:{coins}`; сумма total_amount
    (наностars) должна точно совпасть с пакетом — иначе НЕ зачисляем и говорим
    юзеру (иначе оплаченные звёзды теряются молча)."""
    if message.from_user is None or message.successful_payment is None:
        return
    payment = message.successful_payment
    payload = payment.invoice_payload or ""
    coins: int | None = None
    if payload.startswith("hub_topup:"):
        try:
            coins = int(payload.split(":", 1)[1])
        except ValueError:
            coins = None
    pkg = package_for_amount(payment.total_amount)
    if coins is None or pkg is None or pkg.coins != coins:
        logger.warning(
            "hub: unrecognized payment payload=%r total_amount=%s — no credit",
            payload, payment.total_amount,
        )
        await message.answer(msgs.TOPUP_UNRECOGNIZED)
        return
    try:
        result = await _client().topup_webhook(
            tg_user_id=message.from_user.id,
            charge_id=payment.telegram_payment_charge_id,
            coins=coins,
            username=message.from_user.username,
            first_name=message.from_user.first_name,
        )
    except Exception:
        logger.warning("hub: topup_webhook failed", exc_info=True)
        await message.answer(msgs.TOPUP_FAIL)
        return
    if result.already_existed:
        return  # повторный charge_id — ничего не делаем (GAL-4)
    await message.answer(msgs.TOPUP_ACK.format(coins=coins, balance=result.balance_coins))


@router.message(Command("terms"))
async def cmd_terms(message: Message) -> None:
    await message.answer(msgs.TERMS_TEXT)


@router.message(Command("support"))
async def cmd_support(message: Message) -> None:
    await message.answer(msgs.SUPPORT_TEXT)


@router.message(Command("paysupport"))
async def cmd_paysupport(message: Message) -> None:
    await message.answer(msgs.PAYSUPPORT_TEXT)


async def main() -> None:
    """▶ polling-запуск хаб-бота (systemd: galaxica-hub) + нижняя кнопка меню."""
    bot = Bot(
        token=settings.hub_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.MARKDOWN),
    )
    dp = Dispatcher()
    dp.include_router(router)
    try:
        await bot.set_my_commands(
            [
                BotCommand(command="start", description="Открыть Galaxica"),
                BotCommand(command="dev", description="Разработчикам: получить бота"),
                BotCommand(command="terms", description="Условия"),
                BotCommand(command="support", description="Поддержка"),
                BotCommand(command="paysupport", description="Споры по платежам"),
            ]
        )
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text=msgs.WEBAPP_BTN, web_app=WebAppInfo(url=settings.webapp_url)
            )
        )
        await dp.start_polling(bot)
    finally:
        await bot.session.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
