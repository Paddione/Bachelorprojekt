export interface CircuitBreakerConfig {
    failureThreshold: number;
    recoveryTimeout: number;
    monitoringInterval: number;
}
export declare enum CircuitBreakerState {
    CLOSED = "CLOSED",
    OPEN = "OPEN",
    HALF_OPEN = "HALF_OPEN"
}
export interface CircuitBreakerMetrics {
    state: CircuitBreakerState;
    failures: number;
    successes: number;
    lastFailureTime?: Date;
    lastSuccessTime?: Date;
    requestCount: number;
    errorRate: number;
}
export declare class CircuitBreaker {
    private config;
    private state;
    private failures;
    private successes;
    private lastFailureTime?;
    private lastSuccessTime?;
    private requestCount;
    private nextAttemptTime;
    constructor(config: CircuitBreakerConfig);
    execute<T>(operation: () => Promise<T>): Promise<T>;
    private onSuccess;
    private onFailure;
    getMetrics(): CircuitBreakerMetrics;
    reset(): void;
    isOpen(): boolean;
    isClosed(): boolean;
    isHalfOpen(): boolean;
}
