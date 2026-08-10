# Deploying to production — free tier (Oracle Cloud + DuckDNS + Caddy)

This gets your existing `docker compose up --build` stack running on a real
public server with free HTTPS, at $0/month.

## What changed in this repo for production

- `docker-compose.yml`: Postgres/Redis ports now bind to `127.0.0.1` only
  (not reachable from the internet). Backend/frontend no longer publish
  ports directly — a new `caddy` service is the only container exposed
  publicly (ports 80/443), and it reverse-proxies to both.
- `Caddyfile` (new): routes `/api/*` → backend, everything else → frontend.
  Caddy auto-issues and renews a free Let's Encrypt cert for `$DOMAIN`.
- `packages/frontend/Dockerfile`: now accepts `NEXT_PUBLIC_API_URL` as a
  build arg, since Next.js bakes `NEXT_PUBLIC_*` vars into the JS bundle at
  build time — setting it only as a runtime env var (the old behavior)
  silently does nothing in production.
- `.env.example`: new `DOMAIN` var, and notes on `CORS_ORIGIN` /
  `NEXT_PUBLIC_API_URL` needing your real domain in production.

---

## 1. Provision the server (Oracle Cloud Always Free)

1. Sign up at https://signup.cloud.oracle.com (needs a card for identity
   verification only — the Always Free resources are never billed).
2. Create a Compute instance:
   - Shape: **VM.Standard.A1.Flex** (Ampere ARM) — pick 2 OCPU / 12GB, or
     more if your region still offers 4/24 (allocation varies by region
     right now; if a region shows "out of capacity," try another).
   - Image: **Ubuntu 24.04 (ARM)**.
   - Add your SSH public key during creation.
3. Note the instance's public IP once it's running.

SSH in:
```bash
ssh ubuntu@<PUBLIC_IP>
```

Install Docker:
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

## 2. Open the firewall (both layers — this trips almost everyone up)

Oracle Cloud has **two independent firewalls**. You need to open 80/443 on
both, or connections will silently time out.

**a) Oracle's cloud-level Security List:**
In the OCI Console → your VCN → Security Lists → default security list →
Add Ingress Rules → allow `0.0.0.0/0` on TCP ports `80` and `443`.

**b) The OS-level firewall (iptables) on Ubuntu:**
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save   # if installed; otherwise the rule won't survive reboot
```

## 3. Get a free domain (DuckDNS)

1. Go to https://www.duckdns.org, sign in, create a subdomain, e.g.
   `mywaplatform.duckdns.org`.
2. Point it at your server's public IP (paste the IP into DuckDNS's field,
   click update).
3. Confirm it resolves: `nslookup mywaplatform.duckdns.org` should return
   your server's IP within a minute or two.

## 4. Deploy the app

```bash
git clone <your-repo-url> waplatform   # or scp the project up
cd waplatform
cp .env.example .env
```

Edit `.env` and set, at minimum:
```bash
DOMAIN=mywaplatform.duckdns.org
CORS_ORIGIN=https://mywaplatform.duckdns.org
NEXT_PUBLIC_API_URL=https://mywaplatform.duckdns.org
NEXT_PUBLIC_WS_URL=wss://mywaplatform.duckdns.org
POSTGRES_PASSWORD=<generate a real random password>
JWT_ACCESS_SECRET=<32+ random chars>
JWT_REFRESH_SECRET=<32+ random chars>
SECRETS_ENCRYPTION_KEY=<32+ random chars>
NODE_ENV=production
```

Generate random secrets easily with:
```bash
openssl rand -base64 32
```

Then build and start:
```bash
docker compose up --build -d
```

First boot: Caddy will request a Let's Encrypt cert for `$DOMAIN` — this
needs DNS already resolving (step 3) and ports 80/443 reachable (step 2), or
it'll retry/fail. Watch it:
```bash
docker compose logs -f caddy
```

Seed demo data (optional — skip if you want a clean prod DB):
```bash
docker compose exec backend npm run prisma:seed
```

Visit `https://mywaplatform.duckdns.org` — you should get a valid padlock
with no cert warnings.

## 5. Smoke test

```bash
curl -I https://mywaplatform.duckdns.org/api/v1/health
```
Should return `200`. Then log in through the browser and click around —
confirm auth, contacts, and the automation canvas load without CORS errors
in the browser console (CORS errors here almost always mean `CORS_ORIGIN`
or `NEXT_PUBLIC_API_URL` doesn't exactly match your real URL, including the
`https://`).

## 6. Backups

You already have `scripts/backup-db.sh`. Put it on a cron on the server:
```bash
crontab -e
# add:
0 3 * * * cd /home/ubuntu/waplatform && ./scripts/backup-db.sh >> /home/ubuntu/backup.log 2>&1
```

## Known gaps this doesn't close yet (flagged in your original notes)

- **Still using `prisma db push`, not real migrations.** Fine for getting
  live, but before you're relying on this for real users, generate real
  migration files (needs a live DB connection, so do it against this
  server or a local Postgres) and switch the backend Dockerfile's CMD to
  `prisma migrate deploy`.
- **No secrets manager** — `.env` on the server is still the source of
  truth. Fine at this scale; revisit if you bring on a team.
- **No monitoring/alerting.** If the backend crashes, `restart:
  unless-stopped` will bring it back, but nothing notifies you. Worth
  wiring UptimeRobot (free tier) to hit `/api/v1/health` and alert you if
  it goes down — five-minute setup, no server changes needed.
- **Single server, no redundancy.** Fine for launch; Postgres/Redis data
  lives in Docker volumes on this one VM, so back it up (step 6) and treat
  VM loss as a real risk until you have off-server backups.
