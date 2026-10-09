import type { ConnectionPoolConfig } from "../services/ConnectionPool.js";
import type { CacheConfig } from "../types/cache.types.js";
import type { CalDavConnection } from "../types/calendar.types.js";
import type { ImapConnection, SmtpConnection } from "../types/email.types.js";
import type { SieveConnection } from "../types/sieve.types.js";
export interface PoolsConfig {
    imap: ConnectionPoolConfig;
    smtp: ConnectionPoolConfig;
}
export interface ServerConfig {
    email: ImapConnection;
    smtp: SmtpConnection;
    calendar: CalDavConnection;
    sieve: SieveConnection;
    cache: CacheConfig;
    pools: PoolsConfig;
    debug: boolean;
}
export declare function loadConfig(): ServerConfig;
