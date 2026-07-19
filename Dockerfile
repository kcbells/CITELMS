# CIT-LMS — Docker image for Railway
FROM php:8.2-apache

# ── System packages + PHP extensions your code actually uses ──
# (PDO/pdo_mysql for the database, zip for ZipArchive, curl is built-in)
RUN apt-get update && apt-get install -y \
        libzip-dev \
        unzip \
        libcurl4-openssl-dev \
    && docker-php-ext-install pdo pdo_mysql zip \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

# ── Let .htaccess actually work (Apache ignores it by default) ──
RUN sed -ri -e 's!AllowOverride None!AllowOverride All!g' /etc/apache2/apache2.conf

WORKDIR /var/www/html

# Copy the project in
COPY . /var/www/html/

# Writable folders your app needs at runtime
RUN mkdir -p uploads logs storage \
    && chown -R www-data:www-data /var/www/html \
    && find /var/www/html -type d -exec chmod 755 {} \; \
    && find /var/www/html -type f -exec chmod 644 {} \;

# Railway assigns a random $PORT — this script points Apache at it
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["apache2-foreground"]
