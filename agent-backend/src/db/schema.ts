import {
  boolean,
  integer,
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
  'vlm',
  'custom-endpoint',
  'image-generation',
  'video-generation',
] as const;

export type ModelApiType = (typeof MODEL_API_TYPES)[number];

export const PERMISSION_CATEGORIES = ['platform-basic', 'knowledge-management', 'admin', 'agent'] as const;
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
    name: text('name').notNull().unique(),
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

export const DOCUMENT_STATUSES = ['uploaded', 'running', 'completed', 'failed'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const appPipelineConfigs = pgTable(
  'app_pipeline_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    pipelineName: text('pipeline_name').notNull(),
    commandTemplate: text('command_template').notNull(),
    modelConfigId: uuid('model_config_id').references(() => appModelConfigs.id, { onDelete: 'set null' }),
    isEnabled: boolean('is_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_pipeline_configs_enabled').on(t.isEnabled)],
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

export const appDocumentChannels = pgTable(
  'app_document_channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    parentId: uuid('parent_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    metadataExtractionModelId: uuid('metadata_extraction_model_id').references(() => appModelConfigs.id, {
      onDelete: 'set null',
    }),
    pipelineId: uuid('pipeline_id').references(() => appPipelineConfigs.id, { onDelete: 'set null' }),
    autoStartPipeline: boolean('auto_start_pipeline').notNull().default(false),
    createdBy: uuid('created_by').references(() => appUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_document_channels_parent').on(t.parentId, t.sortOrder)],
);

export const appDocuments = pgTable(
  'app_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => appDocumentChannels.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    fileType: text('file_type').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    fileHash: text('file_hash').notNull(),
    s3Key: text('s3_key').notNull(),
    status: text('status').notNull().default('uploaded'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    uploadedBy: uuid('uploaded_by').references(() => appUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_documents_channel').on(t.channelId, t.updatedAt),
    index('idx_documents_hash').on(t.fileHash),
  ],
);

export const PIPELINE_JOB_STAGES = [
  'submitted',
  'parsed',
  'extracted_metadata',
  'done',
  'failed',
] as const;
export type PipelineJobStage = (typeof PIPELINE_JOB_STAGES)[number];

export const PIPELINE_PROVIDERS = ['baidu', 'aliyun'] as const;
export type PipelineProvider = (typeof PIPELINE_PROVIDERS)[number];

export const appPipelineJobs = pgTable(
  'app_pipeline_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => appDocuments.id, { onDelete: 'cascade' }),
    pipelineName: text('pipeline_name').notNull(),
    provider: text('provider').notNull(),
    stage: text('stage').notNull().default('submitted'),
    externalJobId: text('external_job_id'),
    extractionArgs: text('extraction_args'),
    vlmArgs: text('vlm_args'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_pipeline_jobs_document').on(t.documentId, t.createdAt),
    index('idx_pipeline_jobs_stage').on(t.stage, t.provider),
  ],
);

