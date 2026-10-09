import type { LocalCache } from "../types/cache.types.js";
import type { EmailFolder, EmailMessage, EmailSearchOptions } from "../types/email.types.js";
export interface OfflineCapabilities {
    canSearchEmails: boolean;
    canGetEmail: boolean;
    canGetFolders: boolean;
    canAccessCachedData: boolean;
    lastSyncTime?: Date;
}
export declare class OfflineService {
    private cache;
    private logger;
    constructor(cache: LocalCache);
    getOfflineCapabilities(): OfflineCapabilities;
    searchEmailsOffline(options: EmailSearchOptions): Promise<EmailMessage[]>;
    getEmailOffline(uid: number, folder?: string): Promise<EmailMessage | null>;
    getFoldersOffline(): Promise<EmailFolder[]>;
    getCachedEmailsList(): Array<{
        uid: number;
        folder: string;
        subject: string;
        from: string;
    }>;
    getOfflineStats(): {
        cachedEmails: number;
        cachedSearches: number;
        totalCacheSize: number;
        oldestCacheEntry?: Date;
        newestCacheEntry?: Date;
    };
    private generateSearchCacheKeys;
    private filterOfflineResults;
    private matchesOfflineQuery;
    private getLastSyncTime;
    private getDefaultFolders;
}
