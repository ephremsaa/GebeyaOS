#!/bin/sh
set -e

BACKUP_FILE="$1"

if [ -z "${BACKUP_FILE}" ]; then
  echo "Usage: $0 <path_to_backup_file.sql.gz>"
  echo "Example: $0 /backups/gebeyaos_backup_20261021_010000.sql.gz"
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file '${BACKUP_FILE}' not found."
  exit 1
fi

echo "=========================================================="
echo "WARNING: You are about to restore the GebeyaOS database!"
echo "Target DB: ${PGDATABASE:-gebeyaos_branch} on host ${PGHOST:-localhost}"
echo "Source: ${BACKUP_FILE}"
echo "=========================================================="

echo "[$(date)] Restoring database..."
gunzip -c "${BACKUP_FILE}" | psql -h "${PGHOST:-localhost}" \
                                 -U "${PGUSER:-postgres}" \
                                 -d "${PGDATABASE:-gebeyaos_branch}"

echo "[$(date)] Database restored successfully!"
