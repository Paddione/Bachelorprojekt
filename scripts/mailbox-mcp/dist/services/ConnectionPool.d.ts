export interface ConnectionPoolConfig {
    minConnections: number;
    maxConnections: number;
    acquireTimeoutMs: number;
    idleTimeoutMs: number;
    maxRetries: number;
    retryDelayMs: number;
    healthCheckIntervalMs: number;
}
export interface ConnectionWrapper<T> {
    connection: T;
    createdAt: Date;
    lastUsed: Date;
    isHealthy: boolean;
    inUse: boolean;
    id: string;
}
export interface PoolMetrics {
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
}
export declare abstract class ConnectionPool<T> {
    protected config: ConnectionPoolConfig;
    protected connections: Map<string, ConnectionWrapper<T>>;
    protected waitingQueue: Array<{
        resolve: (connection: ConnectionWrapper<T>) => void;
        reject: (error: Error) => void;
        requestedAt: Date;
        settled: boolean;
    }>;
    protected metrics: PoolMetrics;
    protected logger: import("./Logger.js").ChildLogger;
    private healthCheckInterval?;
    private isShuttingDown;
    private connectionErrors;
    private maxErrorHistory;
    constructor(config: ConnectionPoolConfig);
    abstract createConnection(): Promise<T>;
    abstract validateConnection(connection: T): Promise<boolean>;
    abstract destroyConnection(connection: T): Promise<void>;
    acquire(): Promise<ConnectionWrapper<T>>;
    release(wrapper: ConnectionWrapper<T>): Promise<void>;
    destroy(): Promise<void>;
    getMetrics(): PoolMetrics;
    private findIdleConnection;
    private createNewConnection;
    private createConnectionWithRetries;
    private createConnectionWrapper;
    private registerConnection;
    private recordConnectionCreationError;
    private handleConnectionCreationError;
    protected activateConnection(wrapper: ConnectionWrapper<T>): Promise<ConnectionWrapper<T>>;
    private waitForConnection;
    protected destroyConnectionWrapper(wrapper: ConnectionWrapper<T>): Promise<void>;
    private startHealthCheck;
    private performHealthCheck;
    private identifyConnectionsToDestroy;
    private shouldDestroyConnection;
    private destroyUnhealthyConnections;
    private ensureMinimumConnections;
    private updateMetrics;
    private calculateExponentialBackoff;
    private recordError;
    private generateConnectionId;
}
