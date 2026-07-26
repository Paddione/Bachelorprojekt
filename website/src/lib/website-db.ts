/**
 * website-db.ts — Facade / Re-exports Module for Website DB Layer
 *
 * Stage 2 of website-db split (T002150).
 * All domain functionality has been extracted into specialized modules:
 * - db-pool.ts (pool & schema helpers)
 * - project-portal-db.ts (customers admin getters)
 * - website-core-db.ts (Customer CRUD, Bug Tickets, Site Settings, Vacation, Legal Pages)
 * - meetings-db.ts (Meeting Knowledge Pipeline)
 * - appointments-db.ts (Calendar / Booking / Time Windows)
 * - test-infra-db.ts (Test Run results & Playwright reports)
 * - billing-db.ts (Billing DDL & Tax Monitor)
 * - time-entries-db.ts (Time Entries, Client Notes, Onboarding, Follow-ups)
 * - portal-tools-db.ts (Admin Shortcuts, DSGVO Audit, Invoice Counter, Brett Link)
 * - custom-sections-db.ts (Custom Website Sections)
 * - content-store-db.ts (Content-Store accessors & versioning)
 *
 * This file retains backward-compatibility re-exports for external callers.
 */

// Types re-exported from config/types.ts for backward compatibility.
import type { ReferenzenConfig } from '../config/types';
export type { ReferenzItem, ReferenzenType, ReferenzenConfig } from '../config/types';

// Transitional type re-exports for admin save endpoints
import type {
  HomepageContent, UebermichContent, FaqItem, KontaktContent,
  Stammdaten, NavItem, FooterConfig, KoreFlags,
  LeistungServiceRow, LeistungCategory, HomepageService,
  ServicePageContent, ServicePagePricing, ServicePageSection,
} from '../content-schema';
export type {
  HomepageContent, UebermichContent, FaqItem, KontaktContent,
  Stammdaten, NavItem, FooterConfig, KoreFlags,
  LeistungServiceRow, LeistungCategory, HomepageService,
  ServicePageContent, ServicePagePricing, ServicePageSection,
};

export type LeistungCategoryOverride = LeistungCategory;
export type LeistungServiceOverride = LeistungServiceRow;
export type ServiceOverride = HomepageService & {
  pageContent?: ServicePageContent;
  leistungCategoryId?: string;
  headlineKey?: string;
  headlinePrefix?: boolean;
};

import { initTicketsSchema } from './tickets-schema';
import { pool } from './db-pool';

// Re-exports from db-pool.ts
export { pool, ensureSchemaOnce, __resetSchemaInitCacheForTests } from './db-pool';
export { pool as platformPool } from './db-pool';

// Re-exports from project-portal-db.ts
export { listAllCustomers, listAdminUsers, getCustomerByEmail } from './project-portal-db';

// Re-exports from website-core-db.ts
export {
  // Customer
  upsertCustomer, listPendingEnrollments, declineEnrollment,
  getCustomerFullById, getCustomerByKeycloakId,
  setCustomerNumber, setAdminNumber, setIsAdmin,
  // Bug Tickets
  insertBugTicket, resolveBugTicket, archiveBugTicket,
  getBugTicketStatus, getBugTicketWithComments,
  appendBugTicketComment, reopenBugTicket, listBugTickets,
  // Site Settings
  initSiteSettingsTable, getSiteSetting, setSiteSetting,
  // Vacation / Blackout
  getVacationPeriods, saveVacationPeriods,
  // Legal Pages
  initLegalPagesTable, getLegalPage, saveLegalPage,
} from './website-core-db';

export type {
  Customer,
  PendingEnrollment,
  BugTicketStatus, BugTicketRow, BugTicketComment,
  VacationPeriod,
} from './website-core-db';

import { upsertCustomer } from './website-core-db';

// Eager boot-time init
initTicketsSchema().catch(() => { /* retried on first access via ensureSchemaOnce */ });

// ── Timeline (PR5: reads from tickets.pr_events on the same DB) ─────────────

export type TimelineRow = {
  id: number;
  day: string;
  pr_number: number | null;
  title: string;
  description: string | null;
  category: string;
  scope: string | null;
  brand: string | null;
  requirement_id: string | null;
  requirement_name: string | null;
  bugs_fixed: number;
  ticket_external_id: string | null;
  ticket_id: string | null;
};

export async function listTimeline(opts: {
  limit?: number;
  offset?: number;
  category?: string;
  brand?: string;
} = {}): Promise<TimelineRow[]> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = opts.offset ?? 0;

  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.category) { params.push(opts.category); where.push(`category = $${params.length}`); }
  if (opts.brand)    { params.push(opts.brand);    where.push(`(brand = $${params.length} OR brand IS NULL)`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(limit, offset);

  const rows = (await pool.query(
    `SELECT pr_number AS id,
            to_char(merged_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
            pr_number, title, description,
            category, scope, brand,
            NULL::text AS requirement_id,
            NULL::text AS requirement_name
       FROM tickets.pr_events
       ${whereSql}
      ORDER BY merged_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )).rows as Omit<TimelineRow, 'bugs_fixed' | 'ticket_external_id' | 'ticket_id'>[];

  const prNumbers = rows.map(r => r.pr_number).filter((n): n is number => n != null);
  const bugCounts = new Map<number, number>();
  const ticketIds = new Map<number, { external_id: string; ticket_id: string }>();

  if (prNumbers.length > 0) {
    const [counts, links] = await Promise.all([
      pool.query<{ pr: number; n: number }>(
        `SELECT pr_number AS pr, COUNT(*)::int AS n
           FROM tickets.ticket_links
          WHERE kind = 'fixes' AND pr_number = ANY($1::int[])
          GROUP BY pr_number`,
        [prNumbers],
      ),
      pool.query<{ pr: number; external_id: string; ticket_id: string }>(
        `SELECT tl.pr_number AS pr, t.external_id, tl.from_id AS ticket_id
           FROM tickets.ticket_links tl
           JOIN tickets.tickets t ON t.id = tl.from_id
          WHERE tl.kind = 'implements' AND tl.pr_number = ANY($1::int[])`,
        [prNumbers],
      ),
    ]);
    for (const c of counts.rows) bugCounts.set(c.pr, c.n);
    for (const l of links.rows) ticketIds.set(l.pr, l);
  }

  return rows.map(r => ({
    ...r,
    bugs_fixed: r.pr_number ? (bugCounts.get(r.pr_number) ?? 0) : 0,
    ticket_external_id: r.pr_number ? (ticketIds.get(r.pr_number)?.external_id ?? null) : null,
    ticket_id: r.pr_number ? (ticketIds.get(r.pr_number)?.ticket_id ?? null) : null,
  }));
}

// Re-exports from meetings-db.ts
export {
  initMeetingsDb, getMeetingByRoomToken, createMeeting,
  updateMeetingStatus, saveTranscript, saveArtifact, saveInsight,
  releaseMeeting, getMeetingsForClient, listAllMeetings, getMeetingDetail,
} from './meetings-db';
export type {
  Meeting, MeetingWithDetails, MeetingWithCustomer, SavedTranscript, AdminMeeting,
} from './meetings-db';

export async function assignMeeting(meetingId: string, params: {
  customerName?: string;
  customerEmail?: string;
  meetingType?: string;
  projectId?: string | null;
}): Promise<void> {
  if (params.customerName && params.customerEmail) {
    const c = await upsertCustomer({ name: params.customerName, email: params.customerEmail });
    await pool.query(`UPDATE meetings SET customer_id = $2, updated_at = now() WHERE id = $1`, [meetingId, c.id]);
  }
  if (params.meetingType !== undefined) {
    await pool.query(`UPDATE meetings SET meeting_type = $2, updated_at = now() WHERE id = $1`, [meetingId, params.meetingType]);
  }
  if (params.projectId !== undefined) {
    await pool.query(`UPDATE meetings SET project_id = $2, updated_at = now() WHERE id = $1`, [meetingId, params.projectId]);
  }
}

// Stubs for retired Content save functions
export async function saveServiceConfig(brand: string, overrides: ServiceOverride[]): Promise<void> {
  void brand; void overrides;
  throw new Error('T001490: saveServiceConfig retired — admin endpoints now publish via content-publish.ts');
}
export async function saveLeistungenConfig(brand: string, categories: LeistungCategoryOverride[]): Promise<void> {
  void brand; void categories;
  throw new Error('T001490: saveLeistungenConfig retired — admin endpoints now publish via content-publish.ts');
}
export async function saveReferenzen(brand: string, config: ReferenzenConfig): Promise<void> {
  void brand; void config;
  throw new Error('T001490: saveReferenzen retired — admin endpoints now publish via content-publish.ts');
}
export async function saveHomepageContent(brand: string, data: HomepageContent): Promise<void> {
  void brand; void data;
  throw new Error('T001490: saveHomepageContent retired — admin endpoints now publish via content-publish.ts');
}
export async function saveUebermichContent(brand: string, data: UebermichContent): Promise<void> {
  void brand; void data;
  throw new Error('T001490: saveUebermichContent retired — admin endpoints now publish via content-publish.ts');
}
export async function saveFaqContent(brand: string, items: FaqItem[]): Promise<void> {
  void brand; void items;
  throw new Error('T001490: saveFaqContent retired — admin endpoints now publish via content-publish.ts');
}
export async function saveKontaktContent(brand: string, data: KontaktContent): Promise<void> {
  void brand; void data;
  throw new Error('T001490: saveKontaktContent retired — admin endpoints now publish via content-publish.ts');
}

// Content-Hub keys
export type NavKey = 'navigation';
export type FooterKey = 'footer';
export type StammdatenKey = 'stammdaten';
export type KoreFlagsKey = 'kore_flags';
export type PricingHighlightKey = 'pricing_highlight';
export const NAV_KEY: NavKey = 'navigation';
export const FOOTER_KEY: FooterKey = 'footer';
export const STAMMDATEN_KEY: StammdatenKey = 'stammdaten';
export const KORE_FLAGS_KEY: KoreFlagsKey = 'kore_flags';
export const PRICING_HIGHLIGHT_KEY: PricingHighlightKey = 'pricing_highlight';

export async function setJsonSetting<T>(brand: string, key: string, value: T): Promise<void> {
  void brand; void key; void value;
  throw new Error('T001490: setJsonSetting retired — admin endpoints now publish via content-publish.ts');
}

// Re-exports from time-entries-db.ts
export {
  getLastTimeEntryRate, createTimeEntry, listTimeEntries, listAllTimeEntries,
  setTimeEntryStripeInvoice, getTimeEntryIdsByInvoice, getUnbilledBillableEntriesByCustomer,
  deleteTimeEntry, getProjectTotalMinutes, listClientNotes, createClientNote, deleteClientNote,
  getOrCreateOnboardingChecklist, toggleOnboardingItem, resetOnboardingChecklist,
  createFollowUp, listFollowUps, getDueFollowUps, updateFollowUp, deleteFollowUp,
} from './time-entries-db';
export type { TimeEntry, UnbilledCustomerGroup, ClientNote, OnboardingItem, FollowUp } from './time-entries-db';

// Re-exports from appointments-db.ts
export {
  listTasksInMonth, listProjectsInMonth, listMeetingsInRange,
  setBookingInvoice, getBookingInvoices, getBookingProjects, setBookingProject,
  getBookingLeistungen, getWhitelistedSlots, addSlotToWhitelist, removeSlotFromWhitelist,
  isSlotWhitelisted, claimSlot, getFreeTimeWindows, addFreeTimeWindow, removeFreeTimeWindow,
  isSlotInAnyWindow,
} from './appointments-db';
export type {
  CalendarTask, CalendarProject, CalendarMeeting, BookingInvoiceInfo, WhitelistedSlot, FreeTimeWindow,
} from './appointments-db';

// Content-bundle re-exports
import { bundleServices as _bundleServices, bundleSeo as _bundleSeo } from './content-bundle';
const getServiceConfig = (brand: string) => _bundleServices(brand);
export { getServiceConfig };

function _getSeoForPageKey(brand: string, pageKey: string): { title: string | null; description: string | null; ogImage: string | null } {
  const seo = _bundleSeo(brand);
  return {
    title: seo.titles?.[pageKey] ?? null,
    description: seo.descriptions?.[pageKey] ?? null,
    ogImage: seo.ogImages?.[pageKey] ?? null,
  };
}
const getSeoTitle   = (brand: string, pageKey: string) => _getSeoForPageKey(brand, pageKey).title;
const getSeoOgImage = (brand: string, pageKey: string) => _getSeoForPageKey(brand, pageKey).ogImage;
const getSeoMeta    = (brand: string, pageKey: string) => _getSeoForPageKey(brand, pageKey);
export { getSeoTitle, getSeoOgImage, getSeoMeta };

// Re-exports from portal-tools-db.ts
export {
  listAdminShortcuts, createAdminShortcut, deleteAdminShortcut, updateAdminShortcut,
  insertDsgvoRequest, getNextInvoiceNumber, seedInvoiceCounter, claimBrettLinkPost,
} from './portal-tools-db';
export type { AdminShortcut } from './portal-tools-db';

// Re-exports from test-infra-db.ts
export {
  saveTestRun, updateTestRun, listTestRuns, saveTestResults, listFlakeWindow,
  getTestRunTrend, listLastTestStatusPerTest, savePlaywrightReport, getLatestPlaywrightReport,
} from './test-infra-db';
export type {
  TestRun, TestResultRow, SavedTestResult, FlakeRow, TrendRow, PlaywrightReport,
} from './test-infra-db';

// Re-exports from custom-sections-db.ts
export {
  listCustomSections, getCustomSection, createCustomSection, updateCustomSection, deleteCustomSection,
} from './custom-sections-db';
export type { CustomSectionField, CustomSection } from './custom-sections-db';

// Re-exports from billing-db.ts
export { initBillingTables, initTaxMonitorTables, initEurTables } from './billing-db';

// Re-exports from content-store-db.ts
export { readContent, writeContent, listVersions, ContentConflictError } from './content-store-db';
export type { ContentRead } from './content-store-db';
