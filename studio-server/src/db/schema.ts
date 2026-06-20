import { pgSchema, uuid, text, integer, boolean, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core';

export const studio = pgSchema('studio');

export const clients = studio.table('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  initials: text('initials').notNull(),
  since: text('since').notNull(),
  lang: text('lang').notNull(),
  category: text('category').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const profiles = studio.table('profiles', {
  clientId: uuid('client_id').primaryKey().references(() => clients.id, { onDelete: 'cascade' }),
  fields: jsonb('fields').notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = studio.table('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  status: text('status').notNull().default('aktiv'),
  currentLevel: integer('current_level').notNull().default(0),
  templateOf: uuid('template_of'),
  lang: text('lang').notNull().default('Deutsch'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  pausedAt: timestamp('paused_at', { withTimezone: true }),
});

export const sessionLevels = studio.table('session_levels', {
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  levelNo: integer('level_no').notNull(),
  prompt: text('prompt').notNull().default(''),
  promptIsDefault: boolean('prompt_is_default').notNull().default(true),
  answer: text('answer'),
  notes: text('notes'),
  done: boolean('done').notNull().default(false),
  clipboard: jsonb('clipboard').notNull().default([]),
  generatedAt: timestamp('generated_at', { withTimezone: true }),
}, (t) => ({ pk: primaryKey({ columns: [t.sessionId, t.levelNo] }) }));

export const standardLevels = studio.table('standard_levels', {
  levelNo: integer('level_no').primaryKey(),
  name: text('name').notNull(),
  goal: text('goal').notNull(),
  prompt: text('prompt').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const standardProfileFields = studio.table('standard_profile_fields', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  value: text('value').notNull(),
  type: text('type').notNull().default('text'),
  required: boolean('required').notNull().default(false),
  active: boolean('active').notNull().default(true),
  sort: integer('sort').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
