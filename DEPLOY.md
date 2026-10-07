# Деплой DOZA на VPS через Docker Compose

Сайт (`doza-parfum.by`) и CRM (`crm.doza-parfum.by`) – два Node.js-приложения
на общей базе **PostgreSQL**. Docker Compose запускает PostgreSQL, приложения и
свой Nginx, который принимает трафик на портах 80/443. На VPS эти порты должны
быть свободны; текущий Compose не рассчитан на одновременный Plesk nginx.

```
Интернет → Docker nginx (80/443, TLS)
            ├─ doza-parfum.by      → site:4321
            └─ crm.doza-parfum.by  → crm:3000
Docker: postgres + site + crm + nginx + тома pgdata/uploads/certbot
```

---

## Шаг 0. Проверить доступ (в SSH-консоли)

```bash
sudo -v            # спросит пароль – значит sudo/root есть
docker --version   # покажет версию – значит Docker установлен
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

**Вариант А – через Git (рекомендуется):**
```bash
cd ~
git clone <URL_ВАШЕГО_РЕПОЗИТОРИЯ> doza
cd doza
```

Для текущего Docker-варианта нужен Git-клон на VPS. Изменения из локальной
копии должны быть отправлены в удалённый репозиторий до запуска `deploy.sh`.

---

## Шаг 2. Создать файл секретов `.env`

```bash
cp .env.example .env
nano .env
```

Заполните (для пароля БД используйте hex-строку, чтобы её не пришлось
кодировать внутри `DATABASE_URL`):

```env
POSTGRES_USER=doza
POSTGRES_PASSWORD=ТОТ_ЖЕ_РЕЗУЛЬТАТ_openssl_rand_hex_24
POSTGRES_DB=doza

# host = "db" (имя сервиса в docker-compose), пароль – тот же, что выше
DATABASE_URL=postgresql://doza:ТОТ_ЖЕ_ПАРОЛЬ@db:5432/doza

# сгенерировать: openssl rand -base64 32
NEXTAUTH_SECRET=ВСТАВЬТЕ_СЛУЧАЙНУЮ_СТРОКУ
NEXTAUTH_URL=https://crm.doza-parfum.by

# Telegram-уведомления о заказах (можно оставить пустыми и заполнить позже)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Сохранить в nano: `Ctrl+O`, `Enter`, затем `Ctrl+X`.

Сгенерируйте hex-пароль БД и случайный секрет командами ниже; первый результат
впишите одинаково в `POSTGRES_PASSWORD` и в `DATABASE_URL`, второй — в
`NEXTAUTH_SECRET`:
```bash
openssl rand -hex 24
openssl rand -base64 32
```

---

## Шаг 3. Собрать и запустить

```bash
# Сборка образов и запуск БД + сайта + CRM. Nginx запустим после получения TLS.
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build db site crm

# Только для ПЕРВОГО запуска на пустой БД: применить миграции и добавить
# начальные настройки, тестовые товары и стартового администратора.
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile tools run --rm --build migrate sh -c 'npx prisma migrate deploy && node prisma/seed.mjs'
```

Эта команда предназначена только для первого запуска на пустой БД. Сид не
меняет существующие записи, однако может добавить демо-товары и стартового
админа, если их нет. Образ `migrate` теперь по умолчанию запускает только
миграции. Если база уже содержит рабочие данные, не запускайте сид. Примените
только миграции отдельной командой:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile tools run --rm --build migrate
```

Проверка, что контейнеры живы и отвечают локально:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl -I http://127.0.0.1:4321        # сайт → HTTP 200
curl -I http://127.0.0.1:3000/login  # CRM  → HTTP 200
```

---

## Шаг 4. DNS, TLS и Nginx

1. **DNS.** Убедитесь, что A-записи всех трёх имён указывают на IP VPS:
   `doza-parfum.by`, `www.doza-parfum.by` и `crm.doza-parfum.by`.

2. Убедитесь, что порты 80 и 443 свободны. Compose публикует Docker Nginx
   именно на них; если на сервере установлен Plesk, его nginx займёт эти порты
   и контейнер не запустится.

3. Выпустите Let's Encrypt сертификат до запуска Nginx. Из `~/doza` выполните:
   ```bash
   mkdir -p nginx/certbot/conf nginx/certbot/www
   docker run --rm -p 80:80 -v "$PWD/nginx/certbot/conf:/etc/letsencrypt" certbot/certbot certonly --standalone --email ВАШ_EMAIL --agree-tos --no-eff-email -d doza-parfum.by -d www.doza-parfum.by -d crm.doza-parfum.by
   ```

4. Запустите Docker Nginx:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d nginx
   ```

   Сертификаты исключены из Git и Docker-образов. Nginx отдаёт ACME challenge
   из `nginx/certbot/www`. Добавьте продление через `crontab -e` (замените путь
   на домашний каталог вашего пользователя):
   ```cron
   0 3 * * * /bin/bash /home/ВАШ_ПОЛЬЗОВАТЕЛЬ/doza/renew-cert.sh >> /home/ВАШ_ПОЛЬЗОВАТЕЛЬ/doza-cert-renew.log 2>&1
   ```

После этого:
- https://doza-parfum.by – сайт
- https://crm.doza-parfum.by – CRM

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
./deploy.sh
```

Скрипт обновляет код через `git pull --ff-only`, пересобирает приложение и
образ миграций, затем выполняет `prisma migrate deploy` без сида. Он не удаляет
том PostgreSQL и не запускает `seed.mjs`.

`deploy.sh` сам пересобирает миграционный образ, поэтому старые файлы миграций
не останутся в контейнере. Сидирование не входит в обычное обновление.

### Разовые скрипты каталога

Тот же образ гоняет скрипты наполнения. `--build` нужен по той же причине:

```bash
# новые поступления (существующие карточки не трогает)
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm --build migrate node prisma/seed-products.mjs

# похожие ароматы (заполняет только пустые)
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm --build migrate node prisma/seed-similar.mjs
```

---

## Полезные команды

```bash
# логи
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f site
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f crm
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f db

# перезапуск одного сервиса
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart crm

# бэкап БД до обновления (файл вне репозитория)
backup="$HOME/doza-backup-$(date +%F-%H%M%S).sql"
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db pg_dump -U doza doza > "$backup"
chmod 600 "$backup"

# восстановление БД
cat backup.sql | docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db psql -U doza doza
```

---

## Проверка (что всё работает)

- [ ] `docker compose ps` – все сервисы `Up` / healthy
- [ ] https://doza-parfum.by открывается, каталог показывает товары, замок SSL валиден
- [ ] https://crm.doza-parfum.by/login – вход админом, дашборд грузит данные
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

2. **Рекомендуется:** взять недорогой VPS с root-доступом (от ~5 €/мес) – там
   Docker-вариант выше разворачивается за 15–20 минут и не зависит от
   ограничений панели.

> Если не уверены – пришлите вывод команд из Шага 0, подскажу точный путь.
