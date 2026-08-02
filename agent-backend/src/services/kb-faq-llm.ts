import { resolveModelCliParams } from './model-cli-params.ts';

function applyTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

export async function chatCompletionText(input: {
  modelConfigId: string;
  systemPrompt?: string;
  userPrompt: string;
}): Promise<string> {
  const params = await resolveModelCliParams({
    modelId: input.modelConfigId,
    expectedApiType: 'chat-completions',
  });

  const baseUrl = params.base_url.replace(/\/$/, '');
  const url = `${baseUrl}/chat/completions`;

  const messages: Array<{ role: string; content: string }> = [];
  if (input.systemPrompt?.trim()) {
    messages.push({ role: 'system', content: input.systemPrompt.trim() });
  }
  messages.push({ role: 'user', content: input.userPrompt });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.api_key}`,
    },
    body: JSON.stringify({
      model: params.model_name,
      messages,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Chat completion failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty response from chat model');
  return content;
}

export async function polishFaqAnswerWithModel(input: {
  modelConfigId: string;
  promptTemplate: string;
  question: string;
  answer: string;
}): Promise<string> {
  const userPrompt = applyTemplate(input.promptTemplate, {
    question: input.question,
    answer: input.answer,
  });
  return chatCompletionText({
    modelConfigId: input.modelConfigId,
    userPrompt,
  });
}

export async function extractFaqsWithModel(input: {
  modelConfigId: string;
  promptTemplate: string;
  documentName: string;
  markdown: string;
}): Promise<Array<{ question: string; answer: string }>> {
  const userPrompt = applyTemplate(input.promptTemplate, {
    document_name: input.documentName,
    markdown: input.markdown,
  });

  const raw = await chatCompletionText({
    modelConfigId: input.modelConfigId,
    systemPrompt: 'You extract FAQ pairs from documents. Respond with valid JSON only.',
    userPrompt,
  });

  const jsonText = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  const parsed = JSON.parse(jsonText) as Array<{ question?: string; answer?: string }>;
  if (!Array.isArray(parsed)) throw new Error('Extraction response must be a JSON array');

  const items: Array<{ question: string; answer: string }> = [];
  for (const row of parsed) {
    const question = row.question?.trim() ?? '';
    const answer = row.answer?.trim() ?? '';
    if (question && answer) items.push({ question, answer });
  }
  return items;
}
