import { createLogger } from "./Logger.js";
export class OfflineService {
    cache;
    logger = createLogger("OfflineService");
    constructor(cache) {
        this.cache = cache;
    }
    getOfflineCapabilities() {
        const stats = this.cache.size();
        const hasData = stats > 0;
        return {
            canSearchEmails: hasData,
            canGetEmail: hasData,
            canGetFolders: hasData,
            canAccessCachedData: hasData,
            lastSyncTime: this.getLastSyncTime(),
        };
    }
    async searchEmailsOffline(options) {
        // Try multiple cache keys that might contain relevant data
        const possibleKeys = this.generateSearchCacheKeys(options);
        for (const key of possibleKeys) {
            const cachedResults = this.cache.getStale(key);
            if (cachedResults) {
                await this.logger.info("Found offline search results for query", {
                    operation: "searchOfflineEmails",
                    service: "OfflineService",
                }, { options });
                return this.filterOfflineResults(cachedResults, options);
            }
        }
        await this.logger.info("No offline search results found for query", {
            operation: "searchOfflineEmails",
            service: "OfflineService",
        }, { options });
        return [];
    }
    async getEmailOffline(uid, folder = "INBOX") {
        const cacheKey = `email:${folder}:${uid}`;
        const cachedEmail = this.cache.getStale(cacheKey);
        if (cachedEmail) {
            await this.logger.info(`Found offline email UID ${uid} in folder ${folder}`, {
                operation: "getOfflineEmail",
                service: "OfflineService",
            }, { uid, folder });
            return cachedEmail;
        }
        await this.logger.info(`No offline email found for UID ${uid} in folder ${folder}`, {
            operation: "getOfflineEmail",
            service: "OfflineService",
        }, { uid, folder });
        return null;
    }
    async getFoldersOffline() {
        const cacheKey = "email_folders";
        const cachedFolders = this.cache.getStale(cacheKey);
        if (cachedFolders) {
            await this.logger.info("Found offline folders list", {
                operation: "getOfflineFolders",
                service: "OfflineService",
            });
            return cachedFolders;
        }
        await this.logger.info("No offline folders found, returning default folders", {
            operation: "getOfflineFolders",
            service: "OfflineService",
        });
        return this.getDefaultFolders();
    }
    getCachedEmailsList() {
        const emailList = [];
        // This is a simple implementation - in a production system,
        // you'd want to maintain an index of cached emails
        // For now, we'll return an empty list as this would require
        // iterating through all cache keys
        return emailList;
    }
    getOfflineStats() {
        // Basic cache statistics
        const totalSize = this.cache.size();
        return {
            cachedEmails: 0, // Would need cache key enumeration
            cachedSearches: 0, // Would need cache key enumeration
            totalCacheSize: totalSize,
            oldestCacheEntry: undefined,
            newestCacheEntry: undefined,
        };
    }
    generateSearchCacheKeys(options) {
        const keys = [];
        // Generate possible cache keys for this search
        const baseKey = `email_search:${JSON.stringify(options)}`;
        keys.push(baseKey);
        // Try with different limit/offset combinations
        if (options.limit || options.offset) {
            const { limit, offset, ...optionsWithoutPaging } = options;
            keys.push(`email_search:${JSON.stringify(optionsWithoutPaging)}`);
        }
        // Try with just folder
        if (options.folder) {
            keys.push(`email_search:${JSON.stringify({ folder: options.folder })}`);
        }
        return keys;
    }
    filterOfflineResults(results, options) {
        let filtered = [...results];
        // Apply client-side filtering since we're working with cached data
        if (options.query) {
            const query = options.query;
            filtered = filtered.filter(email => this.matchesOfflineQuery(email, query));
        }
        if (options.since) {
            const since = options.since;
            filtered = filtered.filter(email => email.date >= since);
        }
        if (options.before) {
            const before = options.before;
            filtered = filtered.filter(email => email.date <= before);
        }
        // Apply pagination
        if (options.offset) {
            filtered = filtered.slice(options.offset);
        }
        if (options.limit) {
            filtered = filtered.slice(0, options.limit);
        }
        return filtered;
    }
    matchesOfflineQuery(email, query) {
        const lowerQuery = query.toLowerCase();
        // Simple text matching
        return (email.subject.toLowerCase().includes(lowerQuery) ||
            email.from.some(addr => addr.address.toLowerCase().includes(lowerQuery) ||
                addr.name?.toLowerCase().includes(lowerQuery)) ||
            email.to.some(addr => addr.address.toLowerCase().includes(lowerQuery) ||
                addr.name?.toLowerCase().includes(lowerQuery)) ||
            (email.text?.toLowerCase().includes(lowerQuery) ?? false));
    }
    getLastSyncTime() {
        // This would need to be tracked separately
        // For now, return undefined
        return undefined;
    }
    getDefaultFolders() {
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
}
//# sourceMappingURL=OfflineService.js.map