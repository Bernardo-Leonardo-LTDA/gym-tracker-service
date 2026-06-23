import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

// Users table (Save current music state)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 255 }),

  // --- Real Time (Music) ---
  currentSongTitle: varchar('current_song_title', { length: 255 }),
  currentSongArtist: varchar('current_song_artist', { length: 255 }),
  currentSongExternalId: varchar('current_song_external_id', { length: 255 }),
  currentSongUpdatedAt: timestamp('current_song_updated_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Check-ins table
export const checkins = pgTable('checkins', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  externalPlaceId: varchar('external_place_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
