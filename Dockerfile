FROM php:8.2-apache AS base

# Enable Apache modules (rewrite is built-in)
RUN a2enmod rewrite headers

# Set working directory
WORKDIR /var/www/html

# Copy application files
COPY --chown=www-data:www-data . .

# Create data directory with proper permissions
RUN mkdir -p data/backups && chown -R www-data:www-data data

# Set Apache document root and enable .htaccess
RUN echo '<Directory /var/www/html>\n\
    AllowOverride All\n\
    Require all granted\n\
</Directory>' > /etc/apache2/conf-available/app.conf && \
    a2enconf app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# Production stage
FROM base AS production
ENV MEDISA_SNAPSHOT_MAX=25
EXPOSE 80
CMD ["apache2-foreground"]
