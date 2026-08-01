import type { Message } from '@a2a-js/sdk';

export function extractTextFromA2aMessage(message: Message): string {
  const parts: string[] = [];
  for (const part of message.parts) {
    if (part.content?.$case === 'text' && part.content.value.trim()) {
      parts.push(part.content.value.trim());
    }
  }
  return parts.join('\n').trim();
}
