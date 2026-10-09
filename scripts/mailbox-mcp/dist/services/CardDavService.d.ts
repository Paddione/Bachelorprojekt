import type { CalDavConnection } from "../types/calendar.types.js";
export interface ContactInfo {
    uid: string;
    url: string;
    etag?: string;
    fn?: string;
    name?: string;
    email?: string;
    phone?: string;
    org?: string;
    vcardData?: string;
    addressBook: string;
}
export declare class CardDavService {
    private connection;
    private client;
    private logger;
    constructor(connection: CalDavConnection);
    private getClient;
    listAddressBooks(): Promise<Array<{
        name: string;
        url: string;
    }>>;
    private parseVCard;
    searchContacts(query?: string, addressBookName?: string): Promise<ContactInfo[]>;
    createContact(options: {
        fn: string;
        email?: string;
        phone?: string;
        org?: string;
        addressBookName?: string;
    }): Promise<ContactInfo>;
}
