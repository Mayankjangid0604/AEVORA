#!/bin/bash
# backup-db.sh
# Performs a logical pg_dump of the production database and compresses it.
# Assumes it is run on the host machine where the docker containers are running.

set -e

# Load environment variables
source ../../.env.production

BACKUP_DIR="/var/backups/aevora"
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/db_backup_$DATE.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "Starting database backup at $DATE..."

# Execute pg_dump inside the running Postgres container and gzip it
docker exec -t aevora_postgres_prod pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc | gzip > "$BACKUP_FILE"

echo "Backup saved to $BACKUP_FILE"

# Optional: Keep only the last 30 days of backups
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +30 -exec rm {} \;
echo "Cleaned up old backups."

# Optional: Add AWS CLI sync to S3 here
# aws s3 sync $BACKUP_DIR s3://your-aevora-backup-bucket/
