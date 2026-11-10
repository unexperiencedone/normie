#!/usr/bin/env bash
# One-time: generates secrets into .env (never overwrites existing values).
set -euo pipefail
cd "$(dirname "$0")/.."
touch .env; chmod 600 .env; [ -n "$(tail -c1 .env)" ] && echo >> .env
add() { grep -q "^$1=" .env || echo "$1=$2" >> .env; }
rand() { python3 -c "import secrets;print(secrets.token_urlsafe($1))"; }
add PG_HOST localhost
add PG_PORT 5433
add PG_ADMIN_USER dbforge_admin
add CONTROL_DB dbforge_control
add DBFORGE_ADMIN_PASSWORD "$(rand 24)"
add JWT_SECRET "$(rand 48)"
add CREDENTIALS_KEY "$(python3 -c 'import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())')"
echo "secrets ensured in .env"
