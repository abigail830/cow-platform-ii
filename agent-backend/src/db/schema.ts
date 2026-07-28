import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

export const MODEL_API_TYPES = [
  'chat-completions',
  'embeddings',
  'custom-endpoint',
  'image-generation',
  'video-generation',
] as const;

export type ModelApiType = (typeof MODEL_API_TYPES)[number];

export const PERMISSION_CATEGORIES = ['platform-basic', 'admin', 'agent'] as const;
export type PermissionCategory = (typeof PERMISSION_CATEGORIES)[number];

export const ACCESS_LEVELS = ['read', 'write'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const appUsers = pgTable('app_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const appAgentPermissions = pgTable(
  'app_agent_permissions',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    agentName: text('agent_name').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.agentName] })],
);

export const appConversations = pgTable(
  'app_conversations',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    agentName: text('agent_name').notNull(),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_conversations_user').on(t.userId, t.updatedAt)],
);

export const appModelConfigs = pgTable(
  'app_model_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    modelId: text('model_id').notNull(),
    provider: text('provider').notNull(),
    apiType: text('api_type').notNull(),
    capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
    baseUrl: text('base_url'),
    apiKey: text('api_key'),
    isDefault: boolean('is_default').notNull().default(false),
    extraConfig: jsonb('extra_config').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_model_configs_api_type').on(t.apiType),
    index('idx_model_configs_provider').on(t.provider),
  ],
);

export const appPermissions = pgTable(
  'app_permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    label: text('label').notNull(),
    description: text('description'),
    category: text('category').notNull(),
    routePatterns: jsonb('route_patterns').$type<string[]>().notNull().default([]),
    apiPatterns: jsonb('api_patterns').$type<string[]>().notNull().default([]),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_permissions_category').on(t.category)],
);

export const appRoles = pgTable('app_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const appRolePermissions = pgTable(
  'app_role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => appRoles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => appPermissions.id, { onDelete: 'cascade' }),
    accessLevel: text('access_level').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const appUserRoles = pgTable(
  'app_user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => appRoles.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

