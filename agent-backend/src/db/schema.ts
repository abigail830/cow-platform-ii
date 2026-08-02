import {
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/** pgvector column — driver uses `[f1,f2,...]` string form. */
export const pgVector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector';
  },
  toDriver(value: number[]): string {
    if (!value.length) return '[]';
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '[]') return [];
    const inner = trimmed.replace(/^\[/, '').replace(/\]$/, '');
    if (!inner) return [];
    return inner.split(',').map((part) => Number(part.trim()));
  },
});

export type KbChunkConfig = {
  strategy?: 'markdown_header' | 'fixed_size' | 'paragraph';
  chunk_size?: number;
  chunk_overlap?: number;
};

export const DEFAULT_KB_CHUNK_CONFIG: KbChunkConfig = {
  strategy: 'markdown_header',
  chunk_size: 8000,
  chunk_overlap: 50,
};

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

/** Platform-owned E2B sandbox lease keyed by Flue agent instance id (`userId--conversationId`). */
export const appE2bSessions = pgTable(
  'app_e2b_sessions',
  {
    instanceId: text('instance_id').primaryKey(),
    sandboxId: text('sandbox_id').notNull(),
    agentName: text('agent_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_e2b_sessions_updated').on(t.updatedAt)],
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
    workflowFile: text('workflow_file'),
    modelConfigId: uuid('model_config_id').references(() => appModelConfigs.id, { onDelete: 'set null' }),
    isEnabled: boolean('is_enabled').notNull().default(true),
    isSystem: boolean('is_system').notNull().default(false),
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

export const KNOWLEDGE_BASE_TYPES = ['page_index', 'rag', 'faq'] as const;
export type KnowledgeBaseType = (typeof KNOWLEDGE_BASE_TYPES)[number];

export const KB_IMPORT_JOB_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;
export type KbImportJobStatus = (typeof KB_IMPORT_JOB_STATUSES)[number];

export const KB_IMPORT_JOB_KINDS = [
  'pageindex_import',
  'rag_index',
  'faq_extract',
  'faq_index',
] as const;
export type KbImportJobKind = (typeof KB_IMPORT_JOB_KINDS)[number];

export const KB_ITEM_IMPORT_STATUSES = ['pending', 'importing', 'completed', 'failed'] as const;
export type KbItemImportStatus = (typeof KB_ITEM_IMPORT_STATUSES)[number];

export const KB_FAQ_SOURCE_TYPES = ['manual', 'extracted'] as const;
export type KbFaqSourceType = (typeof KB_FAQ_SOURCE_TYPES)[number];

export const KB_FAQ_PUBLICATION_STATUSES = ['draft', 'published'] as const;
export type KbFaqPublicationStatus = (typeof KB_FAQ_PUBLICATION_STATUSES)[number];

export const KB_FAQ_INDEX_STATUSES = ['pending', 'indexing', 'indexed', 'failed'] as const;
export type KbFaqIndexStatus = (typeof KB_FAQ_INDEX_STATUSES)[number];

export type KbFaqSettings = {
  auto_index_on_publish?: boolean;
  extraction_model_config_id?: string | null;
  extraction_prompt?: string;
  polish_model_config_id?: string | null;
  polish_prompt?: string;
};

export const DEFAULT_KB_FAQ_SETTINGS: KbFaqSettings = {
  auto_index_on_publish: false,
  extraction_model_config_id: null,
  extraction_prompt:
    'Extract FAQ pairs from the document markdown below. Return a JSON array of objects with "question" and "answer" fields. Only include substantive Q&A from the content.\n\nDocument: {document_name}\n\n{markdown}',
  polish_model_config_id: null,
  polish_prompt:
    'Polish the following FAQ answer for clarity and professionalism. Keep the same language as the input. Return only the polished answer text.\n\nQuestion: {question}\n\nAnswer: {answer}',
};

export const appKnowledgeBases = pgTable(
  'app_knowledge_bases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    type: text('type').notNull(),
    pipelineId: uuid('pipeline_id').references(() => appPipelineConfigs.id, { onDelete: 'set null' }),
    embeddingModelConfigId: uuid('embedding_model_config_id').references(() => appModelConfigs.id, {
      onDelete: 'set null',
    }),
    embeddingDimensions: integer('embedding_dimensions').notNull().default(1024),
    chunkConfig: jsonb('chunk_config').$type<KbChunkConfig>().notNull().default(DEFAULT_KB_CHUNK_CONFIG),
    metadataKeys: jsonb('metadata_keys').$type<string[]>().notNull().default([]),
    faqSettings: jsonb('faq_settings')
      .$type<KbFaqSettings>()
      .notNull()
      .default(DEFAULT_KB_FAQ_SETTINGS),
    createdBy: uuid('created_by').references(() => appUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_knowledge_bases_type').on(t.type, t.updatedAt),
    index('idx_knowledge_bases_pipeline').on(t.pipelineId),
    index('idx_knowledge_bases_embedding_model').on(t.embeddingModelConfigId),
  ],
);

export const appKbImportJobs = pgTable(
  'app_kb_import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    knowledgeBaseId: uuid('knowledge_base_id')
      .notNull()
      .references(() => appKnowledgeBases.id, { onDelete: 'cascade' }),
    pipelineId: uuid('pipeline_id').references(() => appPipelineConfigs.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('pending'),
    jobKind: text('job_kind'),
    documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
    faqIds: jsonb('faq_ids').$type<string[]>().notNull().default([]),
    totalCount: integer('total_count').notNull().default(0),
    completedCount: integer('completed_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    errorMessage: text('error_message'),
    createdBy: uuid('created_by').references(() => appUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_kb_import_jobs_kb').on(t.knowledgeBaseId, t.createdAt),
    index('idx_kb_import_jobs_status').on(t.status, t.updatedAt),
  ],
);

export const appKbItems = pgTable(
  'app_kb_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    knowledgeBaseId: uuid('knowledge_base_id')
      .notNull()
      .references(() => appKnowledgeBases.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => appDocuments.id, { onDelete: 'cascade' }),
    documentName: text('document_name').notNull(),
    channelPath: text('channel_path').notNull().default(''),
    originalS3Key: text('original_s3_key').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    pageIndex: jsonb('page_index').$type<Record<string, unknown> | null>(),
    markdown: text('markdown'),
    parsingResult: jsonb('parsing_result').$type<Record<string, unknown> | null>(),
    importStatus: text('import_status').notNull().default('pending'),
    importError: text('import_error'),
    importWarnings: jsonb('import_warnings').$type<string[] | null>(),
    importedAt: timestamp('imported_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uq_kb_items_kb_document').on(t.knowledgeBaseId, t.documentId),
    index('idx_kb_items_kb').on(t.knowledgeBaseId, t.importedAt),
    index('idx_kb_items_document').on(t.documentId),
  ],
);

export const appKbChunks = pgTable(
  'app_kb_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    knowledgeBaseId: uuid('knowledge_base_id')
      .notNull()
      .references(() => appKnowledgeBases.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => appDocuments.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    embedding: pgVector('embedding').notNull(),
    chunkMetadata: jsonb('chunk_metadata').$type<Record<string, unknown> | null>(),
    docMetadata: jsonb('doc_metadata').$type<Record<string, unknown> | null>(),
    contentHash: text('content_hash'),
    indexedAt: timestamp('indexed_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_kb_chunks_kb_document').on(t.knowledgeBaseId, t.documentId),
    index('idx_kb_chunks_kb').on(t.knowledgeBaseId, t.indexedAt),
  ],
);

export const appKbFaqs = pgTable(
  'app_kb_faqs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    knowledgeBaseId: uuid('knowledge_base_id')
      .notNull()
      .references(() => appKnowledgeBases.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    sourceType: text('source_type').notNull().default('manual'),
    sourceDocumentId: uuid('source_document_id').references(() => appDocuments.id, {
      onDelete: 'set null',
    }),
    sourceDocumentName: text('source_document_name'),
    publicationStatus: text('publication_status').notNull().default('draft'),
    indexStatus: text('index_status'),
    indexError: text('index_error'),
    indexedAt: timestamp('indexed_at', { withTimezone: true }),
    embedding: pgVector('embedding'),
    docMetadata: jsonb('doc_metadata').$type<Record<string, unknown> | null>(),
    contentHash: text('content_hash'),
    createdBy: uuid('created_by').references(() => appUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_kb_faqs_kb_status').on(t.knowledgeBaseId, t.publicationStatus, t.updatedAt),
    index('idx_kb_faqs_kb_index').on(t.knowledgeBaseId, t.indexStatus),
    index('idx_kb_faqs_source_document').on(t.sourceDocumentId),
  ],
);

/** RAG per-document index row — parallel to app_kb_items for PageIndex. */
export const appKbChunkDocuments = pgTable(
  'app_kb_chunk_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    knowledgeBaseId: uuid('knowledge_base_id')
      .notNull()
      .references(() => appKnowledgeBases.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => appDocuments.id, { onDelete: 'cascade' }),
    documentName: text('document_name').notNull(),
    channelPath: text('channel_path').notNull().default(''),
    indexStatus: text('index_status').notNull().default('pending'),
    indexError: text('index_error'),
    indexedAt: timestamp('indexed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uq_kb_chunk_documents_kb_document').on(t.knowledgeBaseId, t.documentId),
    index('idx_kb_chunk_documents_kb').on(t.knowledgeBaseId, t.updatedAt),
    index('idx_kb_chunk_documents_document').on(t.documentId),
  ],
);

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

