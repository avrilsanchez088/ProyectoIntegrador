# Container chico que corre pg_dump diario.
# §5.5 del audit. Usar en docker-compose-prod.yml (V1 dev no lo levanta).

FROM postgres:16-alpine

RUN apk add --no-cache dcron tzdata

# Crontab que corre backup.sh todos los días a las 03:00 UTC.
RUN echo "0 3 * * * /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

# Foreground crond + tail del log para que docker logs muestre la actividad.
CMD ["sh", "-c", "touch /var/log/backup.log && crond && tail -F /var/log/backup.log"]
