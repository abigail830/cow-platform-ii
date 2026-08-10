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

  if (Array.isArray(normalized)) {
    for (const item of normalized) {
      if (!isRecord(item)) continue;
      if (item.type === 'text' && typeof item.text === 'string') {
        try {
          const parsed = JSON.parse(item.text) as unknown;
          if (isRecord(parsed)) {
            return isRecord(parsed.details) ? parsed.details : parsed;
          }
        } catch {
          // fall through
        }
      }
    }
  }

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

function toolHasPublishOutput(tool: DynamicToolPart): boolean {
  if (tool.state === 'input-available') return false;
  return parsePublishArtifactOutput(tool.output) !== null;
}

export function extractPublishedArtifacts(messages: FlueConversationMessage[]): PublishedArtifact[] {
  const artifacts: PublishedArtifact[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.parts) {
      if (part.type !== 'dynamic-tool') continue;
      const tool = part as DynamicToolPart;
      if (tool.toolName !== 'publish_artifact' || !toolHasPublishOutput(tool)) continue;
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
    const parsed = /^https?:\/\//i.test(trimmed)
      ? new URL(trimmed)
      : new URL(trimmed, typeof window !== 'undefined' ? window.location.origin : 'http://local');
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

/** Agent attachment download URLs — must not be routed through the SPA shell. */
export function isAgentAttachmentDownloadHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return false;

  try {
    const parsed = /^https?:\/\//i.test(trimmed)
      ? new URL(trimmed)
      : new URL(trimmed, 'http://local');
    return (
      parsed.pathname.startsWith('/api/agents/') && parsed.pathname.includes('/attachments/')
    );
  } catch {
    return trimmed.startsWith('/api/agents/') && trimmed.includes('/attachments/');
  }
}

export function looksLikeBareFilename(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\')) return false;
  return /\.[a-z0-9]{2,8}$/i.test(trimmed);
}

function filenameKey(name: string): string {
  try {
    return decodeURIComponent(name.trim());
  } catch {
    return name.trim();
  }
}

export function buildArtifactHrefResolver(artifacts: PublishedArtifact[]): (href: string, label?: string) => string {
  const byFilename = new Map<string, string>();
  for (const artifact of artifacts) {
    const normalized = normalizeAttachmentDownloadUrl(artifact.downloadUrl);
    const key = filenameKey(artifact.filename);
    byFilename.set(key, normalized);
    byFilename.set(key.toLowerCase(), normalized);
  }

  const soleArtifactUrl =
    artifacts.length === 1 ? normalizeAttachmentDownloadUrl(artifacts[0].downloadUrl) : null;

  return (href: string, label?: string) => {
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

    const name = filenameKey(basenameFromHref(trimmed));
    const labelKey = label ? filenameKey(label) : '';
    const resolved =
      byFilename.get(name) ??
      byFilename.get(name.toLowerCase()) ??
      (labelKey
        ? byFilename.get(labelKey) ?? byFilename.get(labelKey.toLowerCase())
        : undefined);
    if (resolved) return resolved;

    if (looksLikeBareFilename(trimmed) && soleArtifactUrl) return soleArtifactUrl;

    return href;
  };
}

/** Rewrite markdown link targets from sandbox filenames to signed attachment URLs. */
export function rewritePublishedArtifactMarkdownLinks(
  text: string,
  artifacts: PublishedArtifact[],
): string {
  if (!text || artifacts.length === 0) return text;

  const resolve = buildArtifactHrefResolver(artifacts);

  let out = text.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, label, rawHref) => {
    const href = rawHref.trim();
    const resolved = resolve(href, label.trim());
    if (resolved !== href && isAgentAttachmentDownloadHref(resolved)) {
      return `[${label}](${resolved})`;
    }
    return match;
  });

  out = out.replace(/<([^<>\s]+)>/g, (match, rawHref) => {
    const href = rawHref.trim();
    if (!href.includes('/attachments/') && !looksLikeBareFilename(href)) return match;
    const resolved = resolve(href);
    if (resolved !== href && isAgentAttachmentDownloadHref(resolved)) {
      return `<${resolved}>`;
    }
    return match;
  });

  return out;
}
