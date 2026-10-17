import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const events = sqliteTable('events', {
  id: text('id').primaryKey(), title: text('title').notNull(),
  salt: text('salt').notNull(), passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const records = sqliteTable('records', {
  eventId: text('event_id').notNull(), id: text('id').notNull(), kind: text('kind').notNull(),
  data: text('data').notNull(), version: integer('version').notNull(),
  lastOp: text('last_op').notNull(), updatedAt: integer('updated_at').notNull(),
}, t => [primaryKey({ columns: [t.eventId, t.id] })]);
export const limits = sqliteTable('limits', {
  id: text('id').primaryKey(), count: integer('count').notNull(), until: integer('until').notNull(),
});
