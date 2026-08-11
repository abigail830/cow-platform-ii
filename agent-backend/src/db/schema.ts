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

/** Chunking options for RAG index pipeline Config YAML (not stored on KB row). */
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
  'rerank',
  'vlm',
  'audio-asr',
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
  (t) => [
    index('idx_conversations_user').on(t.userId, t.updatedAt),
    index('idx_conversations_agent_updated').on(t.agentName, t.updatedAt),
  ],
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
    /** Optional worker YAML override; null = CLI packaged default for pipeline_name. */
    configYaml: text('config_yaml'),
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

export const RESOURCE_TYPES = ['document_channel', 'audio_channel', 'knowledge_base', 'studio_agent'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const GRANTEE_TYPES = ['user', 'others'] as const;
export type GranteeType = (typeof GRANTEE_TYPES)[number];

export const appResourceGrants = pgTable(
  'app_resource_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),
    granteeType: text('grantee_type').notNull(),
    granteeUserId: uuid('grantee_user_id').references(() => appUsers.id, { onDelete: 'cascade' }),
    canRead: boolean('can_read').notNull().default(false),
    canWrite: boolean('can_write').notNull().default(false),
    canManage: boolean('can_manage').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_resource_grants_resource').on(t.resourceType, t.resourceId),
    index('idx_resource_grants_user').on(t.granteeUserId),
  ],
);

export const appDocumentChannels = pgTable(
  'app_document_channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    parentId: uuid('parent_id'),
    sortOrder: integer('sort_order').notNull().default(0),
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

export const appAudioChannels = pgTable(
  'app_audio_channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    parentId: uuid('parent_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    pipelineId: uuid('pipeline_id').references(() => appPipelineConfigs.id, { onDelete: 'set null' }),
    postProcessPipelineId: uuid('post_process_pipeline_id').references(() => appPipelineConfigs.id, {
      onDelete: 'set null',
    }),
    autoStartPipeline: boolean('auto_start_pipeline').notNull().default(false),
    createdBy: uuid('created_by').references(() => appUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_audio_channels_parent').on(t.parentId, t.sortOrder)],
);

export const AUDIO_CAPTURE_STATUSES = [
  'draft',
  'transcribing',
  'ready',
  'post_processing',
  'done',
  'failed',
] as const;
export type AudioCaptureStatus = (typeof AUDIO_CAPTURE_STATUSES)[number];

export const AUDIO_CAPTURE_RECORDING_MODES = [
  'multi_party_discussion',
  'structured_interview',
  'presentation_qa',
  'site_field_capture',
  'solo_voice_note',
  'general',
] as const;
export type AudioCaptureRecordingMode = (typeof AUDIO_CAPTURE_RECORDING_MODES)[number];

export const AUDIO_CAPTURE_AUDIENCES = ['external_client', 'internal_team', 'mixed', 'unknown'] as const;
export type AudioCaptureAudience = (typeof AUDIO_CAPTURE_AUDIENCES)[number];

export const CAPTURE_PIPELINE_JOB_STAGES = [
  'submitted',
  'structuring',
  'classifying',
  'extracting',
  'done',
  'failed',
] as const;
export type CapturePipelineJobStage = (typeof CAPTURE_PIPELINE_JOB_STAGES)[number];

export const appAudioCaptures = pgTable(
  'app_audio_captures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => appAudioChannels.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    brief: text('brief'),
    participantsHint: text('participants_hint'),
    recordingMode: text('recording_mode').$type<AudioCaptureRecordingMode | null>(),
    audience: text('audience').$type<AudioCaptureAudience>().notNull().default('unknown'),
    status: text('status').$type<AudioCaptureStatus>().notNull().default('draft'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdBy: uuid('created_by').references(() => appUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_audio_captures_channel').on(t.channelId, t.updatedAt)],
);

export const appAudios = pgTable(
  'app_audios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => appAudioChannels.id, { onDelete: 'cascade' }),
    captureId: uuid('capture_id').references(() => appAudioCaptures.id, { onDelete: 'cascade' }),
    segmentIndex: integer('segment_index'),
    segmentLabel: text('segment_label'),
    name: text('name').notNull(),
    fileType: text('file_type').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    fileHash: text('file_hash').notNull(),
    s3Key: text('s3_key').notNull(),
    status: text('status').notNull().default('uploaded'),
    durationSec: integer('duration_sec'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    uploadedBy: uuid('uploaded_by').references(() => appUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_audios_channel').on(t.channelId, t.updatedAt),
    index('idx_audios_hash').on(t.fileHash),
    index('idx_audios_capture').on(t.captureId, t.segmentIndex),
  ],
);

export const AUDIO_PIPELINE_JOB_STAGES = ['submitted', 'transcribing', 'done', 'failed'] as const;
export type AudioPipelineJobStage = (typeof AUDIO_PIPELINE_JOB_STAGES)[number];

export const appAudioCapturePipelineJobs = pgTable(
  'app_audio_capture_pipeline_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    captureId: uuid('capture_id')
      .notNull()
      .references(() => appAudioCaptures.id, { onDelete: 'cascade' }),
    pipelineName: text('pipeline_name').notNull(),
    stage: text('stage').$type<CapturePipelineJobStage>().notNull().default('submitted'),
    configYaml: text('config_yaml'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_audio_capture_pipeline_jobs_capture').on(t.captureId, t.createdAt)],
);

export const appAudioPipelineJobs = pgTable(
  'app_audio_pipeline_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    audioId: uuid('audio_id')
      .notNull()
      .references(() => appAudios.id, { onDelete: 'cascade' }),
    pipelineName: text('pipeline_name').notNull(),
    provider: text('provider').notNull(),
    stage: text('stage').notNull().default('submitted'),
    externalJobId: text('external_job_id'),
    configYaml: text('config_yaml'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_audio_pipeline_jobs_audio').on(t.audioId, t.createdAt),
    index('idx_audio_pipeline_jobs_stage').on(t.stage, t.provider),
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

export const PIPELINE_PROVIDERS = ['baidu', 'aliyun', 'paddle'] as const;
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
  polish_agent_def_id?: string | null;
  /** Override for FAQ extract; null = platform default kb-faq-extract. */
  extract_pipeline_id?: string | null;
};

export const DEFAULT_KB_FAQ_SETTINGS: KbFaqSettings = {
  auto_index_on_publish: false,
  polish_agent_def_id: null,
  extract_pipeline_id: null,
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
    /** Snapshot of pipeline config_yaml at job create; null = CLI uses packaged default. */
    configYaml: text('config_yaml'),
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
    /** Flattened lexical discovery corpus (name/channel/abstract/tags/TOC/summaries). */
    discoveryText: text('discovery_text'),
    tocTitles: jsonb('toc_titles').$type<string[] | null>(),
    pageCount: integer('page_count'),
    pageIndexStrategy: text('page_index_strategy'),
    /** false when markdown column is incomplete and S3 remains authoritative. */
    markdownComplete: boolean('markdown_complete').notNull().default(true),
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
    index('idx_kb_items_channel_path').on(t.channelPath),
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

export const appUserPreferences = pgTable(
  'app_user_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    prefKey: text('pref_key').notNull(),
    prefValue: jsonb('pref_value').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.prefKey] })],
);

/** Personal API keys for programmatic access (hash only; plaintext shown once at creation). */
export const appUserApiKeys = pgTable(
  'app_user_api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default('Default'),
    keyPrefix: text('key_prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_user_api_keys_user').on(t.userId, t.createdAt),
    index('idx_user_api_keys_prefix').on(t.keyPrefix),
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
    /** Snapshot of pipeline config_yaml at job create; null = CLI uses packaged default. */
    configYaml: text('config_yaml'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_pipeline_jobs_document').on(t.documentId, t.createdAt),
    index('idx_pipeline_jobs_stage').on(t.stage, t.provider),
  ],
);

/** Agent playground session file attachments (metadata only; bytes in local FS or Vercel Blob). */
export const appSessionFiles = pgTable(
  'app_session_files',
  {
    id: text('id').primaryKey(),
    instanceId: text('instance_id').notNull(),
    agentName: text('agent_name').notNull(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageBackend: text('storage_backend').notNull(),
    storageKey: text('storage_key').notNull(),
    contentCacheKey: text('content_cache_key'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_session_files_instance').on(t.instanceId, t.createdAt),
    index('idx_session_files_expires').on(t.expiresAt),
  ],
);

export const BUILTIN_WORKFLOW_KEYS = [
  'session_image_extract',
  'metadata_extract',
  'faq_extract',
  'faq_polish',
] as const;
export type BuiltinWorkflowKey = (typeof BUILTIN_WORKFLOW_KEYS)[number];

export const BUILTIN_OUTPUT_MODES = ['text', 'json', 'structured'] as const;
export type BuiltinOutputMode = (typeof BUILTIN_OUTPUT_MODES)[number];

export const SYNC_AGENT_TRIGGER_TYPES = ['api', 'upload', 'pipeline_job', 'kb_job', 'test'] as const;
export type SyncAgentTriggerType = (typeof SYNC_AGENT_TRIGGER_TYPES)[number];

export const appBuiltinAgentDefs = pgTable(
  'app_builtin_agent_defs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    workflowKey: text('workflow_key').notNull(),
    apiType: text('api_type').notNull(),
    modelConfigId: uuid('model_config_id')
      .notNull()
      .references(() => appModelConfigs.id, { onDelete: 'restrict' }),
    systemPrompt: text('system_prompt').notNull().default(''),
    userPromptTemplate: text('user_prompt_template').notNull().default(''),
    outputMode: text('output_mode').notNull().default('text'),
    outputSchema: jsonb('output_schema').$type<Record<string, unknown>>(),
    temperature: text('temperature'),
    maxTokens: integer('max_tokens'),
    isSystem: boolean('is_system').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_builtin_agent_defs_workflow').on(t.workflowKey, t.updatedAt),
    index('idx_builtin_agent_defs_model').on(t.modelConfigId),
  ],
);

export const appWorkflowBindings = pgTable(
  'app_workflow_bindings',
  {
    workflowKey: text('workflow_key').primaryKey(),
    builtinAgentDefId: uuid('builtin_agent_def_id')
      .notNull()
      .references(() => appBuiltinAgentDefs.id, { onDelete: 'restrict' }),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
);

export const appSyncAgentRuns = pgTable(
  'app_sync_agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowKey: text('workflow_key').notNull(),
    builtinAgentDefId: uuid('builtin_agent_def_id').references(() => appBuiltinAgentDefs.id, {
      onDelete: 'set null',
    }),
    agentDefVersion: integer('agent_def_version'),
    triggerType: text('trigger_type').notNull(),
    triggeredBy: uuid('triggered_by').references(() => appUsers.id, { onDelete: 'set null' }),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    status: text('status').notNull(),
    latencyMs: integer('latency_ms'),
    errorMessage: text('error_message'),
    inputSummary: text('input_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_sync_agent_runs_workflow').on(t.workflowKey, t.createdAt),
    index('idx_sync_agent_runs_triggered_by').on(t.triggeredBy, t.createdAt),
  ],
);

export const appSyncAgentMessages = pgTable(
  'app_sync_agent_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => appSyncAgentRuns.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    tokenUsage: jsonb('token_usage').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_sync_agent_messages_run').on(t.runId)],
);

export const STUDIO_AGENT_ORIGINS = ['user', 'platform'] as const;
export type StudioAgentOrigin = (typeof STUDIO_AGENT_ORIGINS)[number];

export const appStudioAgents = pgTable(
  'app_studio_agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),
    description: text('description').notNull().default(''),
    icon: text('icon'),
    origin: text('origin').notNull().default('user'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    instructions: text('instructions').notNull().default(''),
    modelConfigId: uuid('model_config_id')
      .notNull()
      .references(() => appModelConfigs.id, { onDelete: 'restrict' }),
    thinkingLevel: text('thinking_level'),
    skillIds: jsonb('skill_ids').$type<string[]>().notNull().default([]),
    platformMcpIds: jsonb('platform_mcp_ids').$type<string[]>().notNull().default([]),
    privateMcpIds: jsonb('private_mcp_ids').$type<string[]>().notNull().default([]),
    datasourceIds: jsonb('datasource_ids').$type<string[]>().notNull().default([]),
    sandbox: jsonb('sandbox').$type<Record<string, unknown>>().notNull().default({ provider: 'none' }),
    a2a: jsonb('a2a').$type<Record<string, unknown> | null>(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_studio_agents_created_by').on(t.createdBy),
    index('idx_studio_agents_updated').on(t.updatedAt),
  ],
);

export const appUserMcpServers = pgTable(
  'app_user_mcp_servers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    title: text('title'),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    secrets: text('secrets'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_user_mcp_servers_created_by').on(t.createdBy),
    uniqueIndex('uq_user_mcp_servers_owner_name').on(t.createdBy, t.name),
  ],
);

export const appUserMcpCredentials = pgTable(
  'app_user_mcp_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    platformMcpId: text('platform_mcp_id').notNull(),
    secrets: text('secrets').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('uq_user_mcp_credentials_user_platform').on(t.userId, t.platformMcpId)],
);

export const appUserDatasources = pgTable(
  'app_user_datasources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    displayTitle: text('display_title'),
    type: text('type').notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    username: text('username').notNull(),
    database: text('database').notNull(),
    passwordEncrypted: text('password_encrypted').notNull(),
    ssl: boolean('ssl').notNull().default(false),
    readonly: boolean('readonly').notNull().default(true),
    maxRows: integer('max_rows').notNull().default(100),
    statementTimeoutMs: integer('statement_timeout_ms').notNull().default(30_000),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_user_datasources_created_by').on(t.createdBy),
    uniqueIndex('uq_user_datasources_owner_name').on(t.createdBy, t.name),
  ],
);

