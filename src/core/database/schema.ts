import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 255 }),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Check-ins table
export const checkins = pgTable(
  'checkins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    externalPlaceId: varchar('external_place_id', { length: 255 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // At most one active check-in (and session token) per user.
  (table) => [
    uniqueIndex('checkins_one_active_per_user')
      .on(table.userId)
      .where(sql`${table.isActive}`),
  ]
);

export type User = typeof users.$inferSelect;
export type CheckIn = typeof checkins.$inferSelect;
