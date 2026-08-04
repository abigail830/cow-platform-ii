import type { FlueConversationMessage, FlueConversationPart } from '@flue/react';
import { normalizeToolPayload } from './tool-payload.ts';

type DynamicToolPart = Extract<FlueConversationPart, { type: 'dynamic-tool' }>;

export type KbCitation = {
  documentName: string;
  previewUrl: string;
};

const PLACEHOLDER_HREF_RE = /^(?:source\.)?preview_url(?:_placeholder)?\/?$/i;

function parseToolOutput(output: unknown): unknown {
  const normalized = normalizeToolPayload(output);
  if (typeof normalized === 'string') {
    try {
      return JSON.parse(normalized) as unknown;
    } catch {
      return normalized;
    }
  }
  return normalized;
}

function readCitation(source: unknown): KbCitation | null {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  const documentName = typeof record.document_name === 'string' ? record.document_name.trim() : '';
  const previewUrl =
    (typeof record.preview_url === 'string' && record.preview_url.trim()) ||
    (typeof record.parsed_url === 'string' && record.parsed_url.trim()) ||
    '';
  if (!documentName || !previewUrl) return null;
  return { documentName, previewUrl };
}

function isHybridSearchTool(toolName: string): boolean {
  return toolName === 'hybrid_search' || toolName.endsWith('__hybrid_search');
}

export function extractKbCitations(messages: FlueConversationMessage[]): KbCitation[] {
  const citations: KbCitation[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== 'dynamic-tool') continue;
      const tool = part as DynamicToolPart;
      if (!isHybridSearchTool(tool.toolName) || tool.state !== 'output-available') continue;

      const payload = parseToolOutput(tool.output);
      if (!payload || typeof payload !== 'object') continue;
      const results = (payload as { results?: unknown }).results;
      if (!Array.isArray(results)) continue;

      for (const item of results) {
        if (!item || typeof item !== 'object') continue;
        const citation = readCitation((item as { source?: unknown }).source);
        if (!citation) continue;
        const key = `${citation.previewUrl}\0${citation.documentName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        citations.push(citation);
      }
    }
  }

  return citations;
}

function indexCitations(citations: KbCitation[]): {
  byName: Map<string, string>;
  byFilename: Map<string, string>;
} {
  const byName = new Map<string, string>();
  const byFilename = new Map<string, string>();

  for (const citation of citations) {
    byName.set(citation.documentName, citation.previewUrl);
    byName.set(citation.documentName.toLowerCase(), citation.previewUrl);
    const filename = citation.documentName.split('/').pop() ?? citation.documentName;
    byFilename.set(filename, citation.previewUrl);
    byFilename.set(filename.toLowerCase(), citation.previewUrl);
  }

  return { byName, byFilename };
}

function resolveCitationHref(
  href: string,
  label: string | undefined,
  byName: Map<string, string>,
  byFilename: Map<string, string>,
): string | null {
  const trimmedHref = href.trim();
  const trimmedLabel = label?.trim() ?? '';

  if (trimmedHref.startsWith('/knowledge/documents/')) return trimmedHref;

  if (PLACEHOLDER_HREF_RE.test(trimmedHref) && trimmedLabel) {
    return (
      byName.get(trimmedLabel) ??
      byName.get(trimmedLabel.toLowerCase()) ??
      byFilename.get(trimmedLabel) ??
      byFilename.get(trimmedLabel.toLowerCase()) ??
      null
    );
  }

  if (
    trimmedLabel &&
    (!trimmedHref.startsWith('/') && !trimmedHref.startsWith('http://') && !trimmedHref.startsWith('https://'))
  ) {
    const fromLabel =
      byName.get(trimmedLabel) ??
      byName.get(trimmedLabel.toLowerCase()) ??
      byFilename.get(trimmedLabel) ??
      byFilename.get(trimmedLabel.toLowerCase());
    if (fromLabel) return fromLabel;

    const fromHref =
      byFilename.get(trimmedHref) ??
      byFilename.get(trimmedHref.toLowerCase()) ??
      byName.get(trimmedHref) ??
      byName.get(trimmedHref.toLowerCase());
    if (fromHref) return fromHref;
  }

  return null;
}

export function buildKbCitationHrefResolver(
  citations: KbCitation[],
): (href: string, label?: string) => string {
  const { byName, byFilename } = indexCitations(citations);

  return (href: string, label?: string) => {
    const resolved = resolveCitationHref(href, label, byName, byFilename);
    return resolved ?? href;
  };
}

export function rewriteKbCitationMarkdown(text: string, citations: KbCitation[]): string {
  if (!text || citations.length === 0) return text;
  const { byName, byFilename } = indexCitations(citations);

  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label: string, href: string) => {
    const resolved = resolveCitationHref(href, label, byName, byFilename);
    return resolved ? `[${label}](${resolved})` : match;
  });
}
