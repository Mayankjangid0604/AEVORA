#!/bin/bash
# backup-db.sh
# Performs a logical pg_dump of the AEVORA PostgreSQL database.
# Supports custom binary archive (.dump) with native zlib compression (default)
# and gzipped plain text SQL (.sql.gz).
# Assumes it is run on the host machine where the docker containers are running.

set -euo pipefail

TARGET_CONTAINER="${1:-${POSTGRES_CONTAINER:-aevora_postgres_prod}}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/aevora}"
BACKUP_FORMAT="${BACKUP_FORMAT:-custom}" # 'custom' (.dump) or 'sql' (.sql.gz)

# Validate BACKUP_DIR upfront before any filesystem operations
if [ -z "${BACKUP_DIR:-}" ] || [ "$BACKUP_DIR" = "/" ] || [ "$BACKUP_DIR" = "." ] || [[ "$BACKUP_DIR" == *".."* ]] || [[ "$BACKUP_DIR" != /* ]]; then
  echo "Error: Unsafe, relative, or suspicious BACKUP_DIR '$BACKUP_DIR'. BACKUP_DIR must be an absolute path and not root ('/')."
  exit 1
fi

# Validate TARGET_CONTAINER name format
if ! [[ "$TARGET_CONTAINER" =~ ^[a-zA-Z0-9_.-]+$ ]]; then
  echo "Error: Invalid target container name '$TARGET_CONTAINER'."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Safely load database environment variables if unset
for ENV_FILE in "$REPO_ROOT/.env.production" "$REPO_ROOT/.env.staging"; do
  if [ -f "$ENV_FILE" ]; then
    if [ -z "${POSTGRES_USER:-}" ]; then
      EXTRACTED_USER=$(grep -E "^[[:space:]]*POSTGRES_USER=" "$ENV_FILE" | head -n 1 | cut -d'=' -f2- | tr -d ' "'"'")
      if [ -n "$EXTRACTED_USER" ]; then POSTGRES_USER="$EXTRACTED_USER"; fi
    fi
    if [ -z "${POSTGRES_DB:-}" ]; then
      EXTRACTED_DB=$(grep -E "^[[:space:]]*POSTGRES_DB=" "$ENV_FILE" | head -n 1 | cut -d'=' -f2- | tr -d ' "'"'")
      if [ -n "$EXTRACTED_DB" ]; then POSTGRES_DB="$EXTRACTED_DB"; fi
    fi
    break
  fi
done

POSTGRES_USER="${POSTGRES_USER:-aevora}"
POSTGRES_DB="${POSTGRES_DB:-aevoradb}"

DATE=$(date +"%Y-%m-%d_%H-%M-%S")
if [ "$BACKUP_FORMAT" = "sql" ]; then
  BACKUP_FILE="$BACKUP_DIR/db_backup_$DATE.sql.gz"
  FORMAT_LABEL="Plain SQL (gzip compressed)"
else
  BACKUP_FILE="$BACKUP_DIR/db_backup_$DATE.dump"
  FORMAT_LABEL="PostgreSQL Custom Archive (native compression)"
fi

# Check if target container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${TARGET_CONTAINER}$"; then
  echo "Error: Target container '$TARGET_CONTAINER' is not running."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "=================================================="
echo "AEVORA Database Backup Utility"
echo "Target Container: $TARGET_CONTAINER"
echo "Backup File:      $BACKUP_FILE"
echo "Format:           $FORMAT_LABEL"
echo "Database:         $POSTGRES_DB"
echo "User:             $POSTGRES_USER"
echo "=================================================="

echo "Starting database backup at $DATE..."

# Atomic file generation: dump to temporary file and verify before committing
TEMP_BACKUP_FILE="${BACKUP_FILE}.tmp.$$"
trap 'rm -f "${TEMP_BACKUP_FILE:-}"' EXIT INT TERM

# Execute pg_dump inside running Postgres container.
# CRITICAL: Do NOT use -t (pseudo-TTY) because it corrupts binary data (LF -> CRLF conversion)
if [ "$BACKUP_FORMAT" = "sql" ]; then
  docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$TARGET_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fp | gzip > "$TEMP_BACKUP_FILE"
else
  # Native custom archive format (-Fc) has built-in zlib compression; avoid redundant double-gzip
  docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$TARGET_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$TEMP_BACKUP_FILE"
fi

RETENTION_DAYS="${RETENTION_DAYS:-30}"
if ! [[ "$RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  echo "Error: RETENTION_DAYS must be a positive integer, got '$RETENTION_DAYS'."
  exit 1
fi

# Verify backup was created and is non-empty
if [ ! -s "$TEMP_BACKUP_FILE" ]; then
  echo "Error: Backup failed. Temporary file '$TEMP_BACKUP_FILE' is missing or 0 bytes."
  exit 1
fi

# Verify archive readability
if [ "$BACKUP_FORMAT" = "sql" ]; then
  if command -v gzip >/dev/null 2>&1; then
    if ! gzip -t "$TEMP_BACKUP_FILE" 2>/dev/null; then
      echo "Error: Generated backup archive '$TEMP_BACKUP_FILE' is corrupt or not valid gzip."
      exit 1
    fi
    echo "Archive readability verified (gzip CRC check passed)."
  fi
else
  # Custom archive: verify catalog readability via pg_restore inside container
  if ! docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$TARGET_CONTAINER" pg_restore -l < "$TEMP_BACKUP_FILE" >/dev/null 2>&1; then
    echo "Error: Generated backup archive '$TEMP_BACKUP_FILE' is corrupt or unreadable."
    exit 1
  fi
  echo "Archive readability verified (pg_restore catalog check passed)."
fi

# Atomically commit the validated backup file
mv "$TEMP_BACKUP_FILE" "$BACKUP_FILE"
trap - EXIT INT TERM

echo "Backup saved successfully to $BACKUP_FILE ($(wc -c < "$BACKUP_FILE") bytes)"

# Retention cleanup: Keep only the configured retention days
if [ -d "$BACKUP_DIR" ] && [ "${CLEANUP_OLD_BACKUPS:-true}" = "true" ]; then
  # Use -mindepth 1 -maxdepth 1 to strictly prevent directory escape or recursive subdirectory removal
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type f \( -name "db_backup_*.dump" -o -name "db_backup_*.sql.gz" \) -mtime +"$RETENTION_DAYS" -exec rm -f {} \; 2>/dev/null || true
  echo "Cleaned up backups older than $RETENTION_DAYS days."
fi
