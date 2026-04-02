<?php
/**
 * WordPress MCP Adapter — in-pod setup script.
 *
 * Run via: kubectl exec -n wordpress deploy/wordpress -- php /tmp/mcp-setup.php
 * (the Taskfile pipes this file into stdin and runs it with `php /dev/stdin`)
 *
 * Must run inside the wordpress:6-apache container so that wp_hash_password()
 * produces $wp$2y$ (bcrypt) hashes. The wordpress:cli image falls back to the
 * older $generic$ (phpass) algorithm, which the Apache pod cannot verify.
 */

$_SERVER['HTTP_HOST'] = 'localhost';
require '/var/www/html/wp-load.php';

// ── Install mu-plugin to unblock Application Passwords in local env ───────────
// Wordfence's loginSec_disableApplicationPasswords setting hooks __return_false
// onto wp_is_application_passwords_available, blocking all Application Password
// auth. This mu-plugin runs after plugins_loaded (priority 20) and removes that
// hook when WP_ENVIRONMENT_TYPE=local — the value set in the k3d container env.
$muplugins_dir = WP_CONTENT_DIR . '/mu-plugins';
if ( ! is_dir( $muplugins_dir ) ) {
    mkdir( $muplugins_dir, 0755, true );
}
$mu_plugin_path = $muplugins_dir . '/openclaw-mcp-apppasswords.php';
$mu_plugin_code = <<<'PHP'
<?php
/**
 * OpenClaw MCP — Re-enable Application Passwords on local/k3d environments.
 *
 * Wordfence's "Disable Application Passwords" security setting blocks all
 * Application Password authentication via __return_false. This mu-plugin
 * removes that override when the environment type is 'local', allowing
 * in-cluster MCP adapter requests to authenticate via HTTP Basic Auth.
 *
 * Only active when WP_ENVIRONMENT_TYPE=local (set in the k3d container env).
 * Has no effect in production where WP_ENVIRONMENT_TYPE != 'local'.
 */
add_action( 'plugins_loaded', function () {
    if ( 'local' === wp_get_environment_type() ) {
        remove_filter( 'wp_is_application_passwords_available', '__return_false' );
    }
}, 20 );
PHP;
file_put_contents( $mu_plugin_path, $mu_plugin_code );
echo "OK: mu-plugin installed at mu-plugins/openclaw-mcp-apppasswords.php\n";

// ── Activate plugins ─────────────────────────────────────────────────────────
$plugins = [
    'abilities-api/abilities-api.php',
    'mcp-adapter/mcp-adapter.php',
];
foreach ($plugins as $plugin) {
    if ( ! is_plugin_active( $plugin ) ) {
        $result = activate_plugin( $plugin );
        if ( is_wp_error( $result ) ) {
            fwrite( STDERR, "WARN: Could not activate $plugin: " . $result->get_error_message() . "\n" );
        } else {
            echo "OK: Activated $plugin\n";
        }
    } else {
        echo "OK: $plugin already active\n";
    }
}

// ── Resolve admin user ────────────────────────────────────────────────────────
$users = get_users( [ 'role__in' => [ 'administrator' ], 'number' => 1 ] );
if ( empty( $users ) ) {
    fwrite( STDERR, "ERROR: No administrator user found.\n" );
    exit( 1 );
}
$user = $users[0];

// ── Remove stale openclaw app password if it exists ───────────────────────────
foreach ( WP_Application_Passwords::get_user_application_passwords( $user->ID ) as $ap ) {
    if ( $ap['name'] === 'openclaw' ) {
        WP_Application_Passwords::delete_application_password( $user->ID, $ap['uuid'] );
        echo "INFO: Removed stale 'openclaw' application password.\n";
    }
}

// ── Create new Application Password ──────────────────────────────────────────
$result = WP_Application_Passwords::create_new_application_password(
    $user->ID,
    [ 'name' => 'openclaw' ]
);
if ( is_wp_error( $result ) ) {
    fwrite( STDERR, "ERROR: " . $result->get_error_message() . "\n" );
    exit( 1 );
}
$raw_password = $result[0]; // plaintext — irrecoverable after this point

echo "\n";
echo "┌─────────────────────────────────────────────────────────┐\n";
echo "│           WordPress MCP Adapter — Ready                 │\n";
echo "├─────────────────────────────────────────────────────────┤\n";
echo "│  Endpoint:                                              │\n";
echo "│    /wp-json/mcp/mcp-adapter-default-server              │\n";
echo "│                                                         │\n";
echo "│  Credentials (shown ONCE — save immediately):           │\n";
printf( "│  Username:     %-40s │\n", $user->user_login );
printf( "│  App Password: %-40s │\n", $raw_password );
echo "│                                                         │\n";
echo "│  Run: task wordpress:mcp:save-credentials               │\n";
echo "└─────────────────────────────────────────────────────────┘\n";
echo "\n";
echo "OPENCLAW_WP_USERNAME={$user->user_login}\n";
echo "OPENCLAW_WP_APP_PASSWORD={$raw_password}\n";
