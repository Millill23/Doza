# Деплой DOZA на хостинг (Plesk / VPS)

Сайт (`doza-parfum.by`) и CRM (`crm.doza-parfum.by`) — это два Node.js-приложения
на общей базе **PostgreSQL**. Хостинг даёт только MySQL — поэтому базу мы поднимаем
**в Docker-контейнере** вместе с приложениями. Plesk используем для доменов и
бесплатного SSL (Let's Encrypt), который проксирует запросы на наши контейнеры.

```
Интернет → Plesk nginx (80/443, SSL)
            ├─ doza-parfum.by      → 127.0.0.1:4321  (контейнер site)
            └─ crm.doza-parfum.by  → 127.0.0.1:3000  (контейнер crm)
Docker: postgres + site + crm + том uploads (для фото)
```

---

## Шаг 0. Проверить доступ (в SSH-консоли)

```bash
sudo -v            # спросит пароль — значит sudo/root есть
docker --version   # покажет версию — значит Docker установлен
```

- **`sudo` и `docker` есть** → продолжайте со Шага 1.
- **`sudo` есть, `docker` нет** → установите Docker:
  ```bash
  curl -fsSL https://get.docker.com | sudo sh
  sudo systemctl enable --now docker
  ```
- **`sudo` недоступен** (чистый shared-хостинг) → см. раздел «Фолбэк» в конце.

---

## Шаг 1. Загрузить код на сервер

**Вариант А — через Git (рекомендуется):**
```bash
cd ~
git clone <URL_ВАШЕГО_РЕПОЗИТОРИЯ> doza
cd doza
```

**Вариант Б — через файловый менеджер Plesk:** загрузите архив проекта,
распакуйте, затем зайдите в каталог через SSH (`cd ~/doza`).

> Plesk Git-авто-деплой для этого проекта не подходит: он рассчитан на одно
> приложение, а у нас монорепозиторий из двух приложений со сборкой в Docker.

---

## Шаг 2. Создать файл секретов `.env`

```bash
cp .env.example .env
nano .env
```

Заполните (пароль БД и `NEXTAUTH_SECRET` придумайте свои):

```env
POSTGRES_USER=doza
POSTGRES_PASSWORD=ПРИДУМАЙТЕ_НАДЁЖНЫЙ_ПАРОЛЬ
POSTGRES_DB=doza

# host = "db" (имя сервиса в docker-compose), пароль — тот же, что выше
DATABASE_URL=postgresql://doza:ПРИДУМАЙТЕ_НАДЁЖНЫЙ_ПАРОЛЬ@db:5432/doza

# сгенерировать: openssl rand -base64 32
NEXTAUTH_SECRET=ВСТАВЬТЕ_СЛУЧАЙНУЮ_СТРОКУ
NEXTAUTH_URL=https://crm.doza-parfum.by

# Telegram-уведомления о заказах (можно оставить пустыми и заполнить позже)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Сохранить в nano: `Ctrl+O`, `Enter`, затем `Ctrl+X`.

Сгенерировать секрет для `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
```

---

## Шаг 3. Собрать и запустить

```bash
# Сборка образов и запуск БД + сайта + CRM (первый раз — несколько минут)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Применить миграции и наполнить БД (таблицы, тестовые товары, админ)
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile tools run --rm migrate
```

Проверка, что контейнеры живы и отвечают локально:
```bash
docker compose ps
curl -I http://127.0.0.1:4321        # сайт → HTTP 200
curl -I http://127.0.0.1:3000/login  # CRM  → HTTP 200
```

---

## Шаг 4. Настроить домены и SSL в Plesk

1. **DNS.** Убедитесь, что A-записи указывают на IP сервера:
   - `doza-parfum.by` → IP
   - `crm.doza-parfum.by` → IP
   - (по желанию `www.doza-parfum.by` → IP)

2. **Создайте в Plesk:**
   - домен `doza-parfum.by`
   - субдомен `crm.doza-parfum.by`

3. **Reverse-proxy.** Для каждого зайдите:
   **Hosting & DNS → Apache & nginx Settings**:
   - снимите галочку **«Proxy mode»** (чтобы nginx обслуживал напрямую);
   - в поле **«Additional nginx directives»** вставьте:

   Для `doza-parfum.by`:
   ```nginx
   location / {
       proxy_pass http://127.0.0.1:4321;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
   }
   ```

   Для `crm.doza-parfum.by` — то же самое, но `proxy_pass http://127.0.0.1:3000;`

   Нажмите **Apply / OK**.

4. **SSL.** Для каждого домена:
   **SSL/TLS Certificates → Install (Let's Encrypt)** → отметьте основной домен
   (и `www` для главного) → выпустить. Plesk сам продлевает сертификаты.

После этого:
- https://doza-parfum.by — сайт
- https://crm.doza-parfum.by — CRM

---

## Шаг 5. После первого запуска (обязательно)

1. **Сменить пароль администратора.** Войдите в CRM:
   `admin@doza-parfum.by` / `admin123` → раздел **Пользователи** → создайте
   нового админа с надёжным паролем → старого отключите (или смените пароль).

2. **Удалить тестовые товары** (сид создаёт 12 демо-позиций) и завести реальные:
   CRM → **Товары** → редактирование/архив, загрузка фото.

3. **Telegram (если нужно).** Впишите `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`
   в `.env`, затем перезапустите:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

---

## Обновление кода в будущем

```bash
cd ~/doza
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# если были новые миграции БД:
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile tools run --rm migrate
```

---

## Полезные команды

```bash
# логи
docker compose logs -f site
docker compose logs -f crm
docker compose logs -f db

# перезапуск одного сервиса
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart crm

# бэкап БД
docker compose exec db pg_dump -U doza doza > backup_$(date +%F).sql

# восстановление БД
cat backup.sql | docker compose exec -T db psql -U doza doza
```

---

## Проверка (что всё работает)

- [ ] `docker compose ps` — все сервисы `Up` / healthy
- [ ] https://doza-parfum.by открывается, каталог показывает товары, замок SSL валиден
- [ ] https://crm.doza-parfum.by/login — вход админом, дашборд грузит данные
- [ ] Тестовый заказ на сайте → появляется в CRM (→ Telegram, если настроен)
- [ ] Загрузка фото товара в CRM → фото видно на сайте

---

## Фолбэк: если Docker/root недоступны (чистый shared Plesk)

Этот стек не предназначен для shared PHP/MySQL-хостинга. Варианты:

1. **Внешний PostgreSQL** (без изменения кода): заведите бесплатную/дешёвую базу
   на [Neon](https://neon.tech), [Supabase](https://supabase.com) или Railway,
   пропишите их `DATABASE_URL` в `.env`. Приложения тогда поднимаются как два
   Node.js-приложения в Plesk (расширение Node.js / Passenger): отдельный домен
   на каждое, команда сборки `pnpm build`, запуск из `apps/site/dist` и
   `apps/crm/.next`. Настройка монорепо под Passenger заметно сложнее.

2. **Рекомендуется:** взять недорогой VPS с root-доступом (от ~5 €/мес) — там
   Docker-вариант выше разворачивается за 15–20 минут и не зависит от
   ограничений панели.

> Если не уверены — пришлите вывод команд из Шага 0, подскажу точный путь.
