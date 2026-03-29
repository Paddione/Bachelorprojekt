<?php
/**
 * Nextcloud OIDC Login — Keycloak Integration
 *
 * Wird automatisch von Nextcloud geladen, wenn in /var/www/html/config/ gemountet.
 * Setzt voraus, dass die App "oidc_login" installiert ist:
 *   docker exec homeoffice-nextcloud php occ app:install oidc_login
 */
$CONFIG = [
  'oidc_login_provider_url'      => 'https://' . getenv('KC_DOMAIN') . '/realms/homeoffice',
  'oidc_login_client_id'         => 'nextcloud',
  'oidc_login_client_secret'     => getenv('NEXTCLOUD_OIDC_SECRET'),
  'oidc_login_auto_redirect'     => false,
  'oidc_login_logout_url'        => 'https://' . getenv('KC_DOMAIN') . '/realms/homeoffice/protocol/openid-connect/logout?client_id=nextcloud&post_logout_redirect_uri=' . urlencode('https://' . getenv('NC_DOMAIN')),
  'oidc_login_button_text'       => 'Mit Keycloak anmelden',
  'oidc_login_hide_password_form' => false,
  'oidc_login_use_id_token'      => false,
  'oidc_login_attributes'        => [
    'id'   => 'preferred_username',
    'name' => 'name',
    'mail' => 'email',
  ],
  'oidc_login_scope'             => 'openid email profile',
  'oidc_login_disable_registration' => false,
  'oidc_login_tls_verify'        => true,
  'allow_user_to_change_display_name' => false,
  'lost_password_link'           => 'disabled',
];
