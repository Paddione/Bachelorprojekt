#!/bin/sh
# Install SSO middleware into Invoice Ninja
set -e

MIDDLEWARE_DIR="/var/www/app/app/Http/Middleware"
KERNEL="/var/www/app/app/Http/Kernel.php"

# Copy middleware
cp /sso/SsoAutoLogin.php "$MIDDLEWARE_DIR/SsoAutoLogin.php"
echo "[sso-init] Middleware copied"

# Register in Kernel.php - add to the 'web' middleware group
if ! grep -q 'SsoAutoLogin' "$KERNEL"; then
    # Add the use statement
    sed -i '/^use App\\Http\\Middleware\\SessionDomains;/a use App\\Http\\Middleware\\SsoAutoLogin;' "$KERNEL"
    # Add to web middleware group, after StartSession
    sed -i '/StartSession::class,/a\            SsoAutoLogin::class,' "$KERNEL"
    echo "[sso-init] Middleware registered in Kernel"
else
    echo "[sso-init] Middleware already registered"
fi
