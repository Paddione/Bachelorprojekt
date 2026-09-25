import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CardDavService } from "../services/CardDavService.js";
import { toMCPError } from "../types/errors.js";

export const CONTACT_TOOLS = [
  "list_address_books",
  "search_contacts",
  "create_contact",
] as const;

export type ContactToolName = (typeof CONTACT_TOOLS)[number];

export function isContactTool(name: string): name is ContactToolName {
  return CONTACT_TOOLS.includes(name as ContactToolName);
}

export function createContactTools(cardDavService: CardDavService): Tool[] {
  return [
    {
      name: "list_address_books",
      description: "List all available CardDAV address books in the mailbox.org account",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "search_contacts",
      description: "Search contacts in mailbox.org address book by name, email, phone or organization",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query to filter contacts (optional, returns all if omitted)",
          },
          addressBook: {
            type: "string",
            description: "Specific address book name to search in (optional)",
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "create_contact",
      description: "Create a new contact in mailbox.org address book (CardDAV)",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Full name (display name) of the contact",
          },
          email: {
            type: "string",
            description: "Email address of the contact (optional)",
          },
          phone: {
            type: "string",
            description: "Phone number of the contact (optional)",
          },
          organization: {
            type: "string",
            description: "Organization / Company name (optional)",
          },
          addressBook: {
            type: "string",
            description: "Target address book name (default: 'Kontakte')",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  ];
}

export async function handleContactTool(
  cardDavService: CardDavService,
  name: ContactToolName,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "list_address_books": {
        const books = await cardDavService.listAddressBooks();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ addressBooks: books }, null, 2),
            },
          ],
        };
      }
      case "search_contacts": {
        const query = typeof args.query === "string" ? args.query : undefined;
        const addressBook = typeof args.addressBook === "string" ? args.addressBook : undefined;
        const contacts = await cardDavService.searchContacts(query, addressBook);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  count: contacts.length,
                  contacts: contacts.map(c => ({
                    fn: c.fn,
                    email: c.email,
                    phone: c.phone,
                    org: c.org,
                    addressBook: c.addressBook,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }
      case "create_contact": {
        const fn = args.name as string;
        const email = typeof args.email === "string" ? args.email : undefined;
        const phone = typeof args.phone === "string" ? args.phone : undefined;
        const org = typeof args.organization === "string" ? args.organization : undefined;
        const addressBook = typeof args.addressBook === "string" ? args.addressBook : undefined;

        const newContact = await cardDavService.createContact({
          fn,
          email,
          phone,
          org,
          addressBookName: addressBook,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Contact '${fn}' created successfully in '${newContact.addressBook}'`,
                  contact: {
                    fn: newContact.fn,
                    email: newContact.email,
                    phone: newContact.phone,
                    org: newContact.org,
                    addressBook: newContact.addressBook,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error executing contact tool '${name}': ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
