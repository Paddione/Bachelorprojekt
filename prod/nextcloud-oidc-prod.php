<?php
/**
 * Nextcloud OIDC Login — Keycloak Integration (Production)
 *
 * Uses internal Keycloak URL for discovery (backchannel),
 * but public HTTPS URLs for browser redirects.
 */
$CONFIG = [
  'oidc_login_provider_url'      => 'http://keycloak:8080/realms/workspace',
  'oidc_login_client_id'         => 'nextcloud',
  'oidc_login_client_secret'     => getenv('NEXTCLOUD_OIDC_SECRET'),
  'oidc_login_auto_redirect'     => true,
  'oidc_login_logout_url'        => 'https://' . getenv('KC_DOMAIN') . '/realms/workspace/protocol/openid-connect/logout?client_id=nextcloud&post_logout_redirect_uri=' . urlencode('https://' . getenv('NC_DOMAIN')),
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
