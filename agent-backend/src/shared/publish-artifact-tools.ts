import {
  createAttachmentRef,
} from '@flue/runtime/adapter';
import type { SessionEnv } from '@flue/runtime';
import { Type } from '@earendil-works/pi-ai';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { signAttachmentAccessToken } from '../auth/attachment-access-token.ts';
import {
  agentConversationStreamPath,
} from './agent-instance-id.ts';
import { resolveFlueConversationId } from '../flue/resolve-flue-conversation-id.ts';
import { getPlatformFlueStores } from '../flue/platform-flue-stores.ts';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.pdf': 'application/pdf',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
};

const PublishArtifactParams = Type.Object({
  path: Type.String({ description: 'Absolute or workspace-relative path inside the sandbox' }),
  filename: Type.Optional(Type.String({ description: 'Download filename override' })),
  mimeType: Type.Optional(Type.String({ description: 'MIME type override' })),
});

export type PublishArtifactContext = {
  env: SessionEnv;
  instanceId: string;
  agentName: string;
};

export type PublishArtifactResult = {
  attachmentId: string;
  downloadUrl: string;
  filename: string;
  mimeType: string;
  size: number;
};

function inferMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return 'application/octet-stream';
  return MIME_BY_EXTENSION[lower.slice(dot)] ?? 'application/octet-stream';
}

function readPublicApiUrl(): string {
  return (
    process.env.OPENKMS_API_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT?.trim() || '8787'}`
  ).replace(/\/$/, '');
}

/** Relative attachment path for in-app download links (browser uses current origin + Vite proxy). */
export function buildAttachmentDownloadPath(
  agentName: string,
  instanceId: string,
  attachmentId: string,
): string {
  const path = `/api/agents/${encodeURIComponent(agentName)}/${encodeURIComponent(instanceId)}/attachments/${encodeURIComponent(attachmentId)}`;
  const token = signAttachmentAccessToken({ agentName, instanceId, attachmentId });
  return `${path}?token=${encodeURIComponent(token)}`;
}

/** Prefix a relative API path with the public backend origin (A2A / external clients). */
export function absolutizePublicApiUrl(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = readPublicApiUrl();
  return `${base}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

function buildAttachmentDownloadUrl(
  agentName: string,
  instanceId: string,
  attachmentId: string,
): string {
  return buildAttachmentDownloadPath(agentName, instanceId, attachmentId);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

export function createPublishArtifactAgentTool(context: PublishArtifactContext) {
  return {
    name: 'publish_artifact',
    label: 'Publish Artifact',
    description:
      'Publish a sandbox file as a downloadable platform attachment (Flue attachment store + /attachments URL).',
    parameters: PublishArtifactParams,
    async execute(
      _toolCallId: string,
      params: { path: string; filename?: string; mimeType?: string },
      signal?: AbortSignal,
    ) {
      throwIfAborted(signal);

      const bytes = await context.env.readFileBuffer(params.path);
      const filename = params.filename?.trim() || basename(params.path) || 'artifact';
      const mimeType = params.mimeType?.trim() || inferMimeType(filename);
      const attachmentId = randomUUID();

      const attachment = await createAttachmentRef({
        id: attachmentId,
        mimeType,
        bytes,
        filename,
      });

      const streamPath = agentConversationStreamPath(context.agentName, context.instanceId);
      const { attachmentStore, conversationStreamStore } = await getPlatformFlueStores();
      const conversationId = await resolveFlueConversationId(conversationStreamStore, streamPath);
      if (!conversationId) {
        throw new Error(
          `[publish_artifact] No Flue conversation found for stream path "${streamPath}".`,
        );
      }

      await attachmentStore.put({
        streamPath,
        attachment,
        bytes,
        conversationId,
      });

      const result: PublishArtifactResult = {
        attachmentId,
        downloadUrl: buildAttachmentDownloadUrl(context.agentName, context.instanceId, attachmentId),
        filename: attachment.filename ?? filename,
        mimeType,
        size: bytes.byteLength,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
