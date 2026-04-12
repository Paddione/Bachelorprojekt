<?php
$CONFIG = [
    'memcache.local'       => '\\OC\\Memcache\\APCu',
    'memcache.distributed' => '\\OC\\Memcache\\Redis',
    'memcache.locking'     => '\\OC\\Memcache\\Redis',
    'redis' => [
        'host'     => 'nextcloud-redis',
        'port'     => 6379,
        'timeout'  => 1.5,
        'dbindex'  => 0,
    ],
    'default_phone_region'     => 'DE',
    'maintenance_window_start' => 1,
    'serverid'                 => 'workspace-nc-01',
    'log_rotate_size'          => 104857600,
];
