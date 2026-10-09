import { createLogger } from "./Logger.js";
import { SmtpConnectionPool, } from "./SmtpConnectionPool.js";
export class SmtpService {
    pool;
    logger = createLogger("SmtpService");
    constructor(connection, poolConfig) {
        this.pool = new SmtpConnectionPool({
            ...poolConfig,
            connectionConfig: connection,
        });
    }
    async sendEmail(composition) {
        let wrapper = null;
        try {
            wrapper = await this.pool.acquire();
            const transporter = wrapper.connection;
            const defaultFromAddress = this.pool.connectionConfig.fromAddress || this.pool.connectionConfig.user;
            const defaultFromName = this.pool.connectionConfig.fromName ||
                this.extractNameFromEmail(defaultFromAddress);
            const mailOptions = {
                from: composition.from
                    ? {
                        name: composition.from.name || defaultFromName,
                        address: composition.from.address,
                    }
                    : {
                        name: defaultFromName,
                        address: defaultFromAddress,
                    },
                to: this.formatAddresses(composition.to),
                cc: composition.cc ? this.formatAddresses(composition.cc) : undefined,
                bcc: composition.bcc
                    ? this.formatAddresses(composition.bcc)
                    : undefined,
                subject: composition.subject,
                text: composition.text,
                html: composition.html,
                attachments: composition.attachments?.map(att => ({
                    filename: att.filename,
                    content: att.content,
                    contentType: att.contentType,
                })),
            };
            const info = await transporter.sendMail(mailOptions);
            return {
                success: true,
                message: "Email sent successfully",
                messageId: info.messageId,
            };
        }
        catch (error) {
            await this.logger.error("Failed to send email", {
                operation: "sendEmail",
                service: "SmtpService",
            }, {
                composition,
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                success: false,
                message: `Failed to send email: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
        finally {
            if (wrapper) {
                await this.pool.release(wrapper);
            }
        }
    }
    async verifyConnection() {
        let wrapper = null;
        try {
            wrapper = await this.pool.acquire();
            await wrapper.connection.verify();
            return true;
        }
        catch (error) {
            await this.logger.error("SMTP connection verification failed", {
                operation: "verifyConnection",
                service: "SmtpService",
            }, { error: error instanceof Error ? error.message : String(error) });
            return false;
        }
        finally {
            if (wrapper) {
                await this.pool.release(wrapper);
            }
        }
    }
    formatAddresses(addresses) {
        return addresses
            .map(addr => {
            if (addr.name) {
                return `"${addr.name}" <${addr.address}>`;
            }
            return addr.address;
        })
            .join(", ");
    }
    extractNameFromEmail(email) {
        const localPart = email.split("@")[0];
        return localPart
            .split(/[._-]/)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
    }
    async close() {
        await this.pool.destroy();
    }
    // Pool management methods
    getPoolMetrics() {
        return this.pool.getSmtpMetrics();
    }
    async validatePoolHealth() {
        try {
            const metrics = this.pool.getMetrics();
            return (metrics.totalConnections > 0 &&
                metrics.totalErrors < metrics.totalConnections);
        }
        catch (error) {
            await this.logger.error("Error checking SMTP pool health", {
                operation: "isHealthy",
                service: "SmtpService",
            }, { error: error instanceof Error ? error.message : String(error) });
            return false;
        }
    }
    async verifyAllPoolConnections() {
        return await this.pool.verifyAllConnections();
    }
}
//# sourceMappingURL=SmtpService.js.map