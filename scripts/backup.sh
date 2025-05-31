#!/bin/bash
# scripts/backup.sh

# Workflow Engine Backup Script

set -e

# Configuration
BACKUP_DIR=${BACKUP_DIR:-"/backup/workflow-engine"}
DATA_DIR=${DATA_DIR:-"/opt/workflow-engine/data"}
CONFIG_DIR=${CONFIG_DIR:-"/opt/workflow-engine/config"}
RETENTION_DAYS=${RETENTION_DAYS:-7}

# Create backup directory
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/$TIMESTAMP"
mkdir -p "$BACKUP_PATH"

echo "Starting backup to $BACKUP_PATH"

# Backup data directory
echo "Backing up data..."
tar -czf "$BACKUP_PATH/data.tar.gz" -C "$DATA_DIR" .

# Backup config directory
echo "Backing up config..."
tar -czf "$BACKUP_PATH/config.tar.gz" -C "$CONFIG_DIR" .

# Backup database (if using PostgreSQL)
if [ -n "$DATABASE_URL" ]; then
    echo "Backing up database..."
    pg_dump "$DATABASE_URL" | gzip > "$BACKUP_PATH/database.sql.gz"
fi

# Create backup manifest
cat > "$BACKUP_PATH/manifest.json" << EOF
{
    "timestamp": "$TIMESTAMP",
    "version": "$(cat /opt/workflow-engine/VERSION)",
    "components": ["data", "config", "database"],
    "size": "$(du -sh $BACKUP_PATH | cut -f1)"
}
EOF

# Clean old backups
echo "Cleaning old backups..."
find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \;

echo "Backup completed successfully"

# Optional: Upload to S3
if [ -n "$S3_BUCKET" ]; then
    echo "Uploading to S3..."
    aws s3 sync "$BACKUP_PATH" "s3://$S3_BUCKET/backups/$TIMESTAMP/"
fi