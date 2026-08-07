#!/bin/sh
set -e

# _data/ doesn't exist in the image (FrameTrail's setup wizard creates it on
# first run), so a fresh volume/bind-mount is initialized root-owned by Docker.
# The chown baked into the image at build time never touches it, since it's
# applied before any volume is ever mounted over the path. Fix ownership here,
# at container start, once — skip it once it's already correct so a large
# _data/ doesn't pay a recursive chown on every restart.
mkdir -p /var/www/html/_data
if [ "$(stat -c '%U' /var/www/html/_data)" != "www-data" ]; then
    chown -R www-data:www-data /var/www/html/_data
fi

exec docker-php-entrypoint "$@"
