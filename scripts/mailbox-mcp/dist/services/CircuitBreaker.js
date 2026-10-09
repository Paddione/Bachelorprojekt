export var CircuitBreakerState;
(function (CircuitBreakerState) {
    CircuitBreakerState["CLOSED"] = "CLOSED";
    CircuitBreakerState["OPEN"] = "OPEN";
    CircuitBreakerState["HALF_OPEN"] = "HALF_OPEN";
})(CircuitBreakerState || (CircuitBreakerState = {}));
export class CircuitBreaker {
    config;
    state = CircuitBreakerState.CLOSED;
    failures = 0;
    successes = 0;
    lastFailureTime;
    lastSuccessTime;
    requestCount = 0;
    nextAttemptTime = 0;
    constructor(config) {
        this.config = config;
    }
    async execute(operation) {
        if (this.state === CircuitBreakerState.OPEN) {
            if (Date.now() < this.nextAttemptTime) {
                throw new Error("Circuit breaker is OPEN - operation not allowed");
            }
            // Transition to HALF_OPEN to test if service has recovered
            this.state = CircuitBreakerState.HALF_OPEN;
        }
        this.requestCount++;
        try {
            const result = await operation();
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure();
            throw error;
        }
    }
    onSuccess() {
        this.successes++;
        this.lastSuccessTime = new Date();
        if (this.state === CircuitBreakerState.HALF_OPEN) {
            // Service has recovered, close the circuit
            this.state = CircuitBreakerState.CLOSED;
            this.failures = 0; // Reset failure count
        }
    }
    onFailure() {
        this.failures++;
        this.lastFailureTime = new Date();
        if (this.failures >= this.config.failureThreshold) {
            this.state = CircuitBreakerState.OPEN;
            this.nextAttemptTime = Date.now() + this.config.recoveryTimeout;
        }
    }
    getMetrics() {
        const totalRequests = this.successes + this.failures;
        const errorRate = totalRequests > 0 ? this.failures / totalRequests : 0;
        return {
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            lastFailureTime: this.lastFailureTime,
            lastSuccessTime: this.lastSuccessTime,
            requestCount: this.requestCount,
            errorRate,
        };
    }
    reset() {
        this.state = CircuitBreakerState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.requestCount = 0;
        this.lastFailureTime = undefined;
        this.lastSuccessTime = undefined;
        this.nextAttemptTime = 0;
    }
    isOpen() {
        return this.state === CircuitBreakerState.OPEN;
    }
    isClosed() {
        return this.state === CircuitBreakerState.CLOSED;
    }
    isHalfOpen() {
        return this.state === CircuitBreakerState.HALF_OPEN;
    }
}
//# sourceMappingURL=CircuitBreaker.js.map