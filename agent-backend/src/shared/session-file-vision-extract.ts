import { SESSION_FILE_READ_MAX_CHARS } from '../storage/session-files/constants.ts';
import type { ExtractResult } from './session-file-extract.ts';
import { resolveSessionFileVisionModel } from './session-file-vision-model.ts';

export function buildSessionImageExtractPrompt(filename: string): string {
  return `You are extracting content from an uploaded image attachment for a Q&A assistant.

Output Markdown using EXACTLY this structure (keep the headings):

# Image extract: ${filename}

## Visible text
(Transcribe all legible text in reading order. Preserve original language. Use markdown tables when appropriate. Write [illegible] for unreadable fragments. If there is no text, write "None".)

## Visual summary
(Brief layout / chart / UI description in Chinese when helpful. Do not invent content that is not visible.)

## Uncertainties
(List ambiguous or cut-off regions; write "None" if nothing uncertain.)

Rules:
- Copy numbers, dates, and identifiers exactly as shown.
- Do not guess or hallucinate text.
- Do not wrap the response in code fences.`;
}

function normalizeVisionMimeType(mimeType: string, filename: string): string {
  const trimmed = mimeType.trim().toLowerCase();
  if (trimmed.startsWith('image/')) return trimmed;
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

export async function extractSessionImageWithVision(params: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<ExtractResult> {
  const model = await resolveSessionFileVisionModel();
  if (!model.baseUrl?.trim()) {
    throw new Error(`VLM model "${model.name}" is missing baseUrl`);
  }

  const mime = normalizeVisionMimeType(params.mimeType, params.filename);
  const dataUrl = `data:${mime};base64,${params.bytes.toString('base64')}`;
  const url = `${model.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: model.modelId,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildSessionImageExtractPrompt(params.filename) },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`VLM extract failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };
  const rawContent = payload.choices?.[0]?.message?.content;
  let text = '';
  if (typeof rawContent === 'string') {
    text = rawContent.trim();
  } else if (Array.isArray(rawContent)) {
    text = rawContent
      .map((part) => (part.type === 'text' ? part.text?.trim() ?? '' : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (!text) {
    throw new Error('VLM extract returned empty content');
  }

  const warnings = ['image_vision_extracted'];
  if (text.length > SESSION_FILE_READ_MAX_CHARS) {
    text = text.slice(0, SESSION_FILE_READ_MAX_CHARS);
    warnings.push('image_extract_truncated');
  }

  return { text, warnings };
}
