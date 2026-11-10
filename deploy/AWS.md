# Hosting Normie on AWS (EC2)

About 30 minutes the first time. This runs on your AWS credits, so **do step 0 first**.

---

## 0. Protect your credits (2 minutes)

- **Billing and Cost Management → Credits:** check how much is left and when it expires.
- **Billing → Budgets → Create budget → "Zero spend" or a $5 monthly budget**, with your email.
  AWS then emails you before anything costs real money.

Rough cost of the server below: **about $12–15 a month** (instance + disk + public IP), taken from
your credits. **Stop** the instance when you don't need it (step "Pausing" at the end) to stretch them.

## 1. Launch the server

**EC2 → Instances → Launch instances**

| Setting | Choose |
|---|---|
| Name | `normie` |
| AMI | **Ubuntu Server 24.04 LTS** |
| Architecture / type | **t4g.small** (ARM, 2 GB, cheapest) or **t3.small** (x86, 2 GB). Avoid 1 GB types: building the website needs about 2 GB |
| Key pair | **Create new key pair** → name `normie`, type RSA, format `.pem` → it downloads; keep it safe |
| Network settings → **Edit** | Allow **SSH** from **My IP**, tick **Allow HTTPS traffic from the internet** and **Allow HTTP traffic from the internet** |
| Storage | **20 GB gp3** |

Click **Launch instance**, open it, wait for **Running**, and copy the **Public IPv4 address**.

> Optional but recommended: **EC2 → Elastic IPs → Allocate → Associate** it with the instance, so the
> address does not change if you stop and start the server.

## 2. Connect

```bash
chmod 600 ~/Downloads/normie.pem
ssh -i ~/Downloads/normie.pem ubuntu@<PUBLIC_IP>
```

## 3. Install Docker (on the server)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu

# a 2 GB safety net so the first build never runs out of memory
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

exit        # log out and ssh in again so the Docker permission applies
```

## 4. Get a web address

HTTPS needs a name:

- **Free:** a subdomain at **duckdns.org**, for example `normie-ak.duckdns.org` → your public IP.
- **Instant:** `<IP-with-dashes>.sslip.io`, for example `13-233-10-20.sslip.io`.
- **Your own domain:** an **A record** → the public IP.

## 5. Download Normie and add the secrets (on the server)

```bash
git clone https://github.com/unexperiencedone/normie.git && cd normie
cp deploy/.env.docker.example .env.docker
python3 -c "import secrets; print('POSTGRES_PASSWORD=' + secrets.token_urlsafe(32)); print('JWT_SECRET=' + secrets.token_urlsafe(48))"
python3 -c "import base64,os; print('CREDENTIALS_KEY=' + base64.urlsafe_b64encode(os.urandom(32)).decode())"
nano .env.docker
```

In `.env.docker`, set:

```
POSTGRES_PASSWORD=...        # from the command above
JWT_SECRET=...               # from the command above
CREDENTIALS_KEY=...          # from the command above; keep a copy somewhere safe
AGENT_API_KEY=nvapi-...      # your NVIDIA key (copy it from .env on your laptop)

DOMAIN=normie-ak.duckdns.org
SITE_URL=https://normie-ak.duckdns.org
COOKIE_SECURE=true
PUBLIC_DB_HOST=normie-ak.duckdns.org
```

Save with **Ctrl+O, Enter**, quit with **Ctrl+X**.

## 6. Start it

```bash
docker compose --env-file .env.docker up -d --build    # first build: about 5–10 minutes
docker compose --env-file .env.docker ps               # all four should be "running"
```

Open `https://<your-address>` and sign up. `https://<your-address>/api/readyz` should answer
`{"ok":true,"control_db":"up"}`.

---

## Pausing and ending (saving credits)

| Want to | Do |
|---|---|
| Pause (keeps everything, stops most charges) | EC2 → Instances → select → **Instance state → Stop**. The disk (and an Elastic IP) still cost a little |
| Resume | **Start** it again. Without an Elastic IP the address changes: update DuckDNS / sslip.io and `.env.docker`, then `docker compose --env-file .env.docker up -d` |
| End completely | Back up first (below), then **Terminate** the instance and **release** the Elastic IP; otherwise both keep charging |

Backup before ending: `docker compose --env-file .env.docker exec -T db pg_dumpall -U postgres > normie-backup.sql`,
then copy it to your laptop with `scp -i ~/Downloads/normie.pem ubuntu@<PUBLIC_IP>:~/normie/normie-backup.sql .`

Updating, logs and troubleshooting are the same as in [`ORACLE.md`](ORACLE.md#everyday-operations).

---

## What the live server runs (set up on 10 Nov 2026)

| | |
|---|---|
| Address | **https://normie-db.duckdns.org** (also `https://44-200-183-73.sslip.io`) |
| Instance | t4g.small (ARM, 2 vCPU, 2 GB) + 2 GB swap, Ubuntu 24.04, 20 GB disk |
| HTTPS | Let's Encrypt certificate, obtained and renewed automatically by Caddy |
| DuckDNS updater | `~/duckdns/duck.sh` runs every 5 minutes (cron), so the name follows the server if its IP changes. The token is stored in `~/duckdns/token` (private). |
| Daily backup | `~/backup-normie.sh` runs at 03:30 UTC (09:00 IST): `pg_dumpall` of every database plus a copy of `.env.docker`, into `~/backups/`, keeping the 7 newest |

Copy the latest backup to your laptop:

```bash
scp -i ~/Downloads/normie.pem "ubuntu@normie-db.duckdns.org:backups/*$(date +%F)*" ~/normie-backups/
```

Restore everything from a dump (on a fresh server, after `up -d`):

```bash
zcat normie-YYYY-MM-DD.sql.gz | docker compose --env-file .env.docker exec -T db psql -U postgres -d postgres
```

Use the **same `.env.docker`** (it is in the backup) so `CREDENTIALS_KEY` still matches the stored passwords.
