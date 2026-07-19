#!/bin/bash
set -e

# Railway gives the container a random $PORT and routes traffic to it.
# Apache defaults to listening on 80 — point it at $PORT instead.
: "${PORT:=80}"

sed -i "s/Listen 80/Listen ${PORT}/" /etc/apache2/ports.conf
sed -i "s/:80>/:${PORT}>/" /etc/apache2/sites-enabled/000-default.conf

exec "$@"
