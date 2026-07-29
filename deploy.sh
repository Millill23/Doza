#!/usr/bin/env bash
# Обновление прод-окружения DOZA на VPS.
#
# Кодифицирует ПРАВИЛЬНЫЙ порядок деплоя. Ключевой нюанс: сервис `migrate`
# живёт в профиле `tools`, поэтому `up --build` его НЕ пересобирает — если
# не собрать образ `migrate` заново, новые Prisma-миграции молча пропустятся
# ("No pending migrations to apply") и сайт отдаст 500 на отсутствующих таблицах.
#
# Использование (на сервере):  cd ~/doza && ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

C="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

echo "==> git pull"
git pull --ff-only

echo "==> сборка и запуск site/crm/nginx"
$C up -d --build

echo "==> пересборка образа migrate (иначе миграции пропустятся)"
$C build migrate

echo "==> применение миграций (migrate deploy, БЕЗ seed)"
$C run --rm migrate sh -c "npx prisma migrate deploy"

echo "==> статус"
$C ps
echo -n "site/catalog -> "; curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 http://127.0.0.1:4321/catalog || true
echo -n "crm/login    -> "; curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 http://127.0.0.1:3000/login || true

echo "==> готово"
