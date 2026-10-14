# AEVORA Database Backup & Restoration Operational Runbook

**Target Systems**: AEVORA Staging & Production Environments  
**Primary Engine**: PostgreSQL 15 / 16 (Docker-managed)  
**Scripts**:
- [`infrastructure/scripts/backup-db.sh`](file:///e:/Aevora/infrastructure/scripts/backup-db.sh)
- [`infrastructure/scripts/restore-db.sh`](file:///e:/Aevora/infrastructure/scripts/restore-db.sh)

---

## 1. Architectural Overview & Backup Formats

The AEVORA backup infrastructure uses logical database extraction via `pg_dump` executed inside the active Docker container.

### Supported Formats

| Format Identifier | File Extension | PostgreSQL Switch | Description & Compression | Recommended Use |
|---|---|---|---|---|
| `custom` *(default)* | `.dump` | `-Fc` | PostgreSQL Custom Archive format with native internal zlib compression. Enables granular multi-table selective restoration and fast parallel restore. | **Primary Staging & Production format** |
| `sql` | `.sql.gz` | `-Fp \| gzip` | Plain SQL DDL/DML script compressed with gzip. Human-readable when uncompressed. | Disaster recovery audit / database migration |

### Integrity Verification Invariants
Every backup operation automatically enforces three validation stages before declaring success:
1. **Zero-Byte Check**: Verifies the archive file exists and is strictly non-empty (`[ -s "$BACKUP_FILE" ]`).
2. **Catalog Readability Verification**:
   - For `custom` archives: Executes `pg_restore -l` to parse the Table of Contents (TOC). Truncated or corrupt files immediately fail with exit code `1`.
   - For `sql.gz` archives: Executes `gzip -t` to test the CRC-32 checksum and decompression stream.
3. **No Credential Exposure**: `PGPASSWORD` is passed directly in subprocess environment streams; credentials and connection strings are never echoed, logged, or printed.

---

## 2. Retention Policy & Storage Directory

- **Default Backup Directory**: `/var/backups/aevora` (configurable via `BACKUP_DIR`).
- **File Naming Pattern**: `db_backup_YYYY-MM-DD_HH-MM-SS.dump` (or `.sql.gz`).
- **Retention Pruning**:
  - Controlled by `RETENTION_DAYS` (default: `30`) and `CLEANUP_OLD_BACKUPS=true`.
  - The script executes `find "$BACKUP_DIR" -type f \( -name "*.dump" -o -name "*.sql.gz" \) -mtime +"$RETENTION_DAYS" -exec rm -f {} \;`.
  - Backups created within the retention window are strictly preserved. Only files older than the retention threshold are removed.

---

## 3. Recurring Schedule Configurations (Linux Staging Host)

Because development machines may run Windows or non-systemd environments, scheduling configurations are stored in the repository and activated upon deployment to the Linux staging host.

### Option A: Systemd Timer (Recommended for Ubuntu / Debian / RHEL)

1. **Deploy Service and Timer units**:
   ```bash
   sudo cp /opt/aevora/infrastructure/scripts/systemd/aevora-backup.service /etc/systemd/system/
   sudo cp /opt/aevora/infrastructure/scripts/systemd/aevora-backup.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   ```

2. **Configure Host Overrides (Optional)**:
   Create `/etc/default/aevora-backup`:
   ```bash
   POSTGRES_CONTAINER=aevora_postgres_staging
   BACKUP_DIR=/var/backups/aevora
   BACKUP_FORMAT=custom
   RETENTION_DAYS=30
   CLEANUP_OLD_BACKUPS=true
   ```

3. **Enable and Start Timer**:
   ```bash
   sudo systemctl enable --now aevora-backup.timer
   ```

4. **Verify Timer Schedule & Last Execution**:
   ```bash
   systemctl list-timers --all | grep aevora-backup
   systemctl status aevora-backup.service
   journalctl -u aevora-backup.service -n 50
   ```

### Option B: Traditional Cron Schedule

1. **Install Cron File**:
   ```bash
   sudo cp /opt/aevora/infrastructure/scripts/cron/aevora-backup.cron /etc/cron.d/aevora-backup
   sudo chmod 0644 /etc/cron.d/aevora-backup
   ```

2. **Cron Schedule**: Executes daily at `02:00 UTC` (`0 2 * * *`). Logs output to `/var/log/aevora-backup.log`.

---

## 4. Local Storage Boundaries & Off-Site Replication Governance

### Current Scope: Local Host Volume Only
By design and security default:
- Backups are written strictly to the local filesystem of the host machine (`/var/backups/aevora`).
- **No data is transferred over the public internet or external networks.**
- No cloud storage bucket or third-party backup service is configured out-of-the-box.

### Off-Site Backup Authorization & Requirements
Before establishing automated off-site synchronization to remote storage (e.g. AWS S3, Google Cloud Storage, or Cloudflare R2), the following explicit approvals and configurations are mandatory:
1. **Explicit Architecture Approval**: Written approval from the Sovereign Chairman / Security Lead designating the target cloud provider and bucket ARN.
2. **Client-Side Envelope Encryption (KMS)**: Off-site archives must be encrypted with an independent KMS key (e.g. `gpg` or AWS KMS) before transmission.
3. **Dedicated IAM Role with Least Privilege**: The staging host must assume a role restricted solely to `s3:PutObject` on the specific backup prefix, without bucket-listing or deletion permissions.
4. **Lifecycle Immutability (WORM / Object Lock)**: The destination bucket should enforce retention locks (e.g. 90-day retention lock) to protect against ransomware.

---

## 5. Restoration Procedure

Restorations are performed using [`infrastructure/scripts/restore-db.sh`](file:///e:/Aevora/infrastructure/scripts/restore-db.sh).

### Safety Invariants
> [!CAUTION]
> Never restore into an active developer or production database without isolating or backing it up first. Always test restoration into a fresh or disposable container.

### Step-by-Step Restoration Workflow

1. **Identify the desired backup archive**:
   ```bash
   ls -lh /var/backups/aevora/
   ```

2. **Execute restoration against the target container**:
   ```bash
   /opt/aevora/infrastructure/scripts/restore-db.sh \
     /var/backups/aevora/db_backup_2026-10-13_02-00-00.dump \
     aevora_postgres_staging
   ```

3. **Restoration format auto-detection**:
   `restore-db.sh` inspects the archive header magic bytes:
   - If magic bytes start with `PGDMP`, it invokes `pg_restore --clean --if-exists --no-owner --no-privileges`.
   - If magic bytes start with `1f8b` (gzip) containing `PGDMP`, it pipes `gunzip -c` into `pg_restore`.
   - If magic bytes represent plain SQL text, it invokes `psql -v ON_ERROR_STOP=1`.

4. **Post-Restoration Verification**:
   Verify entity counts and schema readiness:
   ```bash
   docker exec -i aevora_postgres_staging psql -U aevora -d aevoradb -c \
     "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
   docker exec -i aevora_postgres_staging psql -U aevora -d aevoradb -c \
     "SELECT id, name FROM \"Company\";"
   ```

---

## 6. Failure Modes & Troubleshooting

| Symptom | Root Cause | Remediation |
|---|---|---|
| `Target container ... is not running` | Database container stopped or unhealthy. | Start container: `docker compose up -d postgres`. Verify with `docker ps`. |
| `Backup failed. File is missing or 0 bytes` | Disk full, incorrect container credentials, or `pg_dump` error. | Check host disk space (`df -h /var/backups`). Check container logs: `docker logs <container>`. |
| `Archive readability verified (catalog check failed)` | Network interruption or process kill during dump stream. | The corrupt file will not overwrite valid backups. Re-run backup manually. |
| `pg_restore: error: input file does not appear to be a valid archive` | Incorrect file passed to `restore-db.sh` or corrupted archive. | Check file integrity with `od -tx1 -c <file> \| head -n 2`. Ensure file is not 0 bytes. |
