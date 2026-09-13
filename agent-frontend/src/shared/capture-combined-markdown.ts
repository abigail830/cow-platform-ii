/** Mirror openkms-cli build_combined_markdown for capture post-process preview fallback. */

type KnowledgePoint = { text?: string; summary?: string } | string;

type StructuredTopic = {
  label?: string;
  title?: string;
  preview?: string;
};

export type CaptureCombinedMarkdownInput = {
  title: string;
  abstract?: string | null;
  summaryMd?: string | null;
  extraction?: Record<string, unknown> | null;
  structured?: { topics?: StructuredTopic[] } | null;
};

export function buildCaptureCombinedMarkdown(input: CaptureCombinedMarkdownInput): string | null {
  const title = input.title.trim() || 'Capture';
  const parts: string[] = [`# ${title}`, ''];

  if (input.abstract?.trim()) {
    parts.push('## Abstract', '', input.abstract.trim(), '');
  }

  if (input.summaryMd?.trim()) {
    parts.push('## Summary', '', input.summaryMd.trim(), '');
  }

  if (input.extraction) {
    parts.push('## Knowledge extraction', '');
    const points = input.extraction.knowledge_points;
    if (Array.isArray(points) && points.length > 0) {
      for (const item of points as KnowledgePoint[]) {
        if (typeof item === 'string' && item.trim()) {
          parts.push(`- ${item.trim()}`);
        } else if (item && typeof item === 'object') {
          const text = String(item.text ?? item.summary ?? '').trim();
          if (text) parts.push(`- ${text}`);
        }
      }
      parts.push('');
    } else {
      parts.push('```json');
      parts.push(JSON.stringify(input.extraction, null, 2));
      parts.push('```', '');
    }
  }

  const topics = input.structured?.topics;
  if (Array.isArray(topics) && topics.length > 0) {
    parts.push('## Topics', '');
    for (const topic of topics) {
      const label = String(topic.label ?? topic.title ?? 'Topic').trim() || 'Topic';
      const preview = String(topic.preview ?? '').trim();
      parts.push(`### ${label}`);
      if (preview) parts.push(preview);
      parts.push('');
    }
  }

  const body = parts.join('\n').trim();
  if (!body || body === `# ${title}`) return null;
  return `${body}\n`;
}
