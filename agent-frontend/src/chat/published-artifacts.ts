import type { FlueConversationMessage } from '@flue/react';
import { apiUrl } from '../api/base.ts';
import { normalizeToolPayload } from './tool-payload.ts';

export type PublishedArtifact = {
  filename: string;
  downloadUrl: string;
};

type DynamicToolPart = Extract<
  import('@flue/react').FlueConversationPart,
  { type: 'dynamic-tool' }
>;

function basenameFromHref(href: string): string {
  const withoutQuery = href.split('?')[0] ?? href;
  const segment = withoutQuery.split('/').pop() ?? withoutQuery;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseToolResultRecord(output: unknown): Record<string, unknown> | null {
  const normalized = normalizeToolPayload(output);
  if (typeof normalized === 'string') {
    try {
      const parsed = JSON.parse(normalized) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (!isRecord(normalized)) return null;
  if (isRecord(normalized.details)) return normalized.details;
  return normalized;
}

export function parsePublishArtifactOutput(output: unknown): PublishedArtifact | null {
  const record = parseToolResultRecord(output);
  if (!record) return null;

  const downloadUrl =
    typeof record.downloadUrl === 'string' ? record.downloadUrl.trim() : '';
  if (!downloadUrl) return null;

  const filename =
    typeof record.filename === 'string' && record.filename.trim()
      ? record.filename.trim()
      : basenameFromHref(downloadUrl) || 'artifact';

  return { filename, downloadUrl };
}

export function extractPublishedArtifacts(messages: FlueConversationMessage[]): PublishedArtifact[] {
  const artifacts: PublishedArtifact[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.parts) {
      if (part.type !== 'dynamic-tool') continue;
      const tool = part as DynamicToolPart;
      if (tool.toolName !== 'publish_artifact' || tool.state !== 'output-available') continue;
      const artifact = parsePublishArtifactOutput(tool.output);
      if (!artifact || seen.has(artifact.downloadUrl)) continue;
      seen.add(artifact.downloadUrl);
      artifacts.push(artifact);
    }
  }

  return artifacts;
}

/** Rewrite attachment URLs to the configured API origin; keep signed query tokens. */
export function normalizeAttachmentDownloadUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.pathname.startsWith('/api/agents/') && parsed.pathname.includes('/attachments/')) {
      return apiUrl(`${parsed.pathname}${parsed.search}`);
    }
  } catch {
    if (trimmed.startsWith('/api/agents/') && trimmed.includes('/attachments/')) {
      return apiUrl(trimmed);
    }
  }

  return trimmed;
}

export function buildArtifactHrefResolver(artifacts: PublishedArtifact[]): (href: string, label?: string) => string {
  const byFilename = new Map<string, string>();
  for (const artifact of artifacts) {
    const normalized = normalizeAttachmentDownloadUrl(artifact.downloadUrl);
    byFilename.set(artifact.filename, normalized);
    byFilename.set(artifact.filename.toLowerCase(), normalized);
  }

  return (href: string, _label?: string) => {
    const trimmed = href.trim();
    if (!trimmed) return href;

    if (trimmed.includes('/attachments/')) {
      return normalizeAttachmentDownloadUrl(trimmed);
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return normalizeAttachmentDownloadUrl(trimmed);
    }

    if (trimmed.startsWith('/api/')) {
      return apiUrl(trimmed);
    }

    const name = basenameFromHref(trimmed);
    const resolved = byFilename.get(name) ?? byFilename.get(name.toLowerCase());
    if (resolved) return resolved;

    return href;
  };
}
