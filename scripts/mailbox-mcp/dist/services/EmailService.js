import { simpleParser } from "mailparser";
import { withCacheFallback } from "../utils/cacheFallback.js";
import { ImapConnectionPool, } from "./ImapConnectionPool.js";
import { createLogger } from "./Logger.js";
import { OfflineService } from "./OfflineService.js";
export class EmailService {
    pool;
    cache;
    offlineService;
    logger = createLogger("EmailService");
    constructor(connection, cache, poolConfig) {
        this.cache = cache;
        this.offlineService = new OfflineService(cache);
        this.pool = new ImapConnectionPool({
            ...poolConfig,
            connectionConfig: connection,
        });
    }
    async disconnect() {
        await this.pool.destroy();
    }
    async searchEmails(options) {
        const cacheKey = `email_search:${JSON.stringify(options)}`;
        return withCacheFallback({
            cacheKey,
            cache: this.cache,
            fetch: async () => {
                const folder = options.folder || "INBOX";
                let wrapper = null;
                try {
                    wrapper = await this.pool.acquireForFolder(folder);
                    const messages = await this.performEmailSearch(wrapper, options);
                    return messages;
                }
                finally {
                    if (wrapper) {
                        await this.pool.releaseFromFolder(wrapper);
                    }
                }
            },
            defaultValue: [],
            logger: this.logger,
            operation: "searchEmails",
            service: "EmailService",
            ttl: 300000, // 5 minutes TTL
            logContext: { folder: options.folder, query: options.query },
        });
    }
    async getEmail(uid, folder = "INBOX") {
        const cacheKey = `email:${folder}:${uid}`;
        let wrapper = null;
        try {
            return await withCacheFallback({
                cacheKey,
                cache: this.cache,
                fetch: async () => {
                    wrapper = await this.pool.acquireForFolder(folder);
                    const message = await this.fetchEmailByUid(wrapper, uid, folder);
                    return message;
                },
                defaultValue: null,
                logger: this.logger,
                operation: "getEmail",
                service: "EmailService",
                ttl: 600000, // 10 minutes TTL
                logContext: { uid, folder },
            });
        }
        catch (error) {
            // Mark connection as unhealthy if fetch operation timed out
            if (wrapper &&
                error instanceof Error &&
                error.message.includes("timed out")) {
                wrapper.isHealthy = false;
                await this.logger.warning("Marking connection as unhealthy due to timeout", {
                    operation: "getEmail",
                    service: "EmailService",
                }, { uid, folder });
            }
            throw error;
        }
        finally {
            if (wrapper) {
                await this.pool.releaseFromFolder(wrapper);
            }
        }
    }
    async getEmailThread(messageId, folder = "INBOX") {
        const cacheKey = `thread:${folder}:${messageId}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }
        const thread = await this.buildEmailThread(messageId, folder);
        if (thread) {
            this.cache.set(cacheKey, thread, 300000); // 5 minutes TTL
        }
        return thread;
    }
    async performEmailSearch(wrapper, options) {
        const searchResult = await this.executeSearch(wrapper, options);
        if (!searchResult || searchResult.length === 0) {
            return [];
        }
        const paginatedResults = this.applyPagination(searchResult, options);
        const messages = await this.fetchMessageHeaders(wrapper, paginatedResults, options.folder || "INBOX");
        const filteredMessages = this.applyInMemoryFilters(messages, options);
        return this.sortMessagesByDate(filteredMessages);
    }
    async executeSearch(wrapper, options) {
        const searchCriteria = this.buildSearchCriteria(options);
        const result = await wrapper.connection.search(searchCriteria);
        return Array.isArray(result) ? result : null;
    }
    applyPagination(searchResult, options) {
        const offset = options.offset || 0;
        const end = options.limit ? offset + options.limit : undefined;
        return searchResult.slice(offset, end);
    }
    async fetchMessageHeaders(wrapper, uids, folder) {
        const messages = [];
        if (uids.length > 0) {
            const iterator = wrapper.connection.fetch(uids, {
                envelope: true,
                uid: true,
                flags: true,
            });
            try {
                for await (const message of iterator) {
                    const emailMessage = this.parseEmailMessage(message, folder);
                    if (emailMessage) {
                        messages.push(emailMessage);
                    }
                }
            }
            finally {
                // Ensure iterator is properly closed even if an error occurs during parsing
                try {
                    if (iterator && typeof iterator.return === "function") {
                        await iterator.return();
                    }
                }
                catch (error) {
                    await this.logger.warning("Failed to close fetch iterator for message headers", {
                        operation: "fetchMessageHeaders",
                        service: "EmailService",
                    }, {
                        folder,
                        uidCount: uids.length,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    wrapper.isHealthy = false;
                }
            }
        }
        return messages;
    }
    sortMessagesByDate(messages) {
        return messages.sort((a, b) => b.date.getTime() - a.date.getTime());
    }
    async fetchEmailByUid(wrapper, uid, folder) {
        try {
            const rawMessage = await this.fetchRawMessageByUid(wrapper, uid, folder);
            if (!rawMessage) {
                return null;
            }
            const parsed = await simpleParser(rawMessage.source);
            return this.parseFullEmailMessage(parsed, rawMessage, folder);
        }
        catch (error) {
            throw new Error(`Failed to fetch email with UID ${uid} from folder ${folder}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async fetchRawMessageByUid(wrapper, uid, folder) {
        // Add timeout to prevent hanging fetch operations
        const timeoutMs = 10000; // 10 seconds timeout for fetch operation
        const fetchPromise = this.performFetch(wrapper, uid);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`IMAP fetch operation timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        });
        try {
            return await Promise.race([fetchPromise, timeoutPromise]);
        }
        catch (error) {
            await this.logger.error(`Failed to fetch email with UID ${uid} from folder ${folder}`, {
                operation: "fetchEmailContent",
                service: "EmailService",
            }, {
                uid,
                folder,
                error: error instanceof Error ? error.message : String(error),
            });
            // CRITICAL: Mark connection as unhealthy when fetch times out
            // The background performFetch() may still be running, leaving the
            // IMAP connection in a corrupted state. Marking it unhealthy ensures
            // it won't be reused and will be destroyed on next validation.
            wrapper.isHealthy = false;
            return null;
        }
    }
    async performFetch(wrapper, uid) {
        // Create iterator explicitly so we can properly close it
        const iterator = wrapper.connection.fetch(`${uid}:${uid}`, {
            source: true,
            envelope: true,
            uid: true,
            flags: true,
        }, { uid: true });
        try {
            // Get the first (and should be only) message
            for await (const msg of iterator) {
                return msg;
            }
            return null;
        }
        finally {
            // Explicitly close the iterator to prevent connection state issues
            // This is critical for connection reuse - without this, the connection
            // may be left in a state where it's waiting for the iterator to complete
            try {
                if (iterator && typeof iterator.return === "function") {
                    await iterator.return();
                }
            }
            catch (error) {
                // If iterator cleanup fails, mark the connection as unhealthy
                // to prevent reuse of a potentially corrupted connection
                await this.logger.warning("Failed to properly close fetch iterator", {
                    operation: "performFetch",
                    service: "EmailService",
                }, {
                    uid,
                    error: error instanceof Error ? error.message : String(error),
                });
                wrapper.isHealthy = false;
            }
        }
    }
    buildSearchCriteria(options) {
        let criteria = {};
        criteria = this.addDateFilters(criteria, options);
        criteria = this.addQueryFilters(criteria, options);
        return Object.keys(criteria).length === 0 ? { all: true } : criteria;
    }
    addDateFilters(criteria, options) {
        if (options.since) {
            criteria.since = options.since;
        }
        if (options.before) {
            criteria.before = options.before;
        }
        return criteria;
    }
    addQueryFilters(criteria, options) {
        if (!options.query) {
            return criteria;
        }
        const query = options.query.trim();
        if (this.isOrQuery(query)) {
            return this.handleOrQuery(criteria);
        }
        if (this.isFromQuery(query)) {
            return this.handleFromQuery(criteria, query);
        }
        if (this.isToQuery(query)) {
            return this.handleToQuery(criteria, query);
        }
        return this.handleTextQuery(criteria, query);
    }
    isOrQuery(query) {
        return query.includes(" OR ");
    }
    handleOrQuery(criteria) {
        return Object.keys(criteria).length === 0 ? { all: true } : criteria;
    }
    isFromQuery(query) {
        return query.toLowerCase().startsWith("from:");
    }
    handleFromQuery(criteria, query) {
        criteria.from = query.substring(5).trim();
        return criteria;
    }
    isToQuery(query) {
        return query.toLowerCase().startsWith("to:");
    }
    handleToQuery(criteria, query) {
        criteria.to = query.substring(3).trim();
        return criteria;
    }
    handleTextQuery(criteria, query) {
        criteria.or = [{ subject: query }, { body: query }];
        return criteria;
    }
    applyInMemoryFilters(messages, options) {
        let filtered = messages;
        // Apply query filter for complex queries that weren't handled by IMAP
        if (options.query) {
            const query = options.query;
            const needsInMemoryQueryFilter = query.includes(" OR ");
            if (needsInMemoryQueryFilter) {
                filtered = filtered.filter(msg => this.matchesQuery(msg, query));
            }
        }
        return filtered;
    }
    matchesQuery(message, query) {
        // Handle complex query matching in memory
        const lowercaseQuery = query.toLowerCase();
        // Handle OR operations
        if (lowercaseQuery.includes(" or ")) {
            const orParts = lowercaseQuery.split(" or ").map(part => part.trim());
            return orParts.some(part => this.matchesSingleQuery(message, part));
        }
        return this.matchesSingleQuery(message, lowercaseQuery);
    }
    matchesSingleQuery(message, query) {
        // Handle from: queries
        if (query.startsWith("from:")) {
            const emailDomain = query.substring(5).trim();
            return message.from.some(from => from.address.toLowerCase().includes(emailDomain));
        }
        // Handle to: queries
        if (query.startsWith("to:")) {
            const emailDomain = query.substring(3).trim();
            return message.to.some(to => to.address.toLowerCase().includes(emailDomain));
        }
        // Default text search in subject and from/to addresses
        const searchText = query.toLowerCase();
        return (message.subject.toLowerCase().includes(searchText) ||
            message.from.some(from => from.address.toLowerCase().includes(searchText) ||
                from.name?.toLowerCase().includes(searchText)) ||
            message.to.some(to => to.address.toLowerCase().includes(searchText) ||
                to.name?.toLowerCase().includes(searchText)));
    }
    parseEmailMessage(message, folder) {
        if (!message.envelope) {
            return null;
        }
        const envelope = message.envelope;
        return {
            id: envelope.messageId || `${message.uid}@${folder}`,
            uid: message.uid,
            subject: envelope.subject || "",
            from: this.parseAddressesFromEnvelope(envelope.from),
            to: this.parseAddressesFromEnvelope(envelope.to),
            cc: this.parseAddressesFromEnvelope(envelope.cc),
            date: envelope.date || new Date(),
            flags: message.flags || [],
            folder,
        };
    }
    parseFullEmailMessage(parsed, message, folder) {
        return {
            id: parsed.messageId || `${message.uid}@${folder}`,
            uid: message.uid,
            subject: parsed.subject || "",
            from: this.parseAddressesFromParsed(parsed.from),
            to: this.parseAddressesFromParsed(parsed.to),
            cc: this.parseAddressesFromParsed(parsed.cc),
            bcc: this.parseAddressesFromParsed(parsed.bcc),
            date: parsed.date || new Date(),
            text: parsed.text,
            html: parsed.html || undefined,
            attachments: parsed.attachments?.map(att => ({
                filename: att.filename || "unnamed",
                contentType: att.contentType,
                size: att.size,
                contentId: att.cid,
            })),
            flags: message.flags || [],
            folder,
        };
    }
    parseAddressesFromEnvelope(addresses) {
        if (!addresses)
            return [];
        if (!Array.isArray(addresses)) {
            const addr = addresses;
            if (addr.address) {
                return [{ name: addr.name, address: addr.address }];
            }
            return [];
        }
        return addresses.map(addr => ({
            name: addr.name,
            address: addr.address,
        }));
    }
    parseAddressesFromParsed(addresses) {
        if (!addresses)
            return [];
        if (!Array.isArray(addresses)) {
            const addr = addresses;
            if (addr.address) {
                return [{ name: addr.name, address: addr.address }];
            }
            return [];
        }
        return addresses.map(addr => ({
            name: addr.name,
            address: addr.address,
        }));
    }
    async buildEmailThread(messageId, folder) {
        // Basic implementation - can be enhanced with proper thread detection
        const message = await this.searchEmails({
            query: messageId.replace(/[<>]/g, ""),
            folder,
            limit: 1,
        });
        if (message.length === 0) {
            return null;
        }
        const baseMessage = message[0];
        return {
            threadId: messageId,
            messages: [baseMessage],
            subject: baseMessage.subject,
            participants: [...baseMessage.from, ...baseMessage.to],
            lastActivity: baseMessage.date,
        };
    }
    async getFolders() {
        const cacheKey = "email_folders";
        let wrapper = null;
        try {
            return await withCacheFallback({
                cacheKey,
                cache: this.cache,
                fetch: async () => {
                    wrapper = await this.pool.acquire();
                    const folders = await wrapper.connection.list();
                    const result = folders.map(folder => ({
                        name: folder.name,
                        path: folder.path,
                        delimiter: folder.delimiter || "/",
                        flags: Array.isArray(folder.flags)
                            ? folder.flags
                            : folder.flags instanceof Set
                                ? Array.from(folder.flags)
                                : [],
                        specialUse: folder.specialUse,
                    }));
                    return result;
                },
                defaultValue: this.getDefaultFolders(),
                logger: this.logger,
                operation: "getFolders",
                service: "EmailService",
                ttl: 900000, // Cache for 15 minutes
            });
        }
        finally {
            if (wrapper) {
                await this.pool.release(wrapper);
            }
        }
    }
    async moveEmail(uid, fromFolder, toFolder) {
        let wrapper = null;
        try {
            wrapper = await this.pool.acquireForFolder(fromFolder);
            await wrapper.connection.messageMove(`${uid}:${uid}`, toFolder, {
                uid: true,
            });
            // Clear cache for both folders
            this.clearFolderCache(fromFolder);
            this.clearFolderCache(toFolder);
            // Invalidate connections for the affected folders
            await this.pool.invalidateFolderConnections(fromFolder);
            await this.pool.invalidateFolderConnections(toFolder);
            return {
                success: true,
                message: `Email moved from ${fromFolder} to ${toFolder}`,
            };
        }
        catch (error) {
            await this.logger.error(`Error moving email UID ${uid}`, {
                operation: "moveEmail",
                service: "EmailService",
            }, {
                uid,
                fromFolder,
                toFolder,
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                success: false,
                message: `Failed to move email: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
        finally {
            if (wrapper) {
                await this.pool.releaseFromFolder(wrapper);
            }
        }
    }
    async markEmail(uid, folder, flags, action) {
        let wrapper = null;
        try {
            wrapper = await this.pool.acquireForFolder(folder);
            if (action === "add") {
                await wrapper.connection.messageFlagsAdd(`${uid}:${uid}`, flags, {
                    uid: true,
                });
            }
            else {
                await wrapper.connection.messageFlagsRemove(`${uid}:${uid}`, flags, {
                    uid: true,
                });
            }
            // Clear cache for the folder
            this.clearFolderCache(folder);
            return {
                success: true,
                message: `Email flags ${action === "add" ? "added" : "removed"} successfully`,
            };
        }
        catch (error) {
            await this.logger.error(`Error marking email UID ${uid}`, {
                operation: "markEmail",
                service: "EmailService",
            }, {
                uid,
                folder,
                flags,
                action,
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                success: false,
                message: `Failed to mark email: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
        finally {
            if (wrapper) {
                await this.pool.releaseFromFolder(wrapper);
            }
        }
    }
    async deleteEmail(uid, folder, permanent = false) {
        let wrapper = null;
        try {
            wrapper = await this.pool.acquireForFolder(folder);
            if (permanent) {
                // Add deleted flag and expunge
                await wrapper.connection.messageFlagsAdd(`${uid}:${uid}`, ["\\Deleted"], {
                    uid: true,
                });
                // Note: expunge is called automatically after messageDelete in newer ImapFlow versions
                // await wrapper.connection.expunge(); // This method may not exist in current ImapFlow version
            }
            else {
                // Move to Trash folder
                try {
                    await wrapper.connection.messageMove(`${uid}:${uid}`, "Trash", {
                        uid: true,
                    });
                }
                catch (moveError) {
                    // If Trash folder doesn't exist, try other common names
                    const trashFolders = ["Deleted Items", "Deleted", "INBOX.Trash"];
                    let moved = false;
                    for (const trashFolder of trashFolders) {
                        try {
                            await wrapper.connection.messageMove(`${uid}:${uid}`, trashFolder, {
                                uid: true,
                            });
                            moved = true;
                            break;
                        }
                        catch (error) {
                            // Continue to next folder
                        }
                    }
                    if (!moved) {
                        // If no trash folder found, mark as deleted
                        await wrapper.connection.messageFlagsAdd(`${uid}:${uid}`, ["\\Deleted"], {
                            uid: true,
                        });
                    }
                }
            }
            // Clear cache for the folder
            this.clearFolderCache(folder);
            return {
                success: true,
                message: permanent
                    ? "Email permanently deleted"
                    : "Email moved to trash",
            };
        }
        catch (error) {
            await this.logger.error(`Error deleting email UID ${uid}`, {
                operation: "deleteEmail",
                service: "EmailService",
            }, {
                uid,
                folder,
                permanent,
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                success: false,
                message: `Failed to delete email: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
        finally {
            if (wrapper) {
                await this.pool.releaseFromFolder(wrapper);
            }
        }
    }
    async createDraft(composition, folder = "Drafts") {
        let wrapper = null;
        try {
            wrapper = await this.pool.acquireForFolder(folder);
            // Create email content
            const emailContent = this.buildEmailContent(composition);
            // Append to drafts folder
            const result = await wrapper.connection.append(folder, emailContent, [
                "\\Draft",
            ]);
            // Clear cache for the drafts folder
            this.clearFolderCache(folder);
            return {
                success: true,
                message: "Draft saved successfully",
                uid: result && typeof result === "object" && "uid" in result
                    ? result.uid
                    : undefined,
            };
        }
        catch (error) {
            await this.logger.error("Error creating draft", {
                operation: "createDraft",
                service: "EmailService",
            }, {
                composition,
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                success: false,
                message: `Failed to create draft: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
        finally {
            if (wrapper) {
                await this.pool.releaseFromFolder(wrapper);
            }
        }
    }
    buildEmailContent(composition) {
        const headers = [];
        // Add recipients
        headers.push(`To: ${this.formatAddressesForHeader(composition.to)}`);
        if (composition.cc && composition.cc.length > 0) {
            headers.push(`CC: ${this.formatAddressesForHeader(composition.cc)}`);
        }
        if (composition.bcc && composition.bcc.length > 0) {
            headers.push(`BCC: ${this.formatAddressesForHeader(composition.bcc)}`);
        }
        headers.push(`Subject: ${composition.subject}`);
        headers.push(`Date: ${new Date().toUTCString()}`);
        headers.push(`Message-ID: <${Date.now()}.${Math.random()}@mailbox.org>`);
        if (composition.html) {
            headers.push("Content-Type: text/html; charset=utf-8");
        }
        else {
            headers.push("Content-Type: text/plain; charset=utf-8");
        }
        const content = composition.html || composition.text || "";
        return `${headers.join("\r\n")}\r\n\r\n${content}`;
    }
    formatAddressesForHeader(addresses) {
        return addresses
            .map(addr => {
            if (addr.name) {
                return `"${addr.name}" <${addr.address}>`;
            }
            return addr.address;
        })
            .join(", ");
    }
    clearFolderCache(folder) {
        // Clear all cache entries that are associated with the specified folder
        // Check if keys() method exists (for backwards compatibility)
        if (typeof this.cache.keys !== "function") {
            return;
        }
        const keysToDelete = [];
        for (const key of this.cache.keys()) {
            // Match email search keys containing this folder
            if (key.startsWith("email_search:") &&
                key.includes(`"folder":"${folder}"`)) {
                keysToDelete.push(key);
            }
            // Match individual email keys for this folder
            if (key.startsWith(`email:${folder}:`)) {
                keysToDelete.push(key);
            }
            // Match thread keys for this folder
            if (key.startsWith(`thread:${folder}:`)) {
                keysToDelete.push(key);
            }
        }
        for (const key of keysToDelete) {
            this.cache.delete(key);
        }
    }
    getDefaultFolders() {
        // Return a basic set of folders when connection is not available
        return [
            {
                name: "INBOX",
                path: "INBOX",
                delimiter: "/",
                flags: [],
                specialUse: undefined,
            },
            {
                name: "Sent",
                path: "Sent",
                delimiter: "/",
                flags: [],
                specialUse: "\\Sent",
            },
            {
                name: "Drafts",
                path: "Drafts",
                delimiter: "/",
                flags: [],
                specialUse: "\\Drafts",
            },
            {
                name: "Trash",
                path: "Trash",
                delimiter: "/",
                flags: [],
                specialUse: "\\Trash",
            },
        ];
    }
    // Pool management methods
    getPoolMetrics() {
        return this.pool.getImapMetrics();
    }
    // Offline capabilities
    getOfflineCapabilities() {
        return this.offlineService.getOfflineCapabilities();
    }
    async searchEmailsOffline(options) {
        return this.offlineService.searchEmailsOffline(options);
    }
    async getEmailOffline(uid, folder = "INBOX") {
        return this.offlineService.getEmailOffline(uid, folder);
    }
    async getFoldersOffline() {
        return this.offlineService.getFoldersOffline();
    }
    async validatePoolHealth() {
        try {
            const metrics = this.pool.getMetrics();
            return (metrics.totalConnections > 0 &&
                metrics.totalErrors < metrics.totalConnections);
        }
        catch (error) {
            await this.logger.error("Error checking pool health", {
                operation: "isHealthy",
                service: "EmailService",
            }, { error: error instanceof Error ? error.message : String(error) });
            return false;
        }
    }
    async createDirectory(name, parentPath = "") {
        let wrapper = null;
        try {
            wrapper = await this.pool.acquire();
            // Construct the full folder path
            // Use standard IMAP delimiter
            const delimiter = "/"; // Standard IMAP delimiter
            const folderPath = parentPath ? `${parentPath}${delimiter}${name}` : name;
            // Create the folder using IMAP CREATE command
            await wrapper.connection.mailboxCreate(folderPath);
            return {
                success: true,
                message: `Directory '${name}' created successfully`,
            };
        }
        catch (error) {
            await this.logger.error(`Error creating directory '${name}'`, {
                operation: "createDirectory",
                service: "EmailService",
            }, { name, error: error instanceof Error ? error.message : String(error) });
            return {
                success: false,
                message: `Failed to create directory: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
        finally {
            if (wrapper) {
                await this.pool.release(wrapper);
            }
        }
    }
}
//# sourceMappingURL=EmailService.js.map