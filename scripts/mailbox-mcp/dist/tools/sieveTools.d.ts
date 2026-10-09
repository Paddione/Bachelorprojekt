import { type CallToolRequest, type CallToolResult, type Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServerConfig } from "../config/config.js";
/** Sieve tool names - exported for tool routing */
export declare const SIEVE_TOOLS: readonly ["list_sieve_scripts", "get_sieve_script", "create_sieve_filter", "delete_sieve_script", "activate_sieve_script", "check_sieve_script", "get_sieve_capabilities"];
export type SieveToolName = (typeof SIEVE_TOOLS)[number];
export declare function isSieveTool(name: string): name is SieveToolName;
export declare function getSieveTools(): Tool[];
export declare function handleSieveTool(request: CallToolRequest, config: ServerConfig): Promise<CallToolResult>;
