import type { SessionFilesBackend } from './config.ts';

export type SessionFileRecord = {
  id: string;
  instanceId: string;
  agentName: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageBackend: SessionFilesBackend;
  storageKey: string;
  contentCacheKey: string | null;
  expiresAt: Date | null;
  createdAt: Date;
};

export type SessionFileListItem = {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  hasContentCache: boolean;
  createdAt: string;
};
