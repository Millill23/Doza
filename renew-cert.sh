#!/usr/bin/env bash
# Renew the Docker-mounted Let's Encrypt certificate using standalone mode.
# Nginx must release port 80 during the ACME challenge.
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

"${COMPOSE[@]}" stop nginx
start_nginx() {
  "${COMPOSE[@]}" start nginx
}
trap start_nginx EXIT

docker run --rm -p 80:80 \
  -v "$PWD/nginx/certbot/conf:/etc/letsencrypt" \
  certbot/certbot renew --standalone --quiet

"${COMPOSE[@]}" start nginx
trap - EXIT
"${COMPOSE[@]}" exec -T nginx nginx -s reload
