import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { CalendarService } from "../services/CalendarService.js";
/** Calendar tool names - exported for tool routing */
export declare const CALENDAR_TOOLS: readonly ["get_calendar_events", "search_calendar", "get_free_busy"];
export type CalendarToolName = (typeof CALENDAR_TOOLS)[number];
export declare function isCalendarTool(name: string): name is CalendarToolName;
export declare function createCalendarTools(calendarService: CalendarService): Tool[];
export declare function handleCalendarTool(name: string, args: Record<string, unknown>, calendarService: CalendarService): Promise<CallToolResult>;
