<?php
$CONFIG = [
    // Reverse proxy — trust in-cluster pod/service CIDRs (RFC1918)
    'trusted_proxies' => [
        '10.0.0.0/8',
        '172.16.0.0/12',
        '192.168.0.0/16',
        '127.0.0.1/32',
    ],
    'forwarded_for_headers' => ['HTTP_X_FORWARDED_FOR'],

    // Memcache
    'memcache.local'       => '\\OC\\Memcache\\APCu',
    'memcache.distributed' => '\\OC\\Memcache\\Redis',
    'memcache.locking'     => '\\OC\\Memcache\\Redis',
    'redis' => [
        'host'    => 'nextcloud-redis.workspace-korczewski.svc.cluster.local',
        'port'    => 6379,
        'timeout' => 1.5,
        'dbindex' => 0,
    ],

    // Admin warnings
    'default_phone_region'     => 'DE',
    'maintenance_window_start' => 1,
    'serverid'                 => 'workspace-nc-korczewski-01',
    'log_rotate_size'          => 104857600,
];
