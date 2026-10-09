import type { EmailComposition, EmailOperationResult, SmtpConnection } from "../types/email.types.js";
import { type SmtpPoolConfig } from "./SmtpConnectionPool.js";
export declare class SmtpService {
    private pool;
    private logger;
    constructor(connection: SmtpConnection, poolConfig: Omit<SmtpPoolConfig, "connectionConfig">);
    sendEmail(composition: EmailComposition): Promise<EmailOperationResult>;
    verifyConnection(): Promise<boolean>;
    private formatAddresses;
    private extractNameFromEmail;
    close(): Promise<void>;
    getPoolMetrics(): {
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
    validatePoolHealth(): Promise<boolean>;
    verifyAllPoolConnections(): Promise<{
        verified: number;
        failed: number;
    }>;
}
