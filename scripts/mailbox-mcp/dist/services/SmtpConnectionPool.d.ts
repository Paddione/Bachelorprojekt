import { type Transporter } from "nodemailer";
import type { SmtpConnection } from "../types/email.types.js";
import { ConnectionPool, type ConnectionPoolConfig, type ConnectionWrapper } from "./ConnectionPool.js";
export interface SmtpConnectionWrapper extends ConnectionWrapper<Transporter> {
    lastVerified?: Date;
    verificationFailures: number;
}
export interface SmtpPoolConfig extends ConnectionPoolConfig {
    connectionConfig: SmtpConnection;
    verificationIntervalMs?: number;
    maxVerificationFailures?: number;
}
export declare class SmtpConnectionPool extends ConnectionPool<Transporter> {
    private smtpConfig;
    private verificationIntervalMs;
    private maxVerificationFailures;
    get connectionConfig(): SmtpConnection;
    constructor(config: SmtpPoolConfig);
    createConnection(): Promise<Transporter>;
    validateConnection(connection: Transporter): Promise<boolean>;
    protected activateConnection(wrapper: ConnectionWrapper<Transporter>): Promise<ConnectionWrapper<Transporter>>;
    destroyConnection(connection: Transporter): Promise<void>;
    acquire(): Promise<SmtpConnectionWrapper>;
    release(wrapper: ConnectionWrapper<Transporter>): Promise<void>;
    protected needsVerification(wrapper: SmtpConnectionWrapper): boolean;
    getSmtpMetrics(): {
        totalVerificationFailures: number;
        connectionsNeedingVerification: number;
        verificationIntervalMs: number;
        maxVerificationFailures: number;
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
    verifyAllConnections(): Promise<{
        verified: number;
        failed: number;
    }>;
}
