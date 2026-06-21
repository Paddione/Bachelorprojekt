<?php
/**
 * Nextcloud OIDC Login — Pocket ID Integration (Dev)
 *
 * Dev-Variante: HTTP statt HTTPS, interner Pocket-ID-URL für Discovery.
 * Pocket ID hat keine Gruppen, daher mappt 'isAdmin' auf die
 * Admin-Rolle der oidc_login_usersMap-Spalte.
 */
$CONFIG = [
  'oidc_login_provider_url'      => 'http://pocket-id:1411',
  'oidc_login_client_id'         => 'nextcloud',
  'oidc_login_client_secret'     => getenv('POCKET_ID_NEXTCLOUD_SECRET') ?: getenv('NEXTCLOUD_OIDC_SECRET'),
  'oidc_login_auto_redirect'     => true,
  'oidc_login_logout_url'        => 'http://' . getenv('POCKET_ID_DOMAIN') . '/api/oidc/end-session?client_id=nextcloud&post_logout_redirect_uri=' . urlencode('http://' . getenv('NC_DOMAIN')),
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
  'oidc_login_tls_verify'        => false,
  'oidc_login_groups_attribute'  => 'isAdmin',
  'oidc_login_admin_group'       => 'true',
  'allow_user_to_change_display_name' => false,
  'lost_password_link'           => 'disabled',
];
