import { randomUUID } from "node:crypto";
import { createDAVClient, type DAVAddressBook, type DAVObject } from "tsdav";
import type { CalDavConnection } from "../types/calendar.types.js";
import { createLogger } from "./Logger.js";

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

const getBookDisplayName = (book: DAVAddressBook): string => {
  if (typeof book.displayName === "string") return book.displayName;
  if (book.displayName && typeof book.displayName === "object") {
    const text = (book.displayName as Record<string, unknown>)._text;
    if (typeof text === "string") return text;
  }
  return "AddressBook";
};

export class CardDavService {
  private connection: CalDavConnection;
  private client: Awaited<ReturnType<typeof createDAVClient>> | null = null;
  private logger = createLogger("CardDavService");

  constructor(connection: CalDavConnection) {
    this.connection = connection;
  }

  private async getClient(): Promise<Awaited<ReturnType<typeof createDAVClient>>> {
    if (!this.client) {
      this.client = await createDAVClient({
        serverUrl: this.connection.baseUrl,
        credentials: {
          username: this.connection.username,
          password: this.connection.password,
        },
        authMethod: "Basic",
        defaultAccountType: "carddav",
      });
    }
    return this.client;
  }

  async listAddressBooks(): Promise<Array<{ name: string; url: string }>> {
    const client = await this.getClient();
    const books = await client.fetchAddressBooks();
    return books.map(b => ({
      name: getBookDisplayName(b),
      url: b.url,
    }));
  }

  private parseVCard(vcardStr: string, url: string, bookName: string): ContactInfo {
    const lines = vcardStr.split(/\r\n|\r|\n/);
    let fn = "";
    let name = "";
    let email = "";
    let phone = "";
    let org = "";
    let uid = url;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith("FN:")) {
        fn = line.substring(3).trim();
      } else if (line.startsWith("N:")) {
        name = line.substring(2).replace(/;/g, " ").trim();
      } else if (line.startsWith("EMAIL") && line.includes(":")) {
        email = line.substring(line.indexOf(":") + 1).trim();
      } else if (line.startsWith("TEL") && line.includes(":")) {
        phone = line.substring(line.indexOf(":") + 1).trim();
      } else if (line.startsWith("ORG:")) {
        org = line.substring(4).replace(/;/g, " ").trim();
      } else if (line.startsWith("UID:")) {
        uid = line.substring(4).trim();
      }
    }

    return {
      uid,
      url,
      fn: fn || name || "Unnamed",
      name: name || fn,
      email,
      phone,
      org,
      vcardData: vcardStr,
      addressBook: bookName,
    };
  }

  async searchContacts(query?: string, addressBookName?: string): Promise<ContactInfo[]> {
    const client = await this.getClient();
    const books = await client.fetchAddressBooks();
    const targetBooks = addressBookName
      ? books.filter(b => getBookDisplayName(b).toLowerCase() === addressBookName.toLowerCase())
      : books;

    const results: ContactInfo[] = [];
    const q = query ? query.toLowerCase() : "";
    const auth =
      "Basic " +
      Buffer.from(
        `${this.connection.username}:${this.connection.password}`,
      ).toString("base64");

    for (const book of targetBooks) {
      const bookName = getBookDisplayName(book);
      try {
        const response = await fetch(book.url, {
          method: "PROPFIND",
          headers: {
            Authorization: auth,
            Depth: "1",
            "Content-Type": "application/xml",
          },
          body: `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
  <D:prop>
    <D:getetag/>
    <C:address-data/>
  </D:prop>
</D:propfind>`,
        });

        if (!response.ok && response.status !== 207) continue;
        const xml = await response.text();

        const respMatches = xml.split(/<\/?(?:D:)?response>/i);
        for (const resp of respMatches) {
          if (!resp.includes("address-data")) continue;
          const hrefMatch = resp.match(/<(?:D:)?href>([^<]+)<\/(?:D:)?href>/i);
          const vcardMatch = resp.match(
            /<(?:[A-Za-z0-9_]+:)?address-data[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:[A-Za-z0-9_]+:)?address-data>/i,
          );

          if (vcardMatch && vcardMatch[1].trim().startsWith("BEGIN:VCARD")) {
            const cardData = vcardMatch[1].trim();
            const cardUrl = hrefMatch
              ? new URL(hrefMatch[1], book.url).href
              : book.url;
            const parsed = this.parseVCard(cardData, cardUrl, bookName);
            if (!q) {
              results.push(parsed);
            } else {
              const haystack =
                `${parsed.fn} ${parsed.name} ${parsed.email} ${parsed.phone} ${parsed.org}`.toLowerCase();
              if (haystack.includes(q)) {
                results.push(parsed);
              }
            }
          }
        }
      } catch (err) {
        this.logger.warning(`Failed to fetch vcards from ${bookName}: ${err}`);
      }
    }

    return results;
  }

  async createContact(options: {
    fn: string;
    email?: string;
    phone?: string;
    org?: string;
    addressBookName?: string;
  }): Promise<ContactInfo> {
    const client = await this.getClient();
    const books = await client.fetchAddressBooks();
    const targetBook =
      (options.addressBookName
        ? books.find(b => getBookDisplayName(b).toLowerCase() === options.addressBookName?.toLowerCase())
        : books.find(b => getBookDisplayName(b) === "Kontakte") || books[0]) || books[0];

    if (!targetBook) {
      throw new Error("No address book available to save contact");
    }

    const uid = `contact-${randomUUID()}`;
    const vCardLines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `UID:${uid}`,
      `FN:${options.fn}`,
      `N:${options.fn};;;;`,
    ];
    if (options.email) vCardLines.push(`EMAIL;TYPE=INTERNET:${options.email}`);
    if (options.phone) vCardLines.push(`TEL;TYPE=CELL:${options.phone}`);
    if (options.org) vCardLines.push(`ORG:${options.org}`);
    vCardLines.push("END:VCARD", "");
    const vCardData = vCardLines.join("\r\n");

    const newVCard = await client.createVCard({
      addressBook: targetBook,
      vCardString: vCardData,
      filename: `${uid}.vcf`,
    });

    return this.parseVCard(vCardData, newVCard.url, getBookDisplayName(targetBook));
  }
}
