#!/bin/sh
set -e

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/gebeyaos_backup_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Starting automated PostgreSQL backup..."
pg_dump -h "${PGHOST:-localhost}" \
        -U "${PGUSER:-postgres}" \
        -d "${PGDATABASE:-gebeyaos_branch}" \
        --no-owner \
        --clean \
        --if-exists \
        | gzip > "${BACKUP_FILE}"

echo "[$(date)] Backup completed successfully: ${BACKUP_FILE}"
echo "[$(date)] Size: $(ls -lh "${BACKUP_FILE}" | awk '{print $5}')"

# Retain backups for 30 days, purge older ones
find "${BACKUP_DIR}" -type f -name "gebeyaos_backup_*.sql.gz" -mtime +30 -exec rm -f {} +
echo "[$(date)] Old backups purged (> 30 days)."
