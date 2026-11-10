# Hosting Normie on Oracle Cloud (Always Free)

About 30–45 minutes the first time. Everything below stays inside Oracle's **Always Free** limits.

---

## 1. Create the server (in the Oracle Cloud console)

**☰ Menu → Compute → Instances → Create instance**

| Setting | Choose |
|---|---|
| Name | `normie` |
| Image | **Canonical Ubuntu 24.04** (click *Change image*) |
| Shape | **Ampere → VM.Standard.A1.Flex**, **2 OCPUs, 12 GB RAM** (Always Free allows up to 4 OCPUs / 24 GB in total) |
| Networking | keep the defaults (a new VCN and public subnet); make sure **Assign a public IPv4 address** is on |
| SSH keys | **Generate a key pair for me** → **Download private key** (keep this file safe: it is your only way in) |
| Boot volume | default (~47 GB) is plenty |

Click **Create**. When it shows **Running**, copy the **Public IP address**.

> **"Out of capacity" error?** Free ARM servers are popular. Try another *Availability domain* in the
> placement section, try again later, or upgrade the account to *Pay As You Go*. That gets priority
> capacity and stops Oracle reclaiming idle free servers; you are still billed nothing while you stay
> within the Always Free limits. Set a budget alert if you upgrade.

## 2. Open ports 80 and 443 (two places)

**a) Oracle's firewall:** on the instance page → the **Subnet** link → **Security Lists** → the default
list → **Add Ingress Rules**, twice:

| Source CIDR | IP protocol | Destination port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

**b) Ubuntu's own firewall** is done in step 4 (Oracle's Ubuntu image blocks everything except SSH
by default).

## 3. Connect to the server (from your laptop)

```bash
chmod 600 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@<PUBLIC_IP>
```

## 4. Prepare the server (run on the server)

```bash
# open web ports in Ubuntu's firewall and keep the rule after reboots
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# install Docker and let the ubuntu user use it
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit        # log out and ssh in again so the group applies
```

## 5. Get a web address

HTTPS needs a name, not just an IP address. Pick one:

- **Your own domain:** at your domain registrar, add an **A record**, for example `normie.yourdomain.com`
  → `<PUBLIC_IP>`.
- **Free, no domain needed:** create a subdomain at **duckdns.org**, for example `normie-ak.duckdns.org`,
  and point it to `<PUBLIC_IP>`.
- **Quickest test:** `<PUBLIC_IP with dashes>.sslip.io`, for example `129-146-12-34.sslip.io`, which
  works immediately.

## 6. Download Normie and add the secrets (on the server)

```bash
git clone https://github.com/unexperiencedone/normie.git
cd normie
cp deploy/.env.docker.example .env.docker

# print fresh secrets to paste in:
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

## 7. Start it

```bash
docker compose --env-file .env.docker up -d --build    # first build takes ~5–10 minutes
docker compose --env-file .env.docker ps               # all four should be "running"
```

Open `https://<your-domain>`. Caddy fetches the HTTPS certificate on the first visit, which can
take a few seconds. Check the API with `https://<your-domain>/api/readyz`: it should answer
`{"ok":true,"control_db":"up"}`. Then **Sign up** and create a project.

---

## Everyday operations

| Task | Command (in `~/normie` on the server) |
|---|---|
| Update to the latest code | `git pull && docker compose --env-file .env.docker up -d --build` |
| See logs | `docker compose --env-file .env.docker logs -f api` |
| Restart | `docker compose --env-file .env.docker restart` |
| Stop (data is kept) | `docker compose --env-file .env.docker down` |
| Full database backup to a file | `docker compose --env-file .env.docker exec -T db pg_dumpall -U postgres > normie-$(date +%F).sql` |

The stack restarts by itself after crashes and server reboots (`restart: unless-stopped`). Your laptop
can be off.

## If something goes wrong

| Symptom | Fix |
|---|---|
| The site does not load at all | Check both firewalls (step 2a in the console, step 4 on the server) and that the DNS name points to the right IP (`ping <your-domain>`) |
| Browser says the certificate is invalid | DNS was not pointing at the server when Caddy started. Fix DNS, then `docker compose --env-file .env.docker restart caddy` |
| Logged in, but every page sends you back to login | `COOKIE_SECURE=true` needs HTTPS. Open the site with `https://` |
| The copilot does not answer | `AGENT_API_KEY` missing or wrong: fix `.env.docker`, then `up -d` |
| Build stops with "killed" | Out of memory. Give the instance more RAM (Edit → shape, still free up to 24 GB) |
