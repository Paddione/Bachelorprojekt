import { ImapFlow } from "imapflow";
import type { ImapConnection } from "../types/email.types.js";
import { type CircuitBreakerConfig, type CircuitBreakerMetrics } from "./CircuitBreaker.js";
import { ConnectionPool, type ConnectionPoolConfig, type ConnectionWrapper } from "./ConnectionPool.js";
export interface ImapConnectionWrapper extends ConnectionWrapper<ImapFlow> {
    selectedFolder?: string;
}
export interface ImapPoolConfig extends ConnectionPoolConfig {
    connectionConfig: ImapConnection;
    circuitBreaker?: CircuitBreakerConfig;
}
export declare class ImapConnectionPool extends ConnectionPool<ImapFlow> {
    private connectionConfig;
    private circuitBreaker;
    protected logger: import("./Logger.js").ChildLogger;
    constructor(config: ImapPoolConfig);
    createConnection(): Promise<ImapFlow>;
    validateConnection(connection: ImapFlow): Promise<boolean>;
    destroyConnection(connection: ImapFlow): Promise<void>;
    acquireForFolder(folder: string): Promise<ImapConnectionWrapper>;
    releaseFromFolder(wrapper: ImapConnectionWrapper): Promise<void>;
    release(wrapper: ConnectionWrapper<ImapFlow>): Promise<void>;
    getImapMetrics(): {
        folderDistribution: Record<string, number>;
        circuitBreaker: CircuitBreakerMetrics;
        totalConnections: number;
        activeConnections: number;
        idleConnections: number;
        waitingRequests: number;
        totalCreated: number;
        totalDestroyed: number;
        totalAcquired: number;
        totalReleased: number;
        totalErrors: number;
        averageConnectionAge: number;
        averageIdleTime: number;
        connectionUtilization: number;
        healthyConnections: number;
        unhealthyConnections: number;
        lastHealthCheck?: Date;
        connectionErrors: Array<{
            timestamp: Date;
            error: string;
            context: string;
        }>;
    };
    getCircuitBreakerMetrics(): CircuitBreakerMetrics;
    resetCircuitBreaker(): void;
    invalidateFolderConnections(folder: string): Promise<void>;
}
