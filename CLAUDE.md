# DOZA — Project Overview

Интернет-магазин парфюмерии на розлив (doza-parfum.by) + CRM-система.

## Архитектура

```
apps/
  site/   → Astro SSR — публичный сайт (doza-parfum.by)
  crm/    → Next.js App Router — CRM (crm.doza-parfum.by)
packages/
  db/     → Prisma schema + migrations + Prisma Client
  shared/ → TypeScript типы, утилиты (форматирование BYN, телефон)
```

## Стек

| Слой | Технология |
|---|---|
| Публичный сайт | Astro SSR + Node.js adapter |
| CRM | Next.js 14 App Router |
| БД | PostgreSQL |
| ORM | Prisma (shared package) |
| Авторизация | NextAuth.js (credentials, сессии) |
| Поиск | Fuse.js (клиентский, island) |
| Изображения | Sharp (WebP) |
| Telegram | Bot API webhook (plain HTTP POST) |
| Деплой | Docker Compose + nginx + certbot |
| Пакеты | pnpm workspaces |

## Команды

```bash
# Установка
pnpm install

# БД
pnpm --filter @doza/db prisma migrate dev
pnpm --filter @doza/db prisma generate
pnpm --filter @doza/db prisma studio

# Сид тестовыми данными
pnpm --filter @doza/db seed

# Разработка
pnpm --filter @doza/site dev        # :4321
pnpm --filter @doza/crm dev         # :3000

# Сборка (production)
pnpm --filter @doza/site build
pnpm --filter @doza/crm build

# Docker
docker compose up -d
docker compose logs -f
```

## Локальная разработка (Windows)

- PostgreSQL 16 установлен как служба `postgresql-x64-16` (суперпароль `postgres`).
- БД `doza` / пользователь `doza` / пароль `doza_dev_pass` (с правом CREATEDB для shadow-базы Prisma).
- `.env` в корне — для сайта (Astro) и Prisma CLI; `apps/crm/.env.local` — для Next.js CRM.
- **Вход в CRM:** `admin@doza-parfum.by` / `admin123` (создаётся сидом).

## Текущее состояние

✅ Реализовано и протестировано:
- Публичный сайт: главная, каталог (Fuse.js поиск + фильтры), карточка товара, корзина, оформление заказа (API), Telegram-уведомление
- CRM: NextAuth + RBAC, дашборд, заказы (смена статуса → списание остатков + начисление баллов), оффлайн-касса, клиенты, аналитика, лояльность, настройки, пользователи
- CRM: полное редактирование карточек товара (бренд, ноты, описание, объёмы, фото по URL, похожие, % баллов, порог, архив, копирование)
- CRM: журнал оффлайн-продаж + отмена закрытой продажи с реверсом остатков/баллов (`offline_sale_edits`)
- CRM: загрузка фото файлами с конвертацией в WebP (Sharp), общий каталог `uploads/`, отдача `/uploads/*` обоими приложениями (в проде — nginx)
- Лояльность: партионный учёт, FIFO-списание/начисление
- Обе сборки проходят (`next build` 19 маршрутов / `astro build`)

⏳ Следующие шаги:
- Редактирование позиций закрытой продажи (сейчас доступна только отмена)
- Деплой на VPS (Docker Compose готов, но не протестирован — Docker не установлен локально)
- Реальные фото/контент, Telegram-токен

## Переменные окружения

Файл `.env` в корне (gitignored):

```
DATABASE_URL=postgresql://doza:password@localhost:5432/doza
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://crm.doza-parfum.by
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

## Ключевые бизнес-правила

### Остатки (мл)
- Базовая единица — миллилитр
- `inventory.quantity_ml` — текущий остаток
- Каждое изменение пишется в `inventory_log`
- При остатке ниже `low_stock_threshold` → подсветка в CRM

### Баллы лояльности
- 1 балл = 1 BYN
- Партионный учёт: каждое начисление = отдельная запись `loyalty_batches` с `expires_at`
- При списании FIFO по `expires_at` (сначала сгорающие)
- Глобальные настройки в таблице `settings` (ключи: `loyalty_percent`, `loyalty_days`)

### Роли CRM
| Роль | Доступ |
|---|---|
| admin | Всё: товары, заказы, клиенты, аналитика, настройки, пользователи |
| seller | Оффлайн-касса, просмотр заказов, карточки клиентов, трек-номера |
| marketer | Клиентская база, лояльность, аналитика (без товаров и настроек) |

### Статусы заказов
`new` → `confirmed` → `shipped` → `closed`  
`new` → `rejected`  
`shipped` → `returned`

### Оффлайн-касса
- До закрытия: изменения без логирования
- После закрытия: любые изменения пишутся в `offline_sale_edits`
- При закрытии: остатки уменьшаются, баллы начисляются

## Схема БД (сводка)

```
brands, settings
products, product_photos, product_volumes, product_similar
inventory, inventory_log
customers, customer_dates
loyalty_batches, loyalty_log
orders, order_items
offline_sales, offline_sale_items, offline_sale_edits
crm_users
```

## Загрузка фото

- Общий каталог `uploads/` в корне репо (gitignored).
- CRM `POST /api/upload` — Sharp → WebP (≤1000×1333, q82), сохраняет в `uploads/`, возвращает `/uploads/<name>.webp`.
- Оба приложения отдают `/uploads/*` из каталога (dev). В проде — nginx напрямую из общего docker-volume `uploads`.
- Путь к каталогу: `getUploadsDir()` из `@doza/shared/uploads` (env `UPLOADS_DIR` или `<корень>/uploads`).

Полная схема: `packages/db/prisma/schema.prisma`

## Деплой (VPS)

```bash
# Первый деплой
git clone ... && cd doza
cp .env.example .env  # заполнить секреты
docker compose up -d
docker compose exec app-crm pnpm --filter @doza/db prisma migrate deploy
```

nginx проксирует:
- `doza-parfum.by` → `localhost:4321` (Astro)
- `crm.doza-parfum.by` → `localhost:3000` (Next.js)
