import dayjs from "dayjs";
import ICAL from "ical.js";
import { createDAVClient } from "tsdav";
import { withCacheFallback } from "../utils/cacheFallback.js";
import { CircuitBreaker, } from "./CircuitBreaker.js";
import { createLogger } from "./Logger.js";
export class CalendarService {
    connection;
    cache;
    client = null;
    circuitBreaker;
    logger = createLogger("CalendarService");
    constructor(connection, cache, circuitBreakerConfig) {
        this.connection = connection;
        this.cache = cache;
        // Initialize circuit breaker with defaults or provided config
        const cbConfig = circuitBreakerConfig || {
            failureThreshold: 3,
            recoveryTimeout: 5000, // 5 seconds
            monitoringInterval: 2000, // 2 seconds
        };
        this.circuitBreaker = new CircuitBreaker(cbConfig);
    }
    async getClient() {
        if (!this.client) {
            this.client = await createDAVClient({
                serverUrl: this.connection.baseUrl,
                credentials: {
                    username: this.connection.username,
                    password: this.connection.password,
                },
                authMethod: "Basic",
                defaultAccountType: "caldav",
            });
        }
        return this.client;
    }
    async getCalendarEvents(options) {
        const cacheKey = `calendar_events:${JSON.stringify(options)}`;
        return withCacheFallback({
            cacheKey,
            cache: this.cache,
            fetch: async () => {
                const events = await this.fetchCalendarEvents(options);
                return events;
            },
            defaultValue: [],
            logger: this.logger,
            operation: "getCalendarEvents",
            service: "CalendarService",
            ttl: 900000, // 15 minutes TTL
            logContext: { options },
        });
    }
    async searchCalendar(options) {
        const cacheKey = `calendar_search:${JSON.stringify(options)}`;
        return withCacheFallback({
            cacheKey,
            cache: this.cache,
            fetch: async () => {
                const events = await this.fetchCalendarEvents(options);
                const filteredEvents = this.filterEventsByQuery(events, options.query);
                return filteredEvents;
            },
            defaultValue: [],
            logger: this.logger,
            operation: "searchCalendar",
            service: "CalendarService",
            ttl: 900000, // 15 minutes TTL
            logContext: { query: options.query },
        });
    }
    async getFreeBusy(start, end, calendar) {
        const cacheKey = `freebusy:${start.toISOString()}:${end.toISOString()}:${calendar || "all"}`;
        return withCacheFallback({
            cacheKey,
            cache: this.cache,
            fetch: async () => {
                const events = await this.fetchCalendarEvents({
                    start,
                    end,
                    calendar,
                });
                const freeBusy = this.calculateFreeBusy(events, start, end);
                return freeBusy;
            },
            defaultValue: {
                start,
                end,
                busy: [],
                free: [{ start, end }],
            },
            logger: this.logger,
            operation: "getFreeBusy",
            service: "CalendarService",
            ttl: 300000, // 5 minutes TTL
            logContext: {
                start: start.toISOString(),
                end: end.toISOString(),
                calendar,
            },
        });
    }
    async fetchCalendarEvents(options) {
        try {
            const calendars = this.connection.calendars || (await this.discoverCalendars());
            const allEvents = [];
            for (const calendar of calendars) {
                if (options.calendar && calendar !== options.calendar) {
                    continue;
                }
                const calendarEvents = await this.fetchEventsFromCalendar(calendar, options);
                allEvents.push(...calendarEvents);
            }
            return this.sortAndLimitEvents(allEvents, options);
        }
        catch (error) {
            this.logger.error("Error fetching calendar events", {
                operation: "getEvents",
                service: "CalendarService",
            }, {
                options,
                error: error instanceof Error ? error.message : String(error),
            });
            return [];
        }
    }
    async discoverCalendars() {
        try {
            const calendars = await this.circuitBreaker.execute(async () => {
                const client = await this.getClient();
                return await client.fetchCalendars();
            });
            return calendars.map((cal) => cal.displayName || cal.url);
        }
        catch (error) {
            this.logger.error("Calendar discovery failed", {
                operation: "getCalendarList",
                service: "CalendarService",
            }, { error: error instanceof Error ? error.message : String(error) });
            return ["personal"];
        }
    }
    async fetchEventsFromCalendar(calendar, options) {
        try {
            const { calendars, calendarObjects } = await this.circuitBreaker.execute(async () => {
                const client = await this.getClient();
                const calendars = await client.fetchCalendars();
                const targetCalendar = calendars.find((cal) => cal.displayName === calendar || cal.url.includes(calendar));
                if (!targetCalendar) {
                    throw new Error(`Calendar ${calendar} not found`);
                }
                const calendarObjects = await client.fetchCalendarObjects({
                    calendar: targetCalendar,
                    timeRange: options.start && options.end
                        ? {
                            start: options.start.toISOString(),
                            end: options.end.toISOString(),
                        }
                        : undefined,
                });
                return { calendars, calendarObjects };
            });
            return await this.parseCalendarObjects(calendarObjects, calendar);
        }
        catch (error) {
            this.logger.error(`Error fetching events from calendar ${calendar}`, {
                operation: "fetchCalendarEvents",
                service: "CalendarService",
            }, {
                calendar,
                options,
                error: error instanceof Error ? error.message : String(error),
            });
            return [];
        }
    }
    parseCalendarObjects(calendarObjects, calendar) {
        const events = [];
        try {
            for (const obj of calendarObjects) {
                if (obj.data) {
                    const parsedEvents = this.parseICalData(obj.data, calendar);
                    events.push(...parsedEvents);
                }
            }
        }
        catch (error) {
            this.logger.error("Error parsing calendar objects", {
                operation: "parseCalendarObjects",
                service: "CalendarService",
            }, { error: error instanceof Error ? error.message : String(error) });
        }
        return events;
    }
    parseICalData(icalData, calendar) {
        const events = [];
        try {
            const jcalData = ICAL.parse(icalData);
            const comp = new ICAL.Component(jcalData);
            const vevents = comp.getAllSubcomponents("vevent");
            for (const vevent of vevents) {
                const event = this.parseVEvent(vevent, calendar);
                if (event) {
                    events.push(event);
                }
            }
        }
        catch (error) {
            this.logger.error("Error parsing iCal data", {
                operation: "parseICalData",
                service: "CalendarService",
            }, { error: error instanceof Error ? error.message : String(error) });
        }
        return events;
    }
    parseVEvent(vevent, calendar) {
        try {
            const event = new ICAL.Event(vevent);
            const basicInfo = this.extractBasicEventInfo(event);
            if (!this.hasValidDates(event)) {
                return null;
            }
            const timeInfo = this.extractTimeInfo(event);
            const participantInfo = this.extractParticipants(event);
            const metadataInfo = this.extractMetadata(event, calendar);
            return {
                ...basicInfo,
                ...timeInfo,
                ...participantInfo,
                ...metadataInfo,
            };
        }
        catch (error) {
            this.logger.error("Error parsing VEVENT", {
                operation: "parseVEvent",
                service: "CalendarService",
            }, { error: error instanceof Error ? error.message : String(error) });
            return null;
        }
    }
    extractBasicEventInfo(event) {
        const uid = event.uid || `${Date.now()}-${Math.random()}`;
        return {
            id: uid,
            uid,
            summary: event.summary || "",
            description: event.description,
            location: event.location,
        };
    }
    hasValidDates(event) {
        return !!(event.startDate && event.endDate);
    }
    extractTimeInfo(event) {
        return {
            start: event.startDate.toJSDate(),
            end: event.endDate.toJSDate(),
            allDay: event.startDate.isDate,
            recurring: event.isRecurring(),
            recurrenceRule: event.component
                .getFirstPropertyValue("rrule")
                ?.toString(),
        };
    }
    extractParticipants(event) {
        const attendees = this.parseAttendees(event.attendees);
        const organizer = this.parseOrganizer(event.organizer);
        return {
            attendees: attendees.length > 0 ? attendees : undefined,
            organizer,
        };
    }
    parseAttendees(attendees) {
        // Früher Return mit leerem Array wenn attendees falsy ist
        if (!attendees || !Array.isArray(attendees)) {
            return [];
        }
        return attendees.map((attendee) => {
            const email = this.extractEmail(attendee);
            return {
                email: email.replace("mailto:", ""),
                name: this.extractName(attendee, email),
                status: this.extractStatus(attendee),
            };
        });
    }
    parseOrganizer(organizer) {
        if (!organizer) {
            return undefined;
        }
        const email = this.extractEmail(organizer).replace("mailto:", "");
        return {
            email,
            name: this.extractName(organizer, email),
        };
    }
    extractEmail(participant) {
        const typedParticipant = participant;
        return typedParticipant.getFirstValue
            ? typedParticipant.getFirstValue()
            : String(participant);
    }
    extractName(participant, email) {
        const typedParticipant = participant;
        return typedParticipant.getParameter
            ? typedParticipant.getParameter("cn")
            : email.replace("mailto:", "").split("@")[0];
    }
    extractStatus(attendee) {
        // Handle null/undefined or non-object attendees
        if (!attendee || typeof attendee !== "object") {
            return "needs-action";
        }
        const typedAttendee = attendee;
        const status = typedAttendee.getParameter
            ? typedAttendee.getParameter("partstat") || "needs-action"
            : "needs-action";
        // Map iCal status values to our expected types
        switch (status.toLowerCase()) {
            case "accepted":
                return "accepted";
            case "declined":
                return "declined";
            case "tentative":
                return "tentative";
            default:
                return "needs-action";
        }
    }
    extractMetadata(event, calendar) {
        const categories = this.parseCategories(event.component.getFirstPropertyValue("categories"));
        return {
            calendar,
            categories,
            created: this.parseICalDate(event.component.getFirstPropertyValue("created")) ||
                new Date(),
            modified: this.parseICalDate(event.component.getFirstPropertyValue("last-modified")) || new Date(),
        };
    }
    parseCategories(categories) {
        return categories && typeof categories === "string"
            ? categories.split(",").map((cat) => cat.trim())
            : [];
    }
    parseICalDate(value) {
        if (!value)
            return null;
        const typedValue = value;
        if (typedValue.toJSDate && typeof typedValue.toJSDate === "function") {
            return typedValue.toJSDate();
        }
        if (typeof value === "string") {
            return dayjs(value).toDate();
        }
        return null;
    }
    filterEventsByQuery(events, query) {
        if (!query)
            return events;
        const searchTerm = query.toLowerCase();
        return events.filter(event => event.summary.toLowerCase().includes(searchTerm) ||
            event.description?.toLowerCase().includes(searchTerm) ||
            event.location?.toLowerCase().includes(searchTerm));
    }
    sortAndLimitEvents(events, options) {
        const sorted = events.sort((a, b) => a.start.getTime() - b.start.getTime());
        if (options.offset || options.limit) {
            const start = options.offset || 0;
            const end = options.limit ? start + options.limit : undefined;
            return sorted.slice(start, end);
        }
        return sorted;
    }
    calculateFreeBusy(events, start, end) {
        const busy = [];
        for (const event of events) {
            if (event.start < end && event.end > start) {
                busy.push({
                    start: new Date(Math.max(event.start.getTime(), start.getTime())),
                    end: new Date(Math.min(event.end.getTime(), end.getTime())),
                    summary: event.summary,
                });
            }
        }
        // Calculate free time slots
        const free = [];
        busy.sort((a, b) => a.start.getTime() - b.start.getTime());
        let currentTime = start;
        for (const busySlot of busy) {
            if (currentTime < busySlot.start) {
                free.push({
                    start: new Date(currentTime),
                    end: new Date(busySlot.start),
                });
            }
            currentTime = new Date(Math.max(currentTime.getTime(), busySlot.end.getTime()));
        }
        if (currentTime < end) {
            free.push({
                start: new Date(currentTime),
                end: new Date(end),
            });
        }
        return { start, end, busy, free };
    }
    // Get circuit breaker metrics
    getCircuitBreakerMetrics() {
        return this.circuitBreaker.getMetrics();
    }
    // Reset circuit breaker (for administrative purposes)
    resetCircuitBreaker() {
        this.circuitBreaker.reset();
    }
    // Clean up resources
    async disconnect() {
        this.client = null;
        this.circuitBreaker.reset();
    }
}
//# sourceMappingURL=CalendarService.js.map