# syntax=docker/dockerfile:1
#
# Multi-stage build: compiles the minified JS/CSS bundle from source in a
# throwaway Node stage (mirrors scripts/build.sh / .github/workflows/build.yml),
# then serves it from a plain PHP + Apache runtime with no build tooling included.
#
# Build:  docker build -t frametrail .
# Run:    docker run -p 8080:80 -v frametrail_data:/var/www/html/_data frametrail

########################################
# Stage 1: build minified JS/CSS bundle
########################################
FROM node:20-alpine AS build

RUN apk add --no-cache bash

WORKDIR /src
COPY . .

RUN npm install -g terser csso-cli \
    && bash scripts/build.sh

########################################
# Stage 2: runtime (PHP + Apache)
########################################
FROM php:8.3-apache

# ffmpeg adds ~500MB (codecs/libs) for a feature (server-side video transcoding +
# thumbnail/scrub-sprite generation) the app detects at runtime and silently skips
# if absent. Off by default for a lean image; opt in with --build-arg WITH_FFMPEG=true.
ARG WITH_FFMPEG=false

# gd   -> image thumbnails (src/_server/files.php)
# curl -> oEmbed / OpenGraph resource previews
RUN apt-get update && apt-get install -y --no-install-recommends \
        libfreetype6-dev \
        libjpeg62-turbo-dev \
        libpng-dev \
        libcurl4-openssl-dev \
        $( [ "$WITH_FFMPEG" = "true" ] && echo ffmpeg ) \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" gd curl \
    && a2enmod rewrite \
    && printf '<Directory /var/www/html>\n    AllowOverride All\n</Directory>\n' \
        >> /etc/apache2/apache2.conf \
    # gd.so / curl.so link against these at runtime. Re-installing them by name
    # marks them "manually installed" so the --auto-remove purge below doesn't
    # treat them as orphaned deps of the -dev packages and remove them too.
    && apt-get install -y --no-install-recommends \
        libfreetype6 libjpeg62-turbo libpng16-16t64 libcurl4t64 \
    && apt-get purge -y --auto-remove \
        libfreetype6-dev libjpeg62-turbo-dev libpng-dev libcurl4-openssl-dev \
    && rm -rf /var/lib/apt/lists/* \
    # Fail the build loudly (rather than shipping a broken image) if a future base
    # image bump renames the runtime lib packages above and breaks extension loading.
    && php -m | grep -qx gd && php -m | grep -qx curl

WORKDIR /var/www/html
COPY --from=build /src/build/ ./

# Install dir + _data/ must be writable by the web server: FrameTrail's setup
# wizard creates _data/ on first run and writes into it on every save/upload.
RUN chown -R www-data:www-data /var/www/html

# _data/ doesn't exist yet at this point (it's created by the setup wizard), so
# this chown never reaches it once a volume/bind-mount is placed there at
# `docker run`/`compose up` time — mounting always overrides build-time state
# with a fresh, root-owned directory. docker-entrypoint.sh fixes ownership at
# container start instead, where the mounted path actually exists.
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["apache2-foreground"]
