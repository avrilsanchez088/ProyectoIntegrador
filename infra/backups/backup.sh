#!/bin/sh
set -eu

# pg_dump diario → directorio /backups con rotación de 14 días.
# §5.5 del audit. Se ejecuta como script de cron dentro del container `backups`.
#
# Variables:
#   PGHOST, PGUSER, PGPASSWORD, PGDATABASE — pasadas por docker-compose.
#   BACKUP_RETENTION_DAYS                  — default 14.
#   S3_ENDPOINT / S3_BUCKET                — opcional, si están copia el dump
#                                             a object storage (R2/MinIO).

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
DUMPFILE="/backups/${PGDATABASE}-${TIMESTAMP}.sql.gz"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup ${PGDATABASE} → ${DUMPFILE}"

pg_dump --format=custom --no-owner --no-acl "$PGDATABASE" | gzip -9 > "$DUMPFILE"

# Verificación mínima: el archivo no debe estar vacío.
if [ ! -s "$DUMPFILE" ]; then
  echo "[ERROR] Dump vacío"
  exit 1
fi
echo "  size=$(du -h "$DUMPFILE" | cut -f1)"

# Optional: subir a S3 / R2 / MinIO si están configurados.
if [ -n "${S3_BUCKET:-}" ] && [ -n "${S3_ENDPOINT:-}" ]; then
  if command -v aws >/dev/null 2>&1; then
    aws --endpoint-url "$S3_ENDPOINT" s3 cp "$DUMPFILE" "s3://${S3_BUCKET}/backups/" \
      || echo "[WARN] s3 cp falló (continuamos con backup local)"
  else
    echo "[WARN] aws CLI no instalado en container — solo backup local"
  fi
fi

# Rotación: borrar dumps más viejos que RETENTION_DAYS.
find /backups -name "${PGDATABASE}-*.sql.gz" -mtime +"$RETENTION_DAYS" -print -delete || true

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup OK"
