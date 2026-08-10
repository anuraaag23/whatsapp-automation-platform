#!/usr/bin/env bash
# Backs up the app's Postgres database to ./backups/waplatform-<timestamp>.sql.gz
# Usage: ./scripts/backup-db.sh
# Restore: gunzip -c backups/waplatform-XXXX.sql.gz | docker compose exec -T postgres psql -U waplatform -d waplatform

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

BACKUP_DIR="./backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTFILE="$BACKUP_DIR/waplatform-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "Backing up database to $OUTFILE ..."
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-waplatform}" "${POSTGRES_DB:-waplatform}" | gzip > "$OUTFILE"

echo "Done. $(du -h "$OUTFILE" | cut -f1) written."
echo ""
echo "Keeping the last 14 backups, removing older ones..."
ls -1t "$BACKUP_DIR"/waplatform-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --

echo "Backup complete."
