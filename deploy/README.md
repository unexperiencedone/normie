# Deploying Normie

Everything runs on **one machine** with Docker: your laptop for testing, or a cloud server for
going live. On a server, Docker keeps it running 24/7 and your laptop can be off.

```
 internet ──► caddy (HTTPS, ports 80/443)
                ├── /api/*  ──► api  (FastAPI, copilot, pg_dump)  ──► db (PostgreSQL 18)
                └── the rest ──► web  (Next.js: landing page + app)
```

| Service | What it is | Keeps its data in |
|---|---|---|
| `db` | PostgreSQL 18: the control database plus one database per project | volume `pgdata` |
| `api` | the Python backend (`deploy/api.Dockerfile`), with PostgreSQL 18 client tools for backups | volume `backups` |
| `web` | the website (`deploy/web.Dockerfile`), built as a standalone Node server | none |
| `caddy` | the front door: HTTPS certificates, sends `/api` to the API and everything else to the website | volumes `caddy_data`, `caddy_config` |

Caddy sends `/api` **directly** to the API, so the copilot's long streamed answers are never cut off
by a proxy timeout. Because the data is in named volumes, rebuilding or restarting containers never
loses projects, users or backups.

## Run it on your laptop

```bash
cp deploy/.env.docker.example .env.docker
# fill in POSTGRES_PASSWORD, JWT_SECRET, CREDENTIALS_KEY (commands are in the file) and AGENT_API_KEY
# if PostgreSQL already runs on this machine, set DB_PORT=5434
docker compose --env-file .env.docker up -d --build
open http://localhost
```

Stop with `docker compose --env-file .env.docker down`. Your data stays in the volumes. Add `-v`
only if you really want to wipe the volumes too.

## Put it on a server

**Oracle Cloud step by step (Always Free):** see [`ORACLE.md`](ORACLE.md).


1. Get a Linux server: Oracle Cloud *Always Free*, or a small Hetzner / DigitalOcean machine.
   1–2 GB of RAM is enough.
2. Point a domain at it: an `A` record for `normie.example.com` → the server's IP address.
3. Install Docker on the server, copy the project there (`git clone`, or `scp`) and create
   `.env.docker` with:
   ```
   DOMAIN=normie.example.com
   SITE_URL=https://normie.example.com
   COOKIE_SECURE=true
   PUBLIC_DB_HOST=normie.example.com
   ```
4. `docker compose --env-file .env.docker up -d --build`. Caddy fetches the HTTPS certificate by
   itself on first start.
5. Open ports **80** and **443** in the server's firewall. Open **5432** (and set `DB_PUBLISH=0.0.0.0`)
   only if users should connect to their project databases from outside with psql or a GUI.

`restart: unless-stopped` brings every service back after a crash or a server reboot.

## Updating

```bash
git pull
docker compose --env-file .env.docker up -d --build
```

## Secrets

`.env.docker` holds the database password, the login and encryption secrets and the AI key. It is in
`.gitignore` and `.dockerignore`, so it never goes to GitHub or into an image. **Keep
`CREDENTIALS_KEY` safe:** it encrypts the project database passwords, and losing it means losing
access to them.

## Optional: landing page on Netlify

`netlify.toml` (repository root) builds the website on Netlify. That is useful for a free public link
to the landing page. The app screens still need the API from the Docker stack: set `NORMIE_API_URL`
in Netlify to the server's address. Serving everything from the one server is simpler.
