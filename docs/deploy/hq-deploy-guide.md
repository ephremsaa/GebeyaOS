# GebeyaOS – Central HQ Cloud Deployment Guide (Linux VPS)
**Target: Ubuntu 22.04 / 24.04 LTS VPS with Docker, Caddy HTTPS, and Isolated Database**

---

## 1. System Requirements & Architecture
* **VPS Size**: 2 vCPU, 4GB RAM, 50GB NVMe SSD (Hetzner, DigitalOcean, or AWS EC2).
* **Ports Exposed to Internet**: Port `80` (HTTP) and Port `443` (HTTPS) ONLY.
* **Database**: PostgreSQL 16 isolated inside internal Docker network (Port 5432 is NEVER exposed publicly).
* **Ingress**: Caddy Web Server providing automated Let's Encrypt TLS certificates, HTTP/3, and reverse-proxying to NestJS.

---

## 2. Server Preparation (Ubuntu)
SSH into your VPS as root:
```bash
# Update and install Docker
apt update && apt upgrade -y
apt install -y curl git ufw fail2ban jq

# Install Docker Engine & Compose plugin
curl -fsSL https://get.docker.com | sh
usermod -aG docker ubuntu

# Configure Strict UFW Firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

---

## 3. Deployment Configuration
Clone the repository into `/opt/gebeyaos`:
```bash
git clone https://github.com/ephremsaa/GebeyaOS.git /opt/gebeyaos
cd /opt/gebeyaos
```

Create production configuration `/opt/gebeyaos/.env.hq`:
```bash
# Generate high-entropy secrets
HQ_DB_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

cat <<EOF > /opt/gebeyaos/.env.hq
NODE_ENV=production
HQ_DB_NAME=gebeyaos_central
HQ_DB_USER=gebeyaos_hq
HQ_DB_PASSWORD=${HQ_DB_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
CORS_ORIGINS=https://admin.gebeyaos.et
APP_VERSION=1.0.0
EOF

chmod 600 /opt/gebeyaos/.env.hq
```

Update `/opt/gebeyaos/docker/Caddyfile` with your live domain:
```caddy
admin.gebeyaos.et {
    handle /api/* {
        uri strip_prefix /api
        reverse_proxy hq-server:4000
    }
    handle /health { reverse_proxy hq-server:4000 }
    handle /ready { reverse_proxy hq-server:4000 }
    handle {
        root * /srv/admin
        try_files {path} /index.html
        file_server
    }
}
```

---

## 4. Launching HQ Cluster
```bash
cd /opt/gebeyaos/docker
docker compose -f docker-compose.hq.yml --env-file /opt/gebeyaos/.env.hq up -d --build
```

Verify service readiness:
```bash
curl -i http://localhost:4000/ready
# Expected: {"status":"ok","service":"gebeyaos-hq-server","db":"reachable"}
```

---

## 5. Provisioning First Platform Super Administrator
```bash
docker exec -it gebeyaos-hq-server node /app/scripts/create-platform-admin.js
```
Follow the interactive prompts to generate the primary super administrator credentials and 160-bit TOTP authenticator secret.
