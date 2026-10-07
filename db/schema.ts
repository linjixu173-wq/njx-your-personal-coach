import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const profiles = sqliteTable('profiles', {
  userId: text('user_id').primaryKey(), data: text('data').notNull(), activePlanId: text('active_plan_id'),
  revision: integer('revision').notNull().default(0), updatedAt: text('updated_at').notNull(),
});
export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), batchId: text('batch_id').notNull().unique(),
  basePlanId: text('base_plan_id'), data: text('data').notNull(), createdAt: text('created_at').notNull(),
}, t => [index('idx_plans_owner').on(t.userId)]);
export const batches = sqliteTable('batches', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), kind: text('kind').notNull(),
  basePlanId: text('base_plan_id'), data: text('data').notNull(), createdAt: text('created_at').notNull(),
}, t => [index('idx_batches_owner').on(t.userId)]);
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), status: text('status').notNull(),
  data: text('data').notNull(), revision: integer('revision').notNull().default(0), createdAt: text('created_at').notNull(),
}, t => [index('idx_sessions_owner').on(t.userId), uniqueIndex('idx_sessions_one_draft').on(t.userId).where(sql`${t.status} = 'draft'`)]);
export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), objectKey: text('object_key').notNull(),
  mime: text('mime').notNull(), date: text('date').notNull(), view: text('view').notNull(), createdAt: text('created_at').notNull(),
}, t => [index('idx_photos_owner').on(t.userId)]);
