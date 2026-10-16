#!/bin/bash
# restore-db.sh
# Performs a safe logical restoration of an AEVORA PostgreSQL database backup.
# Automatically detects archive format:
#   - PostgreSQL custom format (.dump / .pgdump / raw PGDMP) -> pg_restore
#   - Gzipped custom format (pg_dump -Fc | gzip)             -> gunzip | pg_restore
#   - Gzipped SQL (.sql.gz)                                   -> gunzip | psql
#   - Plain SQL text (.sql)                                   -> psql
# Assumes it is run on the host machine where the docker containers are running.

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Error: Both backup file path and target container name are required to prevent accidental restore into the wrong database."
  echo "Usage: $0 <path-to-backup-file> <target-container-name>"
  echo "Example: $0 /var/backups/aevora/db_backup_2026-10-13_12-00-00.dump aevora_postgres_staging"
  exit 1
fi

BACKUP_FILE="$1"
TARGET_CONTAINER="$2"

# SAFETY GUARD 1: Refuse restoration into active developer containers
if [ "$TARGET_CONTAINER" = "aevora_postgres" ] || [ "$TARGET_CONTAINER" = "hostel-postgres" ]; then
  echo "Error: Refusing to restore into developer container '$TARGET_CONTAINER'. Developer databases are strictly protected."
  exit 1
fi

# SAFETY GUARD 1b: the live local application database needs explicit confirmation (restore overwrites existing tables)
if [ "$TARGET_CONTAINER" = "aevora_postgres_fresh" ] && [ "${CONFIRM_LOCAL_RESTORE:-false}" != "true" ]; then
  echo "SAFETY GUARD: '$TARGET_CONTAINER' is the live local AEVORA application database."
  echo "Restoring overwrites its current data. Take a fresh backup first, then re-run with CONFIRM_LOCAL_RESTORE=true."
  exit 1
fi

# SAFETY GUARD 2: Explicit confirmation required when targeting production databases
if [[ "$TARGET_CONTAINER" == *"prod"* ]]; then
  if [ "${CONFIRM_PRODUCTION_RESTORE:-false}" != "true" ]; then
    echo "================================================================================"
    echo "SAFETY GUARD: Target container '$TARGET_CONTAINER' appears to be a PRODUCTION database!"
    echo "Restoration is a destructive operation that will overwrite existing tables."
    echo "To proceed, you must explicitly set CONFIRM_PRODUCTION_RESTORE=true in the environment."
    echo "Example: CONFIRM_PRODUCTION_RESTORE=true $0 $BACKUP_FILE $TARGET_CONTAINER"
    echo "================================================================================"
    exit 1
  fi
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file '$BACKUP_FILE' not found."
  exit 1
fi

if [ ! -s "$BACKUP_FILE" ]; then
  echo "Error: Backup file '$BACKUP_FILE' is empty (0 bytes). Cannot restore from empty archive."
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

echo "=================================================="
echo "AEVORA Database Restoration Utility"
echo "Backup File:      $BACKUP_FILE ($(wc -c < "$BACKUP_FILE") bytes)"
echo "Target Container: $TARGET_CONTAINER"
echo "Database:         $POSTGRES_DB"
echo "User:             $POSTGRES_USER"
echo "=================================================="

# Check if target container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${TARGET_CONTAINER}$"; then
  echo "Error: Target container '$TARGET_CONTAINER' is not running."
  exit 1
fi

# Format detection:
# 1. Check if file is gzip-compressed (magic bytes 0x1f 0x8b)
IS_GZIP=false
GZIP_HEADER=$(head -c 2 "$BACKUP_FILE" 2>/dev/null | od -An -tx1 2>/dev/null | tr -d ' ' || true)
if [ "$GZIP_HEADER" = "1f8b" ]; then
  IS_GZIP=true
fi

# 2. Check if payload (decompressed or raw) starts with PostgreSQL custom archive header 'PGDMP'
IS_PGDMP=false
if [ "$IS_GZIP" = true ]; then
  PAYLOAD_MAGIC=$(gunzip -c "$BACKUP_FILE" 2>/dev/null | head -c 5 2>/dev/null || true)
else
  PAYLOAD_MAGIC=$(head -c 5 "$BACKUP_FILE" 2>/dev/null || true)
fi

if [ "$PAYLOAD_MAGIC" = "PGDMP" ]; then
  IS_PGDMP=true
fi

echo "Archive Inspection: GzipCompressed=$IS_GZIP, CustomFormatPGDMP=$IS_PGDMP"

if [ "$IS_PGDMP" = true ]; then
  echo "Executing restore via pg_restore (PostgreSQL custom format)..."
  if [ "$IS_GZIP" = true ]; then
    gunzip -c "$BACKUP_FILE" | docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$TARGET_CONTAINER" pg_restore \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
      --clean \
      --if-exists \
      --no-owner \
      --no-privileges
  else
    cat "$BACKUP_FILE" | docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$TARGET_CONTAINER" pg_restore \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
      --clean \
      --if-exists \
      --no-owner \
      --no-privileges
  fi
else
  echo "Executing restore via psql (plain SQL script)..."
  if [ "$IS_GZIP" = true ]; then
    gunzip -c "$BACKUP_FILE" | docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$TARGET_CONTAINER" psql \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
      -v ON_ERROR_STOP=1
  else
    cat "$BACKUP_FILE" | docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$TARGET_CONTAINER" psql \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
      -v ON_ERROR_STOP=1
  fi
fi

echo "Database restoration completed successfully."
