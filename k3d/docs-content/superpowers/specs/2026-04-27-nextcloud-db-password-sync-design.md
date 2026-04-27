# Nextcloud DB Password Sync — Design

**Date:** 2026-04-27

## Problem

Nextcloud writes `dbpassword` into `config.php` on first install and reads it from there on every subsequent restart. When `NEXTCLOUD_DB_PASSWORD` in the `workspace-secrets` SealedSecret is rotated, the PostgreSQL role is updated but `config.php` on the PVC is not — causing authentication failures and a crash-loop on the next pod restart.

## Solution

Add a `zz-db.config.php` config file (mounted from a ConfigMap, read-only) that overrides `dbpassword` at runtime using `getenv('POSTGRES_PASSWORD')`. Nextcloud loads all PHP files in `config/` alphabetically; the `zz-` prefix guarantees this file wins over `config.php`.

This is the established pattern in the codebase: `oidc.config.php` already uses `getenv()` for secrets.

## Scope

The change lives entirely in `k3d/nextcloud.yaml` (the base). Both prod overlays inherit via `k3d → prod → prod-mentolder / prod-korczewski` and require no modifications — `prod/patch-nextcloud.yaml` only overrides env vars, leaving volumes untouched. `POSTGRES_PASSWORD` is already injected from `workspace-secrets` in all three environments (dev secret in k3d, SealedSecret in prod).

## Changes

**File:** `k3d/nextcloud.yaml`

1. Add `ConfigMap` named `nextcloud-db-config` with one key `zz-db.config.php`:
   ```php
   <?php
   $CONFIG = ['dbpassword' => getenv('POSTGRES_PASSWORD')];
   ```

2. Add a `volume` entry referencing the ConfigMap.

3. Add a `volumeMount` in the `nextcloud` container mounting `zz-db.config.php` read-only at `/var/www/html/config/zz-db.config.php`.

4. Add the same `volumeMount` in the `nextcloud-cron` sidecar (it runs `cron.php` which also bootstraps Nextcloud's DI container).

No other files change. `POSTGRES_PASSWORD` is already injected from `workspace-secrets`.

## Result

Any secret rotation automatically takes effect on the next pod restart without manual `config.php` edits.
