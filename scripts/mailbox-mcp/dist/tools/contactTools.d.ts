import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CardDavService } from "../services/CardDavService.js";
export declare const CONTACT_TOOLS: readonly ["list_address_books", "search_contacts", "create_contact"];
export type ContactToolName = (typeof CONTACT_TOOLS)[number];
export declare function isContactTool(name: string): name is ContactToolName;
export declare function createContactTools(cardDavService: CardDavService): Tool[];
export declare function handleContactTool(cardDavService: CardDavService, name: ContactToolName, args: Record<string, unknown>): Promise<CallToolResult>;
