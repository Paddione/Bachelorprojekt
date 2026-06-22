<?php
/**
 * Nextcloud OIDC Login — Pocket ID Integration (Production)
 *
 * Uses internal Pocket ID URL for discovery (backchannel),
 * but public HTTPS URLs for browser redirects.
 * Pocket ID has no groups — maps isAdmin to the admin role.
 */
$CONFIG = [
  'oidc_login_provider_url'      => 'http://pocket-id:1411',
  'oidc_login_client_id'         => 'nextcloud',
  'oidc_login_client_secret'     => getenv('POCKET_ID_NEXTCLOUD_SECRET'),
  'oidc_login_auto_redirect'     => true,
  'oidc_login_logout_url'        => 'https://' . getenv('POCKET_ID_DOMAIN') . '/api/oidc/end-session?client_id=nextcloud&post_logout_redirect_uri=' . urlencode('https://' . getenv('NC_DOMAIN')),
  'oidc_login_button_text'       => 'Anmelden',
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
  'oidc_login_groups_attribute'  => 'isAdmin',
  'oidc_login_admin_group'       => 'true',
  'allow_user_to_change_display_name' => false,
  'lost_password_link'           => 'disabled',
];
