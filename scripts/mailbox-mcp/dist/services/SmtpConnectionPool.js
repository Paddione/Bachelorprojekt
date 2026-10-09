import nodemailer from "nodemailer";
import { ConnectionPool, } from "./ConnectionPool.js";
export class SmtpConnectionPool extends ConnectionPool {
    smtpConfig;
    verificationIntervalMs;
    maxVerificationFailures;
    get connectionConfig() {
        return this.smtpConfig;
    }
    constructor(config) {
        super(config);
        this.smtpConfig = config.connectionConfig;
        this.verificationIntervalMs = config.verificationIntervalMs || 300000; // 5 minutes
        this.maxVerificationFailures = config.maxVerificationFailures || 3;
    }
    async createConnection() {
        const transportOptions = {
            host: this.smtpConfig.host,
            port: this.smtpConfig.port,
            secure: this.smtpConfig.secure,
            auth: {
                user: this.smtpConfig.user,
                pass: this.smtpConfig.password,
            },
            tls: {
                rejectUnauthorized: false,
            },
            pool: false, // We handle pooling ourselves
            maxConnections: 1,
            maxMessages: Number.POSITIVE_INFINITY,
        };
        const transporter = nodemailer.createTransport(transportOptions);
        // Verify the connection immediately after creation
        await transporter.verify();
        return transporter;
    }
    async validateConnection(connection) {
        try {
            await connection.verify();
            return true;
        }
        catch (error) {
            await this.logger.warning("SMTP connection validation failed", {
                operation: "validateConnection",
                service: "SmtpConnectionPool",
            }, { error: error instanceof Error ? error.message : String(error) });
            return false;
        }
    }
    // Override activateConnection to handle SMTP-specific verification timing
    async activateConnection(wrapper) {
        const smtpWrapper = wrapper;
        // Only validate if we need verification based on timing
        const needsVerification = this.needsVerification(smtpWrapper);
        if (needsVerification) {
            const isValid = await this.validateConnection(wrapper.connection);
            if (isValid) {
                smtpWrapper.lastVerified = new Date();
                smtpWrapper.verificationFailures = 0;
            }
            else {
                smtpWrapper.verificationFailures++;
                if (smtpWrapper.verificationFailures >= this.maxVerificationFailures) {
                    await this.destroyConnectionWrapper(wrapper);
                    throw new Error("SMTP connection failed verification multiple times");
                }
                throw new Error("SMTP connection verification failed: Connection is not valid");
            }
        }
        wrapper.inUse = true;
        wrapper.lastUsed = new Date();
        wrapper.isHealthy = true;
        this.metrics.activeConnections++;
        this.metrics.idleConnections--;
        this.metrics.totalAcquired++;
        return wrapper;
    }
    async destroyConnection(connection) {
        try {
            connection.close();
        }
        catch (error) {
            await this.logger.warning("Error closing SMTP connection", {
                operation: "destroyConnection",
                service: "SmtpConnectionPool",
            }, { error: error instanceof Error ? error.message : String(error) });
        }
    }
    // Override acquire to handle SMTP-specific logic
    async acquire() {
        const wrapper = (await super.acquire());
        // Initialize SMTP-specific properties if not present
        if (wrapper.verificationFailures === undefined) {
            wrapper.verificationFailures = 0;
        }
        return wrapper;
    }
    // Override release to reset verification failures on successful use
    async release(wrapper) {
        const smtpWrapper = wrapper;
        // Reset verification failures if connection was used successfully
        if (smtpWrapper.isHealthy) {
            smtpWrapper.verificationFailures = 0;
        }
        await super.release(wrapper);
    }
    needsVerification(wrapper) {
        if (!wrapper.lastVerified) {
            return true;
        }
        const timeSinceVerification = Date.now() - wrapper.lastVerified.getTime();
        return timeSinceVerification > this.verificationIntervalMs;
    }
    // Get pool status with SMTP-specific information
    getSmtpMetrics() {
        const baseMetrics = this.getMetrics();
        let totalVerificationFailures = 0;
        let connectionsNeedingVerification = 0;
        for (const wrapper of this.connections.values()) {
            const smtpWrapper = wrapper;
            totalVerificationFailures += smtpWrapper.verificationFailures || 0;
            if (this.needsVerification(smtpWrapper)) {
                connectionsNeedingVerification++;
            }
        }
        return {
            ...baseMetrics,
            totalVerificationFailures,
            connectionsNeedingVerification,
            verificationIntervalMs: this.verificationIntervalMs,
            maxVerificationFailures: this.maxVerificationFailures,
        };
    }
    // Method to force verification of all idle connections
    async verifyAllConnections() {
        let verified = 0;
        let failed = 0;
        const verificationPromises = [];
        for (const wrapper of this.connections.values()) {
            const smtpWrapper = wrapper;
            if (!smtpWrapper.inUse) {
                const promise = this.validateConnection(smtpWrapper.connection)
                    .then(isValid => {
                    if (isValid) {
                        smtpWrapper.lastVerified = new Date();
                        smtpWrapper.verificationFailures = 0;
                        smtpWrapper.isHealthy = true;
                        verified++;
                    }
                    else {
                        smtpWrapper.verificationFailures++;
                        smtpWrapper.isHealthy = false;
                        failed++;
                        // Destroy connections that have failed too many times
                        if (smtpWrapper.verificationFailures >= this.maxVerificationFailures) {
                            // Schedule destruction asynchronously
                            this.destroyConnection(smtpWrapper.connection)
                                .catch(async (err) => {
                                await this.logger.warning("Error destroying connection", {
                                    operation: "periodicVerification",
                                    service: "SmtpConnectionPool",
                                }, {
                                    error: err instanceof Error ? err.message : String(err),
                                });
                            })
                                .finally(() => this.connections.delete(smtpWrapper.id));
                        }
                    }
                })
                    .catch(() => {
                    smtpWrapper.verificationFailures++;
                    smtpWrapper.isHealthy = false;
                    failed++;
                });
                verificationPromises.push(promise);
            }
        }
        await Promise.allSettled(verificationPromises);
        return { verified, failed };
    }
}
//# sourceMappingURL=SmtpConnectionPool.js.map