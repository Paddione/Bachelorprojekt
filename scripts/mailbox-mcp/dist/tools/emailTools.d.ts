import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { EmailService } from "../services/EmailService.js";
import type { SmtpService } from "../services/SmtpService.js";
/** Email tool names - exported for tool routing */
export declare const EMAIL_TOOLS: readonly ["search_emails", "get_email", "get_email_thread", "send_email", "create_draft", "move_email", "mark_email", "delete_email", "get_folders", "create_directory"];
export type EmailToolName = (typeof EMAIL_TOOLS)[number];
export declare function isEmailTool(name: string): name is EmailToolName;
export declare function createEmailTools(emailService: EmailService, smtpService?: SmtpService): Tool[];
export declare function handleEmailTool(name: string, args: unknown, emailService: EmailService, smtpService?: SmtpService): Promise<{
    content: Array<{
        type: "text";
        text: string;
        [key: string]: unknown;
    }>;
    isError?: boolean;
}>;
